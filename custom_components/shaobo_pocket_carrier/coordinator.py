# -*- coding: utf-8 -*-
"""中国运营商专属协调器模块 (电信/联通模块化隔离)"""
import asyncio
import logging
import datetime
import time
from datetime import timedelta
from typing import Any, Dict

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    UPDATE_INTERVAL_TELECOM,
    UPDATE_INTERVAL_UNICOM,
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    CarrierAuthExpiredError,
    CONF_SCAN_INTERVAL,
    CONF_CALL_START_DATE,
    CONF_SIGNATURE_STRING,
    CONF_SIGNATURE_TIMESTAMP,
    CONF_AUTH_USER_NAME,
    CONF_AUTH_ID_CARD,
    CALL_CACHE_MAX_RECORDS,
    EVENT_LOGIN_EXPIRED,
    MIN_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL_TELECOM,
    DEFAULT_SCAN_INTERVAL_UNICOM,
)
from .api.telecom import TelecomClient
from .api.unicom import UnicomClient
from .storage import async_save_carrier_account, CallRecordCache

_LOGGER = logging.getLogger(__name__)

class TelecomDataUpdateCoordinator(DataUpdateCoordinator):
    """中国电信独立数据协调器 (长效Token，定时动态轮询)"""

    def __init__(self, hass: HomeAssistant, phone: str, auth_data: dict, entry=None) -> None:
        self.phone = phone
        self.entry = entry
        self.client = TelecomClient(phone, auth_data)
        # 通话详单二次认证等实体操作与定时轮询共用同一个 client，
        # 而 requests.Session 并发使用不安全，故统一串行化
        self._client_lock = asyncio.Lock()
        # 通话流水本地缓存 (.storage/Shaobo_CallRecords)，认证失效时兜底展示历史流水
        self.call_cache = CallRecordCache(hass, CARRIER_TELECOM, phone)
        # 登录态失效标记: 供实体(按钮/开关)判断"按下去应该走登录还是走详单认证"，
        # 由 api/telecom.TelecomClient.probe_token / 本轮拉取结果更新
        self.login_expired = False
        self.last_auth_error = ""

        interval_min = DEFAULT_SCAN_INTERVAL_TELECOM
        if entry:
            try:
                interval_min = int(entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_TELECOM))
            except Exception:
                interval_min = DEFAULT_SCAN_INTERVAL_TELECOM

        interval_min = max(MIN_SCAN_INTERVAL, interval_min)

        super().__init__(
            hass,
            _LOGGER,
            name=f"China Telecom ({phone})",
            update_interval=timedelta(minutes=interval_min),
        )

    async def _async_update_data(self) -> Dict[str, Any]:
        """异步拉取电信数据"""
        try:
            start_date = ""
            signature_string = ""
            signature_timestamp = 0.0
            if self.entry:
                start_date = str(self.entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
                # 若保存的是当月1日，自动转为空字符串，使得跨月到新月份时无需配置即可自动滚动到新月份1日
                if start_date == datetime.date.today().replace(day=1).strftime("%Y-%m-%d"):
                    start_date = ""
                signature_string = str(self.entry.options.get(CONF_SIGNATURE_STRING, "") or "").strip()
                try:
                    signature_timestamp = float(self.entry.options.get(CONF_SIGNATURE_TIMESTAMP, 0.0) or 0.0)
                except Exception:
                    signature_timestamp = 0.0
            async with self._client_lock:
                data = await self.hass.async_add_executor_job(
                    self.client.fetch_all_data, start_date, signature_string, signature_timestamp
                )
            if not data or not isinstance(data, dict):
                raise UpdateFailed("电信接口返回空数据")
            # 通话流水本地缓存同步 (认证有效时落盘，失效时用缓存兜底)
            await self._async_sync_call_record_cache(data)
            self._mark_login_alive()
            return data
        except CarrierAuthExpiredError as auth_err:
            # 注意: 这里刻意不再 raise ConfigEntryAuthFailed。
            # 抛出它会让整条配置条目进入 setup 失败/重试，Home Assistant 会卸载全部实体
            # (按钮/文本/开关/时间实体一起消失)，而"掉线后按按钮重新登录"恰恰依赖这些实体。
            # 因此改为降级返回数据 + 抛登录失效事件，让实体保持可用。
            return await self._async_handle_login_expired(str(auth_err))
        except Exception as err:
            _LOGGER.error("拉取电信手机号 %s 数据异常: %s", self.phone, err)
            raise UpdateFailed(f"电信接口通信失败: {err}") from err

    @callback
    def _mark_login_expired(self, reason: str) -> None:
        """标记登录态失效, 并只在状态翻转时抛事件 (供自动登录模块监听)"""
        first_time = not self.login_expired
        self.login_expired = True
        self.last_auth_error = reason
        if first_time:
            self.hass.bus.async_fire(
                EVENT_LOGIN_EXPIRED,
                {"entry_id": self.entry.entry_id if self.entry else "", "phone": self.phone, "reason": reason},
            )

    @callback
    def _mark_login_alive(self) -> None:
        """本轮拉取成功, 清除登录失效标记"""
        if self.login_expired:
            _LOGGER.info("电信手机号 %s 登录态已恢复正常", self.phone)
        self.login_expired = False
        self.last_auth_error = ""

    @callback
    def mark_login_revived(self) -> None:
        """登录成功后由登录模块调用, 恢复协调器登录态标记"""
        self._mark_login_alive()

    async def _async_handle_login_expired(self, reason: str) -> Dict[str, Any]:
        """登录凭证失效时的降级处理 (不再让整条条目进入 setup 失败)

        返回上一份可用数据 + 本地流水缓存，并打上"登录已失效"标记：
        - 数据类传感器保持可用 (显示上次数据并给出状态提示)，不会整片变 unavailable
        - 按钮 / 文本 / 开关 / 时间等控制实体得以保留，可自动或手动完成短信登录
        - 同时启动 Home Assistant 官方重新认证入口 (选项流那条路仍可用)
        """
        first_time = not self.login_expired
        self._mark_login_expired(reason)

        if first_time:
            _LOGGER.warning(
                "电信手机号 %s 登录已失效，条目保持在线以便自动/手动重新登录: %s",
                self.phone,
                reason,
            )
            self._async_start_reauth()
        else:
            _LOGGER.debug("电信手机号 %s 仍处于登录失效状态: %s", self.phone, reason)

        data: Dict[str, Any] = dict(self.data) if isinstance(self.data, dict) else {}
        data["login_expired"] = True
        data["login_error"] = reason
        data["account_status"] = "登录已失效 (需重新登录)"
        data["call_need_auth"] = True
        data["call_auth_status"] = "登录已失效 (需重新登录)"
        data["call_auth_remaining_minutes"] = 0

        # 通话流水用本地缓存兜底，避免历史数据消失
        try:
            await self._async_sync_call_record_cache(data)
        except Exception as err:
            _LOGGER.debug("登录失效时读取流水缓存失败: %s", err)

        return data

    @callback
    def _async_start_reauth(self) -> None:
        """启动 Home Assistant 官方"重新认证"入口 (已有进行中的流程则不重复)"""
        if not self.entry:
            return
        try:
            for flow in self.hass.config_entries.flow.async_progress_by_handler(DOMAIN):
                context = flow.get("context") or {}
                if context.get("entry_id") != self.entry.entry_id:
                    continue
                # 只把"重新认证"流程视为已存在: 用户此刻打开的选项流不应阻止重新认证入口出现
                if str(flow.get("step_id", "")).startswith("reauth"):
                    return
        except Exception as err:
            _LOGGER.debug("检查进行中的重新认证流程失败: %s", err)

        try:
            self.entry.async_start_reauth(self.hass)
            _LOGGER.info("已为手机号 %s 启动重新认证流程", self.phone)
        except Exception as err:
            _LOGGER.debug("启动重新认证流程失败(忽略): %s", err)

    async def _async_sync_call_record_cache(self, data: Dict[str, Any]) -> None:
        """同步通话流水本地缓存

        - 二次认证有效且拉到流水: 覆盖写入本地缓存
        - 二次认证失效/拉取异常: 用本地缓存兜底填充，避免历史流水凭空消失
        """
        try:
            records = data.get("call_records") or []
            need_auth = data.get("call_need_auth") is True

            if records:
                # 防御性排序: 后续"最近一次通话"与缓存截断都假设按时间倒序，
                # 而运营商接口并不保证顺序，避免把最旧的一条当成最近通话
                try:
                    records = sorted(
                        records, key=lambda r: str(r.get("call_time", "")), reverse=True
                    )
                except Exception as err:
                    _LOGGER.debug("通话流水排序失败(保持原顺序): %s", err)

            if not need_auth:
                # 认证有效: 仅在真的拉到流水时落盘
                # (接口成功但返回空只代表当前查询区间确实无通话，不覆盖历史缓存)
                if not records:
                    return

                signature = [
                    len(records),
                    str(records[0].get("call_time", "")),
                    str(records[-1].get("call_time", "")),
                    str(data.get("call_start_date", "")),
                    str(data.get("call_end_date", "")),
                ]
                cached = await self.call_cache.async_load()
                if cached.get("signature") == signature:
                    return

                await self.call_cache.async_save({
                    "signature": signature,
                    "records": records[:CALL_CACHE_MAX_RECORDS],
                    "call_count": len(records),
                    "last_call": data.get("last_call") or records[0],
                    "start_date": str(data.get("call_start_date", "")),
                    "end_date": str(data.get("call_end_date", "")),
                })
                _LOGGER.debug("电信手机号 %s 通话流水已写入本地缓存 (%d 条)", self.phone, len(records))
                return

            # 认证失效: 用本地缓存兜底展示
            cached = await self.call_cache.async_load()
            cached_records = cached.get("records") or []
            if not cached_records:
                return

            # 历史缓存可能是旧字段名 (calle_no/call_area/total_charge)，
            # 这里统一整理并补一次归属地 (用户后来才启用/更新归属地库时也能补上)
            try:
                from .phone_region import enrich_records, get_index

                enrich_records(get_index(), cached_records)
            except Exception as err:
                _LOGGER.debug("整理缓存流水失败(已跳过): %s", err)

            data["call_records"] = cached_records
            # 缓存里 call_count 是截断前的全量条数，优先用它，避免"本月通话次数"前后不一致
            data["call_count"] = cached.get("call_count") or len(cached_records)
            data["last_call"] = cached.get("last_call") or cached_records[0]
            data["call_data_from_cache"] = True
            data["call_cache_saved_at"] = cached.get("saved_at", 0.0)
            data["call_cache_saved_at_text"] = cached.get("saved_at_text", "")
            if cached.get("start_date"):
                data["call_start_date"] = cached["start_date"]
            if cached.get("end_date"):
                data["call_end_date"] = cached["end_date"]

            status = str(data.get("call_auth_status") or "已过期 (需重新认证)")
            data["call_auth_status"] = f"{status} · 展示本地缓存流水"
            _LOGGER.debug(
                "电信手机号 %s 详单授权已失效，改用本地缓存流水 %d 条 (缓存于 %s)",
                self.phone,
                len(cached_records),
                cached.get("saved_at_text", "未知时间"),
            )
        except Exception as err:
            _LOGGER.warning("同步电信手机号 %s 通话流水本地缓存异常: %s", self.phone, err)

    async def async_send_call_auth_sms(self) -> tuple[bool, str]:
        """下发通话流水(语音详单)二次认证短信验证码 (内部自动完成滑块识别)"""
        try:
            async with self._client_lock:
                ok = await self.hass.async_add_executor_job(self.client.send_detail_auth_sms)
        except CarrierAuthExpiredError as err:
            return False, f"登录凭证已失效，请在集成中重新登录 ({err})"
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 下发通话详单验证码异常: %s", self.phone, err)
            return False, f"请求异常 ({err})"

        if ok:
            _LOGGER.info("电信手机号 %s 通话详单验证码短信已下发", self.phone)
            return True, "验证码短信已下发"
        return False, "短信下发被拦截或滑块识别失败，请稍后重试"

    async def async_submit_call_auth_code(
        self,
        sms_code: str,
        user_name: str = "",
        id_card: str = "",
    ) -> tuple[bool, str]:
        """提交「机主姓名 + 身份证号 + 验证码」完成通话详单二次认证

        成功后持久化签名并立即拉取最新流水；三个参数缺一不可。
        """
        code = str(sms_code or "").strip()
        options = self.entry.options if self.entry else {}
        name = str(user_name or "").strip() or str(options.get(CONF_AUTH_USER_NAME, "") or "").strip()
        id_no = str(id_card or "").strip() or str(options.get(CONF_AUTH_ID_CARD, "") or "").strip()

        missing = [
            label
            for label, value in (("验证码", code), ("机主姓名", name), ("身份证号", id_no))
            if not value
        ]
        if missing:
            return False, "缺少" + "、".join(missing) + "，请在对应实体中填写后重试"

        try:
            async with self._client_lock:
                ok, msg, signature = await self.hass.async_add_executor_job(
                    self.client.verify_detail_auth, name, id_no, code
                )
        except CarrierAuthExpiredError as err:
            return False, f"登录凭证已失效，请在集成中重新登录 ({err})"
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 提交通话详单认证异常: %s", self.phone, err)
            return False, f"请求异常 ({err})"

        if not ok:
            return False, msg or "认证失败"

        # 签名与实名信息写入 options 供后续轮询/回填使用 (运行时选项变化，不会触发集成重载)
        if self.entry:
            new_options = dict(self.entry.options)
            if signature:
                new_options[CONF_SIGNATURE_STRING] = signature
            new_options[CONF_SIGNATURE_TIMESTAMP] = time.time()
            if name:
                new_options[CONF_AUTH_USER_NAME] = name
            if id_no:
                new_options[CONF_AUTH_ID_CARD] = id_no
            self.hass.config_entries.async_update_entry(self.entry, options=new_options)

        # 立即拉取最新通话流水。
        # 用 async_request_refresh (HA 自带合并/冷却) 而不是 async_refresh：
        # 上面写 options 已触发 __init__.async_update_options 里的即时刷新，
        # 直接再 refresh 会对运营商接口多打一次全量请求。
        try:
            await self.async_request_refresh()
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 认证成功后拉取流水异常: %s", self.phone, err)
        return True, msg or "认证成功"

    # ------------------------------------------------------------------ 短信登录
    async def async_probe_login_state(self) -> str:
        """主动探活登录态: "ok" / "expired" / "error"(网络问题)"""
        try:
            async with self._client_lock:
                state = await self.hass.async_add_executor_job(self.client.probe_token)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 登录态探活异常: %s", self.phone, err)
            return "error"

        if state == "expired" and not self.login_expired:
            self._mark_login_expired("探活发现登录凭证已失效")
        return state

    async def async_send_login_sms(self) -> tuple[bool, str]:
        """下发短信登录验证码 (内部自动完成滑块识别)"""
        try:
            async with self._client_lock:
                ok = await self.hass.async_add_executor_job(self.client.send_sms)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 下发登录验证码异常: %s", self.phone, err)
            return False, f"请求异常 ({err})"

        if ok:
            _LOGGER.info("电信手机号 %s 登录验证码短信已下发", self.phone)
            return True, "登录验证码短信已下发"
        return False, "短信下发被拦截或滑块识别失败，请稍后重试"

    async def async_login_with_sms(self, code: str) -> tuple[bool, str]:
        """用短信验证码完成登录 (成功时 client 内部已装载新 token)"""
        try:
            async with self._client_lock:
                ok = await self.hass.async_add_executor_job(self.client.login_with_sms, code)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 短信登录异常: %s", self.phone, err)
            return False, f"请求异常 ({err})"

        if ok:
            return True, "登录成功"
        return False, "验证码错误或已过期"


class UnicomDataUpdateCoordinator(DataUpdateCoordinator):
    """中国联通独立数据协调器 (短效Token滚动，每10分钟平稳保活并拉取数据)"""

    def __init__(self, hass: HomeAssistant, phone: str, auth_data: dict, entry=None) -> None:
        self.phone = phone
        self.entry = entry
        self.client = UnicomClient(phone, auth_data)
        interval_min = DEFAULT_SCAN_INTERVAL_UNICOM
        if entry:
            try:
                interval_min = int(entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_UNICOM))
            except Exception:
                interval_min = DEFAULT_SCAN_INTERVAL_UNICOM

        interval_min = max(MIN_SCAN_INTERVAL, interval_min)

        super().__init__(
            hass,
            _LOGGER,
            name=f"China Unicom ({phone})",
            update_interval=timedelta(minutes=interval_min),
        )

    async def _async_update_data(self) -> Dict[str, Any]:
        """异步拉取联通数据并执行 3 分钟 onLine.htm 滚动保活"""
        try:
            data = await self.hass.async_add_executor_job(self.client.fetch_all_data)
            if not data or not isinstance(data, dict):
                raise UpdateFailed("联通接口返回空数据")
            
            # 若有新的 token_online，可平滑更新 entry.data 与专属 storage 文件
            if self.entry and self.client.token_online:
                new_auth = self.client.export_auth()
                if new_auth != self.entry.data.get("auth_data"):
                    new_data = dict(self.entry.data)
                    new_data["auth_data"] = new_auth
                    self.hass.config_entries.async_update_entry(self.entry, data=new_data)
                    await async_save_carrier_account(self.hass, CARRIER_UNICOM, self.phone, new_auth)

            return data
        except CarrierAuthExpiredError as auth_err:
            _LOGGER.warning("联通手机号 %s 登录凭证已失效，触发 Home Assistant 重新认证: %s", self.phone, auth_err)
            raise ConfigEntryAuthFailed(f"联通登录凭证失效: {auth_err}") from auth_err
        except Exception as err:
            _LOGGER.error("拉取联通手机号 %s 数据/保活异常: %s", self.phone, err)
            raise UpdateFailed(f"联通接口通信失败: {err}") from err
