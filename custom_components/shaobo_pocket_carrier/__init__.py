# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 核心集成入口"""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.const import Platform

from .const import (
    DOMAIN,
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    CONF_CARRIER,
    CONF_PHONE,
    CONF_AUTH_DATA,
    CONF_SCAN_INTERVAL,
)
from .coordinator import TelecomDataUpdateCoordinator, UnicomDataUpdateCoordinator
from .views import CarrierSliderPageView, CarrierSliderVerifyView

from .storage import async_remove_carrier_account, async_remove_call_record_cache

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR, Platform.TEXT, Platform.BUTTON, Platform.DATE]

# 仅以下选项变更时才需要重载集成条目 (轮询间隔在协调器构造时生效，无法运行时变更)；
# 通话详单签名、查询起始日期等运行时选项由协调器每轮实时读取，
# 只需在监听器里立即刷新一次数据即可，重载会造成实体无谓重建
_RELOAD_WATCHED_OPTIONS = (CONF_SCAN_INTERVAL,)

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """初始化全局组件环境，注册联通方案一滑块服务视图"""
    domain_data = hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(CarrierSliderPageView)
    hass.http.register_view(CarrierSliderVerifyView)
    # 标记视图已注册，避免配置流里重复注册同名视图 (配置流中会检查此标记)
    domain_data["views_registered"] = True
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
        "entry": entry,
        # 记录当前生效选项，用于判断选项变更是否需要整条重载
        "options_snapshot": dict(entry.options),
    }

    # 注册配置选项更新监听器
    entry.async_on_unload(entry.add_update_listener(async_update_options))

    # 转发加载 传感器 / 文本 / 按钮 平台
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """集成选项更新回调

    仅与轮询间隔/查询范围相关的选项变化才需要重载条目 (轮询间隔在协调器构造时生效)；
    通话详单二次认证签名等运行时选项由协调器每轮实时读取，无需重载，避免实体被无谓重建，
    但必须在本回调里重新拉取一次数据，否则新写入的签名/参数要等下一个轮询周期才生效
    (选项流完成认证后正是依赖此处立即刷新，否则通话流水会停留在"需重新认证")。
    """
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    snapshot = runtime.get("options_snapshot") if isinstance(runtime, dict) else None
    snapshot = snapshot if isinstance(snapshot, dict) else {}

    reload_needed = any(
        snapshot.get(key) != entry.options.get(key) for key in _RELOAD_WATCHED_OPTIONS
    )

    if isinstance(runtime, dict):
        runtime["options_snapshot"] = dict(entry.options)

    if reload_needed:
        _LOGGER.debug("检测到轮询相关选项变更，重载条目 %s", entry.entry_id)
        await hass.config_entries.async_reload(entry.entry_id)
        return

    coordinator = runtime.get("coordinator") if isinstance(runtime, dict) else None
    if coordinator is None:
        _LOGGER.debug("选项变更不影响轮询设置，且协调器不可用，跳过处理: %s", entry.entry_id)
        return

    _LOGGER.debug("选项变更无需重载，立即拉取一次数据以应用新参数: %s", entry.entry_id)
    try:
        await coordinator.async_refresh()
    except Exception as err:  # 刷新失败不能影响选项写入本身
        _LOGGER.warning("选项变更后刷新数据失败: %s", err)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """卸载指定手机号条目"""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok

async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """当用户在前端彻底删除该集成条目时，同步清理专属存储文件中的凭据与通话流水缓存"""
    carrier = entry.data.get(CONF_CARRIER)
    phone = entry.data.get(CONF_PHONE)
    if carrier and phone:
        _LOGGER.info("正在清理手机号 %s 在专属存储文件中的持久化凭据", phone)
        await async_remove_carrier_account(hass, carrier, phone)
        await async_remove_call_record_cache(hass, carrier, phone)
