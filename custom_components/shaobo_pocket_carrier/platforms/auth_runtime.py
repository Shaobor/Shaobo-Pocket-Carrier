# -*- coding: utf-8 -*-
"""认证/登录共享运行时状态

本模块只负责"同一条配置条目下各实体之间的共享状态"，不含任何实体定义，
便于分离开发与单元测试：

- 通话详单二次认证 (text 三件套 + button) 与短信登录共用同一个验证码实体，
  因此需要记录"当前期待哪个阶段的验证码"以及对应发码时间，用于：
    1. 只接受发码之后写入的验证码 (避免上一个阶段的迟到码被误用)
    2. 分阶段自动提交 (登录阶段优先于详单阶段)
- 登录连续失败计数 (达到上限后暂停自动登录)
"""
import logging
import time
from typing import Any, Callable, List, Optional

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# 阶段标识
STAGE_LOGIN = "login"
STAGE_DETAIL = "detail"

# 验证码写入时间与发码时间比较时的容差 (秒): 手机端转发可能略早于本地记录
_CODE_TIME_TOLERANCE = 1.0


class AuthRuntime:
    """通话详单二次认证 / 短信登录 的共享运行时状态"""

    def __init__(self) -> None:
        # ---- 详单认证三要素 (姓名/身份证号 仅详单阶段使用) ----
        self.name = ""
        self.id_card = ""

        # ---- 验证码 (登录与详单共用同一实体，仅内存暂存，不落盘、不写日志) ----
        self.code = ""
        self.code_set_at = 0.0

        # ---- 实体引用 / entity_id (供跨实体协作) ----
        self.text_entity = None
        self.button_entity = None
        self.code_entity_id = ""

        # ---- 详单认证阶段 ----
        self.sms_sent_at = 0.0
        self.await_submit_until = 0.0

        # ---- 登录阶段 ----
        self.login_sms_sent_at = 0.0
        self.login_await_until = 0.0
        self.login_failures = 0
        self.auto_login_paused = False

        # ---- 功能开关 (由 switch 实体同步写入, 供登录/自动查询模块读取) ----
        self.auto_login_enabled = False
        self.auto_query_enabled = False
        self.auto_query_time = ""

        # ---- 每日重置查询起始日期 (默认开启: 每天定时恢复为当月 1 日) ----
        self.daily_reset_enabled = True
        self.daily_reset_last_result = "尚未执行"
        self.daily_reset_last_run_at = ""

        # ---- 号码归属地库维护 ----
        self.auto_region_update_enabled = True     # 默认开启: 库缺失或超过 7 天时自动下载
        self.region_db_updating = False
        self.region_db_last_result = "尚未执行"
        self.region_db_last_check_at = 0.0

        # ---- 通用运行状态 ----
        self.last_run_at = ""
        self.last_result = "尚未执行"
        self.auto_query_last_result = "尚未执行"
        self.busy = False

        # ---- 状态变更监听 (实体注册, 用于后台任务/事件驱动时刷新实体状态) ----
        self._listeners: List[Callable[[], Any]] = []

    # ------------------------------------------------------------ 监听器
    @callback
    def add_listener(self, update_callback: Callable[[], Any]) -> None:
        """注册状态刷新回调 (实体在 async_added_to_hass 中注册)"""
        if update_callback not in self._listeners:
            self._listeners.append(update_callback)

    @callback
    def remove_listener(self, update_callback: Callable[[], Any]) -> None:
        if update_callback in self._listeners:
            self._listeners.remove(update_callback)

    @callback
    def notify(self) -> None:
        """通知所有实体刷新状态 (后台任务/事件驱动场景使用)"""
        for update_callback in list(self._listeners):
            try:
                update_callback()
            except Exception as err:  # 单个实体异常不影响其它实体
                _LOGGER.debug("刷新认证实体状态失败: %s", err)

    # ------------------------------------------------------------ 窗口管理
    def open_login_window(self, sent_at: float, seconds: float) -> None:
        """开启登录验证码等待窗口 (同时关闭详单窗口, 两个阶段不并行)

        从"详单阶段"切到"登录阶段"时会作废上一次残留的验证码：
        登录窗口优先级更高，若不清掉，还在路上的详单验证码会被当成登录码提交。
        """
        if self.sms_sent_at or self.await_submit_until:
            self.sms_sent_at = 0.0
            self.clear_code_entity()
        self.login_sms_sent_at = sent_at
        self.login_await_until = sent_at + seconds
        self.await_submit_until = 0.0

    def open_detail_window(self, sent_at: float, seconds: float) -> None:
        """开启详单验证码等待窗口 (同时关闭登录窗口，并作废残留验证码)"""
        if self.login_sms_sent_at or self.login_await_until:
            self.login_sms_sent_at = 0.0
            self.clear_code_entity()
        self.sms_sent_at = sent_at
        self.await_submit_until = sent_at + seconds
        self.login_await_until = 0.0

    def close_windows(self) -> None:
        """关闭全部等待窗口 (取消自动提交)"""
        self.await_submit_until = 0.0
        self.login_await_until = 0.0

    @property
    def login_waiting(self) -> bool:
        return self.login_await_until > time.time()

    @property
    def detail_waiting(self) -> bool:
        return self.await_submit_until > time.time()

    # ------------------------------------------------------------ 验证码判定
    def note_code(self, code: str, written_at: Optional[float] = None) -> None:
        """记录写入的验证码"""
        self.code = code
        self.code_set_at = time.time() if written_at is None else written_at

    def clear_code(self) -> None:
        """清空验证码缓存 (提交后立即调用, 避免复用与串阶段)"""
        self.code = ""
        self.code_set_at = 0.0

    @callback
    def clear_code_entity(self) -> None:
        """清空验证码实体与运行时缓存 (登录/详单提交后调用)"""
        entity = self.text_entity
        if entity is not None:
            entity.async_clear_code()   # 内部会调用 clear_code 并刷新状态
            return
        self.clear_code()
        self.notify()

    def stage_for_new_code(self) -> str:
        """判断刚写入的验证码属于哪个阶段

        - 只有在对应等待窗口内、且写入时间不早于本次发码时间的验证码才被接受
        - 登录窗口优先 (两个窗口不会同时开启, 这里只是兜底)
        - 返回 "" 表示当前没有阶段在等待验证码 (手动提交场景由按钮自行处理)
        """
        written_at = self.code_set_at
        if self.login_waiting and written_at + _CODE_TIME_TOLERANCE >= self.login_sms_sent_at:
            return STAGE_LOGIN
        if self.detail_waiting and written_at + _CODE_TIME_TOLERANCE >= self.sms_sent_at:
            return STAGE_DETAIL
        return ""

    # ------------------------------------------------------------ 登录失败计数
    def note_login_failure(self, limit: int) -> bool:
        """记录一次登录失败, 返回是否已达到上限并暂停自动登录"""
        self.login_failures += 1
        if limit > 0 and self.login_failures >= limit:
            if not self.auto_login_paused:
                _LOGGER.warning(
                    "自动短信登录连续失败 %d 次，已暂停自动登录，请手动按下二次认证按钮",
                    self.login_failures,
                )
            self.auto_login_paused = True
            return True
        return False

    def reset_login_failures(self) -> None:
        """登录成功后清零失败计数并解除暂停"""
        self.login_failures = 0
        self.auto_login_paused = False


