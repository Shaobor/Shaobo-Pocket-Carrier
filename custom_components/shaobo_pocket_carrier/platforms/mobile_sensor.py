# -*- coding: utf-8 -*-
"""中国移动专属传感器模块 (独立隔离)"""
import re
import time
from typing import Any, Dict, List, Optional

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntityDescription,
    SensorStateClass,
)

from ..const import (
    CARRIER_MOBILE,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL_MOBILE,
    SENSOR_ACCOUNT_STATUS,
    SENSOR_BALANCE,
    SENSOR_CHARGE,
    SENSOR_FLOW_REMAIN,
    SENSOR_INTEGRAL,
    SENSOR_LAST_UPDATE,
    SENSOR_LOCATION,
    SENSOR_ONLINE,
    SENSOR_PHONE,
    SENSOR_REAL_NAME,
    SENSOR_STAR_LEVEL,
    SENSOR_VOICE_REMAIN,
)
from .base import BaseCarrierSensor, BaseOnlineSensor
from ..phone_region import (
    db_status as _region_db_status,
)


def _get_mobile_interval_desc(coordinator) -> str:
    """获取移动实际生效的刷新间隔描述 (如 '10 分钟')"""
    mins = DEFAULT_SCAN_INTERVAL_MOBILE
    if hasattr(coordinator, "update_interval") and coordinator.update_interval:
        mins = int(coordinator.update_interval.total_seconds() // 60)
    elif hasattr(coordinator, "entry") and coordinator.entry:
        try:
            mins = int(coordinator.entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL_MOBILE))
        except Exception:
            mins = DEFAULT_SCAN_INTERVAL_MOBILE
    return f"{mins} 分钟"


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



class MobilePhoneSensor(BaseCarrierSensor):
    """移动手机号码"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_PHONE,
            name="手机号码",
            icon="mdi:phone",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        return self.phone

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        masked = f"{self.phone[:3]}****{self.phone[-4:]}" if len(self.phone) == 11 else self.phone
        loc = str(self.data.get("location") or "")
        if not loc or any(kw in loc for kw in ("*", "室", "号楼", "单元")):
            try:
                from ..phone_region import get_index
                index = get_index()
                if index is not None:
                    info = index.query(self.phone)
                    if info is not None:
                        prov = info.get("province", "")
                        city = info.get("city", "")
                        loc = f"{prov} {city}" if prov and city and prov != city else (prov or city or "中国移动")
            except Exception:
                loc = "中国移动"

        attrs = {
            "运营商": "中国移动",
            "卡槽角色": "主号 (主卡)",
            "脱敏号码": masked,
            "归属省市": loc,
            "截至统计": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if self.data.get("address"):
            attrs["登记地址"] = self.data.get("address")
        return attrs


class MobileBalanceSensor(BaseCarrierSensor):
    """移动话费余额"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_BALANCE,
            name="话费余额",
            icon="mdi:wallet",
            native_unit_of_measurement="元",
            device_class=SensorDeviceClass.MONETARY,
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        val = self.data.get("balance")
        return round(float(val), 2) if val is not None else 0.0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        cur_fee = self.native_value or 0.0
        charge = round(float(self.data.get("charge") or 0.0), 2)
        owed = bool(self.data.get("owed"))
        owe_fee = round(float(self.data.get("owe_fee") or 0.0), 2)
        return {
            "当前可用话费": f"{cur_fee} 元",
            "当前状态": "欠费" if owed else "正常",
            "本月消费": f"{charge} 元",
            "是否欠费": "是" if owed else "否",
            "欠费金额": f"{owe_fee} 元",
            "运营商": "中国移动",
            "数据截至": self.data.get("last_update", ""),
        }


