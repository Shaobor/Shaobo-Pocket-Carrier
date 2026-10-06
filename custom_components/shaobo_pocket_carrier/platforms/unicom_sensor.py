# -*- coding: utf-8 -*-
"""中国联通专属传感器模块 (独立隔离)"""
import re
import time
from typing import Any, Dict, List, Optional
from homeassistant.components.sensor import (
    SensorEntityDescription,
    SensorStateClass,
)

from .base import BaseCarrierSensor, BaseOnlineSensor
from ..phone_region import (
    db_status as _region_db_status,
    normalize_record,
    normalize_sms_record,
    normalize_sms_daily,
    normalize_net_record,
    normalize_net_daily,
)

# 本轮轮询没有拉取详单时 (协调器标记 detail_fetch_paused) 详单类实体的展示文案:
# 联通轮询只刷新话费与流量，详单只在「自动获取通话记录」的每日设定时间拉取一次
_DETAIL_PAUSED_STATE = "未获取"
_DETAIL_PAUSED_NOTE = (
    "轮询不拉取详单，展示本地缓存：开启「自动获取通话记录」后每天在设定时间拉取一次，"
    "也可按「刷新详单流水」立即获取"
)


def _city_geo_text() -> str:
    """城市坐标表状态文本 (供实体属性展示)"""
    try:
        from ..city_geo import status as _status

        info = _status()
    except Exception as err:
        return f"不可用 ({err})"
    if not info.get("cities"):
        return "不可用 (坐标表缺失)"
    return f"{info.get('cities')} 个城市坐标（\"经度,纬度\" 字符串）"


def _region_db_text() -> str:
    """归属地库状态文本 (库不可用时如实说明, 不影响其它数据)"""
    try:
        status = _region_db_status()
    except Exception as err:
        return f"不可用 ({err})"
    if not status.get("available"):
        return "不可用 (库文件缺失或损坏)"
    return f"{status.get('version')} ({status.get('source')})"


from ..const import (
    CARRIER_UNICOM,
    SENSOR_PHONE,
    SENSOR_REAL_NAME,
    SENSOR_CUST_NAME,
    SENSOR_MEMBER_LEVEL,
    SENSOR_BALANCE,
    SENSOR_CHARGE,
    SENSOR_FEE_DEPOSIT,
    SENSOR_FEE_ROLLOVER,
    SENSOR_FLOW_REMAIN,
    SENSOR_FLOW_DIRECTIONAL,
    SENSOR_VOICE_REMAIN,
    SENSOR_SMS_REMAIN,
    SENSOR_INTEGRAL,
    SENSOR_STAR_LEVEL,
    SENSOR_LOCATION,
    SENSOR_ACCOUNT_STATUS,
    SENSOR_SPEED_SERVICE,
    SENSOR_BROADBAND_COUNT,
    SENSOR_LAST_UPDATE,
    SENSOR_CALL_RECORD,
    SENSOR_SMS_RECORD,
    SENSOR_NET_RECORD,
)

class UnicomPhoneSensor(BaseCarrierSensor):
    """联通手机号码"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_PHONE,
            name="手机号码",
            icon="mdi:phone",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.phone

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        sub_cards = self.data.get("sub_cards", [])
        broadbands = self.data.get("broadbands", [])
        return {
            "运营商": "中国联通",
            "卡槽角色": "主号 (主卡)",
            "名下宽带数量": f"{len(broadbands)} 条",
            "名下副卡数量": f"{len(sub_cards)} 张",
            "家庭成员总数": len(sub_cards) + len(broadbands) + 1,
            "名下宽带": ", ".join(broadbands) if broadbands else "无",
            "名下副卡": ", ".join(sub_cards) if sub_cards else "无",
        }


class UnicomRealNameSensor(BaseCarrierSensor):
    """联通机主姓名"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_REAL_NAME,
            name="机主姓名",
            icon="mdi:account-badge",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        name = self.data.get("real_name")
        if name and str(name).strip():
            return str(name).strip()
        return "未知"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "证件类型": self.data.get("cert_type", "18位身份证"),
            "证件号码": self.data.get("cert_code", ""),
            "入网时间": self.data.get("open_date", ""),
            "通话级别": self.data.get("call_level", "国际通话"),
            "当前状态": self.data.get("number_status", "开通"),
            "国家网络身份": self.data.get("cyber_identity_state", "未绑定"),
            "运营商": "中国联通",
        }
        if self.data.get("cust_name"):
            attrs["单位名称"] = self.data.get("cust_name")
        if self.data.get("cust_cert_num"):
            attrs["单位户号/税号"] = self.data.get("cust_cert_num")
        return attrs


