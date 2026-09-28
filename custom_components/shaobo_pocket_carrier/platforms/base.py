# -*- coding: utf-8 -*-
"""中国运营商传感器基础实体类"""
import logging
from typing import Any, Dict, Optional
from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.entity import DeviceInfo

from ..const import DOMAIN, CARRIER_NAMES, CARRIER_TELECOM, ENTITY_ID_SUFFIXES

_LOGGER = logging.getLogger(__name__)


class ForcedEntityIdMixin:
    """固定实体 ID 支持 (实体 ID 形如 <domain>.<手机号>_<后缀>)

    便于自动化/手机端转发脚本长期稳定引用。注意 Home Assistant 的实体注册表
    优先于代码中设置的 entity_id：首次创建时直接生效；对已经注册过的旧 ID，
    需要在实体加入后调用 _async_migrate_entity_id() 迁移一次。
    """

    _forced_entity_id: str = ""

    def _setup_forced_entity_id(self, platform_domain: str, phone: str, key: str) -> None:
        """按后缀表设置固定实体 ID (未配置后缀的实体保持 HA 默认命名)"""
        suffix = ENTITY_ID_SUFFIXES.get(key)
        self._forced_entity_id = f"{platform_domain}.{phone}_{suffix}" if suffix else ""
        if self._forced_entity_id:
            self.entity_id = self._forced_entity_id

    @callback
    def _async_migrate_entity_id(self) -> None:
        """把已注册实体迁移到固定实体 ID (注册表 ID 优先于代码中设置的 ID)"""
        target = getattr(self, "_forced_entity_id", "")
        current = self.entity_id
        if not target or not current or current == target or self.hass is None:
            return
        try:
            registry = er.async_get(self.hass)
            if registry.async_get(target) is not None:
                _LOGGER.warning(
                    "%s 的目标实体 ID %s 已被其它实体占用，保留当前 %s",
                    getattr(self, "_attr_name", target),
                    target,
                    current,
                )
                return
            registry.async_update_entity(current, new_entity_id=target)
            _LOGGER.info(
                "实体「%s」的实体 ID 已由 %s 迁移为 %s",
                getattr(self, "_attr_name", target),
                current,
                target,
            )
        except Exception as err:
            _LOGGER.warning("迁移实体 ID %s -> %s 失败: %s", current, target, err)


def build_device_info(carrier: str, phone: str) -> DeviceInfo:
    """构建手机号在 Home Assistant 中的独立设备信息 (所有平台实体共用)"""
    carrier_name = CARRIER_NAMES.get(carrier, carrier)
    return DeviceInfo(
        identifiers={(DOMAIN, f"{carrier}_{phone}")},
        name=f"{carrier_name} ({phone})",
        manufacturer="Shaobor",
        model=f"{carrier_name}通信账户",
        sw_version="13.4" if carrier == CARRIER_TELECOM else "13.1",
        configuration_url="https://appgologinsz.189.cn" if carrier == CARRIER_TELECOM else "https://m.client.10010.com",
    )


class BaseCarrierSensor(CoordinatorEntity, SensorEntity):
    """运营商传感器基类，自动处理设备归属与通用属性"""

    def __init__(
        self,
        coordinator,
        carrier: str,
        phone: str,
        description: SensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.carrier = carrier
        self.phone = phone
        self.entity_description = description
        
        # 实体名称直接使用原有名称，不加任何前缀
        self._attr_name = description.name

        # 每一个手机号对应一个完全独立的实体 unique_id
        self._attr_unique_id = f"{DOMAIN}_{carrier}_{phone}_{description.key}"
        
        # 每一个手机号在 HA 中作为一个完全独立的独立设备（Device）
        self._attr_device_info = build_device_info(carrier, phone)

    @property
    def data(self) -> Dict[str, Any]:
        """获取协调器拉取的最新数据字典"""
        if self.coordinator and isinstance(self.coordinator.data, dict):
            return self.coordinator.data
        return {}