class MobileChargeSensor(BaseCarrierSensor):
    """移动本月消费"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_CHARGE,
            name="本月消费",
            icon="mdi:cash-minus",
            native_unit_of_measurement="元",
            device_class=SensorDeviceClass.MONETARY,
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        val = self.data.get("charge")
        return round(float(val), 2) if val is not None else 0.0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "本月消费": f"{self.native_value or 0.0} 元",
            "运营商": "中国移动",
            "数据截至": self.data.get("last_update", ""),
        }


class MobileFlowSensor(BaseCarrierSensor):
    """移动剩余通用流量"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_FLOW_REMAIN,
            name="剩余通用流量",
            icon="mdi:signal-cellular-3",
            native_unit_of_measurement="GB",
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> Optional[float]:
        val = self.data.get("flow_remain")
        return round(float(val), 2) if val is not None else 0.0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        rem = self.native_value or 0.0
        used = round(float(self.data.get("flow_used") or 0.0), 2)
        tot = round(float(self.data.get("flow_total") or 0.0), 2)
        percent = round(rem / tot * 100, 1) if tot > 0 else 0.0

        attrs: Dict[str, Any] = {
            "本月剩余流量": f"{rem} GB",
            "本月已用流量": f"{used} GB",
            "套餐流量总额": f"{tot} GB",
            "剩余流量占比": percent,
            "流量池类型": "中国移动通用流量",
            "运营商": "中国移动",
            "数据截至": self.data.get("last_update", ""),
        }
        # 写入本机及家庭成员用量属性供卡片解析显示手机号与图例
        masked = f"{self.phone[:3]}****{self.phone[-4:]}" if len(self.phone) == 11 else self.phone
        attrs[f"本机 ({masked})"] = f"{used} GB"
        attrs[f"本机 ({self.phone})"] = f"{used} GB"
        flow_members = self.data.get("flow_members") or self.data.get("card_flow_usage")
        if flow_members:
            if isinstance(flow_members, dict):
                for num, u_val in flow_members.items():
                    is_self = self.phone in num or (len(num) >= 4 and num.endswith(self.phone[-4:]))
                    lbl = "本机" if is_self else "副卡"
                    attrs[f"{lbl} ({num})"] = u_val if "GB" in str(u_val) or "MB" in str(u_val) else f"{u_val} GB"
            elif isinstance(flow_members, list):
                for m in flow_members:
                    lbl = m.get("label", "副卡")
                    num = m.get("phone", "")
                    u_val = m.get("used_gb", 0.0)
                    attrs[f"{lbl} ({num})"] = f"{u_val} GB"

        # 写入流量包明细以供卡片解析
        pkgs = self.data.get("flow_packages") or []
        for i, pkg in enumerate(pkgs, 1):
            attrs[f"流量包{i}"] = pkg
        return attrs


class MobileVoiceSensor(BaseCarrierSensor):
    """移动剩余语音"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_VOICE_REMAIN,
            name="剩余语音",
            icon="mdi:phone-in-talk",
            native_unit_of_measurement="分钟",
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        val = self.data.get("voice_remain")
        return int(val) if val is not None else 0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        rem = self.native_value or 0
        used = int(self.data.get("voice_used") or 0)
        tot = int(self.data.get("voice_total") or 0)
        percent = round(rem / tot * 100, 1) if tot > 0 else 0.0

        attrs: Dict[str, Any] = {
            "本月剩余时长": f"{rem} 分钟",
            "本月已用时长": f"{used} 分钟",
            "套餐通话总额": f"{tot} 分钟",
            "本月剩余占比": percent,
            "通话范围": "国内通用",
            "运营商": "中国移动",
            "数据截至": self.data.get("last_update", ""),
        }
        masked = f"{self.phone[:3]}****{self.phone[-4:]}" if len(self.phone) == 11 else self.phone
        attrs[f"本机 ({masked})"] = f"{used} 分钟"
        attrs[f"本机 ({self.phone})"] = f"{used} 分钟"
        voice_members = self.data.get("voice_members") or self.data.get("card_voice_usage")
        if voice_members:
            if isinstance(voice_members, dict):
                for num, u_val in voice_members.items():
                    is_self = self.phone in num or (len(num) >= 4 and num.endswith(self.phone[-4:]))
                    lbl = "本机" if is_self else "副卡"
                    attrs[f"{lbl} ({num})"] = u_val if "分钟" in str(u_val) else f"{u_val} 分钟"
            elif isinstance(voice_members, list):
                for m in voice_members:
                    lbl = m.get("label", "副卡")
                    num = m.get("phone", "")
                    u_val = m.get("used_mins", 0)
                    attrs[f"{lbl} ({num})"] = f"{u_val} 分钟"

        pkgs = self.data.get("voice_packages") or []
        for i, pkg in enumerate(pkgs, 1):
            attrs[f"语音包{i}"] = pkg
        return attrs


class MobileIntegralSensor(BaseCarrierSensor):
    """移动会员积分"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_INTEGRAL,
            name="积分",
            icon="mdi:star-face",
            native_unit_of_measurement="分",
            state_class=SensorStateClass.TOTAL,
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> Optional[int]:
        val = self.data.get("integral")
        return int(val) if val is not None else 0

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        pts = self.native_value or 0
        return {
            "可用积分": f"{pts} 分",
            "积分": pts,
            "积分体系": "中国移动全球通/动感地带积分",
            "兑换特权": "可兑换移动商城话费券、流量包或生活礼品",
            "运营商": "中国移动",
        }