class UnicomCustNameSensor(BaseCarrierSensor):
    """联通单位户号/户名"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_CUST_NAME,
            name="单位户号",
            icon="mdi:domain",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        # 优先展示单位户号/统一社会信用代码，若无则展示单位名称
        return self.data.get("cust_cert_num") or self.data.get("cust_name") or "个人用户"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "单位名称": self.data.get("cust_name", "无"),
            "单位户号/税号": self.data.get("cust_cert_num", "无"),
            "证件类型": self.data.get("cust_cert_type", "营业执照(组织机构代码)"),
            "实际使用人": self.data.get("real_name") or "未知",
            "使用人证件": self.data.get("cert_code", ""),
            "客户类型": "政企/单位客户" if self.data.get("cust_name") else "个人客户",
            "运营商": "中国联通",
        }


class UnicomMemberLevelSensor(BaseCarrierSensor):
    """联通会员等级"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_MEMBER_LEVEL,
            name="会员等级",
            icon="mdi:medal",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("member_level", "铂金会员")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        integral_val = self.data.get("integral", 0)
        return {
            "会员体系": "中国联通 U+ 专属服务",
            "用户星级": self.data.get("star_level", "0星级"),
            "可用积分": f"{integral_val} 分",
            "积分": integral_val,
            "积分体系": "中国联通会员积分",
            "兑换特权": "可兑换联通商城话费券、流量包或实物礼品",
            "星级特权": self.data.get("star_title", "用户星级特权"),
            "套餐类型": self.data.get("package_type", "5G"),
            "速率服务": self.data.get("speed_service", "5G上网服务(下行峰值500Mbps)"),
            "信用额度": self.data.get("credit_value", "0元"),
            "运营商": "中国联通",
        }


class UnicomSpeedServiceSensor(BaseCarrierSensor):
    """联通主套餐服务"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SPEED_SERVICE,
            name="套餐服务",
            icon="mdi:package-variant-closed",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("package_name") or self.data.get("speed_service", "5G畅享套餐")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        sub_cards = self.data.get("sub_cards", [])
        broadbands = self.data.get("broadbands", [])
        return {
            "套餐全称": self.data.get("package_name", "5G副卡基本套餐"),
            "融合类型": "家庭共享套餐",
            "网络制式": "5G SA/NSA 极速网络",
            "融合宽带": ", ".join(broadbands) if broadbands else "暂无",
            "融合副卡": ", ".join(sub_cards) if sub_cards else "暂无",
            "服务全称": self.data.get("speed_service", "5G上网服务(下行峰值500Mbps)"),
            "下行峰值速率": "500 Mbps",
            "信用额度": self.data.get("credit_value", "0元"),
            "运营商": "中国联通",
        }



class UnicomBalanceSensor(BaseCarrierSensor):
    """联通话费余额"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_BALANCE,
            name="话费余额",
            icon="mdi:cash-multiple",
            native_unit_of_measurement="元",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        return self.data.get("balance")

    @property
    def icon(self) -> str:
        bal = self.native_value
        return "mdi:cash-remove" if bal is not None and bal < 0 else "mdi:cash-multiple"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        combined = self.data.get("combined_account", "独立账户")
        bal = self.native_value or 0.0
        is_arrears = bal < 0
        attrs: Dict[str, Any] = {
            "当前状态": "欠费" if is_arrears else "正常",
            "本月存入": f"{self.data.get('fee_deposit', 0.0):.2f} 元",
            "本月消费": f"{self.data.get('charge', 0.0):.2f} 元",
            "上月结转": f"{self.data.get('fee_rollover', 0.0):.2f} 元",
            "本机消费": f"{self.data.get('charge_self', 0.0):.2f} 元",
            "合账成员消费": f"{self.data.get('charge_others', 0.0):.2f} 元",
            "最近交费时间": self.data.get("last_pay_time", "暂无"),
            "最近交费金额": f"{self.data.get('last_pay_fee', '0.00')} 元",
            "账户类型": combined,
            "是否合账": "是" if "合账" in combined else "否",
            "是否欠费": "是" if is_arrears else "否",
            "欠费金额": f"{abs(bal):.2f} 元" if is_arrears else "0.00 元",
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }
        if self.data.get("is_limit_period"):
            attrs["出账状态"] = self.data.get("limit_period_prompt", "每月1日0点至8点系统出账期 (展示出账前有效余额)")
        return attrs




