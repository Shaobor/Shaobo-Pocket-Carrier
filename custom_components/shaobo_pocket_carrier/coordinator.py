# -*- coding: utf-8 -*-
"""中国运营商专属协调器模块 (电信/联通模块化隔离)"""
import asyncio
import logging
import datetime
import time
from datetime import timedelta
from typing import Any, Dict

from homeassistant.core import HomeAssistant
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
            return data
        except CarrierAuthExpiredError as auth_err:
            _LOGGER.warning("电信手机号 %s 登录凭证已失效，触发 Home Assistant 重新认证: %s", self.phone, auth_err)
            raise ConfigEntryAuthFailed(f"电信登录凭证失效: {auth_err}") from auth_err
        except Exception as err:
            _LOGGER.error("拉取电信手机号 %s 数据异常: %s", self.phone, err)
            raise UpdateFailed(f"电信接口通信失败: {err}") from err

    async def _async_sync_call_record_cache(self, data: Dict[str, Any]) -> None:
        """同步通话流水本地缓存

        - 二次认证有效且拉到流水: 覆盖写入本地缓存
        - 二次认证失效/拉取异常: 用本地缓存兜底填充，避免历史流水凭空消失
        """
        try:
            records = data.get("call_records") or []
            need_auth = data.get("call_need_auth") is True

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

            data["call_records"] = cached_records
            data["call_count"] = len(cached_records)
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

        # 立即拉取最新通话流水
        try:
            await self.async_refresh()
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 认证成功后拉取流水异常: %s", self.phone, err)
        return True, msg or "认证成功"


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
