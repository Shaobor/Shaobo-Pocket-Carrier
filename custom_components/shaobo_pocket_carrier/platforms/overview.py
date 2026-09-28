# -*- coding: utf-8 -*-
"""运营商数据总览实体 (把同一手机号设备的各传感器聚合为一个实体的属性)

设计要点:
- 不重新实现业务逻辑: 直接读取兄弟传感器实体的 state 与 attributes 组装节点,
  因此永远不会与源数据不一致 (源实体全部保留, 长期统计不受影响)。
- 每个传感器 = 一个节点, 节点名即实体名称, 节点内容 = {entity_id, state, 单位, icon, ...原属性}。
- 自身状态(state) = 话费余额; 数值/文字节点的全部有用数据都在属性里。
- 节点通过实体注册表按 unique_id 前缀解析, 不依赖中文拼音 entity_id,
  电信/联通各有自己的设备, 各自生成一个总览实体。

注意: 若节点数据(尤其通话流水清单全量)超过 Home Assistant recorder 单状态属性上限
(约 16384 字节), HA 会拒绝把该状态的属性写入数据库并打印告警 (实时状态不受影响),
必要时可通过集成选项「总览通话流水保留条数」裁剪。
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from ..const import (
    CONF_OVERVIEW_CALL_LIMIT,
    DOMAIN,
    OVERVIEW_CALL_LIMIT_DEFAULT,
    OVERVIEW_CALL_LIST_ATTR,
    OVERVIEW_NODE_ORDER,
    SENSOR_BALANCE,
    SENSOR_OVERVIEW,
)
from .base import build_device_info

_LOGGER = logging.getLogger(__name__)

# 合并写出节流: 一次协调器刷新会让多个传感器几乎同时变化, 合并为一次状态写入
_DEBOUNCE_SECONDS = 1.5
# 启动后补写一次状态 (实体注册表/兄弟实体可能稍后就绪)
_STARTUP_SETTLE_SECONDS = 3

# 节点里不重复携带的通用属性 (icon/单位已单独提升为节点字段)
_NODE_SKIP_KEYS = frozenset(
    {
        "friendly_name",
        "icon",
        "state_class",
        "unit_of_measurement",
        "device_class",
        "supported_features",
        "attribution",
        "assumed_state",
        "options",
        "editable",
        "min",
        "max",
        "step",
        "pattern",
        "mode",
    }
)


class CarrierOverviewSensor(CoordinatorEntity, SensorEntity):
    """运营商数据总览: 每个传感器实体一个节点，全部数据挂在属性上"""

    _attr_should_poll = False
    _attr_icon = "mdi:view-list-outline"
    _attr_native_unit_of_measurement = "元"

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        carrier: str,
        phone: str,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self.carrier = carrier
        self.phone = phone
        self.entry = entry
        self._removed = False
        self._sources: List[Tuple[str, str, str]] = []
        self._unsub_source_tracker = None
        self._unsub_debounce = None

        self._attr_name = "数据总览"
        self._attr_unique_id = f"{DOMAIN}_{carrier}_{phone}_{SENSOR_OVERVIEW}"
        self._attr_device_info = build_device_info(carrier, phone)

    # ------------------------------------------------------------------ 生命周期
    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._removed = False
        self._async_resolve_sources()
        self._async_track_sources()
        # 同批次添加的兄弟实体可能还没写好 entity_id/状态, 稍后补一次
        self.async_on_remove(
            async_call_later(self.hass, _STARTUP_SETTLE_SECONDS, self._handle_startup_settle)
        )
        self.async_on_remove(self._async_cleanup)

    async def async_will_remove_from_hass(self) -> None:
        self._removed = True
        self._async_cleanup()
        await super().async_will_remove_from_hass()

    @callback
    def _async_cleanup(self) -> None:
        if self._unsub_source_tracker is not None:
            self._unsub_source_tracker()
            self._unsub_source_tracker = None
        if self._unsub_debounce is not None:
            self._unsub_debounce()
            self._unsub_debounce = None

    # ------------------------------------------------------------------ 节点解析
    @callback
    def _async_resolve_sources(self) -> None:
        """按实体注册表解析该手机号下属于本集成的传感器实体 (key, entity_id, 节点名)

        直接以 unique_id 前缀 (DOMAIN_carrier_phone_) 作为归属判定，
        不再查询设备注册表 (device_registry.async_get_device 已被 HA 标记废弃，
        且设备标识不再跨配置条目唯一)，既避免废弃 API 又减少一次注册表检索。
        """
        if self.hass is None:
            return

        prefix = f"{DOMAIN}_{self.carrier}_{self.phone}_"

        found: List[Tuple[str, str, str]] = []
        for entry in er.async_get(self.hass).entities.values():
            if entry.platform != DOMAIN or not entry.entity_id.startswith("sensor."):
                continue
            unique_id = entry.unique_id or ""
            if not unique_id.startswith(prefix):
                continue
            key = unique_id[len(prefix):]
            if key == SENSOR_OVERVIEW:
                continue
            name = str(entry.original_name or entry.name or key).strip() or key
            found.append((key, entry.entity_id, name))

        order = {key: index for index, key in enumerate(OVERVIEW_NODE_ORDER)}
        found.sort(key=lambda item: (order.get(item[0], len(order)), item[2]))

        used: Dict[str, int] = {}
        sources: List[Tuple[str, str, str]] = []
        for key, entity_id, name in found:
            if name in used:
                used[name] += 1
                name = f"{name} ({used[name]})"
            else:
                used[name] = 1
            sources.append((key, entity_id, name))

        self._sources = sources
        _LOGGER.debug(
            "数据总览实体已解析 %d 个节点 (%s): %s",
            len(sources),
            self.phone,
            [name for _, _, name in sources],
        )

    @callback
    def _async_track_sources(self) -> None:
        if self._unsub_source_tracker is not None:
            self._unsub_source_tracker()
            self._unsub_source_tracker = None
        entity_ids = [entity_id for _, entity_id, _ in self._sources]
        if not entity_ids or self.hass is None:
            return
        self._unsub_source_tracker = async_track_state_change_event(
            self.hass, entity_ids, self._handle_source_change
        )

    @callback
    def _handle_startup_settle(self, _now) -> None:
        """启动后再解析一次 (补齐同批次实体) 并写出状态"""
        before = [entity_id for _, entity_id, _ in self._sources]
        self._async_resolve_sources()
        after = [entity_id for _, entity_id, _ in self._sources]
        if after != before:
            self._async_track_sources()
        self._async_safe_write_state()

    # ------------------------------------------------------------------ 状态与属性
    @property
    def native_value(self) -> Optional[Any]:
        """主状态取话费余额 (单位: 元)"""
        for key, entity_id, _ in self._sources:
            if key != SENSOR_BALANCE:
                continue
            state = self.hass.states.get(entity_id) if self.hass else None
            if state is None or state.state in ("unknown", "unavailable", ""):
                return None
            try:
                return float(state.state)
            except (TypeError, ValueError):
                return state.state
        return None

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        """每个传感器实体一个节点, 节点内含该实体的状态与全部有用属性"""
        if self.hass is None:
            return {}

        limit = self._call_limit()
        nodes: Dict[str, Any] = {}
        for _key, entity_id, name in self._sources:
            state = self.hass.states.get(entity_id)
            if state is None:
                continue

            attrs = state.attributes or {}
            node: Dict[str, Any] = {"entity_id": entity_id, "state": state.state}
            unit = attrs.get("unit_of_measurement")
            if unit:
                node["单位"] = unit
            icon = attrs.get("icon")
            if icon:
                node["icon"] = icon

            for attr_key, value in attrs.items():
                if attr_key in _NODE_SKIP_KEYS:
                    continue
                if attr_key == OVERVIEW_CALL_LIST_ATTR and limit > 0 and isinstance(value, list):
                    # 保留最近的 limit 条 (原始清单按时间倒序, 最新在前)
                    value = value[:limit]
                node[attr_key] = value

            nodes[name] = node

        return nodes

    def _call_limit(self) -> int:
        """总览里保留的通话流水条数 (0 = 全部)"""
        try:
            limit = int(
                self.entry.options.get(CONF_OVERVIEW_CALL_LIMIT, OVERVIEW_CALL_LIMIT_DEFAULT) or 0
            )
        except (TypeError, ValueError):
            limit = OVERVIEW_CALL_LIMIT_DEFAULT
        return max(0, limit)

    # ------------------------------------------------------------------ 写出节流
    @callback
    def _handle_source_change(self, _event) -> None:
        self._schedule_write()

    @callback
    def _handle_coordinator_update(self) -> None:
        # 协调器刷新后兄弟传感器稍后才写状态, 因此延迟合并写出
        self._schedule_write()

    @callback
    def _schedule_write(self) -> None:
        if self._removed or self.hass is None:
            return
        if self._unsub_debounce is not None:
            return
        self._unsub_debounce = async_call_later(
            self.hass, _DEBOUNCE_SECONDS, self._handle_debounce_done
        )

    @callback
    def _handle_debounce_done(self, _now) -> None:
        self._unsub_debounce = None
        self._async_safe_write_state()

    @callback
    def _async_safe_write_state(self) -> None:
        if self._removed or self.hass is None or not self.entity_id:
            return
        self.async_write_ha_state()


def create_overview_sensor(
    hass: HomeAssistant,
    coordinator,
    carrier: str,
    phone: str,
    entry: ConfigEntry,
) -> CarrierOverviewSensor:
    """创建该手机号的数据总览实体"""
    return CarrierOverviewSensor(hass, coordinator, carrier, phone, entry)
