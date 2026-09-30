# -*- coding: utf-8 -*-
"""中国电信专属传感器模块 (独立隔离，全量对齐高标准属性与 12 核心实体)"""
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
    normalize_net_daily,
    normalize_net_record,
    normalize_record,
    normalize_sms_daily,
    normalize_sms_record,
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
    SENSOR_SMS_RECORD,
    SENSOR_NET_RECORD,
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
        # 登录失效时不要按旧余额算出"正常"，否则会与「在线状态=离线」自相矛盾
        if self.data.get("login_expired"):
            return "登录已失效 (需重新登录)"
        bal = self.data.get("balance", 0.0)
        return "欠费" if (bal or 0.0) < 0 else "正常"

    @property
    def icon(self) -> str:
        if self.data.get("login_expired"):
            return "mdi:account-off"
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


# =====================================================================
# 详单类传感器 (短信 / 上网流量)
#
# 三类详单(语音/短信/上网)共用同一个接口与同一次二次认证、同一个查询区间，
# 因此授权状态、数据来源、缓存兜底逻辑完全一致，差别只在清单结构与摘要。
# 摘要放状态、清单 + 按天汇总 + 合计放属性 (属性过大时 HA 不入库，实时读取不受影响)。
# =====================================================================
class _DetailRecordSensor(BaseCarrierSensor):
    """详单传感器公共实现"""

    _prefix = "sms"                 # 数据字典前缀 (sms_ / net_)
    _label = "短信"                 # 摘要里的名称
    _list_attr = "短信记录"          # 明细清单属性名
    _daily_attr = "按天汇总"
    _idle_icon = "mdi:file-document-outline"
    # 属性裁剪: 子类可声明只保留哪些字段 (None = 全部保留)
    # 元素写法: "字段名" 表示同名取值; ("输出名", "来源字段") 可改名取值 (如 fee 取数值 fee_yuan)
    _record_projection: Optional[tuple] = None
    _daily_projection: Optional[tuple] = None
    # 是否输出"记录条数 / 汇总天数"这类统计 (短信侧由「合计」承担, 不再重复)
    _show_meta_counts = True

    # ---------------- 子类实现 ----------------
    def _normalize_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def _normalize_daily(self, record: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def _summary(self) -> str:
        raise NotImplementedError

    def _extra_detail_attrs(self) -> Dict[str, Any]:
        return {}

    def _total_display(self) -> Dict[str, Any]:
        """「合计」节点内容 (子类可精简)"""
        return self._total

    @staticmethod
    def _project(record: Dict[str, Any], fields: Optional[tuple]) -> Dict[str, Any]:
        """按字段清单裁剪记录 (fields 为 None 时原样返回)

        元素可为 "字段名"(同名取值) 或 ("输出名", "来源字段")(改名/取数值版本),
        例如 ("fee", "fee_yuan") 让 fee 输出纯数字(元)。
        """
        if not fields or not isinstance(record, dict):
            return record
        projected: Dict[str, Any] = {}
        for item in fields:
            if isinstance(item, (tuple, list)) and len(item) == 2:
                projected[item[0]] = record.get(item[1])
            else:
                projected[item] = record.get(item)
        return projected

    # ---------------- 公共数据 ----------------
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
        """查询区间所属月份: "2026-09-01" -> "9月" / "2026年9月" """
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
            or "未知"
        )

    # ---------------- 实体状态 ----------------
    @property
    def native_value(self) -> str:
        if self._records:
            return self._summary()
        if self.data.get("call_need_auth"):
            return "详单授权已过期 (需重新认证)"
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
        rem_min = self.data.get("call_auth_remaining_minutes", 0)
        from_cache = bool(self.data.get(f"{self._prefix}_data_from_cache"))
        if from_cache:
            saved_at = str(self.data.get(f"{self._prefix}_cache_saved_at_text") or "").strip()
            data_source = f"本地缓存 (缓存于 {saved_at})" if saved_at else "本地缓存"
        else:
            data_source = "实时接口"

        attrs: Dict[str, Any] = {
            "运营商": "中国电信",
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
            attrs["缓存说明"] = (
                "详单二次认证已过期，当前展示本地缓存的历史数据；重新认证后可拉取最新数据"
            )
        return attrs


class TelecomSmsRecordSensor(_DetailRecordSensor):
    """电信短信记录 (短信详单 type=2) → sensor.<手机号>_sms"""

    _prefix = "sms"
    _label = "短信"
    _list_attr = "短信记录"
    _idle_icon = "mdi:message-text-clock-outline"
    # 只保留卡片/自动化真正会用到的字段 (其余信息在原始缓存里, 需要时可随时放开)
    # fee 取数值版本(fee_yuan), 不带"元"
    _record_projection = (
        "datetime", "phone_number", "type", ("fee", "fee_yuan"),
        "number_location", "number_isp", "number_location_coordinate",
    )
    # 每天(按方向)一行: date / count / type / fee(纯数字, 元)
    _daily_projection = ("date", "count", "type", "fee")
    # 条数已在「合计」里, 不再重复输出"记录条数/汇总天数"
    _show_meta_counts = False

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_SMS_RECORD,
            name="短信记录",
            icon="mdi:message-text-clock-outline",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

    def _normalize_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_sms_record(record)

    def _normalize_daily(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return normalize_sms_daily(record)

    def _counts(self) -> tuple:
        """(发送条数, 接收条数)"""
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
        """合计: 只给条数(含发送/接收)与金额, 金额为纯数字(元)"""
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


class TelecomNetRecordSensor(_DetailRecordSensor):
    """电信上网记录 (上网流量详单 type=3) → sensor.<手机号>_traffic"""

    _prefix = "net"
    _label = "上网"
    _list_attr = "上网会话清单"
    _idle_icon = "mdi:chart-timeline-variant"
    # 会话清单: 只保留时间/流量/时长/费用(纯数字,元)/业务类型
    _record_projection = (
        "datetime", "volume_mb", "duration_seconds", ("fee", "fee_yuan"), "business_type",
    )
    # 按天汇总: 日期/流量/时长/费用(纯数字,元)/会话数
    _daily_projection = (
        "date", "volume_mb", "duration_seconds", ("fee", "fee_yuan"), "sessions",
    )

    def __init__(self, coordinator, phone: str):
        desc = SensorEntityDescription(
            key=SENSOR_NET_RECORD,
            name="上网记录",
            icon="mdi:chart-timeline-variant",
        )
        super().__init__(coordinator, CARRIER_TELECOM, phone, desc)

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

    def _extra_detail_attrs(self) -> Dict[str, Any]:
        sort_options = [
            str(item.get("title"))
            for item in (self.data.get("net_sort_list") or [])
            if isinstance(item, dict) and item.get("title")
        ]
        filter_options = [
            str(item.get("filterGroupName"))
            for item in (self.data.get("net_filter_list") or [])
            if isinstance(item, dict) and item.get("filterGroupName")
        ]
        return {
            "合计用量": self._fmt_mb(self.total_volume_mb),
            "合计时长": self._fmt_duration(self.total_duration_seconds),
            "排序选项": sort_options,
            "筛选选项": filter_options,
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
        TelecomOnlineSensor(coordinator, phone),
        TelecomLastUpdateSensor(coordinator, phone),
        TelecomCallRecordSensor(coordinator, phone),
        TelecomSmsRecordSensor(coordinator, phone),
        TelecomNetRecordSensor(coordinator, phone),
    ]


class TelecomOnlineSensor(BaseOnlineSensor):
    """电信账号在线状态 (在线/离线/未知)，会作为节点合并进「数据总览」实体"""

    def __init__(self, coordinator, phone: str):
        super().__init__(coordinator, CARRIER_TELECOM, phone)


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
        # 授权过期时若本地缓存有流水，仍然展示最近一次通话，避免数据凭空消失
        last = self.data.get("last_call") or {}
        if last.get("call_time"):
            target = last.get("phone_number") or last.get("calle_no") or "未知"
            call_dir = normalize_record(last).get("type", "")
            return f"{call_dir} {target} ({last.get('duration', '')})"
        if self.data.get("call_need_auth"):
            return "详单授权已过期 (需重新认证)"
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
        # 统一字段结构 (兼容旧缓存键名并补齐归属地/运营商)
        masked_list = [normalize_record(r) for r in records if isinstance(r, dict)]
        auth_status = self.data.get("call_auth_status") or ("已过期 (需重新认证)" if self.data.get("call_need_auth") else "有效")
        rem_min = self.data.get("call_auth_remaining_minutes", 0)

        # 数据来源: 实时接口 / 本地缓存兜底
        from_cache = bool(self.data.get("call_data_from_cache"))
        if from_cache:
            cache_saved_at = str(self.data.get("call_cache_saved_at_text") or "").strip()
            data_source = f"本地缓存 (缓存于 {cache_saved_at})" if cache_saved_at else "本地缓存"
        else:
            data_source = "实时接口"

        last = self.data.get("last_call") or {}
        last_formatted = (
            normalize_record(last)
            if isinstance(last, dict) and last.get("call_time")
            else {}
        )

        attrs = {
            "运营商": "中国电信",
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
            attrs["缓存说明"] = "详单二次认证已过期，当前展示本地缓存的历史流水；重新认证后可拉取最新数据"
        return attrs
