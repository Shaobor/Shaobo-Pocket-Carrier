# -*- coding: utf-8 -*-
"""中国移动短信登录控制实体 (验证码文本实体与登录按钮)

实体清单:
- text「短信登录验证码」(`text.<手机号>_code`):
  短效验证码输入框，供手机端自动化 (Tasker/快捷指令/短信转发) 调用 text.set_value 写入，写入 6 位验证码后自动提交登录
- button「短信登录」(`button.<手机号>_login_button`):
  手动下发验证码短信 / 提交验证码登录
"""
import logging
import time
from typing import Any, Dict, Optional

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.components.text import TextEntity, TextMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant

from ..const import (
    DOMAIN,
    ENTITY_CALL_AUTH_CODE,
    LOGIN_CODE_LENGTH,
    LOGIN_SMS_WAIT_SECONDS,
)
from .auth_runtime import STAGE_LOGIN, AuthRuntime
from .base import CarrierControlEntity
from .mobile_login import (
    STATE_ERROR,
    STATE_EXPIRED,
    STATE_OK,
    async_detect_login_state,
    async_send_login_sms,
    async_submit_login_code,
)

_LOGGER = logging.getLogger(__name__)


class MobileAuthCodeText(CarrierControlEntity, TextEntity):
    """中国移动短信登录验证码实体 (text.<手机号>_code)"""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_native_min = 0
    _attr_native_max = 16
    _attr_mode = TextMode.TEXT

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        phone: str,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            key=ENTITY_CALL_AUTH_CODE,
            name="短信登录验证码",
            icon="mdi:message-text-lock",
            platform_domain="text",
        )
        self._hass = hass
        self._value = ""

    @property
    def native_value(self) -> Optional[str]:
        return self._value

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        attrs: Dict[str, Any] = {
            "用途": "中国移动短信快捷登录验证码",
            "填写状态": "已填写" if self._value else "未填写",
            "使用说明": (
                f"移动短信登录验证码。触发发码后在 {LOGIN_SMS_WAIT_SECONDS} 秒内写入 "
                f"{LOGIN_CODE_LENGTH} 位验证码即自动完成登录并恢复在线"
            ),
        }
        if runtime.code_set_at:
            attrs["填写时间"] = time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(runtime.code_set_at)
            )
            attrs["已填写时长"] = f"{int(time.time() - runtime.code_set_at)} 秒"
        if runtime.login_await_until > time.time():
            attrs["等待提交剩余时间"] = f"约 {int(runtime.login_await_until - time.time())} 秒"
        if self.login_expired:
            attrs["当前登录态"] = "已失效 (等待短信验证码重新登录)"
        return attrs

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._runtime.text_entity = self
        self._runtime.code_entity_id = self.entity_id
        self._runtime.code = self._value
        self._runtime.code_set_at = 0.0

    async def async_will_remove_from_hass(self) -> None:
        if self._runtime.text_entity is self:
            self._runtime.text_entity = None
            self._runtime.code_entity_id = ""
        await super().async_will_remove_from_hass()

    async def async_set_value(self, value: str) -> None:
        """写入值 (手机端自动化调用 text.set_value 服务)"""
        text = "".join((value or "").split())
        self._value = text
        self._runtime.note_code(text, time.time() if text else 0.0)
        self._async_safe_write_state()
        self._runtime.notify()

        if not text:
            return

        # 检查是否满足 6 位纯数字
        if len(text) == LOGIN_CODE_LENGTH and text.isdigit():
            _LOGGER.info("移动手机号 %s 收到短信验证码写入，自动提交登录", self.phone)
            self.hass.async_create_task(
                async_submit_login_code(
                    self.hass, self.entry, self._coordinator, self._runtime, text
                ),
                name=f"{DOMAIN}_mobile_auth_auto_submit",
            )

    def async_clear_code(self) -> None:
        """清空验证码"""
        self._value = ""
        self._runtime.clear_code()
        self._async_safe_write_state()


class MobileAuthButton(CarrierControlEntity, ButtonEntity):
    """中国移动短信登录按钮 (button.<手机号>_login_button)"""

    _attr_device_class = ButtonDeviceClass.UPDATE

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        phone: str,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            key="login_button",
            name="短信登录",
            icon="mdi:login-variant",
            platform_domain="button",
        )
        self._hass = hass

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._runtime.button_entity = self

    async def async_will_remove_from_hass(self) -> None:
        if self._runtime.button_entity is self:
            self._runtime.button_entity = None
        await super().async_will_remove_from_hass()

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        attrs: Dict[str, Any] = {
            "功能说明": "按下后下发短信登录验证码；写入验证码后再次按下或自动提交登录",
            "当前登录态": "已失效" if self.login_expired else "正常在线",
            "最近执行时间": runtime.last_run_at or "尚未执行",
            "最近执行结果": runtime.last_result,
        }
        if runtime.login_waiting:
            attrs["等待验证码窗口"] = f"剩余约 {int(runtime.login_await_until - time.time())} 秒"
        return attrs

    async def async_press(self) -> None:
        """按钮按下逻辑"""
        runtime = self._runtime
        code = (runtime.code or "").strip()

        # 1. 若当前已有 6 位数字验证码，直接提交登录
        if len(code) == LOGIN_CODE_LENGTH and code.isdigit():
            _LOGGER.info("移动手机号 %s 按下登录按钮，检测到有效验证码，提交登录", self.phone)
            await async_submit_login_code(
                self.hass, self.entry, self._coordinator, runtime, code
            )
            return

        # 2. 否则下发短信验证码
        _LOGGER.info("移动手机号 %s 按下登录按钮，下发短信登录验证码", self.phone)
        await async_send_login_sms(self.hass, self.entry, self._coordinator, runtime)


def create_mobile_auth_text_entity(
    hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry
) -> MobileAuthCodeText:
    """创建移动短信验证码文本实体"""
    return MobileAuthCodeText(hass, coordinator, phone, entry)


def create_mobile_auth_button_entity(
    hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry
) -> MobileAuthButton:
    """创建移动短信登录按钮实体"""
    return MobileAuthButton(hass, coordinator, phone, entry)
