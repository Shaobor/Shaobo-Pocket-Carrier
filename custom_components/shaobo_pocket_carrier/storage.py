# -*- coding: utf-8 -*-
"""中国运营商专属存储模块 (电信: Shaobo_Telecom / 联通: Shaobo_Unicom)"""
import logging
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from .const import (
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    STORAGE_KEY_TELECOM,
    STORAGE_KEY_UNICOM,
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

