# -*- coding: utf-8 -*-
"""中国运营商 文本实体平台入口 (当前仅中国电信通话详单二次认证参数)"""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CARRIER_TELECOM, CONF_CARRIER, CONF_PHONE
from .platforms.telecom_auth import create_call_auth_text_entities

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """仅中国电信需要通话详单二次认证参数实体"""
    if entry.data.get(CONF_CARRIER) != CARRIER_TELECOM:
        return

    store = hass.data[DOMAIN][entry.entry_id]
    coordinator = store["coordinator"]
    phone = entry.data.get(CONF_PHONE)

    _LOGGER.debug("正在为电信手机号 %s 注册通话详单二次认证参数实体", phone)
    async_add_entities(
        create_call_auth_text_entities(hass, coordinator, phone, entry),
        update_before_add=False,
    )
