# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 核心集成入口"""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.const import Platform

from .const import DOMAIN, CARRIER_TELECOM, CARRIER_UNICOM, CONF_CARRIER, CONF_PHONE, CONF_AUTH_DATA
from .coordinator import TelecomDataUpdateCoordinator, UnicomDataUpdateCoordinator
from .views import CarrierSliderPageView, CarrierSliderVerifyView

from .storage import async_remove_carrier_account

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """初始化全局组件环境，注册联通方案一滑块服务视图"""
    hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(CarrierSliderPageView)
    hass.http.register_view(CarrierSliderVerifyView)
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """加载配置条目，初始化专属协调器并挂载平台"""
    carrier = entry.data[CONF_CARRIER]
    phone = entry.data[CONF_PHONE]
    auth_data = entry.data.get(CONF_AUTH_DATA) or {}

    if carrier == CARRIER_TELECOM:
        coordinator = TelecomDataUpdateCoordinator(hass, phone, auth_data, entry=entry)
    elif carrier == CARRIER_UNICOM:
        coordinator = UnicomDataUpdateCoordinator(hass, phone, auth_data, entry=entry)
    else:
        _LOGGER.error("未知的运营商类型: %s", carrier)
        return False

    # 执行首次拉取，确保实体初始化即有数据
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "carrier": carrier,
        "phone": phone,
    }

    # 注册配置选项更新监听器
    entry.async_on_unload(entry.add_update_listener(async_update_options))

    # 转发加载 Sensor 平台
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """当用户更新集成选项时，重新加载条目以应用新设置"""
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """卸载指定手机号条目"""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok

async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """当用户在前端彻底删除该集成条目时，同步清理专属存储文件中的凭据"""
    carrier = entry.data.get(CONF_CARRIER)
    phone = entry.data.get(CONF_PHONE)
    if carrier and phone:
        _LOGGER.info("正在清理手机号 %s 在专属存储文件中的持久化凭据", phone)
        await async_remove_carrier_account(hass, carrier, phone)
