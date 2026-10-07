# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 核心集成入口"""
import logging
import os
from typing import Any, Dict, Optional

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import (
    DOMAIN,
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    CONF_CARRIER,
    CONF_PHONE,
    CONF_AUTH_DATA,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL_TELECOM,
    DEFAULT_SCAN_INTERVAL_UNICOM,
    EVENT_LOGIN_EXPIRED,
    MIN_SCAN_INTERVAL,
)
from .coordinator import TelecomDataUpdateCoordinator, UnicomDataUpdateCoordinator
from .platforms.auto_query import async_cancel_daily_query, async_cancel_daily_reset
from .platforms.telecom_login import async_setup_login_listener
from .views import CarrierSliderPageView, CarrierSliderVerifyView

from .storage import async_remove_carrier_account, async_remove_call_record_cache

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [
    Platform.SENSOR,
    Platform.TEXT,
    Platform.BUTTON,
    Platform.DATE,
    Platform.SWITCH,
    Platform.TIME,
]

URL_CARD = "/shaobo_pocket_carrier/pocket-carrier-card.js"
VERSION_CARD = "5.11.9"
# 早期内置的完整版 room-elves-card，文件已移除: 资源里残留的旧地址会 404，启动时一并清掉
LEGACY_CARD_URLS = ("/shaobo_pocket_carrier/room-elves-card.js",)


async def _async_register_lovelace_resource(hass: HomeAssistant, url: str) -> None:
    """把前端卡片登记到 Lovelace Resources: 同一卡片只保留一条，版本号变了就更新

    同一卡片登记了多个地址时 (如 ?v=1.0.0 与 ?v=1.0.1)，浏览器会当成不同模块各加载一次，
    白白多下载一遍；旧版卡片地址 (LEGACY_CARD_URLS) 也在这里删除。
    """
    try:
        lovelace = hass.data.get("lovelace")
        resources = getattr(lovelace, "resources", None) if lovelace else None
        if not resources or not hasattr(resources, "async_create_item"):
            return  # YAML 模式的资源只能手动维护
        # 资源集合是懒加载的: 不先加载，async_items() 返回空列表，
        # 每次启动都会被误判为"未登记"而重复新建一条
        await resources.async_get_info()

        base_url = url.split("?")[0]
        matched = []
        legacy = []
        for item in resources.async_items():
            item_url = item.get("url", "") if isinstance(item, dict) else getattr(item, "url", "")
            item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            if not item_id:
                continue
            if item_url.split("?")[0] == base_url:
                matched.append((item_id, item_url))
            elif item_url.split("?")[0] in LEGACY_CARD_URLS:
                legacy.append((item_id, item_url))

        for item_id, item_url in legacy:
            await resources.async_delete_item(item_id)
            _LOGGER.info("已移除旧版卡片资源: %s", item_url)

        if not matched:
            await resources.async_create_item({"res_type": "module", "url": url})
            _LOGGER.info("已自动将卡片注册到 Lovelace Resources: %s", url)
            return

        # 优先保留已经是当前版本的那条，其余重复登记全部删除
        matched.sort(key=lambda item: item[1] != url)
        keep_id, keep_url = matched[0]
        for item_id, item_url in matched[1:]:
            await resources.async_delete_item(item_id)
            _LOGGER.info("已移除重复登记的卡片资源: %s", item_url)
        if keep_url != url:
            await resources.async_update_item(keep_id, {"res_type": "module", "url": url})
            _LOGGER.info("已更新 Lovelace Resource 卡片版本: %s", url)
    except Exception as err:
        _LOGGER.debug("自动注册 Lovelace Resource 失败(可忽略): %s", err)


def _effective_scan_interval(entry: ConfigEntry) -> int:
    """实际生效的轮询间隔 (分钟)，算法与协调器构造时一致: 选项里没有就取运营商默认值"""
    default = (
        DEFAULT_SCAN_INTERVAL_TELECOM
        if entry.data.get(CONF_CARRIER) == CARRIER_TELECOM
        else DEFAULT_SCAN_INTERVAL_UNICOM
    )
    try:
        interval = int(entry.options.get(CONF_SCAN_INTERVAL, default))
    except Exception:
        interval = default
    return max(MIN_SCAN_INTERVAL, interval)


def _options_snapshot(entry: ConfigEntry) -> Dict[str, Any]:
    """选项快照 (scan_interval 记实际生效值)，用于判断选项变更是否需要整条重载

    轮询间隔在协调器构造时生效，只有它变了才需要重载；通话详单签名、查询起始日期等
    运行时选项由协调器每轮实时读取，立即刷新一次即可，重载会造成实体无谓重建。
    老条目的 options 里可能没有 scan_interval 键，必须按实际生效值比较，
    否则每次改别的选项 (如查询起始日期) 都会被误判为间隔变更而整条重载。
    """
    snapshot = dict(entry.options)
    snapshot[CONF_SCAN_INTERVAL] = _effective_scan_interval(entry)
    return snapshot


