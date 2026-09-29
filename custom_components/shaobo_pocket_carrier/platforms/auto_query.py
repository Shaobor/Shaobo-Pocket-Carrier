# -*- coding: utf-8 -*-
"""中国电信「自动获取通话记录」模块 (switch + time 实体)

实体:
- switch「自动获取通话记录」(`switch.<手机号>_auto_query`)      : 功能总开关
- time  「自动获取通话记录时间」(`time.<手机号>_auto_query_time`): 每日执行时间
- switch「每日重置查询起始日期」(`switch.<手机号>_daily_reset`)   : 默认开启，
  每天 DAILY_RESET_START_DATE_TIME (06:00) 把「通话详单查询起始日期」恢复为当月 1 日
  (跟随当月)，用于长期浏览历史月份后自动回到当月

触发源:
1. 每天到达设定时间 -> 把「通话详单查询起始日期」设为当月 1 日 (即"跟随当月"，跨月自动滚动)
   -> 触发一次通话流水查询 (授权有效直接拉取; 失效则下发详单验证码并等待验证码写入后自动提交)
2. 短信登录成功 -> 若开关开启，延迟 AFTER_LOGIN_QUERY_DELAY 秒再获取一次
   (拉开与登录验证码的时间差，避免两种验证码串味)

掉线时: 若「自动登录」开关开启则先登录，登录成功后由触发源 2 自动续做查询；
未开启则跳过并在实体属性里说明。
"""
import datetime
import logging
from typing import Any, Dict, Optional, Tuple

from homeassistant.components.switch import SwitchDeviceClass, SwitchEntity
from homeassistant.components.time import TimeEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_time_change
from homeassistant.helpers.restore_state import RestoreEntity

from ..const import (
    AFTER_LOGIN_QUERY_DELAY,
    CONF_CALL_START_DATE,
    DAILY_RESET_START_DATE_TIME,
    DEFAULT_AUTO_QUERY_TIME,
    DOMAIN,
    ENTITY_AUTO_LOGIN_SWITCH,
    ENTITY_AUTO_QUERY_SWITCH,
    ENTITY_AUTO_QUERY_TIME,
    ENTITY_CALL_QUERY_DAILY_RESET,
    EVENT_LOGIN_SUCCESS,
)
from .auth_runtime import AuthRuntime, schedule_busy_retry
from .base import CarrierControlEntity
from .telecom_auth import async_start_detail_query
from .telecom_login import (
    STATE_ERROR,
    STATE_EXPIRED,
    async_auto_login,
    async_detect_login_state,
    async_send_login_sms,
)

_LOGGER = logging.getLogger(__name__)

# 每个配置条目的每日定时任务 (entry_id -> 取消回调)
_DAILY_TIMERS: Dict[str, Any] = {}


# ---------------------------------------------------------------- 工具函数
def parse_auto_query_time(value: Optional[str]) -> Tuple[int, int]:
    """解析 HH:MM[:SS] 为 (hour, minute)，非法值回退默认时间"""
    raw = str(value or "").strip() or DEFAULT_AUTO_QUERY_TIME
    try:
        parsed = datetime.time.fromisoformat(raw)
        return parsed.hour, parsed.minute
    except Exception:
        fallback = datetime.time.fromisoformat(DEFAULT_AUTO_QUERY_TIME)
        return fallback.hour, fallback.minute


@callback
def async_cancel_daily_query(entry_id: str) -> None:
    """取消该条目的每日定时任务"""
    unsub = _DAILY_TIMERS.pop(entry_id, None)
    if unsub is not None:
        try:
            unsub()
        except Exception as err:
            _LOGGER.debug("取消每日自动获取任务失败: %s", err)


