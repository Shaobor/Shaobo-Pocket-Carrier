# -*- coding: utf-8 -*-
"""中国移动「短信登录」模块 (离线自动登录)

职责:
1. 判定登录态: 协调器状态位优先, 否则主动探活; 网络故障与掉线严格区分
2. 登录流程: 下发登录验证码短信 → 等待写入 → 用验证码登录 → 更新 entry.data 与 .storage → 原地恢复 client 会话 → 结束 Home Assistant 挂起的重新认证流程
3. 自动登录: 监听登录失效事件, 按开关决定是否自动发码, 连续失败达到上限后暂停
"""
import logging
import time
from typing import Tuple

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from ..const import (
    AUTO_LOGIN_MAX_FAILURES,
    CARRIER_MOBILE,
    CONF_AUTH_DATA,
    CONF_PHONE,
    DOMAIN,
    EVENT_LOGIN_EXPIRED,
    EVENT_LOGIN_SUCCESS,
    LOGIN_CODE_LENGTH,
    LOGIN_SMS_WAIT_SECONDS,
)
from ..storage import async_save_carrier_account
from .auth_runtime import AuthRuntime, async_get_auth_runtime, schedule_busy_retry

_LOGGER = logging.getLogger(__name__)

STATE_OK = "ok"
STATE_EXPIRED = "expired"
STATE_ERROR = "error"


# ---------------------------------------------------------------- 登录态判定
def is_login_expired(coordinator) -> bool:
    """协调器已记录登录失效 (无需额外请求)"""
    return bool(getattr(coordinator, "login_expired", False))


async def async_detect_login_state(coordinator) -> str:
    """判定登录态: 状态位优先, 否则主动探活一次

    返回 STATE_OK / STATE_EXPIRED / STATE_ERROR(网络问题, 不应触发登录短信)
    """
    if coordinator is None:
        return STATE_ERROR
    if is_login_expired(coordinator):
        return STATE_EXPIRED
    return await coordinator.async_probe_login_state()


# ---------------------------------------------------------------- 登录流程
async def async_send_login_sms(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
) -> Tuple[bool, str]:
    """下发登录验证码短信并开启等待窗口"""
    sent_at = time.time()
    ok, msg = await coordinator.async_send_login_sms()
    if ok:
        runtime.open_login_window(sent_at, LOGIN_SMS_WAIT_SECONDS)
        runtime.last_result = (
            f"登录验证码已下发，请在 {LOGIN_SMS_WAIT_SECONDS} 秒内写入「短信登录验证码」实体"
        )
        # 边界: 验证码可能早于发码请求返回就已写入
        pending = (runtime.code or "").strip()
        if (
            len(pending) == LOGIN_CODE_LENGTH
            and pending.isdigit()
            and runtime.code_set_at + 1.0 >= sent_at
        ):
            _LOGGER.info("移动手机号 %s 发码期间已收到登录验证码，直接提交登录", entry.data.get(CONF_PHONE))
            runtime.last_result = "登录验证码已就绪，正在登录…"
            runtime.notify()
            await async_submit_login_code(hass, entry, coordinator, runtime, pending)
            return True, runtime.last_result
    else:
        runtime.close_windows()
        runtime.last_result = f"登录验证码下发失败：{msg}"
    runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
    runtime.notify()
    _LOGGER.info("移动手机号 %s 登录发码结果: %s (%s)", entry.data.get(CONF_PHONE), ok, msg)
    return ok, msg