async def _async_migrate_unicom_control_entities(
    hass: HomeAssistant, entry: ConfigEntry, phone: str
) -> None:
    """把旧版按"中国电信"生成的联通控制类实体迁回联通 (实体 ID 与历史状态不变)

    旧版控制类实体 (开关/时间/日期/按钮) 一律按电信生成 unique_id 与设备，联通号码因此
    多出一个"中国电信 (<手机号>)"设备。必须在平台加载前改 unique_id，否则实体会按新
    unique_id 重新注册、实体 ID 变成 _2；残留的空设备由 _async_remove_stale_telecom_device 清理。
    """
    old_prefix = f"{DOMAIN}_{CARRIER_TELECOM}_{phone}_"
    new_prefix = f"{DOMAIN}_{CARRIER_UNICOM}_{phone}_"
    ent_reg = er.async_get(hass)
    unicom_device = next(
        (
            device
            for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
            if (DOMAIN, f"{CARRIER_UNICOM}_{phone}") in device.identifiers
        ),
        None,
    )

    @callback
    def _migrate(reg_entry: er.RegistryEntry) -> Optional[Dict[str, Any]]:
        if not reg_entry.unique_id.startswith(old_prefix):
            return None
        new_unique_id = new_prefix + reg_entry.unique_id[len(old_prefix):]
        if ent_reg.async_get_entity_id(reg_entry.domain, DOMAIN, new_unique_id):
            _LOGGER.warning("实体 %s 的新 unique_id 已被占用，跳过迁移", reg_entry.entity_id)
            return None
        _LOGGER.info("实体 %s 已从电信设备迁回联通设备", reg_entry.entity_id)
        updates: Dict[str, Any] = {"new_unique_id": new_unique_id}
        # 被禁用的实体不会被加载，设备归属要在这里一并改掉
        if unicom_device is not None:
            updates["device_id"] = unicom_device.id
        return updates

    try:
        await er.async_migrate_entries(hass, entry.entry_id, _migrate)
    except Exception as err:  # 迁移失败不能影响条目加载
        _LOGGER.warning("迁移联通控制类实体失败: %s", err)


@callback
def _async_remove_stale_telecom_device(hass: HomeAssistant, entry: ConfigEntry, phone: str) -> None:
    """移除联通条目下残留的"中国电信 (<手机号>)"空设备 (仍挂有实体时保留，避免连带删除实体)"""
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    stale_identifier = (DOMAIN, f"{CARRIER_TELECOM}_{phone}")
    for device in dr.async_entries_for_config_entry(dev_reg, entry.entry_id):
        if stale_identifier not in device.identifiers:
            continue
        remaining = er.async_entries_for_device(ent_reg, device.id, include_disabled_entities=True)
        if remaining:
            _LOGGER.debug(
                "电信设备下仍有 %d 个实体，暂不移除: %s",
                len(remaining),
                [reg_entry.entity_id for reg_entry in remaining],
            )
            continue
        # 设备只属于一个配置条目，直接删除 (async_update_device 的 remove_config_entry_id 已废弃)
        dev_reg.async_remove_device(device.id)
        _LOGGER.info("已移除联通手机号 %s 下残留的电信空设备", phone)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """初始化全局组件环境，注册前端卡片静态资源与联通方案一滑块服务视图"""
    domain_data = hass.data.setdefault(DOMAIN, {})

    # 注册前端静态卡片资源映射: /shaobo_pocket_carrier -> <集成目录>/frontend
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    if os.path.isdir(frontend_dir) and not domain_data.get("static_paths_registered"):
        try:
            await hass.http.async_register_static_paths([
                StaticPathConfig("/shaobo_pocket_carrier", frontend_dir, cache_headers=False)
            ])
            domain_data["static_paths_registered"] = True
            _LOGGER.info("已注册掌上运营商前端静态资源路径: /shaobo_pocket_carrier -> %s", frontend_dir)
        except Exception as err:
            _LOGGER.warning("注册前端静态资源路径失败: %s", err)

    # 尝试自动向 Lovelace 注册卡片引用
    card_url = f"{URL_CARD}?v={VERSION_CARD}"
    await _async_register_lovelace_resource(hass, card_url)

    # 配置流在集成尚未 async_setup 时可能已抢先注册过同名视图，
    # 重复注册会命中 aiohttp 的重复路由保护，因此两处都要检查标记
    if not domain_data.get("views_registered"):
        hass.http.register_view(CarrierSliderPageView)
        hass.http.register_view(CarrierSliderVerifyView)
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

    # 准备归属地库 (用户库优先, 其次集成内置库) 与城市坐标 (电信/联通的详单都要用):
    # 在执行器里加载，避免首轮刷新在事件循环里读文件；库缺失/损坏时静默降级,
    # 只是详单里查不到归属地, 不影响任何其它功能
    import asyncio as _asyncio

    from . import city_geo, phone_region

    try:
        await phone_region.async_prepare(hass)
        await city_geo.async_prepare(hass)
    except _asyncio.CancelledError:  # 取消必须原样抛出
        raise
    except Exception as err:
        _LOGGER.debug("归属地/坐标数据初始化失败(已跳过): %s", err)

    # 执行首次拉取，确保实体初始化即有数据
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "carrier": carrier,
        "phone": phone,
        "entry": entry,
        # 记录当前生效选项，用于判断选项变更是否需要整条重载
        "options_snapshot": _options_snapshot(entry),
    }

    # 注册配置选项更新监听器
    entry.async_on_unload(entry.add_update_listener(async_update_options))

    # 中国电信: 监听"登录失效"事件, 由「自动短信登录」开关决定是否自动发码登录
    if carrier == CARRIER_TELECOM:
        entry.async_on_unload(async_setup_login_listener(hass, entry, coordinator))
        # 首次刷新早于监听器注册: 启动时账号若已掉线，事件已经抛过且此后不再抛，
        # 这里补抛一次，保证「自动短信登录」开关能在开机后立即接管
        if getattr(coordinator, "login_expired", False):
            _LOGGER.info("启动时检测到账号已离线，补发登录失效事件以触发自动登录")
            hass.bus.async_fire(
                EVENT_LOGIN_EXPIRED,
                {
                    "entry_id": entry.entry_id,
                    "phone": phone,
                    "reason": str(getattr(coordinator, "last_auth_error", "")),
                },
            )

    if carrier == CARRIER_UNICOM:
        await _async_migrate_unicom_control_entities(hass, entry, phone)

    # 转发加载 传感器 / 文本 / 按钮 / 日期 / 开关 / 时间 平台
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 平台加载完成后实体已挂回联通设备，再清理残留的空电信设备
    if carrier == CARRIER_UNICOM:
        _async_remove_stale_telecom_device(hass, entry, phone)
    return True