@callback
def async_schedule_daily_query(hass: HomeAssistant, entry: ConfigEntry, runtime: AuthRuntime) -> None:
    """按运行时状态 (开关 + 时间) 重新注册每日定时任务"""
    async_cancel_daily_query(entry.entry_id)
    if not runtime.auto_query_enabled:
        _LOGGER.debug("自动获取通话记录已关闭，取消每日定时任务")
        return

    hour, minute = parse_auto_query_time(runtime.auto_query_time)

    @callback
    def _handle_time(now) -> None:
        hass.async_create_task(
            async_run_auto_query(hass, entry, runtime, trigger="daily"),
            name=f"{DOMAIN}_auto_query_daily",
        )

    _DAILY_TIMERS[entry.entry_id] = async_track_time_change(
        hass, _handle_time, hour=hour, minute=minute, second=0
    )
    _LOGGER.info(
        "已注册每日自动获取通话记录: 每天 %02d:%02d (%s)", hour, minute, entry.data.get("phone", "")
    )


@callback
def _reset_query_start_date(hass: HomeAssistant, entry: ConfigEntry) -> Optional[bool]:
    """把「通话详单查询起始日期」设为当月 1 日 (存空值 = 跟随当月, 跨月自动滚动)

    返回 True=确实重置了 / False=本来就是跟随当月 / None=写入失败 (不能谎报"无需改动")。
    """
    try:
        options = dict(entry.options)
        if str(options.get(CONF_CALL_START_DATE, "") or "").strip():
            options[CONF_CALL_START_DATE] = ""
            hass.config_entries.async_update_entry(entry, options=options)
            _LOGGER.debug("已把通话流水查询起始日期重置为当月 1 日 (跟随当月)")
            return True
        return False
    except Exception as err:
        _LOGGER.warning("重置通话流水查询起始日期失败: %s", err)
        return None


# ------------------------------------------- 每日重置查询起始日期 (06:00)
_DAILY_RESET_TIMERS: Dict[str, Any] = {}


@callback
def async_cancel_daily_reset(entry_id: str) -> None:
    """取消该条目的「每日重置查询起始日期」定时任务"""
    unsub = _DAILY_RESET_TIMERS.pop(entry_id, None)
    if unsub is not None:
        try:
            unsub()
        except Exception as err:
            _LOGGER.debug("取消每日重置查询起始日期任务失败: %s", err)


@callback
def async_schedule_daily_reset(
    hass: HomeAssistant, entry: ConfigEntry, runtime: AuthRuntime
) -> None:
    """按开关状态注册「每天 06:00 把查询起始日期恢复为当月 1 日」的定时任务"""
    async_cancel_daily_reset(entry.entry_id)
    if not runtime.daily_reset_enabled:
        _LOGGER.debug("每日重置查询起始日期已关闭，取消定时任务")
        return

    hour, minute = parse_auto_query_time(DAILY_RESET_START_DATE_TIME)

    @callback
    def _handle_time(now) -> None:
        hass.async_create_task(
            async_run_daily_reset(hass, entry, runtime),
            name=f"{DOMAIN}_daily_reset_start_date",
        )

    _DAILY_RESET_TIMERS[entry.entry_id] = async_track_time_change(
        hass, _handle_time, hour=hour, minute=minute, second=0
    )
    _LOGGER.info(
        "已注册每日重置通话流水查询起始日期: 每天 %02d:%02d (%s)",
        hour,
        minute,
        entry.data.get("phone", ""),
    )


async def async_run_daily_reset(
    hass: HomeAssistant, entry: ConfigEntry, runtime: AuthRuntime
) -> None:
    """把「通话详单查询起始日期」恢复为当月 1 日 (跟随当月)

    - 已处于"跟随当月"时不写选项，不做多余刷新
    - 手动固定过其它月份时改回空值：实体立即显示当月 1 日，并顺带刷新一次数据
    """
    today = datetime.date.today()
    month_first = f"{today.year}年{today.month}月1日"
    try:
        changed = _reset_query_start_date(hass, entry)
        if changed is None:
            runtime.daily_reset_last_result = "重置失败：写入集成选项异常，请查看日志"
        elif changed:
            runtime.daily_reset_last_result = (
                f"已重置为 {month_first} (跟随当月)，并已触发一次数据刷新"
            )
            _LOGGER.info("每日定时已把通话流水查询起始日期重置为当月 1 日")
        else:
            runtime.daily_reset_last_result = f"已是 {month_first} (跟随当月)，无需改动"
    except Exception as err:
        runtime.daily_reset_last_result = f"执行异常：{err}"
        _LOGGER.warning("每日重置通话流水查询起始日期异常: %s", err)

    runtime.daily_reset_last_run_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    runtime.notify()


