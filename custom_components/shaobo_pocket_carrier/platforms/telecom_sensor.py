# -*- coding: utf-8 -*-
"""中国电信专属传感器模块 (独立隔离，全量对齐高标准属性与 12 核心实体)"""
import time
from typing import Any, Dict, List, Optional
from homeassistant.components.sensor import (
    SensorEntityDescription,
    SensorStateClass,
)

from .base import BaseCarrierSensor
from ..const import (
    CARRIER_TELECOM,
    SENSOR_PHONE,
    SENSOR_REAL_NAME,
    SENSOR_SPEED_SERVICE,
    SENSOR_BALANCE,
    SENSOR_CHARGE,
    SENSOR_FLOW_REMAIN,
    SENSOR_FLOW_USED,
    SENSOR_VOICE_REMAIN,
    SENSOR_VOICE_USED,
    SENSOR_CALL_RECORD,
    SENSOR_INTEGRAL,
    SENSOR_LOCATION,
    SENSOR_ACCOUNT_STATUS,
    SENSOR_LAST_UPDATE,
)

class TelecomFlowRemainSensor(BaseCarrierSensor):
    """电信剩余通用流量 (合并共享流量总额、已用、副卡使用明细与细分子包)"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_FLOW_REMAIN,
            name="剩余通用流量",
            icon="mdi:cloud-download-outline",
            native_unit_of_measurement="GB",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        return self.data.get("flow_remain_gb")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        tot = self.data.get("flow_total_gb", 0.0)
        rem = self.native_value or 0.0
        used = self.data.get("flow_used_gb", 0.0)
        pct = f"{round(rem / tot * 100, 1)}%" if tot > 0 else "0%"
        attrs = {
            "本月剩余流量": f"{rem:.2f} GB",
            "本月已用流量": f"{used:.2f} GB",
            "套餐流量总额": f"{tot:.2f} GB",
            "剩余流量占比": pct,
            "流量池类型": "家庭融合共享流量池",
            "成员排序": "本机置顶，副卡依次排列",
        }
        for m in self.data.get("flow_members", []):
            label = m.get("label", "副卡")
            phone = m.get("phone", "")
            used_m = m.get("used_gb", 0.0)
            attrs[f"{label} ({phone})"] = f"{used_m} GB"
        for idx, pkg in enumerate(self.data.get("detailed_flow_pkgs", []), 1):
            attrs[f"流量包{idx}"] = pkg
        attrs["运营商"] = "中国电信"
        return attrs


class TelecomRealNameSensor(BaseCarrierSensor):
    """电信机主姓名"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_REAL_NAME,
            name="机主姓名",
            icon="mdi:account-badge",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        name = self.data.get("account_name")
        if name and str(name).strip():
            return str(name).strip()
        mask = lambda p: p[:3] + "****" + p[-4:] if len(p) == 11 else p
        return f"电信用户 ({mask(self.phone)})"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        fixed = self.data.get("fixed_lines", [])
        return {
            "机主姓名": self.native_value,
            "实名认证状态": "已通过二代身份证实名认证",
            "证件类型": "中华人民共和国居民身份证",
            "证件号码": self.data.get("cert_num") or "已实名登记 (电信一级隐私保护脱敏)",
            "入网网龄": self.data.get("open_years", "在网用户"),
            "用户星级": self.data.get("user_level", "普通用户"),
            "信用额度": f"{self.data.get('credit_limit', '0')} 元",
            "所属网络": "中国电信 5G SA/NSA",
            "名下固话号码": ", ".join(fixed) if fixed else "暂无",
            "主卡手机号": self.phone,
            "运营商": "中国电信",
        }


class TelecomPhoneSensor(BaseCarrierSensor):
    """电信手机号码"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_PHONE,
            name="手机号码",
            icon="mdi:phone",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.phone

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        sub_cards = self.data.get("sub_cards", [])
        broadbands = self.data.get("broadbands", [])
        return {
            "运营商": "中国电信",
            "卡槽角色": "主号 (主卡)",
            "主套餐名称": self.data.get("package_name", "5G畅享套餐"),
            "名下宽带数量": f"{len(broadbands)} 条",
            "名下副卡数量": f"{len(sub_cards)} 张",
            "家庭成员总数": len(sub_cards) + len(broadbands) + 1,
            "名下宽带": ", ".join(broadbands) if broadbands else "暂无",
            "名下副卡": ", ".join(sub_cards) if sub_cards else "暂无",
            "归属省市": self.data.get("location", "中国电信"),
        }


class TelecomPackageSensor(BaseCarrierSensor):
    """电信主套餐服务"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SPEED_SERVICE,
            name="套餐服务",
            icon="mdi:package-variant-closed",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("package_name", "5G畅享套餐")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        sub_cards = self.data.get("sub_cards", [])
        broadbands = self.data.get("broadbands", [])
        return {
            "套餐全称": self.data.get("package_name", "5G畅享套餐"),
            "融合类型": "家庭融合共享套餐",
            "网络制式": "5G SA/NSA 极速网络",
            "融合宽带": ", ".join(broadbands) if broadbands else "暂无",
            "融合副卡": ", ".join(sub_cards) if sub_cards else "暂无",
            "运营商": "中国电信",
        }


