# -*- coding: utf-8 -*-
"""中国运营商专属协调器模块 (电信/联通模块化隔离)"""
import logging
from datetime import timedelta
from typing import Any, Dict

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    UPDATE_INTERVAL_TELECOM,
    UPDATE_INTERVAL_UNICOM,
    CARRIER_UNICOM,
    CarrierAuthExpiredError,
)
from .api.telecom import TelecomClient
from .api.unicom import UnicomClient
from .storage import async_save_carrier_account

_LOGGER = logging.getLogger(__name__)

class TelecomDataUpdateCoordinator(DataUpdateCoordinator):
    """中国电信独立数据协调器 (长效Token，定时30分钟轮询)"""

    def __init__(self, hass: HomeAssistant, phone: str, auth_data: dict) -> None:
        self.phone = phone
        self.client = TelecomClient(phone, auth_data)
        super().__init__(
            hass,
            _LOGGER,
            name=f"China Telecom ({phone})",
            update_interval=timedelta(seconds=UPDATE_INTERVAL_TELECOM),
        )

    async def _async_update_data(self) -> Dict[str, Any]:
        """异步拉取电信数据"""
        try:
            data = await self.hass.async_add_executor_job(self.client.fetch_all_data)
            if not data or not isinstance(data, dict):
                raise UpdateFailed("电信接口返回空数据")
            return data
        except CarrierAuthExpiredError as auth_err:
            _LOGGER.warning("电信手机号 %s 登录凭证已失效，触发 Home Assistant 重新认证: %s", self.phone, auth_err)
            raise ConfigEntryAuthFailed(f"电信登录凭证失效: {auth_err}") from auth_err
        except Exception as err:
            _LOGGER.error("拉取电信手机号 %s 数据异常: %s", self.phone, err)
            raise UpdateFailed(f"电信接口通信失败: {err}") from err


class UnicomDataUpdateCoordinator(DataUpdateCoordinator):
    """中国联通独立数据协调器 (短效Token滚动，每10分钟平稳保活并拉取数据)"""

    def __init__(self, hass: HomeAssistant, phone: str, auth_data: dict, entry=None) -> None:
        self.phone = phone
        self.entry = entry
        self.client = UnicomClient(phone, auth_data)
        super().__init__(
            hass,
            _LOGGER,
            name=f"China Unicom ({phone})",
            update_interval=timedelta(seconds=UPDATE_INTERVAL_UNICOM),
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
