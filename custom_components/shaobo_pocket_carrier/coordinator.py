# -*- coding: utf-8 -*-
"""中国运营商专属协调器模块 (电信/联通模块化隔离)"""
import asyncio
import logging
import datetime
import time
from datetime import timedelta
from typing import Any, Dict, Optional

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
from .api.unicom import UnicomClient, month_range, resolve_query_month
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

    @staticmethod
    def _sort_detail_records(prefix: str, records: list) -> list:
        """详单记录按时间倒序 (接口不保证顺序)

        "最近一次通话/最新一条短信/最新一次上网"与缓存截断都假设按时间倒序，
        排序失败时保持原顺序, 不影响主流程。
        """
        key_name = "call_time" if prefix == "call" else "datetime"
        try:
            return sorted(records, key=lambda r: str(r.get(key_name, "")), reverse=True)
        except Exception as err:
            _LOGGER.debug("%s 详单排序失败(保持原顺序): %s", prefix, err)
            return records

    async def _async_sync_call_record_cache(self, data: Dict[str, Any]) -> None:
        """同步"通话 / 短信 / 上网流量"三类详单的本地缓存

        - 二次认证有效且拉到记录: 三类一起覆盖写入 (同一个缓存文件，避免互相覆盖)
        - 二次认证失效/拉取异常: 三类都用本地缓存兜底填充，避免历史数据凭空消失
        """
        try:
            need_auth = data.get("call_need_auth") is True
            # 通话保持旧键名 (records/call_count/last_call)，短信与流量用 <prefix>_ 前缀
            collected: Dict[str, Dict[str, Any]] = {}
            for prefix in ("call", "sms", "net"):
                # 数据字典里通话流水的键名是 call_records (缓存文件里才是 records)
                raw = list(data.get("call_records" if prefix == "call" else f"{prefix}_records") or [])
                collected[prefix] = {
                    "records": self._sort_detail_records(prefix, raw),
                    "count": data.get("call_count" if prefix == "call" else f"{prefix}_count") or len(raw),
                    "daily": data.get(f"{prefix}_daily") or [],
                    "total": data.get(f"{prefix}_total") or {},
                    "last": data.get("last_call" if prefix == "call" else f"{prefix}_last")
                    or (raw[0] if raw else {}),
                    "start": data.get(f"{prefix}_start_date") or data.get("call_start_date", ""),
                    "end": data.get(f"{prefix}_end_date") or data.get("call_end_date", ""),
                }

            if not need_auth:
                # 认证有效: 仅在真的拉到记录时落盘
                # (接口成功但返回空只代表当前查询区间确实无记录，不覆盖历史缓存)
                if not any(group["records"] for group in collected.values()):
                    return

                signature = []
                for prefix in ("call", "sms", "net"):
                    group = collected[prefix]
                    time_key = "call_time" if prefix == "call" else "datetime"
                    first = group["records"][0] if group["records"] else {}
                    last = group["records"][-1] if group["records"] else {}
                    signature.append([
                        len(group["records"]),
                        str(first.get(time_key, "")),
                        str(last.get(time_key, "")),
                        str(group["start"]),
                        str(group["end"]),
                    ])
                cached = await self.call_cache.async_load()
                if cached.get("signature") == signature:
                    return

                payload: Dict[str, Any] = {
                    "signature": signature,
                    "records": collected["call"]["records"][:CALL_CACHE_MAX_RECORDS],
                    "call_count": collected["call"]["count"],
                    "last_call": collected["call"]["last"],
                    "start_date": str(collected["call"]["start"]),
                    "end_date": str(collected["call"]["end"]),
                }
                for prefix in ("sms", "net"):
                    group = collected[prefix]
                    payload[f"{prefix}_records"] = group["records"][:CALL_CACHE_MAX_RECORDS]
                    payload[f"{prefix}_count"] = group["count"]
                    payload[f"{prefix}_daily"] = group["daily"]
                    payload[f"{prefix}_total"] = group["total"]
                    payload[f"{prefix}_last"] = group["last"]
                    payload[f"{prefix}_start_date"] = str(group["start"])
                    payload[f"{prefix}_end_date"] = str(group["end"])
                await self.call_cache.async_save(payload)
                _LOGGER.debug(
                    "电信手机号 %s 详单已写入本地缓存 (通话 %d / 短信 %d / 流量 %d 条)",
                    self.phone,
                    len(collected["call"]["records"]),
                    len(collected["sms"]["records"]),
                    len(collected["net"]["records"]),
                )
                return

            # 认证失效: 三类都用本地缓存兜底展示
            cached = await self.call_cache.async_load()
            saved_text = cached.get("saved_at_text", "")
            restored = 0
            for prefix in ("call", "sms", "net"):
                records = cached.get("records" if prefix == "call" else f"{prefix}_records") or []
                if not records:
                    continue
                # 历史缓存可能是旧字段名 (calle_no/call_area/total_charge)，
                # 这里统一整理并补一次归属地 (用户后来才启用/更新归属地库时也能补上)
                if prefix == "call":
                    try:
                        from .phone_region import enrich_records, get_index

                        enrich_records(get_index(), records)
                    except Exception as err:
                        _LOGGER.debug("整理缓存流水失败(已跳过): %s", err)
                    data["call_records"] = records
                    # 缓存里 call_count 是截断前的全量条数，优先用它，避免"本月通话次数"前后不一致
                    data["call_count"] = cached.get("call_count") or len(records)
                    data["last_call"] = cached.get("last_call") or records[0]
                    if cached.get("start_date"):
                        data["call_start_date"] = cached["start_date"]
                    if cached.get("end_date"):
                        data["call_end_date"] = cached["end_date"]
                else:
                    if prefix == "sms":
                        # 缓存里的短信记录可能是早期版本解析的(只有 sendNo 原始字段),
                        # 这里补一次对端号码还原 + 归属地/坐标
                        try:
                            from .phone_region import enrich_number_fields, decrypt_number

                            for record in records:
                                if not str(record.get("phone_number", "")).strip():
                                    for key in ("sendNo", "receiveNo", "oppositeNumber", "calleNo"):
                                        if record.get(key):
                                            record["phone_number_raw"] = str(record[key])
                                            record["phone_number"] = decrypt_number(record[key])
                                            break
                            enrich_number_fields(records)
                        except Exception as err:
                            _LOGGER.debug("整理缓存短信记录失败(已跳过): %s", err)
                    data[f"{prefix}_records"] = records
                    data[f"{prefix}_count"] = cached.get(f"{prefix}_count") or len(records)
                    data[f"{prefix}_daily"] = cached.get(f"{prefix}_daily") or []
                    data[f"{prefix}_total"] = cached.get(f"{prefix}_total") or {}
                    data[f"{prefix}_last"] = cached.get(f"{prefix}_last") or records[0]
                    if cached.get(f"{prefix}_start_date"):
                        data[f"{prefix}_start_date"] = cached[f"{prefix}_start_date"]
                    if cached.get(f"{prefix}_end_date"):
                        data[f"{prefix}_end_date"] = cached[f"{prefix}_end_date"]
                    data[f"{prefix}_status"] = "已过期 (需重新认证) · 展示本地缓存"
                data[f"{prefix}_data_from_cache"] = True
                data[f"{prefix}_cache_saved_at"] = cached.get("saved_at", 0.0)
                data[f"{prefix}_cache_saved_at_text"] = saved_text
                restored += len(records)

            if not restored:
                return

            status = str(data.get("call_auth_status") or "已过期 (需重新认证)")
            data["call_auth_status"] = f"{status} · 展示本地缓存流水"
            _LOGGER.debug(
                "电信手机号 %s 详单授权已失效，改用本地缓存 (共 %d 条, 缓存于 %s)",
                self.phone,
                restored,
                saved_text or "未知时间",
            )
        except Exception as err:
            _LOGGER.warning("同步电信手机号 %s 详单本地缓存异常: %s", self.phone, err)

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
        # 通话流水本地缓存 (.storage/Shaobo_CallRecords)，认证失效/未更新时兜底展示历史流水
        self.call_cache = CallRecordCache(hass, CARRIER_UNICOM, phone)
        # 下一轮刷新强制拉取详单 (「刷新详单流水」按钮 / 修改查询起始日期等主动操作)，
        # 不受「自动获取通话记录」开关限制，用后即清
        self._force_detail_fetch = False
        # 当前展示的详单所属月份 (YYYY-MM)；None = 尚未从本地缓存读取
        self._detail_month: Optional[str] = None
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

    @property
    def auto_query_enabled(self) -> bool:
        """「自动获取通话记录」开关是否开启 (开关实体恢复状态之前视为关闭)"""
        store = self.hass.data.get(DOMAIN, {}).get(self.entry.entry_id) if self.entry else None
        runtime = store.get("auth_runtime") if isinstance(store, dict) else None
        return bool(getattr(runtime, "auto_query_enabled", False))

    def request_detail_fetch(self) -> None:
        """让下一轮刷新强制拉取三类详单 (不受「自动获取通话记录」开关限制)"""
        self._force_detail_fetch = True

    async def async_refresh_details(self) -> bool:
        """立即刷新一次并强制拉取详单，返回是否刷新成功"""
        self.request_detail_fetch()
        await self.async_refresh()
        return self.last_update_success

    async def _async_sync_call_record_cache(self, data: Dict[str, Any], query_month: str) -> None:
        """同步联通通话/短信/上网三类详单的本地缓存 (拉到记录时落盘，失效或空时用本地缓存兜底)

        兜底只用查询月份 (YYYY-MM) 相同的缓存: 月初还没有新流水时，
        不能把上个月的缓存当成本月数据展示。
        """
        try:
            raw_records = list(data.get("call_records") or [])
            sms_records = list(data.get("sms_records") or [])
            net_records = list(data.get("net_records") or [])

            if raw_records or sms_records or net_records:
                # 按照通话时间倒序排序
                if raw_records:
                    raw_records.sort(key=lambda r: str(r.get("call_time", "")), reverse=True)
                first = raw_records[0] if raw_records else {}
                last = raw_records[-1] if raw_records else {}
                signature = [
                    len(raw_records),
                    str(first.get("call_time", "")),
                    str(last.get("call_time", "")),
                    len(sms_records),
                    len(net_records),
                    str(data.get("call_start_date", "")),
                    str(data.get("call_end_date", "")),
                ]
                cached = await self.call_cache.async_load()
                if cached.get("signature") == signature:
                    return

                payload = {
                    "signature": signature,
                    "records": raw_records[:CALL_CACHE_MAX_RECORDS],
                    "call_count": data.get("call_count", len(raw_records)),
                    "last_call": raw_records[0] if raw_records else {},
                    "start_date": str(data.get("call_start_date", "")),
                    "end_date": str(data.get("call_end_date", "")),
                    # 短信详单
                    "sms_records": sms_records[:CALL_CACHE_MAX_RECORDS],
                    "sms_count": data.get("sms_count", len(sms_records)),
                    "sms_daily": data.get("sms_daily") or [],
                    "sms_total": data.get("sms_total") or {},
                    "sms_last": data.get("sms_last") or (sms_records[0] if sms_records else {}),
                    "sms_start_date": str(data.get("sms_start_date", "")),
                    "sms_end_date": str(data.get("sms_end_date", "")),
                    # 上网流量详单
                    "net_records": net_records[:CALL_CACHE_MAX_RECORDS],
                    "net_count": data.get("net_count", len(net_records)),
                    "net_daily": data.get("net_daily") or [],
                    "net_total": data.get("net_total") or {},
                    "net_last": data.get("net_last") or (net_records[0] if net_records else {}),
                    "net_start_date": str(data.get("net_start_date", "")),
                    "net_end_date": str(data.get("net_end_date", "")),
                }
                await self.call_cache.async_save(payload)
                _LOGGER.debug(
                    "联通手机号 %s 详单已写入本地缓存 (通话 %d 条 / 短信 %d 条 / 上网 %d 条)",
                    self.phone, len(raw_records), len(sms_records), len(net_records),
                )
                return

            # 无实时数据时用本地缓存兜底 (只用同月缓存，区间按查询月份重新计算，兼容旧格式缓存)
            cached = await self.call_cache.async_load()
            saved_text = cached.get("saved_at_text", "")
            range_start, range_end = month_range(query_month[:4], query_month[5:7])
            # 本轮没拉详单时数据里没有区间，补上查询月份的区间 (否则传感器显示"当月月初")
            for prefix in ("call", "sms", "net"):
                data.setdefault(f"{prefix}_start_date", range_start)
                data.setdefault(f"{prefix}_end_date", range_end)
            # 本轮没拉详单时，同月缓存里的空清单也要用上 (= 上次拉取时该月就没有记录)，
            # 否则会被误显示成"未获取"
            paused = bool(data.get("detail_fetch_paused"))

            # 1. 通话记录兜底
            records = cached.get("records") or []
            same_month = str(cached.get("start_date") or "")[:7] == query_month
            if (records or paused) and not data.get("call_records") and same_month:
                if records:
                    try:
                        from .phone_region import enrich_records, get_index
                        enrich_records(get_index(), records)
                    except Exception as err:
                        _LOGGER.debug("整理联通缓存流水失败: %s", err)
                data["call_records"] = records
                data["call_count"] = cached.get("call_count") or len(records)
                data["last_call"] = cached.get("last_call") or (records[0] if records else {})
                data["call_data_from_cache"] = True
                data["call_cache_saved_at_text"] = saved_text
                _LOGGER.debug("联通手机号 %s 使用本地缓存兜底通话记录 (%d 条)", self.phone, len(records))

            # 2. 短信详单与上网详单兜底
            for prefix in ("sms", "net"):
                c_records = cached.get(f"{prefix}_records") or []
                same_month = str(cached.get(f"{prefix}_start_date") or "")[:7] == query_month
                if (c_records or paused) and not data.get(f"{prefix}_records") and same_month:
                    data[f"{prefix}_records"] = c_records
                    data[f"{prefix}_count"] = cached.get(f"{prefix}_count") or len(c_records)
                    data[f"{prefix}_daily"] = cached.get(f"{prefix}_daily") or []
                    data[f"{prefix}_total"] = cached.get(f"{prefix}_total") or {}
                    data[f"{prefix}_last"] = cached.get(f"{prefix}_last") or (c_records[0] if c_records else {})
                    data[f"{prefix}_data_from_cache"] = True
                    data[f"{prefix}_cache_saved_at_text"] = saved_text
                    _LOGGER.debug("联通手机号 %s 使用本地缓存兜底%s记录 (%d 条)", self.phone, prefix, len(c_records))
        except Exception as err:
            _LOGGER.debug("同步联通详单记录缓存异常: %s", err)

    async def _async_update_data(self) -> Dict[str, Any]:
        """异步拉取联通数据并执行 3 分钟 onLine.htm 滚动保活"""
        if not getattr(self, "_last_metrics_loaded", False):
            try:
                from .storage import async_load_carrier_metrics
                cached_metrics = await async_load_carrier_metrics(self.hass, CARRIER_UNICOM, self.phone)
                if cached_metrics and isinstance(cached_metrics, dict):
                    if not hasattr(self, "last_valid_metrics"):
                        self.last_valid_metrics = {}
                    self.last_valid_metrics.update(cached_metrics)
                self._last_metrics_loaded = True
            except Exception as err:
                _LOGGER.debug("加载持久化有效指标失败: %s", err)

        start_date = ""
        if self.entry:
            start_date = str(self.entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
            if start_date == datetime.date.today().replace(day=1).strftime("%Y-%m-%d"):
                start_date = ""

        # 联通按自然月查询详单
        yyyy, mm, _dd = resolve_query_month(start_date)
        query_month = f"{yyyy}-{mm}"
        if self._detail_month is None:
            cached = await self.call_cache.async_load()
            self._detail_month = str(cached.get("start_date") or "")[:7]

        # 以下情况拉取详单，否则只刷新话费/流量，详单用同月的本地缓存展示:
        # 「自动获取通话记录」开启 / 主动请求 (刷新详单流水、改日期) /
        # 查询月份与当前展示的详单不是同一个月 (改日期、每日重置、跨月)，保证日期与详单对得上
        fetch_details = (
            self._force_detail_fetch
            or self.auto_query_enabled
            or query_month != self._detail_month
        )
        self._force_detail_fetch = False

        try:
            data = await self.hass.async_add_executor_job(
                self.client.fetch_all_data, start_date, fetch_details
            )
            if not data or not isinstance(data, dict):
                raise UpdateFailed("联通接口返回空数据")

            # 出账期/接口异常防抖保护:
            # 联通每月1日 0:00-8:00 是月结锁账期，接口锁定返回 canusefeecust: 0.00 / curntbalancecust: "--"
            # 此时绝不能将正常话费清空覆盖为 0，必须平滑继承上一次有效余额
            is_limit = data.get("is_limit_period") is True
            balance_fetched = data.get("balance_fetched") is True
            cur_bal = data.get("balance", 0.0)

            if not hasattr(self, "last_valid_metrics"):
                self.last_valid_metrics = {}

            last_bal = self.last_valid_metrics.get("balance")
            if (not balance_fetched or (is_limit and cur_bal == 0.0)) and last_bal is not None:
                data["balance"] = last_bal
                data["balance_source"] = "出账期保留历史有效余额"
                data["limit_period_notice"] = "每月1日0点至8点系统出账期 (当前展示出账前有效余额)"
                _LOGGER.info("联通手机号 %s 处于月初出账期，平滑继承有效话费余额: %s 元", self.phone, last_bal)
            elif balance_fetched and cur_bal != 0.0:
                self.last_valid_metrics["balance"] = cur_bal
                try:
                    from .storage import async_save_carrier_metrics
                    await async_save_carrier_metrics(self.hass, CARRIER_UNICOM, self.phone, self.last_valid_metrics)
                except Exception as err:
                    _LOGGER.debug("持久化有效指标失败: %s", err)

            # 通话流水本地缓存同步 (成功拉取时落盘，失效/空/本轮未拉取时用同月缓存兜底)
            if not fetch_details:
                data["detail_fetch_paused"] = True
            await self._async_sync_call_record_cache(data, query_month)
            if fetch_details:
                self._detail_month = query_month

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