class UnicomFlowRemainSensor(BaseCarrierSensor):
    """联通通用剩余流量"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_FLOW_REMAIN,
            name="剩余通用流量",
            icon="mdi:cloud-download-outline",
            native_unit_of_measurement="GB",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        val = self.data.get("flow_remain_gb")
        if val is not None:
            return val
        raw = str(self.data.get("flow_remain", "")).replace("GB", "").strip()
        try:
            return float(raw)
        except Exception:
            return None

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        rem = self.native_value or 0.0
        used = float(self.data.get("flow_used_gb") or 0.0)
        tot = float(self.data.get("flow_total_gb") or (rem + used))
        pct = f"{round(rem / tot * 100, 1)}%" if tot > 0 else "0%"
        attrs = {
            "本月剩余流量": f"{rem:.2f} GB",
            "本月已用流量": f"{used:.2f} GB",
            "套餐流量总额": f"{tot:.2f} GB",
            "剩余流量占比": pct,
            "流量池类型": "家庭融合共享流量池",
            "成员排序": "本机置顶，副卡依次排列",
            "流量类型": self.data.get("flow_title", "通用流量"),
            "主套餐名称": self.data.get("package_name", "5G副卡基本套餐"),
            "本月超出流量": f"{self.data.get('flow_exceed', 0.0)} MB",
            "剩余定向流量": self.data.get("flow_directional", "0 GB"),
            "定向流量分类": self.data.get("flow_directional_title", "定向/专属流量"),
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }
        # 匹配卡片成员格式: 本机 (156****1105) / 副卡 (130****3907)
        card_usages = self.data.get("card_flow_usage", {})
        if card_usages:
            self_phone_tail = self.phone[-4:] if len(self.phone) >= 4 else self.phone
            for num, usage in card_usages.items():
                is_self = self.phone in num or (len(num) >= 4 and num.endswith(self_phone_tail))
                label = "本机" if is_self else "副卡"
                attrs[f"{label} ({num})"] = usage
        for idx, pkg in enumerate(self.data.get("flow_packages", []), 1):
            attrs[f"流量包{idx}"] = pkg
        return attrs


class UnicomFlowDirectionalSensor(BaseCarrierSensor):
    """联通定向剩余流量"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_FLOW_DIRECTIONAL,
            name="剩余定向流量",
            icon="mdi:filter-outline",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("flow_directional", "0 GB")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "流量分类": self.data.get("flow_directional_title", "定向/专属流量"),
            "数据截至": self.data.get("flush_time", ""),
        }


class UnicomVoiceRemainSensor(BaseCarrierSensor):
    """联通剩余通话语音"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_VOICE_REMAIN,
            name="剩余语音",
            icon="mdi:phone-outgoing-outline",
            native_unit_of_measurement="分钟",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        val = self.data.get("voice_remain_num")
        if val is not None:
            try:
                return int(float(val))
            except Exception:
                pass
        raw = str(self.data.get("voice_remain", "")).replace("分钟", "").strip()
        try:
            return int(float(raw))
        except Exception:
            return None

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        rem = self.native_value or 0
        used = int(self.data.get("voice_used") or 0)
        tot = int(self.data.get("voice_total") or (rem + used))
        rem_pct = f"{round(rem / tot * 100)}%" if tot > 0 else "0%"
        attrs = {
            "套餐通话总额": f"{tot} 分钟",
            "本月已用时长": f"{used} 分钟",
            "本月剩余时长": f"{rem} 分钟",
            "本月剩余占比": rem_pct,
            "通话范围": "国内通用语音 (不含港澳台/国际)",
            "语音类型": self.data.get("voice_title", "剩余语音"),
            "本月超出语音": f"{self.data.get('voice_exceed', 0)} 分钟",
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }
        card_usages = self.data.get("card_voice_usage", {})
        if card_usages:
            self_phone_tail = self.phone[-4:] if len(self.phone) >= 4 else self.phone
            for num, usage in card_usages.items():
                is_self = self.phone in num or (len(num) >= 4 and num.endswith(self_phone_tail))
                label = "本机" if is_self else "副卡"
                attrs[f"{label} ({num})"] = usage
        for idx, pkg in enumerate(self.data.get("voice_packages", []), 1):
            attrs[f"语音包{idx}"] = pkg
        return attrs


class UnicomSmsRemainSensor(BaseCarrierSensor):
    """联通剩余短信"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SMS_REMAIN,
            name="剩余短信",
            icon="mdi:message-processing-outline",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("sms_remain", "0 条")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        pkg_total = self.data.get("sms_package_total")
        if pkg_total is None or isinstance(pkg_total, (dict, list)):
            raw_tot = self.data.get("sms_total")
            if isinstance(raw_tot, (int, float, str)) and not isinstance(raw_tot, (dict, list)):
                try:
                    pkg_total = int(raw_tot)
                except Exception:
                    pkg_total = 0
            else:
                pkg_total = 0
        try:
            total_val = int(pkg_total)
        except Exception:
            total_val = 0
        return {
            "套餐短信总额": f"{total_val} 条",
            "本月已用短信": f"{self.data.get('sms_used', 0)} 条",
            "本月超出短信": f"{self.data.get('sms_exceed', 0)} 条",
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }




