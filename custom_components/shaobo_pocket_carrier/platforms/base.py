# -*- coding: utf-8 -*-
"""中国运营商传感器基础实体类"""
from typing import Any, Dict, Optional
from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.entity import DeviceInfo

from ..const import DOMAIN, CARRIER_NAMES

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
        carrier_name = CARRIER_NAMES.get(carrier, carrier)
        
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{carrier}_{phone}")},
            name=f"{carrier_name} ({phone})",
            manufacturer="Shaobor",
            model=f"{carrier_name}通信账户",
            sw_version="13.4" if carrier == "telecom" else "13.1",
            configuration_url="https://appgologinsz.189.cn" if carrier == "telecom" else "https://m.client.10010.com",
        )

    @property
    def data(self) -> Dict[str, Any]:
        """获取协调器拉取的最新数据字典"""
        if self.coordinator and isinstance(self.coordinator.data, dict):
            return self.coordinator.data
        return {}

