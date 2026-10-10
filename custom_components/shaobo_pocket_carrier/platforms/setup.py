# -*- coding: utf-8 -*-
"""各平台的实际装配逻辑 (根目录的平台入口文件只保留转发)

Home Assistant 通过 importlib.import_module(f"{domain}.{platform}") 加载平台入口，
因此 sensor.py / text.py / button.py / date.py 必须留在集成根目录、且以平台名命名，
不能移动到 platforms/ 子目录；本模块把真正的装配逻辑集中起来，
根目录文件因此可以只剩一行转发：
    from .platforms.setup import async_setup_carrier_texts as async_setup_entry
"""
import logging
from typing import Any, Optional, Tuple

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from ..const import (
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    CARRIER_MOBILE,
    CONF_CARRIER,
    CONF_PHONE,
    DOMAIN,
)
from .auto_query import (
    create_auto_login_switch,
    create_auto_query_switch,
    create_auto_query_time,
    create_daily_reset_switch,
)
from .mobile_auth import (
    create_mobile_auth_button_entity,
    create_mobile_auth_text_entity,
)
from .mobile_sensor import get_mobile_sensors
from .overview import create_overview_sensor
from .region_db import create_region_auto_switch, create_region_update_button
from .telecom_auth import (
    create_call_auth_button_entity,
    create_call_auth_text_entities,
    create_call_query_start_date_entity,
)
from .telecom_sensor import get_telecom_sensors
from .unicom_detail import create_detail_refresh_button
from .unicom_sensor import get_unicom_sensors

_LOGGER = logging.getLogger(__name__)


def get_carrier_context(
    hass: HomeAssistant, entry: ConfigEntry
) -> Optional[Tuple[Any, str, str]]:
    """取条目对应的 (coordinator, carrier, phone)；条目尚未就绪时返回 None"""
    store = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not isinstance(store, dict):
        return None
    coordinator = store.get("coordinator")
    carrier = entry.data.get(CONF_CARRIER)
    phone = entry.data.get(CONF_PHONE)
    if coordinator is None or not carrier or not phone:
        return None
    return coordinator, carrier, phone


