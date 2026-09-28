# -*- coding: utf-8 -*-
"""中国电信通话流水(语音详单)二次认证控制实体

二次认证三要素: 机主姓名 + 身份证号 + 短信验证码，三者齐备才能通过认证。

实体清单:
- text「通话详单机主姓名」: 实名信息，填写后自动缓存到集成选项，重启回填
- text「通话详单身份证号」: 实名信息，填写后自动缓存到集成选项，重启回填
- text「通话详单验证码」  : 短信验证码，供手机端自动化通过 text.set_value 写入
- button「通话详单二次认证」: 手动触发 (或手动拉取流水)
- date「通话详单查询起始日期」: 写入即按该日期所属月份请求一次流水 (截止日期自动取该月最后一天)

按钮规则:
1. 验证码非空  -> 用「姓名+身份证号+验证码」提交认证，成功后持久化签名并立即拉取最新流水
2. 验证码为空 + 授权仍有效 -> 仅立即拉取一次最新流水 (不打扰短信)
3. 验证码为空 + 授权已失效 -> 校验姓名/身份证号是否齐备，齐全则自动下发验证码短信，
   并在 CALL_AUTH_WAIT_SECONDS 秒的等待窗口内监听验证码实体：
   一旦写入验证码即自动提交认证并拉取流水 (无需再次按压按钮)
"""
import calendar
import datetime
import logging
import time
from typing import Any, Dict, Optional

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.components.date import DateEntity
from homeassistant.components.text import TextEntity, TextMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import Entity

from ..const import (
    CALL_AUTH_EXPIRE_SECONDS,
    CALL_AUTH_WAIT_SECONDS,
    CARRIER_TELECOM,
    CONF_AUTH_ID_CARD,
    CONF_AUTH_USER_NAME,
    CONF_CALL_START_DATE,
    CONF_SIGNATURE_STRING,
    CONF_SIGNATURE_TIMESTAMP,
    DOMAIN,
    ENTITY_CALL_AUTH_BUTTON,
    ENTITY_CALL_AUTH_CODE,
    ENTITY_CALL_AUTH_ID_CARD,
    ENTITY_CALL_AUTH_NAME,
    ENTITY_CALL_QUERY_START_DATE,
)
from .base import ForcedEntityIdMixin, build_device_info

_LOGGER = logging.getLogger(__name__)

# 自动提交时要求的最小验证码长度 (避免手机端分多次写入时误提交)
_MIN_AUTO_SUBMIT_CODE_LEN = 4


class CallAuthRuntime:
    """通话详单二次认证运行时共享状态 (同号码的文本实体与按钮实体共用)"""

    def __init__(self) -> None:
        # 三要素仅在内存中暂存，不写日志 (姓名/身份证号另外同步缓存到集成选项)
        self.name = ""
        self.id_card = ""
        self.code = ""
        self.code_set_at = 0.0
        # 实体引用 / entity_id (用于跨实体协作)
        self.text_entity = None
        self.button_entity = None
        self.code_entity_id = ""
        # 运行状态
        self.sms_sent_at = 0.0
        self.await_submit_until = 0.0    # 下发短信后的自动提交等待截止时间戳
        self.last_run_at = ""
        self.last_result = "尚未执行"
        self.busy = False


def async_get_call_auth_runtime(hass: HomeAssistant, entry: ConfigEntry) -> CallAuthRuntime:
    """获取 (必要时初始化) 该配置条目的二次认证运行时状态"""
    store = hass.data.setdefault(DOMAIN, {}).setdefault(entry.entry_id, {})
    runtime = store.get("call_auth_runtime")
    if not isinstance(runtime, CallAuthRuntime):
        runtime = CallAuthRuntime()
        store["call_auth_runtime"] = runtime
    return runtime


