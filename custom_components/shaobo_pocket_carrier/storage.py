# -*- coding: utf-8 -*-
"""中国运营商专属存储模块 (电信: Shaobo_Telecom / 联通: Shaobo_Unicom)"""
import logging
import time
from typing import Any, Dict, Optional

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from .const import (
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    STORAGE_KEY_TELECOM,
    STORAGE_KEY_UNICOM,
    STORAGE_KEY_CALL_CACHE,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

def _get_storage_key(carrier: str) -> str:
    """获取对应的存储文件名"""
    if carrier == CARRIER_TELECOM:
        return STORAGE_KEY_TELECOM
    elif carrier == CARRIER_UNICOM:
        return STORAGE_KEY_UNICOM
    return f"Shaobo_{carrier.capitalize()}"

async def async_save_carrier_account(hass: HomeAssistant, carrier: str, phone: str, auth_data: dict) -> None:
    """保存或更新手机号凭据到对应的专属存储文件 (.storage/Shaobo_Telecom 或 .storage/Shaobo_Unicom)"""
    storage_key = _get_storage_key(carrier)
    store = Store(hass, STORAGE_VERSION, storage_key)
    data = await store.async_load() or {}
    
    # 每个号码一条记录
    data[phone] = {
        "carrier": carrier,
        "phone": phone,
        "auth_data": auth_data,
    }
    await store.async_save(data)
    _LOGGER.info("已将手机号 %s 的最新凭据同步写入 .storage/%s", phone, storage_key)

async def async_remove_carrier_account(hass: HomeAssistant, carrier: str, phone: str) -> None:
    """从专属存储文件移除指定手机号"""
    storage_key = _get_storage_key(carrier)
    store = Store(hass, STORAGE_VERSION, storage_key)
    data = await store.async_load()
    if data and phone in data:
        data.pop(phone, None)
        await store.async_save(data)
        _LOGGER.info("已从 .storage/%s 中移除手机号 %s", storage_key, phone)

async def async_load_carrier_accounts(hass: HomeAssistant, carrier: str) -> dict:
    """读取指定运营商存储的所有手机号账号信息"""
    storage_key = _get_storage_key(carrier)
    store = Store(hass, STORAGE_VERSION, storage_key)
    return await store.async_load() or {}


class CallRecordCache:
    """通话流水(语音详单)本地 JSON 缓存 (位于 <HA配置目录>/.storage/Shaobo_CallRecords)

    通话详单二次认证有效期仅 30 分钟，认证一旦失效运营商接口就不再返回流水。
    此处按号码缓存最近一次成功拉取的完整流水，认证失效或拉取异常时用于兜底展示，
    避免历史通话数据凭空消失；同时该文件为普通 JSON，可离线查看。
    """

    def __init__(self, hass: HomeAssistant, carrier: str, phone: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY_CALL_CACHE)
        self._key = f"{carrier}_{phone}"
        self._carrier = carrier
        self._phone = phone
        self._data: Optional[Dict[str, Any]] = None

    async def _async_ensure_loaded(self) -> Dict[str, Any]:
        """惰性加载整个缓存文件 (只读盘一次)"""
        if self._data is None:
            loaded = await self._store.async_load()
            self._data = loaded if isinstance(loaded, dict) else {}
        return self._data

    async def async_load(self) -> Dict[str, Any]:
        """读取当前号码的缓存 (无缓存返回空字典)"""
        data = await self._async_ensure_loaded()
        item = data.get(self._key)
        return dict(item) if isinstance(item, dict) else {}

    async def async_save(self, payload: Dict[str, Any]) -> None:
        """覆盖写入当前号码的缓存"""
        data = await self._async_ensure_loaded()
        item = dict(payload)
        item["carrier"] = self._carrier
        item["phone"] = self._phone
        item["saved_at"] = time.time()
        item["saved_at_text"] = time.strftime("%Y-%m-%d %H:%M:%S")
        data[self._key] = item
        await self._store.async_save(data)

    async def async_remove(self) -> None:
        """删除当前号码的缓存 (删除集成条目时清理)"""
        data = await self._async_ensure_loaded()
        if self._key in data:
            data.pop(self._key, None)
            await self._store.async_save(data)
            _LOGGER.info("已清理手机号 %s 的通话流水本地缓存", self._phone)


async def async_remove_call_record_cache(hass: HomeAssistant, carrier: str, phone: str) -> None:
    """删除指定号码的通话流水本地缓存"""
    await CallRecordCache(hass, carrier, phone).async_remove()

