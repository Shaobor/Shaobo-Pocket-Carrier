# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 传感器平台分发入口 (模块化架构)"""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CARRIER_TELECOM, CARRIER_UNICOM, CONF_CARRIER, CONF_PHONE
from .platforms.overview import create_overview_sensor
from .platforms.telecom_sensor import get_telecom_sensors
from .platforms.unicom_sensor import get_unicom_sensors

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """根据 ConfigEntry 绑定的运营商和手机号，分发并加载专属模块的传感器列表"""
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]
    carrier = entry.data.get(CONF_CARRIER)
    phone = entry.data.get(CONF_PHONE)

    sensors = []
    if carrier == CARRIER_TELECOM:
        _LOGGER.debug("正在为电信手机号 %s 注册专属传感器模块", phone)
        sensors = get_telecom_sensors(coordinator, phone, entry=entry)
    elif carrier == CARRIER_UNICOM:
        _LOGGER.debug("正在为联通手机号 %s 注册专属传感器模块", phone)
        sensors = get_unicom_sensors(coordinator, phone)
    else:
        _LOGGER.error("未知的运营商类型: %s", carrier)

    if sensors:
        # 追加「数据总览」实体: 把该手机号下所有传感器的状态与属性聚合到一个实体的属性上
        # (每个传感器一个节点), 源实体全部保留, 不影响既有引用与长期统计
        sensors.append(create_overview_sensor(hass, coordinator, carrier, phone, entry))
        async_add_entities(sensors, update_before_add=False)