def async_cancel_call_auth_auto_submit(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """取消「验证码写入即自动提交」的等待窗口

    选项流等其它入口自行下发验证码时调用，避免「通话详单验证码」实体抢先
    消费掉本次验证码，造成两边认证互相打架。
    """
    runtime = async_get_call_auth_runtime(hass, entry)
    runtime.await_submit_until = 0.0


class _TelecomCallAuthEntity(ForcedEntityIdMixin, Entity):
    """通话详单二次认证实体基类 (归属手机号设备，与传感器同设备)"""

    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        phone: str,
        entry: ConfigEntry,
        key: str,
        name: str,
        icon: str,
        platform_domain: str = "text",
    ) -> None:
        super().__init__()
        self._coordinator = coordinator
        self.phone = phone
        self.entry = entry
        self._runtime = async_get_call_auth_runtime(hass, entry)
        self._removed = False
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{DOMAIN}_{CARRIER_TELECOM}_{phone}_{key}"
        self._attr_device_info = build_device_info(CARRIER_TELECOM, phone)

        # 固定实体 ID: <domain>.<手机号>_<后缀>，便于自动化长期稳定引用
        # (已在实体注册表中的旧 ID 由 async_added_to_hass 里的 _async_migrate_entity_id 迁移)
        self._setup_forced_entity_id(platform_domain, phone, key)

    @property
    def data(self) -> Dict[str, Any]:
        """协调器最新数据字典"""
        if self._coordinator and isinstance(self._coordinator.data, dict):
            return self._coordinator.data
        return {}

    def _async_safe_write_state(self) -> None:
        """安全写状态 (后台自动提交可能存在实体已移除的竞态)"""
        if self._removed or self.hass is None or not self.entity_id:
            return
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._removed = False
        self._async_migrate_entity_id()

    async def async_will_remove_from_hass(self) -> None:
        self._removed = True
        await super().async_will_remove_from_hass()


class _TelecomCallAuthText(_TelecomCallAuthEntity, TextEntity):
    """二次认证文本实体基类 (姓名 / 身份证号 / 验证码共用)"""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_native_min = 0
    _attr_native_max = 32
    _attr_mode = TextMode.TEXT

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        phone: str,
        entry: ConfigEntry,
        *,
        key: str,
        name: str,
        icon: str,
        hint: str,
        runtime_attr: str,
        options_key: str = "",
        initial: str = "",
    ) -> None:
        super().__init__(hass, coordinator, phone, entry, key, name, icon, platform_domain="text")
        self._hint = hint
        self._runtime_attr = runtime_attr
        self._options_key = options_key
        self._value = str(initial or "").strip()
        # 运行时共享状态与配置选项保持一致 (重启后由 options 回填)
        setattr(self._runtime, runtime_attr, self._value)

    @property
    def native_value(self) -> Optional[str]:
        """当前值 (空字符串表示未填写)"""
        return self._value

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs: Dict[str, Any] = {
            "用途": "通话流水(语音详单)二次认证参数",
            "填写状态": "已填写" if self._value else "未填写",
            "使用说明": self._hint,
        }
        if self._options_key:
            attrs["缓存状态"] = "已缓存到集成选项 (重启后自动回填)" if self._value else "未填写"
        status = self.data.get("call_auth_status")
        if status:
            attrs["详单授权状态"] = status
        return attrs

    async def async_set_value(self, value: str) -> None:
        """写入值 (手机端自动化可调用 text.set_value 服务)"""
        text = "".join(str(value or "").split())
        self._value = text
        setattr(self._runtime, self._runtime_attr, text)
        self._async_safe_write_state()

        if self._options_key:
            self._async_persist_to_options(self._options_key, text)

        await self._async_after_set(text)

    async def _async_after_set(self, text: str) -> None:
        """值写入后的扩展钩子 (仅验证码实体使用)"""

    def _async_persist_to_options(self, key: str, value: str) -> None:
        """把实名信息同步缓存到集成选项，方便重启回填 (不会触发集成重载)"""
        try:
            new_options = dict(self.entry.options)
            if new_options.get(key) == value:
                return
            new_options[key] = value
            self.hass.config_entries.async_update_entry(self.entry, options=new_options)
            _LOGGER.debug("已缓存通话详单二次认证参数 %s", key)
        except Exception as err:
            _LOGGER.debug("缓存通话详单二次认证参数 %s 失败: %s", key, err)


class TelecomCallAuthNameText(_TelecomCallAuthText):
    """通话详单机主姓名 (二次认证要素一)"""

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            key=ENTITY_CALL_AUTH_NAME,
            name="通话详单机主姓名",
            icon="mdi:account-badge-outline",
            hint="二次认证所需机主姓名，填写后自动缓存到集成选项，重启后自动回填",
            runtime_attr="name",
            options_key=CONF_AUTH_USER_NAME,
            initial=str(entry.options.get(CONF_AUTH_USER_NAME, "") or ""),
        )