async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """集成选项更新回调 (entry.data 变化也会触发，选项没变时直接忽略)

    仅轮询间隔变化才需要重载条目 (轮询间隔在协调器构造时生效)；查询起始日期、
    通话详单二次认证签名等运行时选项由协调器每轮实时读取，无需重载，避免实体被无谓重建，
    但必须在本回调里重新拉取一次数据，否则新写入的签名/参数要等下一个轮询周期才生效
    (选项流完成认证后正是依赖此处立即刷新，否则通话流水会停留在"需重新认证")。
    """
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not isinstance(runtime, dict):
        # 条目尚未加载/正在卸载: 缺少快照时绝不能按"全部变更"去重载，
        # 否则会与卸载流程竞态 (本回调可能作为任务晚于卸载执行)
        _LOGGER.debug("条目 %s 尚未就绪，跳过选项变更处理", entry.entry_id)
        return

    snapshot = runtime.get("options_snapshot")
    if not isinstance(snapshot, dict):
        runtime["options_snapshot"] = _options_snapshot(entry)
        _LOGGER.debug("选项快照缺失，仅重建快照: %s", entry.entry_id)
        return

    current = _options_snapshot(entry)
    if current == snapshot:
        # 只改了 entry.data (联通每轮滚动写回 token、电信短信登录写回凭据): 选项没变，
        # 既不重载也不刷新，否则"刷新 → 写回 token → 再刷新"会无限循环
        return

    reload_needed = snapshot.get(CONF_SCAN_INTERVAL) != current[CONF_SCAN_INTERVAL]

    if reload_needed:
        _LOGGER.debug("检测到轮询相关选项变更，重载条目 %s", entry.entry_id)
        # 重载生效前不推进快照：若本次重载未真正执行成功(条目未加载/异常)，
        # 保留旧快照可让下一次保存选项时重新尝试让新间隔生效
        try:
            reload_ok = await hass.config_entries.async_reload(entry.entry_id)
        except Exception as err:
            reload_ok = False
            _LOGGER.warning("重载条目 %s 异常: %s", entry.entry_id, err)
        if not reload_ok:
            _LOGGER.warning(
                "轮询相关选项已变更但重载未生效，将在下次保存选项时重试: %s", entry.entry_id
            )
        return

    runtime["options_snapshot"] = current

    coordinator = runtime.get("coordinator")
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

    # 实体移除回调会按"开关仍开启"重新调度每日任务，因此这里必须再注销一次，
    # 否则条目卸载后每天的定时任务仍会继续跑
    async_cancel_daily_query(entry.entry_id)
    async_cancel_daily_reset(entry.entry_id)

    if unload_ok:
        runtime = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
        coordinator = runtime.get("coordinator") if isinstance(runtime, dict) else None
        if coordinator is not None:
            # 停掉协调器自身的刷新定时器:
            # 重载后旧协调器若不 shutdown 会继续按 30/10 分钟轮询运营商接口
            try:
                await coordinator.async_shutdown()
            except Exception as err:
                _LOGGER.debug("停止协调器失败: %s", err)
    return unload_ok

async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """当用户在前端彻底删除该集成条目时，同步清理专属存储文件中的凭据与通话流水缓存"""
    carrier = entry.data.get(CONF_CARRIER)
    phone = entry.data.get(CONF_PHONE)
    if carrier and phone:
        _LOGGER.info("正在清理手机号 %s 在专属存储文件中的持久化凭据", phone)
        await async_remove_carrier_account(hass, carrier, phone)
        await async_remove_call_record_cache(hass, carrier, phone)
