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
    EVENT_LOGIN_EXPIRED,
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

# 仅以下选项变更时才需要重载集成条目 (轮询间隔在协调器构造时生效，无法运行时变更)；
# 通话详单签名、查询起始日期等运行时选项由协调器每轮实时读取，
# 只需在监听器里立即刷新一次数据即可，重载会造成实体无谓重建
_RELOAD_WATCHED_OPTIONS = (CONF_SCAN_INTERVAL,)

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """初始化全局组件环境，注册联通方案一滑块服务视图"""
    domain_data = hass.data.setdefault(DOMAIN, {})
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
        # 准备归属地库 (用户库优先, 其次集成内置库): 库缺失/损坏时静默降级,
        # 只是通话记录里查不到归属地, 不影响任何其它功能
        import asyncio as _asyncio

        from . import city_geo, phone_region

        try:
            await phone_region.async_prepare(hass)
            await city_geo.async_prepare(hass)
        except _asyncio.CancelledError:  # 取消必须原样抛出
            raise
        except Exception as err:
            _LOGGER.debug("归属地/坐标数据初始化失败(已跳过): %s", err)
    elif carrier == CARRIER_UNICOM:
        coordinator = UnicomDataUpdateCoordinator(hass, phone, auth_data, entry=entry)
    else:
        _LOGGER.error("未知的运营商类型: %s", carrier)
        return False

    # 执行首次拉取，确保实体初始化即有数据
    await coordinator.async_config_entry_first_refresh()

    # 选项快照里记录"当前真正生效的轮询间隔"：老条目/首次保存时 options 里可能还没有
    # scan_interval 键，若直接与用户新填的值比较会误判为"变更"而做一次无谓的整条重载
    options_snapshot = dict(entry.options)
    try:
        options_snapshot[CONF_SCAN_INTERVAL] = int(
            coordinator.update_interval.total_seconds() // 60
        )
    except Exception:
        pass

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "carrier": carrier,
        "phone": phone,
        "entry": entry,
        # 记录当前生效选项，用于判断选项变更是否需要整条重载
        "options_snapshot": options_snapshot,
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

    # 转发加载 传感器 / 文本 / 按钮 / 日期 / 开关 / 时间 平台
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
    if not isinstance(runtime, dict):
        # 条目尚未加载/正在卸载: 缺少快照时绝不能按"全部变更"去重载，
        # 否则会与卸载流程竞态 (本回调可能作为任务晚于卸载执行)
        _LOGGER.debug("条目 %s 尚未就绪，跳过选项变更处理", entry.entry_id)
        return

    snapshot = runtime.get("options_snapshot")
    if not isinstance(snapshot, dict):
        runtime["options_snapshot"] = dict(entry.options)
        _LOGGER.debug("选项快照缺失，仅重建快照: %s", entry.entry_id)
        return

    reload_needed = any(
        snapshot.get(key) != entry.options.get(key) for key in _RELOAD_WATCHED_OPTIONS
    )

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

    runtime["options_snapshot"] = dict(entry.options)

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
