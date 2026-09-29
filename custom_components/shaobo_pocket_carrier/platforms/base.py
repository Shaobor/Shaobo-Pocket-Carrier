# -*- coding: utf-8 -*-
"""中国运营商实体公共基类

- ForcedEntityIdMixin: 固定实体 ID (<domain>.<手机号>_<后缀>) 与注册表迁移
- CarrierControlEntity: 控制类实体基类 (text / button / date / switch / time 共用)
- build_device_info: 手机号设备信息
- BaseCarrierSensor: 传感器基类 (同样使用固定实体 ID)
"""
import logging
from typing import Any, Dict, Optional
from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import DeviceInfo, Entity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from ..const import DOMAIN, CARRIER_NAMES, CARRIER_TELECOM, ENTITY_ID_SUFFIXES, SENSOR_ONLINE
from .auth_runtime import async_get_auth_runtime

_LOGGER = logging.getLogger(__name__)


class ForcedEntityIdMixin:
    """固定实体 ID 支持 (实体 ID 形如 <domain>.<手机号>_<后缀>)

    后缀取自 const.ENTITY_ID_SUFFIXES (一律为简短英文单词，例如 balance / calls /
    auto_login)，未配置后缀的实体退化为使用实体 key；便于自动化/手机端转发脚本
    长期稳定引用。注意 Home Assistant 的实体注册表优先于代码中设置的 entity_id：
    首次创建时直接生效；对已经注册过的旧 ID，需要在实体加入后调用
    _async_migrate_entity_id() 迁移一次。
    """

    _forced_entity_id: str = ""

    def _setup_forced_entity_id(self, platform_domain: str, phone: str, key: str) -> None:
        """设置固定实体 ID (形如 <domain>.<手机号>_<英文后缀>)"""
        suffix = str(ENTITY_ID_SUFFIXES.get(key) or key or "").strip()
        if not suffix:
            return
        self._forced_entity_id = f"{platform_domain}.{phone}_{suffix}"
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
            # HA 的实体平台会把注册表改名同步到活实体，这里显式回写，
            # 避免同一生命周期内后续代码(如记录 code_entity_id)仍拿到旧 ID
            self.entity_id = target
            _LOGGER.info(
                "实体「%s」的实体 ID 已由 %s 迁移为 %s",
                getattr(self, "_attr_name", target),
                current,
                target,
            )
        except Exception as err:
            _LOGGER.warning("迁移实体 ID %s -> %s 失败: %s", current, target, err)


class CarrierControlEntity(ForcedEntityIdMixin, Entity):
    """运营商控制类实体基类 (text / button / date / switch / time 共用)

    - 恒可用: 账号掉线(登录失效)时也要能按按钮重新登录、写入验证码、开关自动功能
    - 固定实体 ID: <domain>.<手机号>_<后缀>，见 const.ENTITY_ID_SUFFIXES
    - 共享运行时状态: 同一手机号下所有控制实体通过 AuthRuntime 协作
    - 安全写状态: 后台任务/事件驱动时避免对已移除实体写状态
    """

    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        phone: str,
        entry: ConfigEntry,
        key: str,
        name: str,
        icon: str,
        platform_domain: str = "text",
        carrier: str = CARRIER_TELECOM,
    ) -> None:
        super().__init__()
        self._coordinator = coordinator
        self.phone = phone
        self.entry = entry
        self._runtime = async_get_auth_runtime(hass, entry)
        self._removed = False
        self._attr_name = name
        self._attr_icon = icon
        # carrier 默认电信 (控制类实体目前仅电信使用)，留参数以便将来联通复用时不冲突
        self._attr_unique_id = f"{DOMAIN}_{carrier}_{phone}_{key}"
        self._attr_device_info = build_device_info(carrier, phone)
        self._setup_forced_entity_id(platform_domain, phone, key)

    @property
    def available(self) -> bool:
        """恒可用 (掉线时仍需能触发重新登录)"""
        return True

    @property
    def data(self) -> Dict[str, Any]:
        """协调器最新数据字典"""
        if self._coordinator and isinstance(self._coordinator.data, dict):
            return self._coordinator.data
        return {}

    @property
    def login_expired(self) -> bool:
        """当前是否处于登录失效状态"""
        return bool(getattr(self._coordinator, "login_expired", False))

    def _async_safe_write_state(self) -> None:
        """安全写状态 (后台任务可能存在实体已移除的竞态)"""
        if self._removed or self.hass is None or not self.entity_id:
            return
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._removed = False
        self._async_migrate_entity_id()
        self._runtime.add_listener(self._async_safe_write_state)

    async def async_will_remove_from_hass(self) -> None:
        self._removed = True
        self._runtime.remove_listener(self._async_safe_write_state)
        await super().async_will_remove_from_hass()


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