class MobileRealNameSensor(BaseCarrierSensor):
    """移动机主姓名与网龄"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_REAL_NAME,
            name="机主姓名",
            icon="mdi:account-check",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        name = self.data.get("real_name")
        if name and str(name).strip():
            return str(name).strip()
        return "已实名"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "机主姓名": self.native_value,
            "实名认证状态": "已通过",
            "在网网龄": self.data.get("user_age", ""),
            "入网时间": self.data.get("user_begin", ""),
            "用户星级": self.data.get("star_level", "0星级"),
            "所属网络": "中国移动",
            "运营商": "中国移动",
        }
        if self.data.get("address"):
            attrs["登记地址"] = self.data.get("address")
        if self.data.get("business_hall"):
            attrs["办卡营业厅"] = self.data.get("business_hall")
        return attrs


class MobileStarLevelSensor(BaseCarrierSensor):
    """移动用户星级"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_STAR_LEVEL,
            name="用户星级",
            icon="mdi:star-shooting",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("star_level", "0星级")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "用户星级": self.native_value,
            "星级特权": "中国移动星级客户专享服务",
            "运营商": "中国移动",
        }


class MobileLocationSensor(BaseCarrierSensor):
    """移动号码归属地"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LOCATION,
            name="号码归属地",
            icon="mdi:map-marker-radius",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        loc = str(self.data.get("location") or "")
        if loc and loc != "中国移动" and not any(kw in loc for kw in ("*", "室", "号楼", "单元", "小区")):
            return loc
        try:
            from ..phone_region import get_index
            index = get_index()
            if index is not None:
                info = index.query(self.phone)
                if info is not None:
                    prov = info.get("province", "")
                    city = info.get("city", "")
                    if prov and city:
                        return f"{prov} {city}" if prov != city else prov
                    if prov or city:
                        return prov or city
        except Exception:
            pass
        return "中国移动"

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        attrs = {
            "所属省市": self.native_value,
            "网络类型": "5G/4G",
            "运营商": "中国移动",
        }
        if self.data.get("address"):
            attrs["详细地址"] = self.data.get("address")
        if self.data.get("business_hall"):
            attrs["办卡营业厅"] = self.data.get("business_hall")
        return attrs


class MobileAccountStatusSensor(BaseCarrierSensor):
    """移动账户状态"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_ACCOUNT_STATUS,
            name="账户状态",
            icon="mdi:check-decagram",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("account_status", "正常在网")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        owed = bool(self.data.get("owed"))
        return {
            "是否欠费": "是" if owed else "否",
            "欠费金额": f"{self.data.get('owe_fee', 0.0)} 元",
            "运营商": "中国移动",
        }


class MobileOnlineSensor(BaseOnlineSensor):
    """移动在线状态"""

    def __init__(self, coordinator, phone: str):
        super().__init__(coordinator, CARRIER_MOBILE, phone)

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        is_online = self.native_value == "在线"
        return {
            "状态说明": "会话正常，数据定时同步中" if is_online else "移动 Cookie 已失效，请在选项中更新",
            "登录态": "有效" if is_online else "失效",
            "最近刷新成功": "是" if bool(self.data) else "否",
            "轮询间隔": _get_mobile_interval_desc(self.coordinator),
            "运营商": "中国移动",
        }


class MobileLastUpdateSensor(BaseCarrierSensor):
    """移动数据最近更新时间"""

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_LAST_UPDATE,
            name="数据最近更新",
            icon="mdi:clock-check-outline",
        )
        super().__init__(coordinator, CARRIER_MOBILE, phone, desc)

    @property
    def native_value(self) -> str:
        return self.data.get("last_update") or time.strftime("%Y-%m-%d %H:%M:%S")

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        return {
            "轮询间隔": _get_mobile_interval_desc(self.coordinator),
            "运营商": "中国移动",
        }


def get_mobile_sensors(coordinator, phone: str, entry=None) -> List[Any]:
    """生成移动手机号的专属传感器列表"""
    return [
        MobilePhoneSensor(coordinator, phone),
        MobileBalanceSensor(coordinator, phone),
        MobileChargeSensor(coordinator, phone),
        MobileFlowSensor(coordinator, phone),
        MobileVoiceSensor(coordinator, phone),
        MobileIntegralSensor(coordinator, phone),
        MobileRealNameSensor(coordinator, phone),
        MobileStarLevelSensor(coordinator, phone),
        MobileLocationSensor(coordinator, phone),
        MobileAccountStatusSensor(coordinator, phone),
        MobileOnlineSensor(coordinator, phone),
        MobileLastUpdateSensor(coordinator, phone),
    ]