async def async_setup_carrier_sensors(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """传感器平台: 按运营商分发专属模块，并追加数据总览聚合实体"""
    context = get_carrier_context(hass, entry)
    if context is None:
        _LOGGER.warning("条目 %s 尚未就绪，跳过传感器注册", entry.entry_id)
        return
    coordinator, carrier, phone = context

    if carrier == CARRIER_TELECOM:
        _LOGGER.debug("正在为电信手机号 %s 注册专属传感器模块", phone)
        sensors = get_telecom_sensors(coordinator, phone, entry=entry)
    elif carrier == CARRIER_UNICOM:
        _LOGGER.debug("正在为联通手机号 %s 注册专属传感器模块", phone)
        sensors = get_unicom_sensors(coordinator, phone)
    elif carrier == CARRIER_MOBILE:
        _LOGGER.debug("正在为移动手机号 %s 注册专属传感器模块", phone)
        sensors = get_mobile_sensors(coordinator, phone, entry=entry)
    else:
        _LOGGER.error("未知的运营商类型: %s", carrier)
        return

    if not sensors:
        return

    # 追加「数据总览」实体: 把该手机号下所有传感器的状态与属性聚合到一个实体的属性上
    # (每个传感器一个节点)，源实体全部保留，不影响既有引用与长期统计
    sensors.append(create_overview_sensor(hass, coordinator, carrier, phone, entry))
    async_add_entities(sensors, update_before_add=False)


async def async_setup_carrier_texts(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """文本平台: 电信通话详单二次认证参数 (姓名/身份证号/验证码); 移动短信登录验证码"""
    context = get_carrier_context(hass, entry)
    if context is None:
        return
    coordinator, carrier, phone = context

    if carrier == CARRIER_TELECOM:
        _LOGGER.debug("正在为电信手机号 %s 注册通话详单二次认证参数实体", phone)
        async_add_entities(
            create_call_auth_text_entities(hass, coordinator, phone, entry),
            update_before_add=False,
        )
    elif carrier == CARRIER_MOBILE:
        _LOGGER.debug("正在为移动手机号 %s 注册短信登录验证码实体", phone)
        async_add_entities(
            [create_mobile_auth_text_entity(hass, coordinator, phone, entry)],
            update_before_add=False,
        )


async def async_setup_carrier_buttons(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """按钮平台: 归属地库更新按钮通用; 电信: 通话详单二次认证按钮; 联通: 刷新详单流水按钮; 移动: 短信登录按钮"""
    context = get_carrier_context(hass, entry)
    if context is None:
        return
    coordinator, carrier, phone = context

    buttons = [create_region_update_button(hass, coordinator, phone, entry)]
    if carrier == CARRIER_TELECOM:
        buttons.append(create_call_auth_button_entity(hass, coordinator, phone, entry))
    elif carrier == CARRIER_UNICOM:
        buttons.append(create_detail_refresh_button(hass, coordinator, phone, entry))
    elif carrier == CARRIER_MOBILE:
        buttons.append(create_mobile_auth_button_entity(hass, coordinator, phone, entry))

    _LOGGER.debug("正在为 %s 手机号 %s 注册按钮实体 (共 %d 个)", carrier, phone, len(buttons))
    async_add_entities(buttons, update_before_add=False)


async def async_setup_carrier_dates(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """日期平台: 通话详单查询起始日期 (仅电信/联通，移动已无详单功能)"""
    context = get_carrier_context(hass, entry)
    if context is None:
        return
    coordinator, carrier, phone = context

    # 中国移动已移除详单功能，不再创建"通话详单查询起始日期"实体
    if carrier == CARRIER_MOBILE:
        return

    _LOGGER.debug("正在为 %s 手机号 %s 注册通话详单查询起始日期实体", carrier, phone)
    async_add_entities(
        [create_call_query_start_date_entity(hass, coordinator, phone, entry)],
        update_before_add=False,
    )


async def async_setup_carrier_switches(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """开关平台: 自动获取通话记录 / 每日重置查询起始日期 / 自动更新归属地库 (通用); 自动短信登录 (电信与移动)"""
    context = get_carrier_context(hass, entry)
    if context is None:
        return
    coordinator, carrier, phone = context

    # 中国移动已移除通话记录功能，注册归属地自动更新开关和自动短信登录开关
    if carrier == CARRIER_MOBILE:
        switches = [
            create_region_auto_switch(hass, coordinator, phone, entry),
            create_auto_login_switch(hass, coordinator, phone, entry),
        ]
        _LOGGER.debug("正在为移动手机号 %s 注册开关实体 (共 %d 个)", phone, len(switches))
        async_add_entities(switches, update_before_add=False)
        return

    switches = [
        create_auto_query_switch(hass, coordinator, phone, entry),
        create_daily_reset_switch(hass, coordinator, phone, entry),
        create_region_auto_switch(hass, coordinator, phone, entry),
        create_auto_login_switch(hass, coordinator, phone, entry),
    ]

    _LOGGER.debug("正在为 %s 手机号 %s 注册开关实体 (共 %d 个)", carrier, phone, len(switches))
    async_add_entities(switches, update_before_add=False)


async def async_setup_carrier_times(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """时间平台: 自动获取通话记录时间 (仅电信/联通，移动已无此功能)"""
    context = get_carrier_context(hass, entry)
    if context is None:
        return
    coordinator, carrier, phone = context

    # 中国移动已无通话记录功能，不注册自动获取时间实体
    if carrier == CARRIER_MOBILE:
        return

    _LOGGER.debug("正在为 %s 手机号 %s 注册自动获取通话记录时间实体", carrier, phone)
    async_add_entities(
        [create_auto_query_time(hass, coordinator, phone, entry)],
        update_before_add=False,
    )