class BaseCarrierSensor(ForcedEntityIdMixin, CoordinatorEntity, SensorEntity):
    """运营商传感器基类，自动处理设备归属、固定实体 ID 与通用属性"""

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

        # 固定实体 ID: sensor.<手机号>_<英文后缀>，与控制类实体风格一致
        # (例如 sensor.13363902961_balance / sensor.13363902961_calls)
        self._setup_forced_entity_id("sensor", phone, description.key)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # 已注册过的旧 ID (含运营商前缀) 迁移到固定 ID
        self._async_migrate_entity_id()

    @property
    def data(self) -> Dict[str, Any]:
        """获取协调器拉取的最新数据字典"""
        if self.coordinator and isinstance(self.coordinator.data, dict):
            return self.coordinator.data
        return {}


class BaseOnlineSensor(BaseCarrierSensor):
    """账号在线状态传感器 (sensor.<手机号>_online)

    取值: 在线 / 离线 / 未知
    - 离线: 登录态已失效 (需要重新登录；电信可按下「通话详单二次认证」按钮自动短信登录)
    - 在线: 登录态有效且至少成功拉取过一次数据
    - 未知: 还没完成首次数据拉取 (无法判断)

    始终可用 (available 恒为真)，否则账号掉线时它自己会变成 unavailable，
    反而看不出"离线"。
    """

    def __init__(self, coordinator, carrier: str, phone: str) -> None:
        desc = SensorEntityDescription(
            key=SENSOR_ONLINE,
            name="在线状态",
            icon="mdi:lan-connect",
        )
        super().__init__(coordinator, carrier, phone, desc)

    @property
    def available(self) -> bool:
        """恒可用: 离线时也要能显示"离线"而不是 unavailable"""
        return True

    @property
    def native_value(self) -> str:
        coord = self.coordinator
        if coord is None:
            return "未知"
        if getattr(coord, "login_expired", False):
            return "离线"
        # 注意: 联通协调器没有 login_expired 标记，此时必须以"最近一次刷新是否成功"为准，
        # 否则会话失效/网络故障时仍会显示"在线"，与"最近刷新成功=否"自相矛盾
        has_data = bool(self.data)
        last_ok = bool(getattr(coord, "last_update_success", False))
        if has_data and last_ok:
            return "在线"
        if has_data and not last_ok:
            return "离线"
        if last_ok:
            return "在线"
        return "未知"

    @property
    def icon(self) -> str:
        return {
            "在线": "mdi:lan-connect",
            "离线": "mdi:lan-disconnect",
        }.get(self.native_value, "mdi:lan-pending")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        coord = self.coordinator
        state = self.native_value
        attrs: Dict[str, Any] = {
            "状态说明": {
                "在线": "登录态有效，可正常获取数据",
                "离线": "登录态已失效，需重新登录（可按「通话详单二次认证」按钮自动短信登录）",
            }.get(state, "尚未完成首次数据拉取，无法判断在线状态"),
            "登录态": "已失效" if getattr(coord, "login_expired", False) else "有效",
            "最近刷新成功": "是" if getattr(coord, "last_update_success", False) else "否",
        }

        last_ok = getattr(coord, "last_update_success_time", None)
        if last_ok is not None:
            try:
                attrs["最近成功通信时间"] = last_ok.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                attrs["最近成功通信时间"] = str(last_ok)

        reason = str(getattr(coord, "last_auth_error", "") or "").strip()
        if reason and state == "离线":
            attrs["离线原因"] = reason

        interval = getattr(coord, "update_interval", None)
        if interval:
            try:
                attrs["轮询间隔"] = f"{int(interval.total_seconds() // 60)} 分钟"
            except Exception:
                pass
        return attrs
