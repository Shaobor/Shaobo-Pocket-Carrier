# -*- coding: utf-8 -*-
"""中国运营商 Home Assistant 配置流 (支持多手机号、方案一滑块交互与模块化隔离)"""
from collections.abc import Mapping
from typing import Any
import logging
import random
import time
import datetime
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
    CONF_SCAN_INTERVAL,
    CONF_CALL_START_DATE,
    CONF_SIGNATURE_STRING,
    CONF_SIGNATURE_TIMESTAMP,
    CONF_AUTH_USER_NAME,
    CONF_AUTH_ID_CARD,
    CONF_OVERVIEW_CALL_LIMIT,
    OVERVIEW_CALL_LIMIT_DEFAULT,
    CONF_AUTH_ACTION,
    AUTH_ACTION_NONE,
    AUTH_ACTION_CALL_AUTH,
    MIN_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL_TELECOM,
    DEFAULT_SCAN_INTERVAL_UNICOM,
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

    @classmethod
    @callback
    def async_supports_options_flow(cls, config_entry: config_entries.ConfigEntry) -> bool:
        """中国电信与中国联通均支持配置选项 (刷新时间等)"""
        return True

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """获取集成专属选项流"""
        return CarrierOptionsFlowHandler(config_entry)


class CarrierOptionsFlowHandler(config_entries.OptionsFlow):
    """运营商集成配置选项流处理类"""

    def __init__(self, config_entry: config_entries.ConfigEntry = None) -> None:
        """初始化选项流 (支持传入或使用基类自带 property)"""
        super().__init__()
        self._custom_config_entry = config_entry
        self._options_data = {}
        self._telecom_client = None

    @property
    def target_entry(self) -> config_entries.ConfigEntry:
        """获取目标条目"""
        if self._custom_config_entry is not None:
            return self._custom_config_entry
        return self.config_entry

    async def async_step_init(self, user_input=None) -> config_entries.ConfigFlowResult:
        """管理配置选项 (支持电信/联通自定义刷新时间，电信专属认证入口)"""
        errors = {}
        carrier = self.target_entry.data.get(CONF_CARRIER)

        if user_input is not None:
            # 严格校验：刷新时间最低禁止小于 5 分钟
            if CONF_SCAN_INTERVAL in user_input:
                try:
                    val = float(user_input[CONF_SCAN_INTERVAL])
                    if val < MIN_SCAN_INTERVAL:
                        errors["base"] = "interval_too_small"
                    else:
                        user_input[CONF_SCAN_INTERVAL] = int(val)
                except Exception:
                    errors["base"] = "invalid_interval"

            # 数据总览实体保留的通话流水条数 (0 = 全部)
            if CONF_OVERVIEW_CALL_LIMIT in user_input:
                try:
                    user_input[CONF_OVERVIEW_CALL_LIMIT] = max(
                        0, int(float(user_input[CONF_OVERVIEW_CALL_LIMIT] or 0))
                    )
                except Exception:
                    user_input[CONF_OVERVIEW_CALL_LIMIT] = OVERVIEW_CALL_LIMIT_DEFAULT

            auth_action = user_input.pop(CONF_AUTH_ACTION, AUTH_ACTION_NONE)
            if not errors:
                if carrier == CARRIER_TELECOM:
                    selected_date = str(user_input.get(CONF_CALL_START_DATE, "") or "").strip()
                    today_first = datetime.date.today().replace(day=1).strftime("%Y-%m-%d")
                    # 若用户选择的是当前月的1日或留空，则存为空字符串表示“动态跟随当月”
                    # 到了新月份 (如10月1日、11月1日) 将完全自动无缝切换，无需用户重复设置
                    if not selected_date or selected_date == today_first:
                        user_input[CONF_CALL_START_DATE] = ""

                new_options = dict(self.target_entry.options)
                new_options.update(user_input)
                self._options_data = new_options

                # 仅电信支持认证操作流转
                if auth_action == AUTH_ACTION_CALL_AUTH:
                    return await self.async_step_telecom_call_auth()

                return self.async_create_entry(title="", data=self._options_data)

        schema_dict = {}

        if carrier == CARRIER_TELECOM:
            current_interval = int(self.target_entry.options.get(
                CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_TELECOM
            ))
            current_interval = max(MIN_SCAN_INTERVAL, current_interval)
            schema_dict[
                vol.Optional(CONF_SCAN_INTERVAL, default=current_interval)
            ] = selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=1440,
                    step=1,
                    unit_of_measurement="分钟",
                    mode=selector.NumberSelectorMode.BOX,
                )
            )

            first_day_of_month = datetime.date.today().replace(day=1).strftime("%Y-%m-%d")
            current_start_date = str(self.target_entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
            if not current_start_date:
                current_start_date = first_day_of_month

            schema_dict[
                vol.Optional(CONF_CALL_START_DATE, default=current_start_date)
            ] = selector.DateSelector()

            # 仅中国电信增加通话详单二次认证选项 (联通不加)
            schema_dict[
                vol.Optional(CONF_AUTH_ACTION, default=AUTH_ACTION_NONE)
            ] = selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        selector.SelectOptionDict(
                            value=AUTH_ACTION_NONE,
                            label="仅保存上述设置 (不执行认证)"
                        ),
                        selector.SelectOptionDict(
                            value=AUTH_ACTION_CALL_AUTH,
                            label="进行通话流水二次认证 (实名/验证码鉴权)"
                        ),
                    ],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            )

        elif carrier == CARRIER_UNICOM:
            current_interval = int(self.target_entry.options.get(
                CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_UNICOM
            ))
            current_interval = max(MIN_SCAN_INTERVAL, current_interval)
            schema_dict[
                vol.Optional(CONF_SCAN_INTERVAL, default=current_interval)
            ] = selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=120,
                    step=1,
                    unit_of_measurement="分钟",
                    mode=selector.NumberSelectorMode.BOX,
                )
            )

        # 通用选项: 数据总览实体里保留的通话流水条数 (0 = 全部保留)
        try:
            current_limit = int(
                self.target_entry.options.get(
                    CONF_OVERVIEW_CALL_LIMIT, OVERVIEW_CALL_LIMIT_DEFAULT
                )
                or 0
            )
        except Exception:
            current_limit = OVERVIEW_CALL_LIMIT_DEFAULT
        schema_dict[
            vol.Optional(CONF_OVERVIEW_CALL_LIMIT, default=current_limit)
        ] = selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=0,
                max=5000,
                step=1,
                unit_of_measurement="条",
                mode=selector.NumberSelectorMode.BOX,
            )
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema_dict),
            errors=errors,
            description_placeholders={
                "carrier": CARRIER_NAMES.get(carrier, "运营商"),
                "phone": self.target_entry.data.get(CONF_PHONE, ""),
            },
        )


    async def async_step_telecom_call_auth(self, user_input=None) -> config_entries.ConfigFlowResult:
        """电信选项流步骤: 通话详单实名与验证码二次鉴权"""
        errors = {}
        phone = self.target_entry.data.get(CONF_PHONE, "")
        existing_auth = self.target_entry.data.get(CONF_AUTH_DATA) or {}
        existing_model = existing_auth.get("device_model")
        if self._telecom_client is None:
            self._telecom_client = TelecomClient(phone, auth_data=existing_auth, device_model=existing_model)

        coord = None
        if DOMAIN in self.hass.data and self.target_entry.entry_id in self.hass.data[DOMAIN]:
            entry_dict = self.hass.data[DOMAIN][self.target_entry.entry_id]
            if isinstance(entry_dict, dict):
                coord = entry_dict.get("coordinator")
            else:
                coord = entry_dict

        # 1. 机主姓名：优先从本地之前已保存的options中读取；若无则尝试使用电信XML接口实时查出的姓名(排除含*脱敏)
        default_name = str(self.target_entry.options.get(CONF_AUTH_USER_NAME, "") or "").strip()
        if not default_name and coord and coord.data:
            api_name = str(coord.data.get("account_name", "") or "").strip()
            if api_name and "*" not in api_name:
                default_name = api_name

        # 2. 身份证号码：仅从本地已保存的options中读取历史记忆，绝不在代码中内置硬编码
        default_id = str(self.target_entry.options.get(CONF_AUTH_ID_CARD, "") or "").strip()

        if user_input is not None:
            user_name = user_input.get("user_name", "").strip() or default_name
            id_card = user_input.get("id_card", "").strip() or default_id
            sms_code = user_input.get("sms_code", "").strip()

            ok, msg, sig_str = await self.hass.async_add_executor_job(
                self._telecom_client.verify_detail_auth, user_name, id_card, sms_code
            )
            if ok:
                if sig_str:
                    self._options_data[CONF_SIGNATURE_STRING] = sig_str
                self._options_data[CONF_SIGNATURE_TIMESTAMP] = time.time()
                # 认证成功后，仅在用户输入或确认时缓存在本地 options 中，方便下次免输
                if user_name:
                    self._options_data[CONF_AUTH_USER_NAME] = user_name
                if id_card:
                    self._options_data[CONF_AUTH_ID_CARD] = id_card
                # 选项写入后由 __init__.async_update_options 立即触发一次数据刷新
                # (签名等运行时选项不再触发整条重载，注意不要在此处提前刷新，
                #  否则可能读到尚未落盘的旧签名，导致通话流水仍显示"需重新认证")
                return self.async_create_entry(title="", data=self._options_data)
            else:
                _LOGGER.warning("电信通话详单认证失败原因: %s", msg)
                errors["base"] = "call_auth_failed"
        else:
            # 选项流自行下发验证码前，先取消实体侧「验证码写入即自动提交」的等待窗口，
            # 避免「通话详单验证码」实体抢先消费掉本次验证码 (两个入口互相打架)
            try:
                from .platforms.auth_runtime import async_cancel_call_auth_auto_submit

                async_cancel_call_auth_auto_submit(self.hass, self.target_entry)
            except Exception as err:
                _LOGGER.debug("取消实体侧自动提交等待窗口失败: %s", err)

            await self.hass.async_add_executor_job(self._telecom_client.send_detail_auth_sms)

        schema_dict = {}
        if default_name:
            schema_dict[vol.Optional("user_name", default=default_name)] = selector.TextSelector()
        else:
            schema_dict[vol.Optional("user_name")] = selector.TextSelector()

        if default_id:
            schema_dict[vol.Optional("id_card", default=default_id)] = selector.TextSelector()
        else:
            schema_dict[vol.Optional("id_card")] = selector.TextSelector()

        schema_dict[vol.Required("sms_code")] = selector.TextSelector(
            selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
        )

        return self.async_show_form(
            step_id="telecom_call_auth",
            data_schema=vol.Schema(schema_dict),
            errors=errors,
            description_placeholders={"phone": phone},
        )

