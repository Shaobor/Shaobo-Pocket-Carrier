# -*- coding: utf-8 -*-
"""号码归属地库维护实体 (仅中国电信)

- button「更新号码归属地库」(`button.<手机号>_update_region`): 手动下载最新库
- switch「自动更新号码归属地库」(`switch.<手机号>_auto_region_update`): 默认开启，
  启动/打开开关时若库缺失或超过 AUTO_UPDATE_INTERVAL_DAYS 天未更新则自动下载

库文件位置: config/shaobo_pocket_carrier/phone2region.zdb (用户可手动替换);
找不到时回退到集成内置库。下载走多镜像 (GitHub raw / jsDelivr / 官方 CDN)，
下载后校验 CRC32 与格式再原子替换，失败不会破坏现有库文件。
"""
import datetime
import logging
import time
from typing import Any, Dict, Tuple

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.components.switch import SwitchDeviceClass, SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.restore_state import RestoreEntity

from ..const import (
    DOMAIN,
    ENTITY_REGION_AUTO_SWITCH,
    ENTITY_REGION_UPDATE_BUTTON,
)
from ..phone_region import (
    AUTO_UPDATE_INTERVAL_DAYS,
    DB_DIR_NAME,
    async_download_db,
    db_age_days,
    db_status,
)
from .auth_runtime import AuthRuntime
from .base import CarrierControlEntity

_LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------- 共用逻辑
def region_db_should_auto_update(runtime: AuthRuntime) -> bool:
    """是否需要自动更新: 开关开启, 且库缺失或已过期"""
    if not runtime.auto_region_update_enabled or runtime.region_db_updating:
        return False
    age = db_age_days()
    if age is None:
        return True                      # 库缺失: 尽早补齐
    return age >= AUTO_UPDATE_INTERVAL_DAYS


def _db_summary() -> str:
    """库状态一行文本 (供实体属性/结果说明)"""
    try:
        status = db_status()
    except Exception as err:
        return f"不可用 ({err})"
    if not status.get("available"):
        return "不可用 (库文件缺失或损坏, 可按下更新按钮下载)"
    age = db_age_days()
    age_text = f", {age:.0f} 天前更新" if age is not None else ""
    return f"版本 {status.get('version')} · {status.get('source')}{age_text}"


async def async_update_region_db(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
    *,
    reason: str = "手动",
) -> Tuple[bool, str]:
    """下载更新归属地库, 并让新库立即生效

    与运营商接口的 client 无关 (走 HA 的 aiohttp 会话), 因此不占用 runtime.busy,
    但用 region_db_updating 防止并发重复下载。
    """
    if runtime.region_db_updating:
        return False, "更新已在进行中，请稍候"

    runtime.region_db_updating = True
    runtime.region_db_last_result = f"{reason}更新中…"
    runtime.notify()
    try:
        ok, msg = await async_download_db(hass)
    except Exception as err:  # 网络/磁盘异常都不能影响其它功能
        ok, msg = False, f"更新异常：{err}"
    finally:
        runtime.region_db_updating = False
        runtime.region_db_last_check_at = time.time()
        runtime.region_db_last_result = msg
        runtime.notify()

    _LOGGER.info("归属地库更新(%s): %s", reason, msg)

    if ok and coordinator is not None:
        # 新库立即反映到通话记录上: 重新拉取一次 (归属地是本地查询, 不消耗接口额度)
        try:
            await coordinator.async_request_refresh()
        except Exception as err:
            _LOGGER.debug("更新归属地库后刷新数据失败: %s", err)
    return ok, msg