def schedule_busy_retry(
    hass: HomeAssistant,
    delay: float,
    action: Callable[[int], Any],
    *,
    name: str = "",
    attempt: int = 1,
    max_attempts: int = 4,
) -> bool:
    """在 busy 期间安排一次"稍后重试" (返回是否已安排)

    按钮按下、自动提交、自动登录、定时获取共用同一个 busy 标志；瞬时占用若直接丢弃，
    会出现"验证码写入后不提交""掉线后永不自动登录"这类静默失效，
    因此这里做有界重试（最多 max_attempts 次）。
    """
    if hass is None or attempt >= max_attempts:
        return False
    try:
        from homeassistant.helpers.event import async_call_later

        def _retry(_now) -> None:
            hass.async_create_task(
                action(attempt + 1), name=name or f"{DOMAIN}_retry"
            )

        async_call_later(hass, delay, _retry)
        return True
    except Exception as err:
        _LOGGER.debug("安排重试失败: %s", err)
        return False


def async_get_auth_runtime(hass: HomeAssistant, entry: ConfigEntry) -> AuthRuntime:
    """获取 (必要时初始化) 该配置条目的认证/登录共享运行时状态"""
    store = hass.data.setdefault(DOMAIN, {}).setdefault(entry.entry_id, {})
    runtime = store.get("auth_runtime")
    if not isinstance(runtime, AuthRuntime):
        runtime = AuthRuntime()
        store["auth_runtime"] = runtime
    return runtime


def async_cancel_call_auth_auto_submit(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """取消验证码写入即自动提交的等待窗口

    选项流等其它入口自行下发验证码时调用，避免「通话详单验证码」实体抢先
    消费掉本次验证码，造成两边认证互相打架。
    """
    async_get_auth_runtime(hass, entry).close_windows()