class TelecomCallAuthIdCardText(_TelecomCallAuthText):
    """通话详单身份证号 (二次认证要素二)"""

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            key=ENTITY_CALL_AUTH_ID_CARD,
            name="通话详单身份证号",
            icon="mdi:card-account-details-outline",
            hint="二次认证所需身份证号码，填写后自动缓存到集成选项，重启后自动回填",
            runtime_attr="id_card",
            options_key=CONF_AUTH_ID_CARD,
            initial=str(entry.options.get(CONF_AUTH_ID_CARD, "") or ""),
        )


class TelecomCallAuthCodeText(_TelecomCallAuthText):
    """通话详单验证码 (二次认证要素三，供手机端自动化写入)"""

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            key=ENTITY_CALL_AUTH_CODE,
            name="通话详单验证码",
            icon="mdi:message-text-lock",
            hint=(
                "通话流水二次认证短信验证码。按下「通话详单二次认证」按钮下发短信后，"
                f"在 {CALL_AUTH_WAIT_SECONDS} 秒内写入验证码会自动完成认证并拉取流水"
            ),
            runtime_attr="code",
        )

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = super().extra_state_attributes
        if self._runtime.code_set_at:
            attrs["填写时间"] = time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(self._runtime.code_set_at)
            )
            attrs["已填写时长"] = f"{int(time.time() - self._runtime.code_set_at)} 秒"
        if self._runtime.await_submit_until > time.time():
            attrs["自动提交等待中"] = f"剩余约 {int(self._runtime.await_submit_until - time.time())} 秒"
        return attrs

    async def async_added_to_hass(self) -> None:
        """登记实体引用/entity_id，供按钮在认证完成后清空验证码"""
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

    async def _async_after_set(self, text: str) -> None:
        """验证码写入后: 若按钮刚下发过短信，则在等待窗口内自动提交认证"""
        self._runtime.code_set_at = time.time() if text else 0.0
        if len(text) < _MIN_AUTO_SUBMIT_CODE_LEN:
            return
        if time.time() >= self._runtime.await_submit_until:
            return

        button = self._runtime.button_entity
        if button is None:
            return

        _LOGGER.info("电信手机号 %s 收到验证码写入，自动提交二次认证", self.phone)
        self.hass.async_create_task(
            button.async_submit_code_auto(text),
            name=f"{DOMAIN}_call_auth_auto_submit",
        )

    def async_clear_code(self) -> None:
        """清空验证码 (认证成功 / 失败作废时调用)"""
        self._value = ""
        self._runtime.code = ""
        self._runtime.code_set_at = 0.0
        self._async_safe_write_state()