class TelecomBalanceSensor(BaseCarrierSensor):
    """电信话费余额"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_BALANCE,
            name="话费余额",
            icon="mdi:cash-multiple",
            native_unit_of_measurement="元",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        return self.data.get("balance")

    @property
    def icon(self) -> str:
        bal = self.native_value
        return "mdi:cash-remove" if bal is not None and bal < 0 else "mdi:cash-multiple"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        bal = self.native_value or 0.0
        is_arrears = bal < 0
        attrs = {
            "运营商": "中国电信",
            "当前状态": "欠费" if is_arrears else "正常",
            "当前可用话费": f"{bal:.2f} 元" if not is_arrears else f"-{abs(bal):.2f} 元",
            "欠费金额": f"{abs(bal):.2f} 元" if is_arrears else "0.00 元",
            "包含通用余额": f"{self.data.get('balance_general', '0.00')} 元",
            "包含专用余额": self.data.get("balance_special", "0.00元"),
            "本月已消费": f"{self.data.get('charge', 0.0):.2f} 元",
            "是否欠费": "是" if is_arrears else "否",
        }
        for k, v in self.data.get("history_bills", {}).items():
            attrs[f"历史{k}"] = v
        return attrs


class TelecomChargeSensor(BaseCarrierSensor):
    """电信本月消费"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_CHARGE,
            name="本月消费",
            icon="mdi:credit-card-outline",
            native_unit_of_measurement="元",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        return self.data.get("charge")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "本月出账费用": f"{self.native_value or 0.0:.2f} 元",
            "计费周期": time.strftime("%Y年%m月"),
            "运营商": "中国电信",
        }
        bills = list(self.data.get("history_bills", {}).items())
        if len(bills) >= 2:
            attrs["上月出账费用"] = bills[1][1]
        return attrs



class TelecomVoiceRemainSensor(BaseCarrierSensor):
    """电信共享语音剩余"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_VOICE_REMAIN,
            name="共享通话剩余",
            icon="mdi:phone-outgoing-outline",
            native_unit_of_measurement="分钟",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        return self.data.get("voice_remain")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        total = self.data.get("voice_total", 0)
        rem = self.native_value or 0
        used = self.data.get("voice_used", 0)
        rem_pct = f"{round(rem / total * 100)}%" if total > 0 else "0%"
        attrs = {
            "套餐通话总额": f"{total} 分钟",
            "本月已用时长": f"{used} 分钟",
            "本月剩余占比": rem_pct,
            "运营商": "中国电信",
        }
        for idx, pkg in enumerate(self.data.get("voice_packages", []), 1):
            attrs[f"语音包{idx}"] = pkg
        return attrs


class TelecomVoiceUsedSensor(BaseCarrierSensor):
    """电信共享语音已用"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_VOICE_USED,
            name="共享通话已用",
            icon="mdi:phone-in-talk-outline",
            native_unit_of_measurement="分钟",
            state_class=SensorStateClass.MEASUREMENT,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        return self.data.get("voice_used")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "总已用分钟": f"{self.native_value or 0} 分钟",
            "通话范围": "国内通用语音 (不含港澳台/国际)",
        }
        for m in self.data.get("voice_members", []):
            label = m.get("label", "副卡")
            phone = m.get("phone", "")
            used = m.get("used_mins", 0)
            attrs[f"{label} ({phone})"] = f"{used} 分钟"
        attrs["运营商"] = "中国电信"
        return attrs


class TelecomIntegralSensor(BaseCarrierSensor):
    """电信会员积分"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_INTEGRAL,
            name="电信积分",
            icon="mdi:star-circle-outline",
            native_unit_of_measurement="分",
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        return self.data.get("integral", 0)

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "可用积分": f"{self.native_value or 0} 分",
            "积分体系": "中国电信天翼星级积分",
            "兑换特权": "可兑换话费充值券、流量包或积分商城实物礼品",
            "运营商": "中国电信",
        }


class TelecomLocationSensor(BaseCarrierSensor):
    """电信号码归属地"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LOCATION,
            name="号码归属地",
            icon="mdi:map-marker-radius",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("location", "中国电信")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "手机号": self.phone,
            "网络类型": "中国电信 5G/4G",
            "所属省市": self.data.get("location", ""),
            "运营商": "中国电信",
        }