def _trigger_label(trigger: str) -> str:
    return {
        "daily": "每日定时",
        "after_login": "登录后自动获取",
        "manual": "手动",
    }.get(trigger, trigger)


async def async_run_auto_query(
    hass: HomeAssistant,
    entry: ConfigEntry,
    runtime: AuthRuntime,
    *,
    coordinator=None,
    trigger: str = "daily",
    attempt: int = 1,
) -> None:
    """自动获取一次通话记录 (供定时任务与登录成功回调调用)

    1. 查询起始日期重置为当月 1 日
    2. 登录态检查: 掉线 -> 交棒给统一的自动登录入口; 网络异常 -> 跳过
    3. 触发详单查询 (授权有效直接拉取; 失效则下发详单验证码并等待写入后自动提交)
    """
    if coordinator is None:
        # 定时任务路径: 从 hass.data 取协调器 (实体可能尚未加入)
        store = hass.data.get(DOMAIN, {}).get(entry.entry_id)
        coordinator = store.get("coordinator") if isinstance(store, dict) else None
    if coordinator is None:
        _LOGGER.warning("自动获取通话记录缺少协调器，跳过")
        return

    if runtime.busy:
        # busy 是按钮/自动登录/自动提交共用的瞬时标志，直接丢弃会让"登录后自动获取"
        # 与每日定时静默失效，因此改为有界重试
        if schedule_busy_retry(
            hass,
            15,
            lambda n: async_run_auto_query(
                hass, entry, runtime, coordinator=coordinator, trigger=trigger, attempt=n
            ),
            name=f"{DOMAIN}_auto_query_retry",
            attempt=attempt,
        ):
            runtime.auto_query_last_result = "等待其它操作结束后自动重试"
        else:
            runtime.auto_query_last_result = "跳过：当前有其它操作正在执行"
        runtime.notify()
        return

    runtime.busy = True
    try:
        _reset_query_start_date(hass, entry)
        login_state = await async_detect_login_state(coordinator)

        if login_state == STATE_ERROR:
            runtime.auto_query_last_result = "跳过：网络异常，无法连接电信接口"
            return

        if login_state == STATE_EXPIRED:
            if runtime.auto_login_enabled:
                runtime.auto_query_last_result = (
                    "账号离线，已转交自动登录；登录成功后会自动获取通话记录"
                )
                runtime.notify()
                # 交棒给统一的自动登录入口: 它会遵守"连续失败暂停"与"窗口内不重复发码"，
                # 直接调用底层发码会绕过这两层保护 (重复短信轰炸 / 打断详单窗口)
                runtime.busy = False
                await async_auto_login(hass, entry, coordinator, runtime)
            else:
                runtime.auto_query_last_result = "跳过：账号离线且未开启「自动登录」"
            return

        _ok, msg = await async_start_detail_query(hass, entry, coordinator, runtime)
        runtime.auto_query_last_result = f"[{_trigger_label(trigger)}] {msg}"
    except Exception as err:
        runtime.auto_query_last_result = f"执行异常：{err}"
        _LOGGER.warning("自动获取通话记录异常: %s", err)
    finally:
        runtime.busy = False
        runtime.notify()
        _LOGGER.info("自动获取通话记录结束(%s): %s", trigger, runtime.auto_query_last_result)