class TelecomCallAuthButton(_TelecomCallAuthEntity, ButtonEntity):
    """通话详单二次认证按钮 (提交三要素认证 / 下发验证码 / 手动拉取流水)"""

    _attr_device_class = ButtonDeviceClass.UPDATE

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_CALL_AUTH_BUTTON,
            "通话详单二次认证",
            "mdi:shield-key-outline",
            platform_domain="button",
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._runtime.button_entity = self

    async def async_will_remove_from_hass(self) -> None:
        if self._runtime.button_entity is self:
            self._runtime.button_entity = None
        self._runtime.await_submit_until = 0.0
        await super().async_will_remove_from_hass()

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        remain = self.data.get("call_auth_remaining_minutes")
        waiting = max(0, int(self._runtime.await_submit_until - time.time()))

        attrs: Dict[str, Any] = {
            "最近执行时间": self._runtime.last_run_at or "尚未执行",
            "最近执行结果": self._runtime.last_result,
            "认证要素": "机主姓名 + 身份证号 + 短信验证码",
            "机主姓名状态": "已填写" if self._read_param("name", CONF_AUTH_USER_NAME) else "未填写 (需先在「通话详单机主姓名」实体填写)",
            "身份证号状态": "已填写" if self._read_param("id_card", CONF_AUTH_ID_CARD) else "未填写 (需先在「通话详单身份证号」实体填写)",
            "验证码状态": "已填写 (按下将提交认证)" if self._read_code() else "未填写 (按下将下发验证码或直接刷新流水)",
            "详单授权状态": self.data.get("call_auth_status", "未知"),
            "使用说明": (
                "验证码非空: 提交认证并拉取流水; "
                "验证码为空且授权有效: 仅立即拉取最新流水; "
                f"验证码为空且授权失效: 下发验证码短信并在 {CALL_AUTH_WAIT_SECONDS} 秒内等待验证码写入后自动提交"
            ),
        }
        if waiting:
            attrs["自动提交等待中"] = f"剩余约 {waiting} 秒"
        if remain:
            attrs["授权剩余有效时长"] = f"{remain} 分钟"
        if self._runtime.sms_sent_at:
            attrs["最近下发验证码时间"] = time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(self._runtime.sms_sent_at)
            )
        return attrs

    async def async_press(self) -> None:
        """按下按钮: 提交认证 / 下发验证码 / 手动拉取流水"""
        if self._runtime.busy:
            _LOGGER.debug("电信手机号 %s 二次认证按钮正在执行中，忽略本次重复按下", self.phone)
            return

        self._runtime.busy = True
        self._async_safe_write_state()
        try:
            code = self._read_code()
            if code:
                await self._async_submit_code(code)
            elif self._is_auth_alive():
                await self._async_pull_only()
            else:
                name = self._read_param("name", CONF_AUTH_USER_NAME)
                id_card = self._read_param("id_card", CONF_AUTH_ID_CARD)
                missing = [label for label, value in (("机主姓名", name), ("身份证号", id_card)) if not value]
                if missing:
                    self._runtime.last_result = (
                        "缺少" + "、".join(missing) + "，请先在对应实体中填写后再按下"
                    )
                    return
                await self._async_send_sms()
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 二次认证按钮执行异常: %s", self.phone, err)
            self._runtime.last_result = f"执行异常: {err}"
        finally:
            self._runtime.busy = False
            self._runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
            self._async_safe_write_state()

    async def async_submit_code_auto(self, code: str) -> None:
        """验证码写入后触发的自动提交 (仅在按钮下发短信后的等待窗口内被调用)"""
        if self._runtime.busy:
            return

        self._runtime.busy = True
        self._async_safe_write_state()
        try:
            await self._async_submit_code(code)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 自动提交二次认证异常: %s", self.phone, err)
            self._runtime.last_result = f"自动提交异常: {err}"
        finally:
            self._runtime.busy = False
            self._runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
            self._async_safe_write_state()

    def _read_code(self) -> str:
        """读取当前验证码 (优先取实体状态，兜底取运行时缓存)"""
        eid = self._runtime.code_entity_id
        if eid:
            state = self.hass.states.get(eid)
            raw = getattr(state, "state", None) if state is not None else None
            if isinstance(raw, str) and raw.strip() and raw not in ("unknown", "unavailable"):
                return raw.strip()
        return str(self._runtime.code or "").strip()

    def _read_param(self, runtime_attr: str, options_key: str) -> str:
        """读取姓名/身份证号 (优先运行时值，兜底集成选项缓存)"""
        value = str(getattr(self._runtime, runtime_attr, "") or "").strip()
        if value:
            return value
        try:
            return str(self.entry.options.get(options_key, "") or "").strip()
        except Exception:
            return ""

    def _is_auth_alive(self) -> bool:
        """本地判定通话详单授权是否仍在有效期内 (30 分钟)"""
        try:
            options = self.entry.options or {}
            signature = str(options.get(CONF_SIGNATURE_STRING) or "").strip()
            timestamp = float(options.get(CONF_SIGNATURE_TIMESTAMP) or 0.0)
        except Exception:
            return False

        if not signature or timestamp <= 0:
            return False
        if (time.time() - timestamp) >= CALL_AUTH_EXPIRE_SECONDS:
            return False
        # 上一次拉取若已被服务端判定失效，则以服务端结论为准
        if self.data.get("call_need_auth") is True:
            return False
        return True

    async def _async_submit_code(self, code: str) -> None:
        """提交「姓名 + 身份证号 + 验证码」完成二次认证，并立即拉取最新流水"""
        name = self._read_param("name", CONF_AUTH_USER_NAME)
        id_card = self._read_param("id_card", CONF_AUTH_ID_CARD)
        self._runtime.await_submit_until = 0.0

        ok, msg = await self._coordinator.async_submit_call_auth_code(code, name, id_card)
        # 无论成功与否都清空验证码: 成功避免复用，失败则作废以便下次按下重新下发
        await self._async_clear_code()
        if ok:
            _LOGGER.info("电信手机号 %s 通话详单二次认证成功: %s", self.phone, msg)
            self._runtime.last_result = f"认证成功，已拉取最新通话流水 ({msg})"
        else:
            _LOGGER.warning("电信手机号 %s 通话详单二次认证失败: %s", self.phone, msg)
            self._runtime.last_result = f"认证失败: {msg} (验证码已作废，再次按下可重新下发)"

    async def _async_pull_only(self) -> None:
        """授权仍有效: 仅手动拉取一次最新流水，不打扰短信"""
        if await self._async_refresh_data():
            self._runtime.last_result = "详单授权仍在有效期，已手动拉取最新通话流水"
        else:
            self._runtime.last_result = "手动拉取失败，请检查网络或登录凭证后重试"

    async def _async_send_sms(self) -> None:
        """授权已失效: 自动下发验证码短信，并开启等待验证码自动提交的窗口"""
        # 60 秒内已下发过则不重复发送，避免验证码尚未写入时误连点造成短信轰炸
        sent_ago = time.time() - self._runtime.sms_sent_at if self._runtime.sms_sent_at else 0.0
        if sent_ago and sent_ago < 60:
            remain = max(0, int(self._runtime.await_submit_until - time.time()))
            if remain:
                self._runtime.last_result = (
                    f"验证码已于 {int(sent_ago)} 秒前下发, 正在等待写入 (剩余约 {remain} 秒)"
                )
            else:
                self._runtime.last_result = f"验证码已于 {int(sent_ago)} 秒前下发, 请稍候再试"
            return

        ok, msg = await self._coordinator.async_send_call_auth_sms()
        if not ok:
            self._runtime.last_result = f"验证码下发失败: {msg}"
            return

        self._runtime.sms_sent_at = time.time()
        self._runtime.await_submit_until = time.time() + CALL_AUTH_WAIT_SECONDS
        self._runtime.last_result = (
            f"验证码已下发, 正在等待写入 (最长 {CALL_AUTH_WAIT_SECONDS} 秒内收到即自动提交认证)"
        )

        # 边界情况: 短信发送耗时期间验证码已被写入
        existing = self._read_code()
        if len(existing) >= _MIN_AUTO_SUBMIT_CODE_LEN:
            self._runtime.last_result = "验证码已就绪，正在自动提交认证…"
            self._async_safe_write_state()
            # 此处仍在本次按钮执行的 busy 保护内，直接提交即可
            await self._async_submit_code(existing)

    async def _async_refresh_data(self) -> bool:
        """立即拉取一次全量数据"""
        try:
            await self._coordinator.async_refresh()
        except Exception as err:
            _LOGGER.warning("手动拉取电信数据异常: %s", err)
            return False
        return bool(self._coordinator.last_update_success)

    async def _async_clear_code(self) -> None:
        """清空验证码实体状态"""
        entity = self._runtime.text_entity
        if entity is not None:
            entity.async_clear_code()
            return

        self._runtime.code = ""
        self._runtime.code_set_at = 0.0
        eid = self._runtime.code_entity_id
        if not eid:
            return
        try:
            await self.hass.services.async_call(
                "text",
                "set_value",
                {"entity_id": eid, "value": ""},
                blocking=True,
            )
        except Exception as err:
            _LOGGER.debug("清空通话详单验证码实体失败: %s", err)