class TelecomAccountSensor(BaseCarrierSensor):
    """电信账户状态"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_ACCOUNT_STATUS,
            name="账户状态",
            icon="mdi:account-check",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

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
        return {
            "手机号码": self.phone,
            "当前状态": "欠费" if is_arrears else "正常",
            "是否欠费": "是" if is_arrears else "否",
            "欠费金额": f"{abs(bal):.2f} 元" if is_arrears else "0.00 元",
            "当前话费": f"{bal:.2f} 元",
            "家庭融合": "已生效",
            "运营商": "中国电信",
        }


class TelecomLastUpdateSensor(BaseCarrierSensor):
    """电信数据最近同步时间"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LAST_UPDATE,
            name="数据最近更新",
            icon="mdi:clock-check-outline",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        interval_desc = "30分钟自动更新"
        if hasattr(self.coordinator, "update_interval") and self.coordinator.update_interval:
            mins = int(self.coordinator.update_interval.total_seconds() // 60)
            interval_desc = f"{mins}分钟自动更新"
        return {
            "轮询间隔": interval_desc,
            "凭证状态": "长效Token有效",
            "运营商": "中国电信",
        }


def get_telecom_sensors(coordinator, phone: str, entry=None) -> List[BaseCarrierSensor]:
    """生成电信传感器列表 (包含自动根据手机号生成签名的通话记录传感器)"""
    return [
        TelecomRealNameSensor(coordinator, phone),
        TelecomPhoneSensor(coordinator, phone),
        TelecomPackageSensor(coordinator, phone),
        TelecomBalanceSensor(coordinator, phone),
        TelecomChargeSensor(coordinator, phone),
        TelecomFlowRemainSensor(coordinator, phone),
        TelecomVoiceRemainSensor(coordinator, phone),
        TelecomVoiceUsedSensor(coordinator, phone),
        TelecomIntegralSensor(coordinator, phone),
        TelecomLocationSensor(coordinator, phone),
        TelecomAccountSensor(coordinator, phone),
        TelecomLastUpdateSensor(coordinator, phone),
        TelecomCallRecordSensor(coordinator, phone),
    ]


class TelecomCallRecordSensor(BaseCarrierSensor):
    """电信通话记录传感器 (语音详单，需要配置 signatureString)"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_CALL_RECORD,
            name="通话记录",
            icon="mdi:phone-log",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    @property
    def native_value(self) -> str:
        if self.data.get("call_need_auth"):
            return "详单授权已过期 (需重新认证)"
        last = self.data.get("last_call") or {}
        if last.get("call_time"):
            target = last.get("calle_no", "未知")
            call_dir = last.get("type", "")
            if "主叫" in call_dir:
                call_dir = "呼叫"
            elif "被叫" in call_dir:
                call_dir = "接听"
            return f"{call_dir} {target} ({last.get('duration', '')})"
        return "本月暂无通话"

    @property
    def icon(self) -> str:
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
        masked_list = []
        for r in records:
            call_type = r.get("type", "")
            if "主叫" in call_type:
                call_type = "呼叫"
            elif "被叫" in call_type:
                call_type = "接听"
            masked_list.append({
                "call_time": r.get("call_time", ""),
                "type": call_type,                   # 呼叫/接听
                "call_type": r.get("call_type", ""),  # 国内通话/漫游
                "phone_number": r.get("calle_no", ""),
                "duration": r.get("duration", ""),
                "location": r.get("call_area", ""),
                "fee": r.get("total_charge", "0元"),
            })
        auth_status = self.data.get("call_auth_status") or ("已过期 (需重新认证)" if self.data.get("call_need_auth") else "有效")
        rem_min = self.data.get("call_auth_remaining_minutes", 0)

        last = self.data.get("last_call") or {}
        last_formatted = {}
        if last.get("call_time"):
            last_type = last.get("type", "")
            if "主叫" in last_type:
                last_type = "呼叫"
            elif "被叫" in last_type:
                last_type = "接听"
            last_formatted = {
                "call_time": last.get("call_time", ""),
                "type": last_type,
                "call_type": last.get("call_type", ""),
                "phone_number": last.get("calle_no", ""),
                "duration": last.get("duration", ""),
                "location": last.get("call_area", ""),
                "fee": last.get("total_charge", "0元"),
            }

        return {
            "运营商": "中国电信",
            "本月通话次数": self.data.get("call_count", len(records)),
            "查询起始日期": self.data.get("call_start_date", "当月月初"),
            "查询截至日期": self.data.get("call_end_date", "当天"),
            "详单授权状态": auth_status,
            "授权剩余有效时长": f"{rem_min} 分钟" if not self.data.get("call_need_auth") else "0 分钟",
            "最近一次通话": last_formatted,
            "通话流水清单": masked_list,
        }