# ---------------------------------------------------------------- 实体基类
class _AutoQueryEntity(CarrierControlEntity):
    """自动获取通话记录实体基类 (switch / time 共用属性)"""

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        hour, minute = parse_auto_query_time(runtime.auto_query_time)
        attrs: Dict[str, Any] = {
            "功能说明": (
                "开启后每天到达设定时间会自动把「通话详单查询起始日期」设为当月 1 日并获取一次通话流水；"
                "短信登录成功后也会延迟获取一次"
            ),
            "每日执行时间": f"{hour:02d}:{minute:02d}",
            "查询起始日期": "当月 1 日 (跟随当月，跨月自动滚动)",
            "自动登录": "已开启（掉线时先登录再获取）" if runtime.auto_login_enabled else "未开启（掉线时跳过）",
            "最近执行结果": runtime.auto_query_last_result,
        }
        # 登录态来自协调器 (经 CarrierControlEntity.login_expired 读取)
        if self.login_expired:
            attrs["当前登录态"] = "已失效（需重新登录）"
        return attrs


# ---------------------------------------------------------------- switch
class TelecomAutoQuerySwitch(_AutoQueryEntity, SwitchEntity, RestoreEntity):
    """自动获取通话记录开关 (switch.<手机号>_auto_query)"""

    _attr_device_class = SwitchDeviceClass.SWITCH

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_AUTO_QUERY_SWITCH,
            "自动获取通话记录",
            "mdi:calendar-sync-outline",
            platform_domain="switch",
        )
        self._unsub_login = None
        self._unsub_delayed = None

    @property
    def is_on(self) -> bool:
        return bool(self._runtime.auto_query_enabled)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state is not None and last_state.state in ("on", "off"):
            self._runtime.auto_query_enabled = last_state.state == "on"
        self._unsub_login = self.hass.bus.async_listen(
            EVENT_LOGIN_SUCCESS, self._handle_login_success
        )
        async_schedule_daily_query(self.hass, self.entry, self._runtime)

    async def async_will_remove_from_hass(self) -> None:
        # 注意: 每日定时任务是"开关"与"时间"实体共用同一个 entry 键的，
        # 单个实体被移除时不能直接注销任务（会让仍存活的实体失去定时能力），
        # 这里按运行时开关状态重新调度一次即可；条目卸载时由 __init__ 统一注销。
        async_schedule_daily_query(self.hass, self.entry, self._runtime)
        if self._unsub_login is not None:
            self._unsub_login()
            self._unsub_login = None
        if self._unsub_delayed is not None:
            self._unsub_delayed()
            self._unsub_delayed = None
        await super().async_will_remove_from_hass()

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._async_set_enabled(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._async_set_enabled(False)

    async def _async_set_enabled(self, enabled: bool) -> None:
        self._runtime.auto_query_enabled = enabled
        if not enabled and self._unsub_delayed is not None:
            self._unsub_delayed()
            self._unsub_delayed = None
        async_schedule_daily_query(self.hass, self.entry, self._runtime)
        self._runtime.notify()
        _LOGGER.info("自动获取通话记录已%s", "开启" if enabled else "关闭")

    @callback
    def _handle_login_success(self, event) -> None:
        """短信登录成功 -> 延迟自动获取一次 (避免与登录验证码串味)"""
        if (event.data or {}).get("entry_id") not in ("", self.entry.entry_id):
            return
        if not self._runtime.auto_query_enabled:
            return
        if self._unsub_delayed is not None:
            self._unsub_delayed()
        self._runtime.auto_query_last_result = (
            f"登录成功，{AFTER_LOGIN_QUERY_DELAY} 秒后自动获取通话记录"
        )
        self._runtime.notify()
        self._unsub_delayed = async_call_later(
            self.hass, AFTER_LOGIN_QUERY_DELAY, self._handle_delayed_query
        )

    @callback
    def _handle_delayed_query(self, _now) -> None:
        self._unsub_delayed = None
        self.hass.async_create_task(
            async_run_auto_query(
                self.hass,
                self.entry,
                self._runtime,
                coordinator=self._coordinator,
                trigger="after_login",
            ),
            name=f"{DOMAIN}_auto_query_after_login",
        )


# ---------------------------------------------------------------- time
class TelecomAutoQueryTime(_AutoQueryEntity, TimeEntity, RestoreEntity):
    """自动获取通话记录时间 (time.<手机号>_auto_query_time)"""

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_AUTO_QUERY_TIME,
            "自动获取通话记录时间",
            "mdi:clock-time-eight-outline",
            platform_domain="time",
        )

    @property
    def native_value(self) -> Optional[datetime.time]:
        hour, minute = parse_auto_query_time(self._runtime.auto_query_time)
        return datetime.time(hour=hour, minute=minute)

    async def async_set_value(self, value: datetime.time) -> None:
        if value is None:
            return
        self._runtime.auto_query_time = value.strftime("%H:%M:%S")
        async_schedule_daily_query(self.hass, self.entry, self._runtime)
        self._runtime.notify()
        _LOGGER.info(
            "自动获取通话记录时间已设为 %s (%s)",
            self._runtime.auto_query_time,
            self.phone,
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state is not None and last_state.state:
            try:
                parsed = datetime.time.fromisoformat(str(last_state.state))
                self._runtime.auto_query_time = parsed.strftime("%H:%M:%S")
            except Exception:
                self._runtime.auto_query_time = DEFAULT_AUTO_QUERY_TIME
        async_schedule_daily_query(self.hass, self.entry, self._runtime)

    async def async_will_remove_from_hass(self) -> None:
        # 同上: 与「自动获取通话记录」开关共用任务，移除本实体时按开关状态重新调度
        async_schedule_daily_query(self.hass, self.entry, self._runtime)
        await super().async_will_remove_from_hass()


# ---------------------------------------------------------------- 工厂
def create_auto_query_switch(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomAutoQuerySwitch:
    """创建「自动获取通话记录」开关实体 (switch 平台)"""
    return TelecomAutoQuerySwitch(hass, coordinator, phone, entry)


def create_auto_query_time(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomAutoQueryTime:
    """创建「自动获取通话记录时间」实体 (time 平台)"""
    return TelecomAutoQueryTime(hass, coordinator, phone, entry)


# ---------------------------------------------------------------- 自动登录开关
class TelecomAutoLoginSwitch(CarrierControlEntity, SwitchEntity, RestoreEntity):
    """登录失效后自动短信登录开关 (switch.<手机号>_auto_login)"""

    _attr_device_class = SwitchDeviceClass.SWITCH

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_AUTO_LOGIN_SWITCH,
            "自动短信登录",
            "mdi:login-variant",
            platform_domain="switch",
        )

    @property
    def is_on(self) -> bool:
        return bool(self._runtime.auto_login_enabled)

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        attrs: Dict[str, Any] = {
            "功能说明": (
                "开启后检测到登录失效会自动下发登录验证码；手机端把验证码写入"
                "「通话详单验证码」实体即自动完成登录"
            ),
            "登录态": "已失效" if self.login_expired else "有效",
            "连续失败次数": runtime.login_failures,
            "自动登录状态": "已暂停（连续失败达上限，请手动按下认证按钮）"
            if runtime.auto_login_paused
            else "正常",
        }
        if self.login_expired and getattr(self._coordinator, "last_auth_error", ""):
            attrs["登录失效原因"] = str(self._coordinator.last_auth_error)
        if runtime.login_sms_sent_at:
            attrs["最近下发登录验证码时间"] = datetime.datetime.fromtimestamp(
                runtime.login_sms_sent_at
            ).strftime("%Y-%m-%d %H:%M:%S")
        return attrs

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state is not None and last_state.state in ("on", "off"):
            self._runtime.auto_login_enabled = last_state.state == "on"

        # 启动时若已经处于登录失效状态 (登录失效事件早于本实体创建)，补一次自动登录
        if self._runtime.auto_login_enabled and self.login_expired:
            _LOGGER.info("启动时检测到登录已失效，自动短信登录立即接管 (%s)", self.phone)
            self.hass.async_create_task(
                async_auto_login(self.hass, self.entry, self._coordinator, self._runtime),
                name=f"{DOMAIN}_auto_login_startup",
            )

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._runtime.auto_login_enabled = True
        # 手动重新开启时解除暂停并清零失败计数
        self._runtime.reset_login_failures()
        self._runtime.notify()
        _LOGGER.info("自动短信登录已开启 (%s)", self.phone)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._runtime.auto_login_enabled = False
        self._runtime.notify()
        _LOGGER.info("自动短信登录已关闭 (%s)", self.phone)


def create_auto_login_switch(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomAutoLoginSwitch:
    """创建「自动短信登录」开关实体 (switch 平台)"""
    return TelecomAutoLoginSwitch(hass, coordinator, phone, entry)


# ---------------------------------------------------------------- 每日重置查询起始日期
class TelecomDailyResetSwitch(CarrierControlEntity, SwitchEntity, RestoreEntity):
    """每日重置查询起始日期开关 (switch.<手机号>_daily_reset)

    默认开启：每天 DAILY_RESET_START_DATE_TIME (06:00) 自动把
    「通话详单查询起始日期」恢复为当月 1 日 (= 跟随当月，跨月自动滚动)。
    长期查看历史月份后，次日早上会自动回到当月，无需手动改回。
    """

    _attr_device_class = SwitchDeviceClass.SWITCH

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_CALL_QUERY_DAILY_RESET,
            "每日重置查询起始日期",
            "mdi:calendar-refresh",
            platform_domain="switch",
        )

    @property
    def is_on(self) -> bool:
        return bool(self._runtime.daily_reset_enabled)

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        hour, minute = parse_auto_query_time(DAILY_RESET_START_DATE_TIME)
        raw = str(self.entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
        today = datetime.date.today()
        attrs: Dict[str, Any] = {
            "功能说明": (
                f"开启后每天 {hour:02d}:{minute:02d} 自动把「通话详单查询起始日期」"
                "设置为当月 1 日（跟随当月，跨月自动滚动）；关闭后手动设定的月份会一直保留"
            ),
            "每日执行时间": f"{hour:02d}:{minute:02d}",
            "当前查询起始日期": raw if raw else f"{today.year:04d}-{today.month:02d}-01",
            "是否跟随当月": "否（已固定为具体日期）" if raw else "是（跟随当月）",
            "最近执行时间": self._runtime.daily_reset_last_run_at or "尚未执行",
            "最近执行结果": self._runtime.daily_reset_last_result,
        }
        if self.login_expired:
            attrs["当前登录态"] = "已失效（需重新登录）"
        return attrs

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state is not None and last_state.state in ("on", "off"):
            self._runtime.daily_reset_enabled = last_state.state == "on"
        async_schedule_daily_reset(self.hass, self.entry, self._runtime)

    async def async_will_remove_from_hass(self) -> None:
        # 按开关状态重新调度 (关闭时内部会注销)；条目卸载由 __init__ 统一清理
        async_schedule_daily_reset(self.hass, self.entry, self._runtime)
        await super().async_will_remove_from_hass()

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._runtime.daily_reset_enabled = True
        async_schedule_daily_reset(self.hass, self.entry, self._runtime)
        # 立即执行一次，避免要等到第二天早上才生效
        await async_run_daily_reset(self.hass, self.entry, self._runtime)
        self._runtime.notify()
        _LOGGER.info("每日重置查询起始日期已开启 (%s)", self.phone)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._runtime.daily_reset_enabled = False
        async_cancel_daily_reset(self.entry.entry_id)
        self._runtime.notify()
        _LOGGER.info("每日重置查询起始日期已关闭 (%s)", self.phone)


def create_daily_reset_switch(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomDailyResetSwitch:
    """创建「每日重置查询起始日期」开关实体 (switch 平台)"""
    return TelecomDailyResetSwitch(hass, coordinator, phone, entry)
