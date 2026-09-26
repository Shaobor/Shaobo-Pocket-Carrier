# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 配置流 (支持多手机号、方案一滑块交互与模块化隔离)"""
from collections.abc import Mapping
from typing import Any
import logging
import random
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    DOMAIN,
    CARRIER_TELECOM,
    CARRIER_UNICOM,
    CARRIER_NAMES,
    CONF_CARRIER,
    CONF_PHONE,
    CONF_AUTH_DATA,
)
from .api.telecom import TelecomClient, TELECOM_DEVICE_MODELS
from .api.unicom import UnicomClient
from .views import SLIDER_SESSIONS, CarrierSliderPageView, CarrierSliderVerifyView
from .storage import async_save_carrier_account

_LOGGER = logging.getLogger(__name__)

class ChinaCarrierConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):




    def __init__(self):
        self.carrier: str = CARRIER_TELECOM
        self.phone: str = ""
        self.telecom_client: TelecomClient = None
        self.unicom_client: UnicomClient = None

    async def async_step_user(self, user_input=None):
        """步骤1: 选择运营商与输入手机号"""
        errors = {}

        if user_input is not None:
            self.carrier = user_input[CONF_CARRIER]
            self.phone = user_input[CONF_PHONE].strip()

            if len(self.phone) != 11 or not self.phone.isdigit():
                errors["base"] = "invalid_phone"
            else:
                # 检查该手机号是否已被配置 (关闭 raise_on_progress 允许用户随时重新发起配置)
                unique_id = f"{self.carrier}_{self.phone}"
                await self.async_set_unique_id(unique_id, raise_on_progress=False)
                self._abort_if_unique_id_configured()

                if self.carrier == CARRIER_TELECOM:
                    # 电信分支：随机抽取真实 iPhone 设备型号，实现不同账号指纹独立
                    random_model = random.choice(TELECOM_DEVICE_MODELS)
                    self.telecom_client = TelecomClient(self.phone, device_model=random_model)
                    ok = await self.hass.async_add_executor_job(self.telecom_client.send_sms)
                    if ok:
                        return await self.async_step_telecom_sms()
                    else:
                        errors["base"] = "sms_send_failed"

                elif self.carrier == CARRIER_UNICOM:
                    # 联通分支：确保视图已注册
                    domain_data = self.hass.data.setdefault(DOMAIN, {})
                    if not domain_data.get("views_registered"):
                        self.hass.http.register_view(CarrierSliderPageView())
                        self.hass.http.register_view(CarrierSliderVerifyView())
                        domain_data["views_registered"] = True

                    # 触发风控并准备滑块
                    self.unicom_client = UnicomClient(self.phone)
                    try:
                        await self.hass.async_add_executor_job(self.unicom_client.trigger_risk)
                        app_id = await self.hass.async_add_executor_job(self.unicom_client.prepare_captcha)
                        SLIDER_SESSIONS[self.flow_id] = {
                            "client": self.unicom_client,
                            "app_id": app_id,
                            "mobile_hex": self.unicom_client.mobile_hex,
                            "status": "pending",
                        }
                        return await self.async_step_unicom_slider()
                    except Exception as err:
                        _LOGGER.error("联通风控预处理失败: %s", err)
                        errors["base"] = "unicom_risk_failed"

        schema = vol.Schema({
            vol.Required(CONF_CARRIER, default=CARRIER_TELECOM): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        {"label": "中国电信", "value": CARRIER_TELECOM},
                        {"label": "中国联通", "value": CARRIER_UNICOM},
                    ],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(CONF_PHONE): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEL)
            ),
        })

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={"carrier_names": "中国电信 / 中国联通"},
        )

    async def async_step_telecom_sms(self, user_input=None):
        """步骤2 (电信): 输入 6 位短信验证码"""
        errors = {}

        if user_input is not None:
            sms_code = user_input.get("sms_code", "").strip()
            ok = await self.hass.async_add_executor_job(self.telecom_client.login_with_sms, sms_code)
            if ok:
                auth_data = self.telecom_client.export_auth()
                await async_save_carrier_account(self.hass, CARRIER_TELECOM, self.phone, auth_data)

                # 重新认证模式：就地更新条目并重新载入
                if hasattr(self, "_reauth_entry") and self._reauth_entry:
                    return self.async_update_reload_and_abort(
                        self._reauth_entry,
                        data_updates={
                            CONF_AUTH_DATA: auth_data,
                        },
                    )

                return self.async_create_entry(
                    title=f"中国电信 ({self.phone})",
                    data={
                        CONF_CARRIER: CARRIER_TELECOM,
                        CONF_PHONE: self.phone,
                        CONF_AUTH_DATA: auth_data,
                    },
                )
            else:
                errors["base"] = "invalid_sms_code"

        schema = vol.Schema({
            vol.Required("sms_code"): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            ),
        })

        return self.async_show_form(
            step_id="telecom_sms",
            data_schema=schema,
            errors=errors,
            description_placeholders={"phone": self.phone},
        )

    async def async_step_unicom_slider(self, user_input=None):
        """步骤2 (联通-方案一): 引导本地腾讯滑块验证并输入短信"""
        errors = {}

        if user_input is not None:
            sms_code = user_input.get("sms_code", "").strip()
            ok = await self.hass.async_add_executor_job(self.unicom_client.login_with_sms, sms_code)
            if ok:
                SLIDER_SESSIONS.pop(self.flow_id, None)
                auth_data = self.unicom_client.export_auth()
                await async_save_carrier_account(self.hass, CARRIER_UNICOM, self.phone, auth_data)

                # 重新认证模式：就地更新条目并重新载入
                if hasattr(self, "_reauth_entry") and self._reauth_entry:
                    return self.async_update_reload_and_abort(
                        self._reauth_entry,
                        data_updates={
                            CONF_AUTH_DATA: auth_data,
                        },
                    )

                return self.async_create_entry(
                    title=f"中国联通 ({self.phone})",
                    data={
                        CONF_CARRIER: CARRIER_UNICOM,
                        CONF_PHONE: self.phone,
                        CONF_AUTH_DATA: auth_data,
                    },
                )
            else:
                errors["base"] = "invalid_sms_code"

        schema = vol.Schema({
            vol.Required("sms_code"): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            ),
        })

        # 自动识别当前访问环境并生成跨源外部链接，使 HA 前端强制在新标签页中打开 (自带 target="_blank")
        req_host = ""
        req_scheme = "http"
        try:
            from homeassistant.components.http import current_request
            req = current_request.get()
            if req and req.host:
                req_host = req.host
                req_scheme = req.scheme or "http"
        except Exception:
            pass

        if "127.0.0.1" in req_host:
            target_host = req_host.replace("127.0.0.1", "localhost")
        elif "localhost" in req_host:
            target_host = req_host.replace("localhost", "127.0.0.1")
        elif req_host:
            target_host = req_host
        else:
            target_host = "localhost:8123"

        slider_url = f"{req_scheme}://{target_host}/api/shaobo_pocket_carrier/slider?flow_id={self.flow_id}"

        return self.async_show_form(
            step_id="unicom_slider",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "phone": self.phone,
                "slider_url": slider_url,
            },
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> config_entries.ConfigFlowResult:
        """步骤 Reauth: 处理 Home Assistant 官方触发的重新认证"""
        self._reauth_entry = self.hass.config_entries.async_get_entry(self.context["entry_id"])
        self.carrier = entry_data.get(CONF_CARRIER, CARRIER_UNICOM)
        self.phone = entry_data.get(CONF_PHONE, "")
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None) -> config_entries.ConfigFlowResult:
        """步骤 Reauth Confirm: 提示用户并启动滑块与短信登录流程"""
        errors = {}
        if user_input is not None:
            if self.carrier == CARRIER_UNICOM:
                self.unicom_client = UnicomClient(self.phone)
                SLIDER_SESSIONS[self.flow_id] = self.unicom_client
                return await self.async_step_unicom_slider()
            elif self.carrier == CARRIER_TELECOM:
                # 重新认证时，继承并复用原有条目的设备型号，保持设备指纹一致稳定
                existing_auth = {}
                existing_model = None
                if hasattr(self, "_reauth_entry") and self._reauth_entry:
                    existing_auth = self._reauth_entry.data.get(CONF_AUTH_DATA) or {}
                    existing_model = existing_auth.get("device_model")
                self.telecom_client = TelecomClient(self.phone, auth_data=existing_auth, device_model=existing_model)
                ok = await self.hass.async_add_executor_job(self.telecom_client.send_sms)
                if ok:
                    return await self.async_step_telecom_sms()
                else:
                    errors["base"] = "sms_send_failed"

        carrier_name = CARRIER_NAMES.get(self.carrier, "运营商")
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({}),
            errors=errors,
            description_placeholders={
                "carrier": carrier_name,
                "phone": self.phone,
            },
        )