# ---------------------------------------------------------------- button
class RegionDbUpdateButton(CarrierControlEntity, ButtonEntity):
    """手动更新号码归属地库 (`button.<手机号>_update_region`)"""

    _attr_device_class = ButtonDeviceClass.UPDATE

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_REGION_UPDATE_BUTTON,
            "更新号码归属地库",
            "mdi:map-marker-radius-outline",
            platform_domain="button",
        )

    async def async_press(self) -> None:
        await async_update_region_db(
            self.hass, self.entry, self._coordinator, self._runtime, reason="手动"
        )

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        attrs: Dict[str, Any] = {
            "当前库": _db_summary(),
            "最近执行结果": runtime.region_db_last_result,
            "最近执行时间": _fmt_time(runtime.region_db_last_check_at),
            "库文件位置": f"config/{DB_DIR_NAME}/phone2region.zdb",
            "使用说明": (
                "按下后从多个镜像下载最新归属地库 (校验 CRC32 后自动替换)；"
                f"自动更新开关开启时也会在库超过 {AUTO_UPDATE_INTERVAL_DAYS} 天未更新时自动下载；"
                "也可以手动把 phone2region.zdb 放到上述目录后重载集成"
            ),
        }
        if runtime.region_db_updating:
            attrs["状态"] = "正在更新…"
        return attrs


# ---------------------------------------------------------------- switch
class RegionDbAutoUpdateSwitch(CarrierControlEntity, SwitchEntity, RestoreEntity):
    """自动更新号码归属地库 (`switch.<手机号>_auto_region_update`)"""

    _attr_device_class = SwitchDeviceClass.SWITCH

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_REGION_AUTO_SWITCH,
            "自动更新号码归属地库",
            "mdi:cloud-sync-outline",
            platform_domain="switch",
        )

    @property
    def is_on(self) -> bool:
        return bool(self._runtime.auto_region_update_enabled)

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        age = db_age_days()
        attrs: Dict[str, Any] = {
            "功能说明": (
                f"开启后，集成启动或打开本开关时，若归属地库缺失或超过 "
                f"{AUTO_UPDATE_INTERVAL_DAYS} 天未更新，会自动下载最新库文件"
            ),
            "更新间隔": f"{AUTO_UPDATE_INTERVAL_DAYS} 天",
            "当前库": _db_summary(),
            "库文件年龄": f"{age:.0f} 天" if age is not None else "库缺失",
            "最近检查时间": _fmt_time(runtime.region_db_last_check_at),
            "最近检查结果": runtime.region_db_last_result,
        }
        if runtime.region_db_updating:
            attrs["状态"] = "正在更新…"
        return attrs

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state is not None and last_state.state in ("on", "off"):
            self._runtime.auto_region_update_enabled = last_state.state == "on"

        # 启动检查: 库缺失/过期时自动下载 (失败只记录, 不影响任何其它功能)
        if region_db_should_auto_update(self._runtime):
            _LOGGER.info("归属地库缺失或已过期，启动时自动更新")
            self.hass.async_create_task(
                async_update_region_db(
                    self.hass,
                    self.entry,
                    self._coordinator,
                    self._runtime,
                    reason="启动检查",
                ),
                name=f"{DOMAIN}_region_db_startup",
            )

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._runtime.auto_region_update_enabled = True
        self._runtime.notify()
        _LOGGER.info("自动更新号码归属地库已开启 (%s)", self.phone)
        if region_db_should_auto_update(self._runtime):
            await async_update_region_db(
                self.hass,
                self.entry,
                self._coordinator,
                self._runtime,
                reason="开启时检查",
            )

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._runtime.auto_region_update_enabled = False
        self._runtime.notify()
        _LOGGER.info("自动更新号码归属地库已关闭 (%s)", self.phone)


def _fmt_time(value: float) -> str:
    if not value:
        return "尚未执行"
    return datetime.datetime.fromtimestamp(value).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------- 工厂
def create_region_update_button(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> RegionDbUpdateButton:
    """创建「更新号码归属地库」按钮实体 (button 平台)"""
    return RegionDbUpdateButton(hass, coordinator, phone, entry)


def create_region_auto_switch(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> RegionDbAutoUpdateSwitch:
    """创建「自动更新号码归属地库」开关实体 (switch 平台)"""
    return RegionDbAutoUpdateSwitch(hass, coordinator, phone, entry)