class UnicomLocationSensor(BaseCarrierSensor):
    """联通号码归属地"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LOCATION,
            name="号码归属地",
            icon="mdi:map-marker-radius",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("location", "中国联通")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "手机号": self.phone,
            "网络类型": "中国联通5G/4G",
            "所属省市": self.data.get("location", ""),
        }


class UnicomAccountSensor(BaseCarrierSensor):
    """联通账户状态"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_ACCOUNT_STATUS,
            name="账户状态",
            icon="mdi:account-check",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        bal = self.data.get("balance", 0.0)
        return "欠费" if (bal or 0.0) < 0 else "正常"

    @property
    def icon(self) -> str:
        bal = self.data.get("balance", 0.0)
        return "mdi:account-alert" if (bal or 0.0) < 0 else "mdi:account-check"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        bal = self.data.get("balance", 0.0)
        is_arrears = (bal or 0.0) < 0
        attrs = {
            "手机号": self.phone,
            "运营商": "中国联通",
            "是否欠费": "是" if is_arrears else "否",
            "欠费金额": f"{abs(bal):.2f} 元" if is_arrears else "0.00 元",
            "滚动保活": "每3分钟自动续期",
            "脱敏号码": self.data.get("desmobile", ""),
            "截至统计": self.data.get("flush_time", ""),
        }
        if self.data.get("is_limit_period"):
            prompt = self.data.get("limit_period_prompt") or "每月1日0点至每月1日早8点为系统出账期，请您于每月1日早8点以后进行查询，敬请谅解"
            attrs["出账状态"] = prompt
            attrs["出账期提示"] = prompt
        return attrs


