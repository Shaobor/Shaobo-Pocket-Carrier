# -*- coding: utf-8 -*-
"""中国电信通话流水(语音详单)二次认证控制实体

二次认证三要素: 机主姓名 + 身份证号 + 短信验证码，三者齐备才能通过认证。

实体清单:
- text「通话详单机主姓名」: 实名信息，填写后自动缓存到集成选项，重启回填
- text「通话详单身份证号」: 实名信息，填写后自动缓存到集成选项，重启回填
- text「通话详单验证码」  : 短信验证码，供手机端自动化通过 text.set_value 写入 (登录/详单共用)
- button「通话详单二次认证」: 双角色按钮，见下
- date「通话详单查询起始日期」: 写入即按该日期所属月份请求一次流水 (截止日期自动取该月最后一天)

按钮双角色 (掉线时自动切换为"重新登录"):
1. 登录态已失效 (掉线) -> 走「短信登录」: 下发登录验证码 -> 等待写入 -> 登录 -> 恢复账号在线
2. 在线 + 验证码非空 -> 用「姓名+身份证号+验证码」提交详单认证，成功后持久化签名并立即拉取流水
3. 在线 + 验证码为空 + 详单授权仍有效 -> 仅立即拉取一次最新流水 (不打扰短信)
4. 在线 + 验证码为空 + 详单授权已失效 -> 校验实名信息齐备后下发详单验证码，
   并在 CALL_AUTH_WAIT_SECONDS 秒窗口内等待验证码写入后自动提交

两种阶段共用同一个验证码实体: 阶段判定与"只接受发码之后写入的验证码"由
platforms/auth_runtime.py 统一处理; 登录流程本身在 platforms/telecom_login.py。
"""
import calendar
import datetime
import logging
import time
from typing import Any, Dict, Optional, Tuple

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.components.date import DateEntity
from homeassistant.components.text import TextEntity, TextMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback

from ..const import (
    CALL_AUTH_EXPIRE_SECONDS,
    CALL_AUTH_WAIT_SECONDS,
    CARRIER_UNICOM,
    CONF_AUTH_ID_CARD,
    CONF_AUTH_USER_NAME,
    CONF_CALL_START_DATE,
    CONF_CARRIER,
    CONF_PHONE,
    CONF_SIGNATURE_STRING,
    CONF_SIGNATURE_TIMESTAMP,
    DOMAIN,
    ENTITY_CALL_AUTH_BUTTON,
    ENTITY_CALL_AUTH_CODE,
    ENTITY_CALL_AUTH_ID_CARD,
    ENTITY_CALL_AUTH_NAME,
    ENTITY_CALL_QUERY_START_DATE,
    LOGIN_CODE_LENGTH,
)
from .auth_runtime import (
    STAGE_LOGIN,
    AuthRuntime,
    schedule_busy_retry,
)
from .base import CarrierControlEntity
from .telecom_login import (
    STATE_ERROR,
    STATE_EXPIRED,
    STATE_OK,
    async_detect_login_state,
    async_send_login_sms,
    async_submit_login_code,
)

_LOGGER = logging.getLogger(__name__)

# 自动提交时要求的最小验证码长度 (详单阶段; 登录阶段严格要求 6 位)
_MIN_AUTO_SUBMIT_CODE_LEN = 4


