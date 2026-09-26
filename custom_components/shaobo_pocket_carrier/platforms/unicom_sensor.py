# -*- coding: utf-8 -*-
"""中国联通专属传感器模块 (独立隔离)"""
import time
from typing import Any, Dict, List, Optional
from homeassistant.components.sensor import (
    SensorEntityDescription,
    SensorStateClass,
)

from .base import BaseCarrierSensor
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
        return "错误"

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
            "实际使用人": self.data.get("real_name", "王**"),
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
        return {
            "会员体系": "中国联通 U+ 专属服务",
            "用户星级": self.data.get("star_level", "0星级"),
            "可用积分": f"{self.data.get('integral', 0)} 分",
            "星级特权": self.data.get("star_title", "用户星级特权"),
            "套餐类型": self.data.get("package_type", "5G"),
            "速率服务": self.data.get("speed_service", "5G上网服务(下行峰值500Mbps)"),
            "信用额度": self.data.get("credit_value", "0元"),
            "运营商": "中国联通",
        }


class UnicomSpeedServiceSensor(BaseCarrierSensor):
    """联通5G速率服务"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SPEED_SERVICE,
            name="速率服务",
            icon="mdi:speedometer",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("speed_service", "5G上网服务(下行峰值500Mbps)")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "服务全称": self.data.get("speed_service", "5G上网服务(下行峰值500Mbps)"),
            "套餐类型": self.data.get("package_type", "5G"),
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
    def extra_state_attributes(self) -> Dict[str, Any]:
        combined = self.data.get("combined_account", "独立账户")
        return {
            "本月存入": f"{self.data.get('fee_deposit', 0.0):.2f} 元",
            "本月消费": f"{self.data.get('charge', 0.0):.2f} 元",
            "上月结转": f"{self.data.get('fee_rollover', 0.0):.2f} 元",
            "本机消费": f"{self.data.get('charge_self', 0.0):.2f} 元",
            "合账成员消费": f"{self.data.get('charge_others', 0.0):.2f} 元",
            "最近交费时间": self.data.get("last_pay_time", "暂无"),
            "最近交费金额": f"{self.data.get('last_pay_fee', '0.00')} 元",
            "账户类型": combined,
            "是否合账": "是" if "合账" in combined else "否",
            "是否欠费": "是" if (self.native_value or 0) < 0 else "否",
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }




class UnicomFlowRemainSensor(BaseCarrierSensor):
    """联通通用剩余流量"""
    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_FLOW_REMAIN,
            name="剩余通用流量",
            icon="mdi:cloud-download-outline",
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("flow_remain", "无数据")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "流量类型": self.data.get("flow_title", "通用流量"),
            "主套餐名称": self.data.get("package_name", "5G畅爽冰激凌"),
            "本月已用流量": f"{self.data.get('flow_used_gb', 0.0)} GB",
            "本月超出流量": f"{self.data.get('flow_exceed', 0.0)} MB",
            "剩余定向流量": self.data.get("flow_directional", "0 GB"),
            "定向流量分类": self.data.get("flow_directional_title", "定向/专属流量"),
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }
        if self.data.get("card_flow_usage"):
            for num, usage in self.data["card_flow_usage"].items():
                attrs[f"成员卡({num})已用"] = usage
        if self.data.get("flow_packages"):
            attrs["流量包明细"] = self.data["flow_packages"]
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
        )
        super().__init__(coordinator, CARRIER_UNICOM, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("voice_remain", "无数据")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "语音类型": self.data.get("voice_title", "剩余语音"),
            "套餐通话总额": f"{self.data.get('voice_total', 0)} 分钟",
            "本月已用语音": f"{self.data.get('voice_used', 0)} 分钟",
            "本月超出语音": f"{self.data.get('voice_exceed', 0)} 分钟",
            "数据截至": self.data.get("flush_time", ""),
            "运营商": "中国联通",
        }
        if self.data.get("card_voice_usage"):
            for num, usage in self.data["card_voice_usage"].items():
                attrs[f"成员卡({num})已用"] = usage
        if self.data.get("voice_packages"):
            attrs["语音包明细"] = self.data["voice_packages"]
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
        return {
            "套餐短信总额": f"{self.data.get('sms_total', 0)} 条",
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
        return "正常"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "手机号": self.phone,
            "运营商": "中国联通",
            "滚动保活": "每3分钟自动续期",
            "脱敏号码": self.data.get("desmobile", ""),
            "截至统计": self.data.get("flush_time", ""),
        }


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


def get_unicom_sensors(coordinator, phone: str) -> List[BaseCarrierSensor]:
    """生成该联通手机号下的专属传感器实例 (全量规范注册，统一 12 个实体)"""
    return [
        UnicomPhoneSensor(coordinator, phone),
        UnicomRealNameSensor(coordinator, phone),
        UnicomCustNameSensor(coordinator, phone),
        UnicomMemberLevelSensor(coordinator, phone),
        UnicomSpeedServiceSensor(coordinator, phone),
        UnicomBalanceSensor(coordinator, phone),
        UnicomFlowRemainSensor(coordinator, phone),
        UnicomVoiceRemainSensor(coordinator, phone),
        UnicomSmsRemainSensor(coordinator, phone),
        UnicomLocationSensor(coordinator, phone),
        UnicomAccountSensor(coordinator, phone),
        UnicomLastUpdateSensor(coordinator, phone),
    ]