async def async_submit_login_code(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
    code: str,
) -> Tuple[bool, str]:
    """提交短信登录验证码, 成功后恢复账号在线状态"""
    clean = "".join((code or "").split())
    if len(clean) != LOGIN_CODE_LENGTH or not clean.isdigit():
        msg = f"登录验证码应为 {LOGIN_CODE_LENGTH} 位数字"
        runtime.last_result = msg
        runtime.notify()
        return False, msg

    ok, msg = await coordinator.async_login_with_sms(clean)
    runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
    runtime.close_windows()
    runtime.clear_code_entity()

    if not ok:
        paused = runtime.note_login_failure(AUTO_LOGIN_MAX_FAILURES)
        runtime.last_result = f"短信登录失败：{msg}"
        if paused:
            runtime.last_result += f"（连续失败 {runtime.login_failures} 次，已暂停自动登录）"
        runtime.notify()
        return False, msg

    # 登录成功: 持久化新凭据并恢复条目
    auth_data = coordinator.client.export_auth()
    try:
        new_data = dict(entry.data)
        new_data[CONF_AUTH_DATA] = auth_data
        hass.config_entries.async_update_entry(entry, data=new_data)
    except Exception as err:
        _LOGGER.warning("更新配置条目凭据失败: %s", err)
    try:
        await async_save_carrier_account(
            hass, CARRIER_MOBILE, entry.data.get(CONF_PHONE, ""), auth_data
        )
    except Exception as err:
        _LOGGER.warning("写入移动专属存储文件失败: %s", err)

    runtime.reset_login_failures()
    coordinator.mark_login_revived()
    async_abort_reauth_flows(hass, entry)
    runtime.last_result = "短信登录成功，账号已恢复在线"
    runtime.notify()
    _LOGGER.info("移动手机号 %s 短信登录成功，登录态已恢复", entry.data.get(CONF_PHONE))

    # 广播登录成功事件
    hass.bus.async_fire(
        EVENT_LOGIN_SUCCESS,
        {"entry_id": entry.entry_id, "phone": entry.data.get(CONF_PHONE, "")},
    )
    # 恢复后立即刷新一次数据
    hass.async_create_task(
        coordinator.async_refresh(), name=f"{DOMAIN}_mobile_login_refresh"
    )
    return True, msg


@callback
def async_abort_reauth_flows(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """结束 Home Assistant 因登录失效而挂起的重新认证流程"""
    try:
        flows = hass.config_entries.flow.async_progress_by_handler(DOMAIN)
    except Exception as err:
        _LOGGER.debug("读取进行中的配置流失败: %s", err)
        return

    for flow in flows:
        context = flow.get("context") or {}
        if context.get("entry_id") != entry.entry_id:
            continue
        if not str(flow.get("step_id", "")).startswith("reauth"):
            continue
        try:
            hass.config_entries.flow.async_abort(flow["flow_id"])
            _LOGGER.info("已结束挂起的重新认证流程 (%s)", flow["flow_id"])
        except Exception as err:
            _LOGGER.debug("结束重新认证流程失败: %s", err)


# ---------------------------------------------------------------- 自动登录
async def async_auto_login(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
    attempt: int = 1,
) -> None:
    """登录失效后的自动短信登录 (受开关与失败次数限制)"""
    if not runtime.auto_login_enabled:
        return
    if runtime.auto_login_paused:
        _LOGGER.debug("自动登录已暂停 (连续失败 %d 次)，等待人工处理", runtime.login_failures)
        return
    if runtime.busy:
        if schedule_busy_retry(
            hass,
            20,
            lambda n: async_auto_login(hass, entry, coordinator, runtime, n),
            name=f"{DOMAIN}_mobile_auto_login_retry",
            attempt=attempt,
        ):
            _LOGGER.debug("自动登录被其它操作占用，已安排稍后重试 (第 %d 次)", attempt)
        else:
            runtime.last_result = "自动登录被其它操作占用，已放弃（可手动按下登录按钮）"
            runtime.notify()
        return
    if runtime.login_waiting:
        return

    runtime.busy = True
    try:
        _LOGGER.info("移动手机号 %s 检测到登录失效，自动下发登录验证码", entry.data.get(CONF_PHONE))
        ok, msg = await async_send_login_sms(hass, entry, coordinator, runtime)
        if not ok:
            runtime.note_login_failure(AUTO_LOGIN_MAX_FAILURES)
    except Exception as err:
        _LOGGER.warning("移动自动登录异常: %s", err)
        runtime.last_result = f"自动登录异常：{err}"
        runtime.note_login_failure(AUTO_LOGIN_MAX_FAILURES)
    finally:
        runtime.busy = False
        runtime.notify()


@callback
def async_setup_login_listener(hass: HomeAssistant, entry: ConfigEntry, coordinator):
    """注册"登录失效 → 自动登录"事件监听 (返回取消回调)"""

    async def _handle_login_expired(event) -> None:
        data = event.data or {}
        if data.get("entry_id") not in ("", entry.entry_id):
            return
        runtime = async_get_auth_runtime(hass, entry)
        await async_auto_login(hass, entry, coordinator, runtime)

    return hass.bus.async_listen(EVENT_LOGIN_EXPIRED, _handle_login_expired)