class _TelecomCallAuthEntity(CarrierControlEntity):
    """通话详单二次认证实体基类 (公用能力见 platforms/base.CarrierControlEntity)"""

    hass: HomeAssistant


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
        self._hass: HomeAssistant = hass
        self._hint = hint
        self._runtime_attr = runtime_attr
        self._options_key = options_key
        self._value = (initial or "").strip()
        # 运行时共享状态与配置选项保持一致 (重启后由 options 回填)
        setattr(self._runtime, runtime_attr, self._value)

    @property
    def hass(self) -> HomeAssistant:
        """Home Assistant 实例"""
        return self._hass

    @hass.setter
    def hass(self, value: HomeAssistant) -> None:
        self._hass = value

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
        text = "".join((value or "").split())
        self._value = text
        setattr(self._runtime, self._runtime_attr, text)
        self._async_safe_write_state()

        if self._options_key:
            self._async_persist_to_options(self._options_key, text)

        # 通知同条目的其它实体刷新 (按钮的「机主姓名状态/身份证号状态」等属性依赖这里)
        self._runtime.notify()

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
        """验证码写入后: 若正处于某个阶段的等待窗口内, 自动提交 (登录阶段优先)

        登录与详单认证共用本实体, 阶段判定由 auth_runtime.stage_for_new_code 完成:
        只有在对应等待窗口内、且写入时间不早于本次发码时间的验证码才会被采用，
        避免上一个阶段的迟到验证码被误用。
        """
        self._runtime.note_code(text, time.time() if text else 0.0)
        if not text:
            return

        stage = self._runtime.stage_for_new_code()
        if not stage:
            return
        if stage == STAGE_LOGIN and len(text) != LOGIN_CODE_LENGTH:
            return
        if len(text) < _MIN_AUTO_SUBMIT_CODE_LEN:
            return

        button = self._runtime.button_entity
        if button is None:
            return

        _LOGGER.info(
            "电信手机号 %s 收到验证码写入，自动提交%s",
            self.phone,
            "短信登录" if stage == STAGE_LOGIN else "通话详单二次认证",
        )
        self.hass.async_create_task(
            button.async_submit_auto(stage, text),
            name=f"{DOMAIN}_auth_auto_submit",
        )

    def async_clear_code(self) -> None:
        """清空验证码 (登录/认证提交后立即调用, 避免复用与串阶段)"""
        self._value = ""
        self._runtime.clear_code()
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
        self._hass: HomeAssistant = hass

    @property
    def hass(self) -> HomeAssistant:
        """Home Assistant 实例"""
        return self._hass

    @hass.setter
    def hass(self, value: HomeAssistant) -> None:
        self._hass = value

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._runtime.button_entity = self
        self._runtime.add_listener(self._async_safe_write_state)

    async def async_will_remove_from_hass(self) -> None:
        if self._runtime.button_entity is self:
            self._runtime.button_entity = None
        self._runtime.close_windows()
        self._runtime.remove_listener(self._async_safe_write_state)
        await super().async_will_remove_from_hass()

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        remain = self.data.get("call_auth_remaining_minutes")
        detail_wait = max(0, int(runtime.await_submit_until - time.time()))
        login_wait = max(0, int(runtime.login_await_until - time.time()))
        login_expired = bool(getattr(self._coordinator, "login_expired", False))

        attrs: Dict[str, Any] = {
            "最近执行时间": runtime.last_run_at or "尚未执行",
            "最近执行结果": runtime.last_result,
            "当前角色": "短信登录 (账号已离线)" if login_expired else "通话详单二次认证 (在线)",
            "登录态": "已失效" if login_expired else "有效",
            "认证要素": "机主姓名 + 身份证号 + 短信验证码 (登录验证码为 6 位)",
            "机主姓名状态": (
                "已填写" if read_auth_param(runtime, self.entry, "name", CONF_AUTH_USER_NAME)
                else "未填写 (需先在「通话详单机主姓名」实体填写)"
            ),
            "身份证号状态": (
                "已填写" if read_auth_param(runtime, self.entry, "id_card", CONF_AUTH_ID_CARD)
                else "未填写 (需先在「通话详单身份证号」实体填写)"
            ),
            "验证码状态": (
                "已填写 (按下将提交当前阶段的验证码)" if self._read_code()
                else "未填写 (按下将下发验证码或直接刷新流水)"
            ),
            "详单授权状态": self.data.get("call_auth_status", "未知"),
            "自动登录": "已开启" if runtime.auto_login_enabled else "未开启",
            "使用说明": (
                "账号掉线时按下=重新登录（下发登录验证码，写入后自动登录）；"
                "在线时按下：验证码非空→提交详单认证，验证码为空且授权有效→只刷新流水，"
                f"验证码为空且授权失效→下发详单验证码并在 {CALL_AUTH_WAIT_SECONDS} 秒内等待写入后自动提交"
            ),
        }
        if runtime.login_failures:
            attrs["自动登录失败次数"] = (
                f"{runtime.login_failures} 次"
                + ("（已达上限，自动登录已暂停）" if runtime.auto_login_paused else "")
            )
        if login_expired and getattr(self._coordinator, "last_auth_error", ""):
            attrs["登录失效原因"] = str(self._coordinator.last_auth_error)
        if detail_wait:
            attrs["详单验证码等待中"] = f"剩余约 {detail_wait} 秒"
        if login_wait:
            attrs["登录验证码等待中"] = f"剩余约 {login_wait} 秒"
        if remain:
            attrs["授权剩余有效时长"] = f"{remain} 分钟"
        if runtime.sms_sent_at:
            attrs["最近下发详单验证码时间"] = time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(runtime.sms_sent_at)
            )
        if runtime.login_sms_sent_at:
            attrs["最近下发登录验证码时间"] = time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(runtime.login_sms_sent_at)
            )
        return attrs

    async def async_press(self) -> None:
        """按下按钮: 自动区分「短信登录」与「通话详单二次认证」两种角色"""
        if self._runtime.busy:
            _LOGGER.debug("电信手机号 %s 按钮正在执行中，忽略本次重复按下", self.phone)
            return

        self._runtime.busy = True
        self._async_safe_write_state()
        try:
            code = self._read_code()
            login_state = await async_detect_login_state(self._coordinator)

            if login_state == STATE_EXPIRED:
                # 掉线: 按钮语义变为"重新登录"
                if code:
                    await self._async_submit_login(code)
                else:
                    await async_send_login_sms(
                        self.hass, self.entry, self._coordinator, self._runtime
                    )
            elif login_state == STATE_ERROR:
                self._runtime.last_result = (
                    "网络异常：无法连接电信接口，未发送任何短信，请检查网络后重试"
                )
                _LOGGER.warning("电信手机号 %s 网络异常，按钮未触发任何短信动作", self.phone)
            else:
                await self._async_handle_detail(code)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 按钮执行异常: %s", self.phone, err)
            self._runtime.last_result = f"执行异常: {err}"
        finally:
            self._runtime.busy = False
            self._runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
            self._async_safe_write_state()

    async def async_submit_auto(self, stage: str, code: str, attempt: int = 1) -> None:
        """验证码写入后触发的自动提交 (登录阶段 / 详单阶段)

        busy 是被按钮/定时获取/自动登录共用的瞬时标志；直接丢弃验证码会出现
        "写了码却永远不认证"，因此改为有界重试。
        """
        # 执行前重新校验阶段: 重试期间窗口可能已关闭 (已被其它路径提交) 或阶段已切换，
        # 此时必须放弃，否则会用旧验证码重复提交
        if self._runtime.stage_for_new_code() != stage:
            _LOGGER.debug("%s 阶段窗口已关闭/已切换，放弃本次自动提交", stage)
            return

        if self._runtime.busy:
            if schedule_busy_retry(
                self.hass,
                10,
                lambda n: self.async_submit_auto(stage, code, n),
                name=f"{DOMAIN}_auth_auto_submit_retry",
                attempt=attempt,
            ):
                _LOGGER.debug("自动提交被占用，已安排稍后重试 (第 %d 次)", attempt)
            else:
                self._runtime.last_result = "自动提交被其它操作占用，已放弃（可再按一次按钮提交）"
                self._runtime.notify()
            return

        self._runtime.busy = True
        self._async_safe_write_state()
        try:
            if stage == STAGE_LOGIN:
                await self._async_submit_login(code)
            else:
                await self._async_submit_detail(code)
        except Exception as err:
            _LOGGER.warning("电信手机号 %s 自动提交异常: %s", self.phone, err)
            self._runtime.last_result = f"自动提交异常: {err}"
        finally:
            self._runtime.busy = False
            self._runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
            self._async_safe_write_state()

    async def _async_handle_detail(self, code: str) -> None:
        """在线角色: 提交详单认证 / 直接拉取 / 下发详单验证码"""
        if code:
            await self._async_submit_detail(code)
        else:
            await async_start_detail_query(
                self.hass, self.entry, self._coordinator, self._runtime
            )

    async def _async_submit_detail(self, code: str) -> None:
        await async_submit_detail_code(
            self.hass, self.entry, self._coordinator, self._runtime, code
        )

    async def _async_submit_login(self, code: str) -> None:
        ok, _msg = await async_submit_login_code(
            self.hass, self.entry, self._coordinator, self._runtime, code
        )
        if ok:
            self._runtime.last_result = (
                "短信登录成功，账号已恢复在线"
                "（如需通话流水可再按一次；已开启「自动获取通话记录」时会自动获取）"
            )
        self._runtime.notify()

    def _read_code(self) -> str:
        """读取当前验证码 (优先取实体状态，兜底取运行时缓存)"""
        eid = self._runtime.code_entity_id
        if eid:
            state = self.hass.states.get(eid)
            raw = getattr(state, "state", None) if state is not None else None
            if isinstance(raw, str) and raw.strip() and raw not in ("unknown", "unavailable"):
                return raw.strip()
        return (self._runtime.code or "").strip()

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
        self._hass: HomeAssistant = hass

    @property
    def hass(self) -> HomeAssistant:
        """Home Assistant 实例"""
        return self._hass

    @hass.setter
    def hass(self, value: HomeAssistant) -> None:
        self._hass = value

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
        attrs: Dict[str, Any] = {
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
        if self.entry.data.get(CONF_CARRIER) == CARRIER_UNICOM:
            # 联通详单无需二次认证，且接口只支持按自然月查询
            attrs.pop("详单授权状态")
            attrs["用途"] = "通话/短信/上网详单的查询月份：联通接口按自然月查询，选该月任意一天都查询整月"
            attrs["使用说明"] = (
                "写入任意日期会立即拉取一次该月详单 (不受「自动获取通话记录」开关限制)；"
                "「每日重置查询起始日期」开启时每天 06:00 自动回到当月"
            )
        return attrs

    async def async_set_value(self, value: datetime.date) -> None:
        """写入查询起始日期并触发一次数据请求"""
        if value is None:
            return

        today_first = datetime.date.today().replace(day=1)
        # 与选项流规则保持一致: 选当月 1 日表示"动态跟随当月", 存空值, 跨月自动滚动
        stored = "" if value == today_first else value.isoformat()

        # 改日期属于主动查询: 联通即使关闭了「自动获取通话记录」，这一轮刷新也要拉详单
        if self.entry.data.get(CONF_CARRIER) == CARRIER_UNICOM:
            self._coordinator.request_detail_fetch()

        try:
            new_options = dict(self.entry.options)
            if str(new_options.get(CONF_CALL_START_DATE, "") or "").strip() != stored:
                new_options[CONF_CALL_START_DATE] = stored
                self.hass.config_entries.async_update_entry(self.entry, options=new_options)
                # 选项变更监听器会立即刷新一次数据 (不重载整条集成)
                _LOGGER.info(
                    "手机号 %s 通话详单查询起始日期已设为 %s",
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


# ==================================================================== 业务逻辑
# 以下为"通话流水(详单)查询"的业务实现，与实体解耦，便于单元测试与其它模块复用
# (按钮实体与「自动获取通话记录」都调用这里的函数)


def read_auth_param(
    runtime: AuthRuntime, entry: ConfigEntry, runtime_attr: str, options_key: str
) -> str:
    """读取姓名/身份证号 (优先运行时值，兜底集成选项缓存)"""
    value = str(getattr(runtime, runtime_attr, "") or "").strip()
    if value:
        return value
    try:
        return str(entry.options.get(options_key, "") or "").strip()
    except Exception:
        return ""


def is_detail_auth_alive(entry: ConfigEntry, coordinator) -> bool:
    """本地判定通话详单授权是否仍在有效期内 (30 分钟)"""
    try:
        options = entry.options or {}
        signature = str(options.get(CONF_SIGNATURE_STRING) or "").strip()
        timestamp = float(options.get(CONF_SIGNATURE_TIMESTAMP) or 0.0)
    except Exception:
        return False

    if not signature or timestamp <= 0:
        return False
    if (time.time() - timestamp) >= CALL_AUTH_EXPIRE_SECONDS:
        return False
    # 上一次拉取若已被服务端判定失效，则以服务端结论为准
    data = coordinator.data if coordinator and isinstance(coordinator.data, dict) else {}
    if data.get("call_need_auth") is True:
        return False
    return True


async def async_refresh_carrier_data(coordinator) -> bool:
    """立即拉取一次全量数据"""
    try:
        await coordinator.async_refresh()
    except Exception as err:
        _LOGGER.warning("拉取电信数据异常: %s", err)
        return False
    return bool(coordinator.last_update_success)


async def async_start_detail_query(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
) -> Tuple[bool, str]:
    """通话流水(详单)查询入口 —— 按钮与「自动获取通话记录」共用

    1. 详单授权仍在有效期 -> 仅立即拉取一次流水 (不发短信)
    2. 授权已失效 -> 校验实名信息齐备后下发详单验证码并开启等待窗口
       (验证码写入后由按钮的 async_submit_auto 自动提交)
    """
    if is_detail_auth_alive(entry, coordinator):
        ok = await async_refresh_carrier_data(coordinator)
        runtime.last_result = (
            "详单授权仍在有效期，已拉取最新通话流水"
            if ok
            else "拉取失败，请检查网络或登录凭证后重试"
        )
        runtime.notify()
        return ok, runtime.last_result

    name = read_auth_param(runtime, entry, "name", CONF_AUTH_USER_NAME)
    id_card = read_auth_param(runtime, entry, "id_card", CONF_AUTH_ID_CARD)
    missing = [label for label, value in (("机主姓名", name), ("身份证号", id_card)) if not value]
    if missing:
        runtime.last_result = "缺少" + "、".join(missing) + "，请先在对应实体中填写后再试"
        runtime.notify()
        return False, runtime.last_result

    # 60 秒内已下发过则不重复发送, 避免验证码尚未写入时误连点造成短信轰炸
    sent_ago = time.time() - runtime.sms_sent_at if runtime.sms_sent_at else 0.0
    if sent_ago and sent_ago < 60:
        remain = max(0, int(runtime.await_submit_until - time.time()))
        runtime.last_result = (
            f"详单验证码已于 {int(sent_ago)} 秒前下发，正在等待写入 (剩余约 {remain} 秒)"
            if remain
            else f"详单验证码已于 {int(sent_ago)} 秒前下发，请稍候再试"
        )
        runtime.notify()
        return False, runtime.last_result

    # 先记下发时刻再调用发送：短信有可能在接口返回之前就已到达手机并被写入，
    # 若等到发送返回后才记时间戳，这段"早到"的验证码会因早于发码时刻而被判为无效，
    # 表现为"验证码写了却一直不认证"。
    sent_at = time.time()
    ok, msg = await coordinator.async_send_call_auth_sms()
    if ok:
        runtime.open_detail_window(sent_at, CALL_AUTH_WAIT_SECONDS)
        runtime.last_result = (
            f"详单验证码已下发，请在 {CALL_AUTH_WAIT_SECONDS} 秒内写入「通话详单验证码」实体"
        )
        # 边界: 短信可能在发送请求返回前就已到达并被写入，此时写入事件早于窗口开启，
        # 不会触发自动提交 —— 这里补一次提交，避免"验证码写了却没反应"
        pending = (runtime.code or "").strip()
        if (
            len(pending) >= _MIN_AUTO_SUBMIT_CODE_LEN
            and runtime.code_set_at + 1.0 >= sent_at
        ):
            _LOGGER.info("电信手机号 %s 发码期间已收到验证码，直接提交认证", entry.data.get(CONF_PHONE))
            runtime.last_result = "验证码已就绪，正在提交认证…"
            runtime.notify()
            await async_submit_detail_code(hass, entry, coordinator, runtime, pending)
            return True, runtime.last_result
    else:
        # 发送失败: 关掉窗口，避免残留一个等待窗口把后续无关验证码卷进来
        runtime.close_windows()
        runtime.sms_sent_at = 0.0
        runtime.last_result = f"详单验证码下发失败：{msg}"
    runtime.notify()
    return ok, runtime.last_result


async def async_submit_detail_code(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator,
    runtime: AuthRuntime,
    code: str,
) -> Tuple[bool, str]:
    """提交三要素完成详单认证, 成功后立即拉取流水"""
    name = read_auth_param(runtime, entry, "name", CONF_AUTH_USER_NAME)
    id_card = read_auth_param(runtime, entry, "id_card", CONF_AUTH_ID_CARD)
    runtime.close_windows()

    ok, msg = await coordinator.async_submit_call_auth_code(code, name, id_card)
    # 无论成功与否都清空验证码: 成功避免复用, 失败则作废以便下次重新下发
    runtime.clear_code_entity()
    if ok:
        _LOGGER.info("电信手机号 %s 通话详单二次认证成功: %s", entry.data.get(CONF_PHONE), msg)
        runtime.last_result = f"认证成功，已拉取最新通话流水 ({msg})"
    else:
        # 本次验证码已作废，允许立即重新下发 (否则会被 60 秒防重复挡下，与提示文案不符)
        runtime.sms_sent_at = 0.0
        _LOGGER.warning("电信手机号 %s 通话详单二次认证失败: %s", entry.data.get(CONF_PHONE), msg)
        runtime.last_result = f"认证失败：{msg}（验证码已作废，再次按下可立即重新下发）"
    runtime.notify()
    return ok, msg