class UnicomLastUpdateSensor(BaseCarrierSensor):
    """联通数据最近同步时间"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LAST_UPDATE,
            name="数据最近更新",
            icon="mdi:clock-check-outline",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        interval_desc = "10分钟自动更新"
        if hasattr(self.coordinator, "update_interval") and self.coordinator.update_interval:
            mins = int(self.coordinator.update_interval.total_seconds() // 60)
            interval_desc = f"{mins}分钟自动更新"
        return {
            "轮询间隔": interval_desc,
            "凭证状态": "短效Token滚动保活",
            "运营商": "中国联通",
        }


def get_unicom_sensors(coordinator, phone: str) -> List[BaseCarrierSensor]:
    """生成该联通手机号下的专属传感器实例 (全量规范注册，统一 15 个实体)"""
    return [
        UnicomPhoneSensor(coordinator, phone),
        UnicomRealNameSensor(coordinator, phone),
        # UnicomCustNameSensor(coordinator, phone),  # 个人手机卡无单位户号，已彻底移除
        UnicomMemberLevelSensor(coordinator, phone),
        UnicomSpeedServiceSensor(coordinator, phone),
        UnicomBalanceSensor(coordinator, phone),
        UnicomFlowRemainSensor(coordinator, phone),
        UnicomVoiceRemainSensor(coordinator, phone),
        UnicomSmsRemainSensor(coordinator, phone),
        UnicomLocationSensor(coordinator, phone),
        UnicomAccountSensor(coordinator, phone),
        UnicomLastUpdateSensor(coordinator, phone),
        UnicomOnlineSensor(coordinator, phone),
        UnicomCallRecordSensor(coordinator, phone),
        UnicomSmsRecordSensor(coordinator, phone),
        UnicomNetRecordSensor(coordinator, phone),
    ]


class UnicomOnlineSensor(BaseOnlineSensor):
    """联通账号在线状态 (在线/离线/未知)，会作为节点合并进「数据总览」实体"""

    def __init__(self, coordinator, phone: str):
        super().__init__(coordinator, CARRIER_UNICOM, phone)


class UnicomCallRecordSensor(BaseCarrierSensor):
    """联通通话记录传感器 (语音详单)"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_CALL_RECORD,
            name="通话记录",
            icon="mdi:phone-log",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        # 本地有流水时展示最近一次通话
        last = self.data.get("last_call") or {}
        if last.get("call_time"):
            target = last.get("phone_number") or last.get("calle_no") or "未知"
            call_dir = normalize_record(last).get("type", "")
            return f"{call_dir} {target} ({last.get('duration', '')})"
        if self.data.get("call_need_auth"):
            return "详单授权已过期 (需重新认证)"
        if self.data.get("detail_fetch_paused") and not self.data.get("call_data_from_cache"):
            return _DETAIL_PAUSED_STATE
        return "本月暂无通话"

    @property
    def icon(self) -> str:
        if self.data.get("call_data_from_cache"):
            return "mdi:database-clock-outline"
        if self.data.get("call_need_auth"):
            return "mdi:shield-lock-outline"
        last = self.data.get("last_call") or {}
        call_dir = last.get("type", "")
        if "接听" in call_dir or "被叫" in call_dir:
            return "mdi:phone-incoming"
        if "呼叫" in call_dir or "主叫" in call_dir:
            return "mdi:phone-outgoing"
        return "mdi:phone-log"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        records = self.data.get("call_records") or []
        masked_list = [normalize_record(r) for r in records if isinstance(r, dict)]
        auth_status = self.data.get("call_auth_status") or ("已过期 (需重新认证)" if self.data.get("call_need_auth") else "有效")
        rem_min = self.data.get("call_auth_remaining_minutes", 0)

        # 数据来源: 实时接口 / 本地缓存兜底
        from_cache = bool(self.data.get("call_data_from_cache"))
        if from_cache:
            cache_saved_at = str(self.data.get("call_cache_saved_at_text") or "").strip()
            data_source = f"本地缓存 (缓存于 {cache_saved_at})" if cache_saved_at else "本地缓存"
        elif self.data.get("detail_fetch_paused"):
            data_source = "未获取"
        else:
            data_source = "实时接口"

        last = self.data.get("last_call") or {}
        last_formatted = (
            normalize_record(last)
            if isinstance(last, dict) and last.get("call_time")
            else {}
        )

        attrs = {
            "运营商": "中国联通",
            "数据来源": data_source,
            "归属地库": _region_db_text(),
            "坐标库": _city_geo_text(),
            "本月通话次数": self.data.get("call_count", len(records)),
            "查询起始日期": self.data.get("call_start_date", "当月月初"),
            "查询截至日期": self.data.get("call_end_date", "该月最后一天"),
            "详单授权状态": auth_status,
            "授权剩余有效时长": f"{rem_min} 分钟" if not self.data.get("call_need_auth") else "0 分钟",
            "最近一次通话": last_formatted,
            "通话流水清单": masked_list,
        }
        if from_cache:
            attrs["缓存说明"] = "详单数据当前来自本地历史缓存"
        if self.data.get("detail_fetch_paused"):
            attrs["详单获取"] = _DETAIL_PAUSED_NOTE
        return attrs