class TelecomCallQueryStartDate(_TelecomCallAuthEntity, DateEntity):
    """通话流水查询起始日期 (date 实体，供自动化按月份请求流水)

    - 直接映射到集成选项 CONF_CALL_START_DATE：
      选当月 1 日 = "跟随当月" (存空值，跨月自动滚动)，其它日期按具体日期保存
    - 截止日期无需填写：后端自动取该日期所属月份的最后一天
    - 写入后立即触发一次数据刷新 (不重载整条集成)，因此改日期就等于发起一次请求；
      写入相同日期也会重新请求一次 (便于自动化反复触发)
    """

    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_CALL_QUERY_START_DATE,
            "通话详单查询起始日期",
            "mdi:calendar-start",
            platform_domain="date",
        )

    def _current_start_date(self) -> datetime.date:
        """当前生效的查询起始日期 (未设置时跟随当月 1 日)"""
        raw = str(self.entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
        if raw:
            try:
                return datetime.date.fromisoformat(raw)
            except ValueError:
                _LOGGER.debug("通话详单查询起始日期格式无效，已回退为当月: %s", raw)
        return datetime.date.today().replace(day=1)

    @property
    def native_value(self) -> Optional[datetime.date]:
        return self._current_start_date()

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        start = self._current_start_date()
        _, last_day = calendar.monthrange(start.year, start.month)
        raw = str(self.entry.options.get(CONF_CALL_START_DATE, "") or "").strip()
        return {
            "用途": "通话流水(语音详单)查询起始日期，截止日期自动取该月最后一天",
            "所属月份": f"{start.year}年{start.month}月",
            "该月截止日期": f"{start.year:04d}-{start.month:02d}-{last_day:02d}",
            "跟随当月": "是 (跨月自动滚动)" if not raw else "否",
            "当前已拉取区间": (
                f"{self.data.get('call_start_date', '-')} ~ {self.data.get('call_end_date', '-')}"
            ),
            "详单授权状态": self.data.get("call_auth_status", "未知"),
            "使用说明": (
                "写入任意日期会立即按该日期所属月份重新请求一次通话流水；"
                "若授权已过期，再按一次「通话详单二次认证」按钮即可发码并自动完成认证"
            ),
        }

    async def async_set_value(self, value: datetime.date) -> None:
        """写入查询起始日期并触发一次数据请求"""
        if value is None:
            return

        today_first = datetime.date.today().replace(day=1)
        # 与选项流规则保持一致: 选当月 1 日表示"动态跟随当月", 存空值, 跨月自动滚动
        stored = "" if value == today_first else value.isoformat()

        try:
            new_options = dict(self.entry.options)
            if str(new_options.get(CONF_CALL_START_DATE, "") or "").strip() != stored:
                new_options[CONF_CALL_START_DATE] = stored
                self.hass.config_entries.async_update_entry(self.entry, options=new_options)
                # 选项变更监听器会立即刷新一次数据 (不重载整条集成)
                _LOGGER.info(
                    "电信手机号 %s 通话详单查询起始日期已设为 %s",
                    self.phone,
                    stored or f"跟随当月 ({today_first.isoformat()})",
                )
            else:
                # 日期未变化时也按"发起一次请求"处理，方便自动化反复触发
                self.hass.async_create_task(
                    self._coordinator.async_refresh(),
                    name=f"{DOMAIN}_call_query_refresh",
                )
        except Exception as err:
            _LOGGER.warning("写入通话详单查询起始日期失败: %s", err)

        self._async_safe_write_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # 协调器每次刷新后同步一次状态 (其它入口改动该选项时保持显示一致)
        try:
            self.async_on_remove(self._coordinator.async_add_listener(self._async_sync_state))
        except Exception as err:
            _LOGGER.debug("注册通话详单查询起始日期同步监听失败: %s", err)

    @callback
    def _async_sync_state(self) -> None:
        self._async_safe_write_state()


def create_call_auth_text_entities(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> list:
    """创建通话详单二次认证的三个文本实体 (姓名 / 身份证号 / 验证码)"""
    return [
        TelecomCallAuthNameText(hass, coordinator, phone, entry),
        TelecomCallAuthIdCardText(hass, coordinator, phone, entry),
        TelecomCallAuthCodeText(hass, coordinator, phone, entry),
    ]


def create_call_auth_button_entity(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomCallAuthButton:
    """创建通话详单二次认证按钮实体 (button 平台)"""
    return TelecomCallAuthButton(hass, coordinator, phone, entry)


def create_call_query_start_date_entity(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> TelecomCallQueryStartDate:
    """创建通话流水查询起始日期实体 (date 平台)"""
    return TelecomCallQueryStartDate(hass, coordinator, phone, entry)