# =====================================================================
# 联通详单类传感器 (短信记录 / 上网流量记录)
# =====================================================================
class _UnicomDetailRecordSensor(BaseCarrierSensor):
    """联通详单传感器公共实现"""

    _prefix = "sms"                 # 数据字典前缀 (sms_ / net_)
    _label = "短信"                 # 摘要里的名称
    _list_attr = "短信记录"          # 明细清单属性名
    _daily_attr = "按天汇总"
    _idle_icon = "mdi:file-document-outline"
    _record_projection: Optional[tuple] = None
    _daily_projection: Optional[tuple] = None
    _show_meta_counts = True

    def _normalize_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def _normalize_daily(self, record: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def _summary(self) -> str:
        raise NotImplementedError

    def _extra_detail_attrs(self) -> Dict[str, Any]:
        return {}

    def _total_display(self) -> Dict[str, Any]:
        return self._total

    @staticmethod
    def _project(record: Dict[str, Any], fields: Optional[tuple]) -> Dict[str, Any]:
        if not fields or not isinstance(record, dict):
            return record
        projected: Dict[str, Any] = {}
        for item in fields:
            if isinstance(item, (tuple, list)) and len(item) == 2:
                projected[item[0]] = record.get(item[1])
            else:
                projected[item] = record.get(item)
        return projected

    @property
    def _records(self) -> List[Dict[str, Any]]:
        raw = self.data.get(f"{self._prefix}_records") or []
        return [self._normalize_record(r) for r in raw if isinstance(r, dict)]

    @property
    def _daily(self) -> List[Dict[str, Any]]:
        raw = self.data.get(f"{self._prefix}_daily") or []
        return [self._normalize_daily(r) for r in raw if isinstance(r, dict)]

    @property
    def _total(self) -> Dict[str, Any]:
        total = self.data.get(f"{self._prefix}_total")
        return total if isinstance(total, dict) else {}

    def _month_text(self, full: bool = False) -> str:
        start = str(
            self.data.get(f"{self._prefix}_start_date")
            or self.data.get("call_start_date")
            or ""
        )
        matched = re.match(r"^(\d{4})-(\d{2})", start)
        if not matched:
            return "本月"
        if full:
            return f"{matched.group(1)}年{int(matched.group(2))}月"
        return f"{int(matched.group(2))}月"

    @property
    def _auth_status(self) -> str:
        return str(
            self.data.get(f"{self._prefix}_status")
            or self.data.get("call_auth_status")
            or "有效"
        )

    @property
    def native_value(self) -> str:
        if self._records:
            return self._summary()
        if self.data.get("call_need_auth"):
            return "详单授权已过期 (需重新认证)"
        if self.data.get("detail_fetch_paused") and not self.data.get(f"{self._prefix}_data_from_cache"):
            return _DETAIL_PAUSED_STATE
        return f"{self._month_text()}无{self._label}记录"

    @property
    def icon(self) -> str:
        if self.data.get(f"{self._prefix}_data_from_cache"):
            return "mdi:database-clock-outline"
        if self.data.get("call_need_auth"):
            return "mdi:shield-lock-outline"
        return self._idle_icon

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        records = self._records
        daily = self._daily
        rem_min = self.data.get("call_auth_remaining_minutes", 30)
        from_cache = bool(self.data.get(f"{self._prefix}_data_from_cache"))
        if from_cache:
            saved_at = str(self.data.get(f"{self._prefix}_cache_saved_at_text") or "").strip()
            data_source = f"本地缓存 (缓存于 {saved_at})" if saved_at else "本地缓存"
        elif self.data.get("detail_fetch_paused"):
            data_source = "未获取"
        else:
            data_source = "实时接口"

        attrs: Dict[str, Any] = {
            "运营商": "中国联通",
            "统计月份": self._month_text(full=True),
            "数据来源": data_source,
            "查询起始日期": self.data.get(f"{self._prefix}_start_date")
            or self.data.get("call_start_date", "当月月初"),
            "查询截至日期": self.data.get(f"{self._prefix}_end_date")
            or self.data.get("call_end_date", "该月最后一天"),
            "详单授权状态": self._auth_status,
            "授权剩余有效时长": f"{rem_min} 分钟" if not self.data.get("call_need_auth") else "0 分钟",
        }
        if self._show_meta_counts:
            attrs["记录条数"] = len(records)
            attrs["汇总天数"] = len(daily)
        attrs.update({
            "合计": self._total_display(),
            "按天汇总": [self._project(row, self._daily_projection) for row in daily],
            "最近一条": self._project(records[0], self._record_projection) if records else {},
            self._list_attr: [self._project(row, self._record_projection) for row in records],
        })
        attrs.update(self._extra_detail_attrs())
        if from_cache:
            attrs["缓存说明"] = "详单当前展示本地缓存的历史数据"
        if self.data.get("detail_fetch_paused"):
            attrs["详单获取"] = _DETAIL_PAUSED_NOTE
        return attrs


class UnicomSmsRecordSensor(_UnicomDetailRecordSensor):
    """联通短信记录 (短信详单) → sensor.<手机号>_sms"""

    _prefix = "sms"
    _label = "短信"
    _list_attr = "短信记录"
    _idle_icon = "mdi:message-text-clock-outline"
    _record_projection = (
        "datetime", "phone_number", "type", ("fee", "fee_yuan"),
        "number_location", "number_isp", "number_location_coordinate",
    )
    _daily_projection = ("date", "count", "type", "fee")
    _show_meta_counts = False

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SMS_RECORD,
            name="短信记录",
            icon="mdi:message-text-clock-outline",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    def _normalize_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_sms_record(record)

    def _normalize_daily(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_sms_daily(record)

    def _counts(self) -> tuple:
        sent = sum(int(r.get("count", 0) or 0) for r in self._records if r.get("type") == "发送")
        received = sum(int(r.get("count", 0) or 0) for r in self._records if r.get("type") == "接收")
        return sent, received

    def _summary(self) -> str:
        total = self._total
        count = int(total.get("count") or self.data.get(f"{self._prefix}_count") or len(self._records))
        fee = total.get("fee_yuan")
        if fee is None:
            fee = round(sum(float(r.get("fee_yuan", 0.0) or 0) for r in self._records), 2)
        sent, received = self._counts()
        direction = f"（发 {sent} / 收 {received}）" if (sent or received) else ""
        return f"{self._month_text()} {count} 条{direction} · {float(fee):.2f} 元"

    def _total_display(self) -> Dict[str, Any]:
        total = self._total
        count = int(total.get("count") or self.data.get(f"{self._prefix}_count") or len(self._records))
        fee = total.get("fee_yuan")
        if fee is None:
            fee = round(sum(float(r.get("fee_yuan", 0.0) or 0) for r in self._records), 2)
        sent, received = self._counts()
        return {
            "count": count,
            "sent": sent,
            "received": received,
            "fee": round(float(fee), 2),
        }


class UnicomNetRecordSensor(_UnicomDetailRecordSensor):
    """联通上网记录 (上网流量详单) → sensor.<手机号>_traffic"""

    _prefix = "net"
    _label = "上网"
    _list_attr = "上网会话清单"
    _idle_icon = "mdi:chart-timeline-variant"
    _record_projection = (
        "datetime", "volume_mb", "duration_seconds", ("fee", "fee_yuan"), "business_type",
    )
    _daily_projection = (
        "date", "volume_mb", "duration_seconds", ("fee", "fee_yuan"), "sessions",
    )

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_NET_RECORD,
            name="上网记录",
            icon="mdi:chart-timeline-variant",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    def _normalize_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_net_record(record)

    def _normalize_daily(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_net_daily(record)

    @staticmethod
    def _fmt_mb(value: Any) -> str:
        mb = float(value or 0)
        if mb >= 1024:
            return f"{mb / 1024:.2f} GB"
        return f"{mb:.2f} MB"

    @staticmethod
    def _fmt_duration(seconds: Any) -> str:
        total = int(float(seconds or 0))
        hours, remain = divmod(total, 3600)
        minutes = remain // 60
        if hours:
            return f"{hours}小时{minutes}分"
        return f"{minutes}分钟"

    @property
    def total_volume_mb(self) -> float:
        total = self._total
        if total.get("volume_mb") is not None:
            return float(total.get("volume_mb") or 0)
        return sum(float(r.get("volume_mb", 0.0) or 0) for r in self._records)

    @property
    def total_duration_seconds(self) -> int:
        total = self._total
        if total.get("duration_seconds") is not None:
            return int(total.get("duration_seconds") or 0)
        return sum(int(r.get("duration_seconds", 0) or 0) for r in self._records)

    def _summary(self) -> str:
        total = self._total
        fee = total.get("fee_yuan")
        if fee is None:
            fee = round(sum(float(r.get("fee_yuan", 0.0) or 0) for r in self._records), 2)
        return (
            f"{self._month_text()} {self._fmt_mb(self.total_volume_mb)}"
            f" · {self._fmt_duration(self.total_duration_seconds)}"
            f" · {float(fee):.2f} 元"
        )



