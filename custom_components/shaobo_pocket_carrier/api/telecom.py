import hashlib
import base64
import json
import os
import random
import string
import time
import datetime
import calendar
import uuid
import io
import logging
import re
from typing import Any, Dict, List, Optional
import requests
import numpy as np
from PIL import Image
from Crypto.Cipher import AES, PKCS1_v1_5, DES3
from Crypto.Util.Padding import pad
from Crypto.PublicKey import RSA

from ..const import CarrierAuthExpiredError

_LOGGER = logging.getLogger(__name__)


def enrich_call_records(records) -> None:
    """用本地 phone2region 归属地库补充 number_location / number_isp

    归属地只是附加信息: 库缺失、损坏或解析异常时静默跳过，绝不影响通话记录本体。
    """
    try:
        from ..phone_region import enrich_records, get_index

        enrich_records(get_index(), records)
    except Exception as err:
        _LOGGER.debug("补充号码归属地失败(已跳过): %s", err)


# =====================================================================
# 详单解析 (短信详单 / 上网流量详单)
#
# 三类详单走同一个接口 query/queryDetailsV2，用 type 区分并共用同一次二次认证：
#   type=1 语音  -> data.voiceDetail        (voiceDetailList)
#   type=2 短信  -> data.shortMessageDetail
#   type=3 上网  -> data.trafficDetail      (trafficDetailList / trafficDetailSecList / trafficDetailTotalList)
#   type=4 增值业务费 -> data.addedSerDedDetail        (type=5 起接口直接报"第3方系统业务失败")
# 实测样例(2026-09-30)见 _pr/body.md；短信侧结构与流量对称，但本机号码当月无短信记录，
# 因此短信解析写成"防御式"：自动识别列表键与字段别名，未知字段原样保留。
# =====================================================================
_DETAIL_TIME_RE = re.compile(
    r"(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})[日]?\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?"
)
_DETAIL_DATE_RE = re.compile(r"(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})[日]?")


def _ascii_decrypt(raw: str) -> str:
    """电信 App 逆向算法 ASCIIDencrypt: 每位字符 ASCII 码减 2 (对方号码)"""
    if not raw or not isinstance(raw, str):
        return ""
    try:
        return "".join(chr(ord(c) - 2) for c in raw)
    except Exception:
        return raw


def _looks_encrypted(raw: str) -> bool:
    """"13363902861" 被加密后是 "3778612:83" 这种形态 —— 含非数字字符才需要还原"""
    text = str(raw or "")
    return bool(text) and not text.isdigit() and not text.startswith("+")


def _format_detail_time(raw, default_year: int) -> str:
    """"9月30日 09:51:03" -> "2026-09-30 09:51:03" (无法解析时返回原文)"""
    text = str(raw or "").strip()
    if not text:
        return ""
    m = _DETAIL_TIME_RE.search(text)
    if not m:
        return text
    year = int(m.group(1)) if m.group(1) else default_year
    return "%04d-%02d-%02d %02d:%02d:%02d" % (
        year, int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)),
        int(m.group(6) or 0),
    )


def _format_detail_date(raw, default_year: int) -> str:
    """按天汇总里的 "9月30日" -> "2026-09-30" (已规范则原样返回)"""
    text = str(raw or "").strip()
    if not text:
        return ""
    m = _DETAIL_DATE_RE.fullmatch(text)
    if not m:
        m = _DETAIL_DATE_RE.search(text)
    if not m:
        return text
    year = int(m.group(1)) if m.group(1) else default_year
    return "%04d-%02d-%02d" % (year, int(m.group(2)), int(m.group(3)))


def _parse_volume_mb(text) -> float:
    """流量文本 -> MB (二进制换算, 与运营商口径一致): "58.99MB"/"59KB"/"1.69GB" """
    raw = str(text or "").strip().upper()
    if not raw:
        return 0.0
    m = re.search(r"([\d.]+)\s*(TB|GB|MB|KB|B)?", raw)
    if not m:
        return 0.0
    try:
        value = float(m.group(1))
    except (TypeError, ValueError):
        return 0.0
    return value * {"TB": 1024 * 1024, "GB": 1024, "MB": 1, "KB": 1 / 1024, "B": 1 / (1024 * 1024)}.get(
        m.group(2) or "MB", 1
    )


def _parse_duration_seconds(text) -> int:
    """"2小时20分" / "56分20秒" / "24秒" / "上网时长 56分20秒" -> 秒"""
    raw = str(text or "")
    if not raw:
        return 0
    total = 0
    found = False
    for pattern, unit in ((r"(\d+)\s*小时", 3600), (r"(\d+)\s*分", 60), (r"(\d+)\s*秒", 1)):
        m = re.search(pattern, raw)
        if m:
            total += int(m.group(1)) * unit
            found = True
    if not found:
        m = re.search(r"(\d+)", raw)
        if m and "时" in raw:      # 形如 "17" 小时的合计值
            total = int(m.group(1)) * 3600
    return total


def _parse_yuan(text) -> float:
    """费用文本 -> 元: "0元" / "1.50元" / "0" """
    m = re.search(r"([\d.]+)", str(text or ""))
    if not m:
        return 0.0
    try:
        return float(m.group(1))
    except (TypeError, ValueError):
        return 0.0


def _strip_label(text, *labels) -> str:
    """去掉运营商自带的中文标签: "使用业务: 普通流量" -> "普通流量" """
    result = str(text or "").strip()
    for label in labels:
        if label and result.startswith(label):
            result = result[len(label):].lstrip(" :：")
    return result.strip()


def _pick_rows(container: Dict[str, Any]) -> List[Dict[str, Any]]:
    """从详单容器里挑出"记录列表" (排除合计/二级明细列表)"""
    if not isinstance(container, dict):
        return []
    for key, value in container.items():
        if not isinstance(value, list) or not value:
            continue
        low = str(key).lower()
        if "total" in low or "sec" in low:
            continue
        if isinstance(value[0], dict):
            return value
    return []


def _pick_total_items(container: Dict[str, Any]) -> List[Dict[str, Any]]:
    """从详单容器里挑出"合计"块 (title/value/unit 结构的列表)"""
    if not isinstance(container, dict):
        return []
    for key, value in container.items():
        if isinstance(value, list) and value and isinstance(value[0], dict) and "total" in str(key).lower():
            return value
    return []


def _total_map(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """合计块 -> 结构化字典 (按 title 归类)；没有任何合计项时返回空字典"""
    result: Dict[str, Any] = {}
    if items:
        result["items"] = items
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if "用量" in title:
            result["volume"] = str(item.get("value", ""))
            result["volume_unit"] = str(item.get("unit", ""))
            result["volume_mb"] = _parse_volume_mb(f"{item.get('value', '')}{item.get('unit', '')}")
        elif "时长" in title:
            hours = _parse_yuan(item.get("value"))
            minutes = _parse_yuan(item.get("subValue"))
            result["duration_hours"] = int(hours)
            result["duration_minutes"] = int(minutes)
            result["duration_seconds"] = int(hours) * 3600 + int(minutes) * 60
            result["duration"] = f"{int(hours)}小时{int(minutes)}分"
        elif "费用" in title:
            result["fee"] = str(item.get("value", ""))
            result["fee_unit"] = str(item.get("unit", ""))
            result["fee_yuan"] = _parse_yuan(item.get("value"))
        elif "条数" in title or "次数" in title or "短信" in title:
            result["count"] = int(_parse_yuan(item.get("value")))
            result["count_unit"] = str(item.get("unit", ""))
    return result


def _parse_traffic_detail(container: Dict[str, Any], year: int) -> Dict[str, Any]:
    """上网流量详单 -> {records(会话明细), daily(按天), total(合计), count}

    实测结构: trafficDetailList[].trafficDetailSecList[] + trafficDetailTotalList[]
    """
    records: List[Dict[str, Any]] = []
    daily: List[Dict[str, Any]] = []
    for day in _pick_rows(container):
        date_text = str(day.get("date", "") or "")
        date_value = _format_detail_date(date_text, year)
        volume_by_day = str(day.get("volumeByDay", "") or "")
        daily.append({
            "date": date_value,
            "date_text": date_text,
            "volume": volume_by_day,
            "volume_mb": _parse_volume_mb(volume_by_day),
            "duration": str(day.get("durationByDay", "") or ""),
            "duration_seconds": _parse_duration_seconds(day.get("durationByDay")),
            "fee": str(day.get("feeByDay", "") or ""),
            "fee_yuan": _parse_yuan(day.get("feeByDay")),
            "sessions": len(day.get("trafficDetailSecList") or []),
        })
        for row in (day.get("trafficDetailSecList") or []):
            if not isinstance(row, dict):
                continue
            time_text = str(row.get("time", "") or "")
            records.append({
                "date": date_value,
                "time": time_text,
                "datetime": f"{date_value} {time_text}".strip(),
                "volume": str(row.get("volume", "") or ""),
                "volume_mb": _parse_volume_mb(row.get("volume")),
                "duration": _strip_label(row.get("duration", ""), "上网时长"),
                "duration_seconds": _parse_duration_seconds(row.get("duration")),
                "fee": str(row.get("fee", "") or ""),
                "fee_yuan": _parse_yuan(row.get("fee")),
                "business_type": _strip_label(row.get("businessType", ""), "使用业务"),
                "day_volume": volume_by_day,
            })
    total = _total_map(_pick_total_items(container))
    return {"records": records, "daily": daily, "total": total}


_SMS_TIME_KEYS = ("time", "callTime", "smsTime", "sendTime", "startTime", "datetime", "date")
_SMS_NUMBER_KEYS = ("oppositeNumber", "calleNo", "otherNumber", "number", "phoneNumber",
                    "calledNo", "callNo", "oppositeNo", "peerNumber", "smsNumber")
_SMS_TYPE_KEYS = ("type", "smsType", "callType", "direction", "sendType", "smsDirection")
_SMS_COUNT_KEYS = ("count", "smsCount", "amount", "num", "numberCount", "piece")
_SMS_FEE_KEYS = ("fee", "totalCharge", "charge", "totalFee", "feeByDay")
_SMS_ALIAS_KEYS = frozenset(
    _SMS_TIME_KEYS + _SMS_NUMBER_KEYS + _SMS_TYPE_KEYS + _SMS_COUNT_KEYS + _SMS_FEE_KEYS
)
_ONLY_TIME_RE = re.compile(r"^\d{1,2}:\d{1,2}(?::\d{1,2})?$")


def _first_value(row: Dict[str, Any], keys) -> Any:
    for key in keys:
        if row.get(key) not in (None, ""):
            return row[key]
    return ""


def _nested_rows(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """取按天行里的二级明细列表 (如 *SecList), 没有则返回空"""
    for key, value in row.items():
        if isinstance(value, list) and value and isinstance(value[0], dict) and "sec" in str(key).lower():
            return [v for v in value if isinstance(v, dict)]
    return []


def _normalize_detail_number(raw: Any) -> str:
    """详单里的号码一律按 ASCIIDencrypt(每字符 -2) 还原 (与通话记录 calleNo 同一套算法)

    还原结果不像号码时退回原值, 避免把明文号码改坏。
    """
    text = str(raw or "").strip()
    if not text:
        return ""
    decoded = _ascii_decrypt(text)
    if re.fullmatch(r"[+\d\-\s]{4,24}", decoded):
        return decoded.strip()
    return text


def _parse_sms_detail(container: Dict[str, Any], year: int) -> Dict[str, Any]:
    """短信详单 -> {records, daily, total}

    本机号码当月无短信记录，拿不到真实字段样例，因此按"防御式"解析：
    - 自动识别容器里的记录列表键（与流量侧对称时是 按天行 + *SecList 二级明细）
    - 字段用别名表匹配（时间/对端号码/类型/条数/费用），未知字段原样保留
    - 只有时间(时:分:秒)时, 用所在天的日期补全 datetime
    """
    records: List[Dict[str, Any]] = []
    daily: List[Dict[str, Any]] = []
    for day in _pick_rows(container):
        if not isinstance(day, dict):
            continue
        date_text = str(day.get("date", "") or "")
        date_value = _format_detail_date(date_text or _first_value(day, _SMS_TIME_KEYS), year)
        nested = _nested_rows(day)
        day_fee_raw = _first_value(day, _SMS_FEE_KEYS)
        day_count = int(_parse_yuan(_first_value(day, _SMS_COUNT_KEYS)))
        # 有二级明细时, 按天行的 count/fee 只作为"当日汇总", 不渗进明细
        if nested or day_count or str(day_fee_raw or "").strip():
            daily.append({
                "date": date_value,
                "date_text": date_text or date_value,
                "count": day_count or len(nested),
                "fee": str(day_fee_raw or ""),
                "fee_yuan": _parse_yuan(day_fee_raw),
                "items": len(nested),
            })
        for item in (nested or [day]):
            source = dict(item)
            # 明细里缺日期时, 用所在天补上下文 (只补日期类字段)
            if not _first_value(source, _SMS_TIME_KEYS) and date_text:
                source["date"] = date_text
            time_text = str(_first_value(source, _SMS_TIME_KEYS) or "").strip()
            if _ONLY_TIME_RE.match(time_text):
                datetime_text = f"{date_value} {time_text}".strip()
                row_date = date_value
            else:
                datetime_text = _format_detail_time(time_text, year)
                row_date = _format_detail_date(time_text, year) if datetime_text != time_text else date_value
            number_raw = str(_first_value(source, _SMS_NUMBER_KEYS) or "")
            number = _normalize_detail_number(number_raw)
            record: Dict[str, Any] = {
                "datetime": datetime_text,
                "date": row_date,
                "time": datetime_text[11:] if len(datetime_text) > 10 else "",
                "phone_number": number,
                "type": str(_first_value(source, _SMS_TYPE_KEYS) or ""),
                "count": int(_parse_yuan(_first_value(source, _SMS_COUNT_KEYS))) or 1,
                "fee": str(_first_value(source, _SMS_FEE_KEYS) or ""),
                "fee_yuan": _parse_yuan(_first_value(source, _SMS_FEE_KEYS)),
                "number_location": "",
                "number_isp": "",
                "number_location_coordinate": "",
            }
            if number_raw and number_raw != number:
                record["phone_number_raw"] = number_raw
            # 未知字段原样保留 (便于以后核对真实字段名, 不丢数据)
            for key, value in source.items():
                if key in record or key in _SMS_ALIAS_KEYS or isinstance(value, (dict, list)):
                    continue
                record[key] = value
            records.append(record)
    total = _total_map(_pick_total_items(container))
    if "count" not in total:
        total["count"] = sum(r.get("count", 0) for r in records)
    if "fee_yuan" not in total:
        total["fee_yuan"] = round(sum(r.get("fee_yuan", 0.0) for r in records), 2)
    return {"records": records, "daily": daily, "total": total}


HOST = "https://appgologinsz.189.cn"
SERVICE_HOST = "https://appfuwuhd.189.cn:443"
DEFAULT_TELECOM_MODEL = "iPhone 11 Pro Max"
TELECOM_DEVICE_MODELS = [
    "iPhone 11 Pro Max",
    "iPhone 11 Pro",
    "iPhone 11",
    "iPhone 12 Pro Max",
    "iPhone 12 Pro",
    "iPhone 12",
    "iPhone 13 Pro Max",
    "iPhone 13 Pro",
    "iPhone 13",
    "iPhone 14 Pro Max",
    "iPhone 14 Pro",
    "iPhone 14",
    "iPhone 15 Pro Max",
    "iPhone 15 Pro",
    "iPhone 15",
    "iPhone 16 Pro Max",
    "iPhone 16 Pro",
    "iPhone 16",
]
UA = "P216011001"

RSA_PUB_B64 = (
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnk"
    "aAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI0"
    "9e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB"
)

ENC = lambda s: "".join(chr((ord(c) + 2) & 0xFFFF) for c in (s or ""))
DEC = lambda s: "".join(chr((ord(c) - 2) & 0xFFFF) for c in (s or ""))

def aes_ecb_b64(text: str, key_bytes: bytes) -> str:
    raw = text.encode()
    pad = 16 - len(raw) % 16
    raw += bytes([pad]) * pad
    return base64.b64encode(AES.new(key_bytes, AES.MODE_ECB).encrypt(raw)).decode()

def locate_notch(bg_b64: str, piece_b64: str):
    bg = np.asarray(Image.open(io.BytesIO(base64.b64decode(bg_b64))).convert("L")).astype(np.float32)
    pc = np.asarray(Image.open(io.BytesIO(base64.b64decode(piece_b64))).convert("RGBA"))
    mask = pc[:, :, 3] > 128
    ys, xs = np.where(mask)
    y0 = int(ys.min())
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ph, pw = m.shape
    bh, bw = bg.shape
    ring = ~m
    best = (-1.0, -1, -1)
    for y in range(max(0, y0 - 8), min(bh - ph, y0 + 8) + 1):
        for x in range(0, bw - pw + 1):
            win = bg[y:y + ph, x:x + pw]
            v = float(win[ring].mean() - win[m].mean())
            if v > best[0]:
                best = (v, x, y)
    return best[1], best[2], best[0], pw, bw

class TelecomClient:
    def __init__(self, phone: str, auth_data: dict = None, device_model: str = None):
        self.phone = phone
        self.s = requests.Session()
        self.s.headers.update({
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Accept-Language": "zh-Hans;q=1, zh-Hans-CN;q=0.9, en-CN;q=0.8"
        })
        # 使用基于手机号确定性生成的设备 UID，避免重试或跨步骤导致 UID 不一致引发 121 报错
        self.uid = hashlib.md5(f"CT_IOS_11_{self.phone}".encode()).hexdigest()
        self.token = None
        self.user_id = ""
        self.province_code = "600204"
        self.city_code = "8610100"
        self.province_name = ""
        self.city_name = ""
        self.key = ""
        self.isct = "0"
        self.sign = None
        self.signature_string = ""
        # 确定设备机型：优先 auth_data 中的持久化机型，其次传入的 device_model，最后回退到默认机型
        self.device_model = DEFAULT_TELECOM_MODEL
        if auth_data and auth_data.get("device_model"):
            self.device_model = auth_data["device_model"]
        elif device_model:
            self.device_model = device_model

        self.ct_hdr = f"#13.4.0#channel50#{self.device_model}#"

        if auth_data:
            self.load_auth(auth_data)

    def load_auth(self, auth: dict):
        res = auth.get("loginSuccessResult") or {}
        self.token = res.get("token") or auth.get("token")
        self.user_id = res.get("userId", "")
        self.province_code = res.get("provinceCode", self.province_code)
        self.city_code = res.get("cityCode", self.city_code)
        self.province_name = res.get("provinceName", "")
        self.city_name = res.get("cityName", "")
        self.uid = auth.get("uid", self.uid)
        if auth.get("device_model"):
            self.device_model = auth["device_model"]
            self.ct_hdr = f"#13.4.0#channel50#{self.device_model}#"

    def export_auth(self) -> dict:
        return {
            "phone": self.phone,
            "token": self.token,
            "uid": self.uid,
            "device_model": self.device_model,
            "loginSuccessResult": {
                "token": self.token,
                "userId": self.user_id,
                "provinceCode": self.province_code,
                "cityCode": self.city_code,
                "provinceName": self.province_name,
                "cityName": self.city_name
            }
        }

    def _login_post(self, code, params, hdr_extra=None):
        hdr = {
            "broadAccount": "", "broadToken": "", "fixedLineAccount": "",
            "fixedLineToken": "", "provinceCode": "", "code": code,
            "source": "120002", "sourcePassword": "TiqmIZ",
            "userLoginName": "", "clientType": self.ct_hdr, "token": "",
            "timestamp": time.strftime("%Y%m%d%H%M%S"), "shopId": "20004"
        }
        if hdr_extra:
            hdr.update(hdr_extra)
        body = {"headerInfos": hdr, "content": {"attach": "iPhone", "fieldData": params}}
        r = self.s.post(f"{HOST}/login/client/{code}", json=body, timeout=20)
        return r.json().get("responseData") or {}

    def _service_post(self, path, code, field_data):
        url = f"{SERVICE_HOST}/{path}"
        ts = time.strftime("%Y%m%d%H%M%S")
        body = {
            "headerInfos": {
                "broadAccount": "", "clientType": self.ct_hdr, "fixedLineToken": "",
                "userLoginName": ENC(self.phone), "timestamp": ts, "broadToken": "",
                "fixedLineAccount": "", "provinceCode": self.province_code,
                "source": "120002", "code": code, "sourcePassword": "TiqmIZ",
                "token": self.token, "shopId": "20004"
            },
            "content": {"fieldData": field_data, "attach": "iPhone"}
        }
        r = self.s.post(url, json=body, timeout=20)
        res = r.json()
        hdr = res.get("headerInfos") or {}
        code_str = str(hdr.get("code") or "")
        reason_str = str(hdr.get("reason") or "")
        # 仅当明确是"登录态/鉴权"问题才算登录失效。
        # 注意: 不能只按中文关键词"过期/失效"判定 —— 详单授权等业务性提示同样会带这两个词，
        # 误判会导致整条配置条目进入 setup 失败、所有实体被卸载。
        if code_str in ("1001", "2001", "9999", "X201", "X110") or any(
            k in reason_str.lower()
            for k in ["token", "重新登录", "鉴权失败", "未登录", "登录已失效", "凭证", "会话"]
        ):
            _LOGGER.warning("电信接口返回登录态失效: code=%s, reason=%s", code_str, reason_str)
            raise CarrierAuthExpiredError(f"电信登录凭证已失效 ({code_str}: {reason_str})")
        return hdr, res.get("responseData") or {}

    def _query_detail(
        self, type_value: str, start_date: str, end_date: str, signature: str
    ) -> Dict[str, Any]:
        """调用详单接口 query/queryDetailsV2 (返回 responseData)

        type: 1=语音详单 2=短信详单 3=上网流量详单 4=增值业务费 (5 起接口报"第3方系统业务失败")
        三类详单共用同一次二次认证签名与同一个查询区间 (单月)。
        """
        fd = {
            "account": ENC(self.phone),
            "queryFlag": "1",
            "isChinatelecom": "1",
            "type": str(type_value),
            "startDate": start_date,
            "endDate": end_date,
            "shopId": "20004",
            "phoneType": "69",
            "provinceCode": self.province_code,
            "cityCode": self.city_code,
            "sortId": "",
            "validateType": "1",
            "filterConditions": "",
            "signatureString": signature,
            "accessAuth": "0",
        }
        _, resp = self._service_post("query/queryDetailsV2", "queryDetailsV2", fd)
        return resp if isinstance(resp, dict) else {}

    def probe_token(self) -> str:
        """轻量探活: 判断当前登录态是否仍然有效 (用于"掉线即自动短信登录")

        返回值:
        - "ok"      : 登录凭证有效
        - "expired" : 登录凭证已失效, 需要重新登录
        - "error"   : 网络/接口异常, 无法据此判定掉线 (不应触发登录短信)
        """
        if not self.token:
            return "expired"
        fd = {
            "account": ENC(self.phone), "queryFlag": "1", "provinceCode": self.province_code,
            "cityCode": self.city_code, "shopId": "20004", "accessAuth": "0",
            "developCode": "", "isChinatelecom": "1", "netType": ""
        }
        try:
            self._service_post("query/queryPhoneBillBalance", "queryPhoneBillBalance", fd)
            return "ok"
        except CarrierAuthExpiredError:
            return "expired"
        except Exception as err:
            _LOGGER.debug("电信登录态探活请求异常(视为网络问题): %s", err)
            return "error"

    def send_sms(self) -> bool:
        """全自动识别滑块并秒级下发电信短信验证码"""
        p1 = {"deviceUid": self.uid, "imsi": "", "key": self.key,
              "payType": "", "phoneNum": ENC(self.phone), "salesProdId": "",
              "scene": "55", "signSignatureString": "", "validationCode": ""}
        j1 = self._login_post("getLoginRandomCode", p1)
        data1 = j1.get("data") or {}
        if data1.get("key"):
            self.key = data1["key"]
        if data1.get("isChinatelecom") is not None:
            self.isct = str(data1["isChinatelecom"])

        for attempt in range(5):
            p2 = {"account": ENC(self.phone), "clientType": "1",
                  "deviceUid": ENC(self.uid), "scene": "1"}
            j2 = self._login_post("getSliderVerificationPicture", p2)
            d = j2.get("data") or {}
            bg = d.get("backgroundImg") or d.get("bigImg")
            slider = d.get("sliderImg") or d.get("smallImg")
            if not bg or not slider or not d.get("key") or not d.get("extra"):
                continue

            hx, hy, score, pw, bw = locate_notch(bg, slider)
            dist = hx / (bw - pw)
            kb = base64.b64decode(d["extra"])
            st = int(time.time() * 1000)
            n = 15
            track = "%".join(f"{(hx * i / n) / (bw - pw):.3f}#0.000#{st + i * 40}"
                             for i in range(1, n + 1))
            vp = {
                "account": ENC(self.phone), "clientType": "1",
                "deviceUid": ENC(self.uid),
                "distance": aes_ecb_b64("%.4f" % dist, kb),
                "endTime": aes_ecb_b64("%d" % (st + 600), kb),
                "startTime": aes_ecb_b64("%d" % st, kb),
                "key": d["key"],
                "scene": "1", "shopId": "20004",
                "slidingTrack": aes_ecb_b64(track, kb)
            }
            j = self._login_post("verificationSliderPicture", vp)
            sign = (j.get("data") or {}).get("signSignatureString")
            _LOGGER.info("电信滑块校验响应: %s, sign=%s", j, sign)
            if sign:
                self.sign = sign
                p3 = {"deviceUid": self.uid, "imsi": "", "key": self.key,
                      "payType": "", "phoneNum": ENC(self.phone), "salesProdId": "",
                      "scene": "55", "signSignatureString": sign, "validationCode": ""}
                j3 = self._login_post("getLoginRandomCode", p3)
                data3 = j3.get("data") or {}
                if data3.get("key"):
                    self.key = data3["key"]
                if data3.get("isChinatelecom") is not None:
                    self.isct = str(data3["isChinatelecom"])
                _LOGGER.warning("电信短信下发响应: code=%s, desc=%s, isct=%s, uid=%s",
                                j3.get("resultCode"), j3.get("resultDesc"), self.isct, self.uid)
                desc = str(j3.get("resultDesc") or "")
                if str(j3.get("resultCode")) in ("0", "0000") or "成功" in desc or "60s" in desc or "重复获取" in desc:
                    _LOGGER.warning("电信短信验证码下发成功（或60秒内有效验证码已下发）！")
                    return True
            time.sleep(0.5)
        _LOGGER.warning("电信自动过滑块或下发短信超过最大尝试次数，失败")
        return False

    def login_with_sms(self, code: str) -> bool:
        """短信验证码登录"""
        ts = time.strftime("%Y%m%d%H%M%S")
        pad = lambda s, n: (s or "")[:n].ljust(n, "$")
        model_prefix = (self.device_model or DEFAULT_TELECOM_MODEL)[:10].ljust(10, " ")
        plain = (model_prefix + "16.1." + self.uid[:12]
                 + self.phone[:11] + ts[:14] + pad(code, 6)
                 + pad("0", 4) + pad("0.000000", 2))
        cipher = base64.b64encode(
            PKCS1_v1_5.new(RSA.import_key(base64.b64decode(RSA_PUB_B64)))
            .encrypt(plain.encode())).decode()
        fd = {"accountType": "",
              "authentication": base64.b64encode(ENC(code).encode()).decode(),
              "clientType": "1", "deviceUid": self.uid,
              "isChinatelecom": self.isct or "1",
              "loginAuthCipherAsymmertric": cipher, "loginType": "2",
              "phoneNum": ENC(self.phone), "signSignatureString": "",
              "systemVersion": "16.1.1"}
        j = self._login_post("userLoginNormal", fd,
                      hdr_extra={"userLoginName": ENC(self.phone), "timestamp": ts})
        _LOGGER.warning("电信短信登录 userLoginNormal 响应: code=%s, desc=%s",
                        j.get("resultCode"), j.get("resultDesc"))
        data = j.get("data") or {}
        if data.get("loginSuccessResult"):
            self.load_auth(data)
            _LOGGER.warning("电信短信登录成功，token 已成功获取！")
            return True
        _LOGGER.warning("电信短信登录未成功: %s", j.get("resultDesc") or j)
        return False

    def send_detail_auth_sms(self) -> bool:
        """发送通话详单专属业务短信验证码 (scene 115，短信模板: 您正在中国电信APP查询数据详单业务)"""
        # 1. 自动完成滑块并获取 signSignatureString
        sign = ""
        for attempt in range(5):
            p2 = {"account": ENC(self.phone), "clientType": "1",
                  "deviceUid": ENC(self.uid), "scene": "1"}
            j2 = self._login_post("getSliderVerificationPicture", p2)
            d = j2.get("data") or {}
            bg = d.get("backgroundImg") or d.get("bigImg")
            slider = d.get("sliderImg") or d.get("smallImg")
            if not bg or not slider or not d.get("key") or not d.get("extra"):
                continue

            hx, hy, score, pw, bw = locate_notch(bg, slider)
            dist = hx / (bw - pw)
            kb = base64.b64decode(d["extra"])
            st = int(time.time() * 1000)
            n = 15
            track = "%".join(f"{(hx * i / n) / (bw - pw):.3f}#0.000#{st + i * 40}"
                             for i in range(1, n + 1))
            vp = {
                "account": ENC(self.phone), "clientType": "1",
                "deviceUid": ENC(self.uid),
                "distance": aes_ecb_b64("%.4f" % dist, kb),
                "endTime": aes_ecb_b64("%d" % (st + 600), kb),
                "startTime": aes_ecb_b64("%d" % st, kb),
                "key": d["key"],
                "scene": "1", "shopId": "20004",
                "slidingTrack": aes_ecb_b64(track, kb)
            }
            j = self._login_post("verificationSliderPicture", vp)
            sign = (j.get("data") or {}).get("signSignatureString")
            if sign:
                break
            time.sleep(0.5)

        # 2. 调用电信业务验证码端点 https://appgosz.189.cn:443/query/getRandomCodeWithLogin (scene 115)
        url = "https://appgosz.189.cn:443/query/getRandomCodeWithLogin"
        ts = time.strftime("%Y%m%d%H%M%S")
        body = {
            "headerInfos": {
                "broadAccount": "", "clientType": self.ct_hdr, "fixedLineToken": "",
                "userLoginName": ENC(self.phone), "timestamp": ts, "broadToken": "",
                "fixedLineAccount": "", "provinceCode": self.province_code,
                "source": "120002", "code": "getRandomCodeWithLogin", "sourcePassword": "TiqmIZ",
                "token": self.token, "shopId": "20004"
            },
            "content": {
                "fieldData": {
                    "account": ENC(self.phone),
                    "deviceUid": self.uid,
                    "key": "",
                    "phoneNum": ENC(self.phone),
                    "salesId": "",
                    "scene": "115",
                    "shopId": "20004",
                    "signSignatureString": sign or "",
                    "validationCode": "",
                    "verifyCodeType": ""
                },
                "attach": "iPhone"
            }
        }
        try:
            r = self.s.post(url, json=body, timeout=15)
            res = r.json()
            resp_data = res.get("responseData") or {}
            result_code = str(resp_data.get("resultCode") or "")
            result_desc = str(resp_data.get("resultDesc") or "")
            _LOGGER.warning("电信详单业务验证码下发响应: code=%s, desc=%s", result_code, result_desc)
            return result_code in ("0", "0000") or "成功" in result_desc
        except Exception as e:
            _LOGGER.warning("详单验证码下发请求异常: %s", e)
            return False

    def verify_detail_auth(self, name: str = "", id_card: str = "", sms_code: str = "") -> tuple[bool, str, str]:
        """提交通话详单二次鉴权认证 (query/authentication)"""
        if not self.token:
            return False, "登录凭证缺失，请重新认证电信账号", ""

        clean_name = name.strip()
        if "*" in clean_name:
            clean_name = ""

        fd = {
            "account": ENC(self.phone),
            "shopId": "20004",
            "idCardNum": ENC(id_card.strip()) if id_card else "",
            "userName": ENC(clean_name) if clean_name else "",
            "randomCode": sms_code.strip(),
            "scene": "1"
        }
        try:
            hdr, res = self._service_post("query/authentication", "authentication", fd)
            result_code = str(res.get("resultCode") or hdr.get("code") or "")
            result_desc = str(res.get("resultDesc") or hdr.get("reason") or "")
            _LOGGER.warning("电信通话详单二次认证返回: code=%s, desc=%s, res=%s", result_code, result_desc, res)
            if result_code in ("0", "0000") or "成功" in result_desc:
                # 动态从接口返回里面提取 signatureString
                data_dict = res.get("data") or {}
                sig_str = data_dict.get("signatureString") or res.get("signatureString") or ""
                if not sig_str and isinstance(res, dict):
                    # 备用遍历查找含有 signature 的字段
                    for k, v in res.items():
                        if "signature" in k.lower() and isinstance(v, str):
                            sig_str = v
                            break
                if not sig_str:
                    sig_str = f"kf6Hj20004{self.phone}"
                self.signature_string = sig_str
                _LOGGER.info("成功从鉴权接口返回中获取到通话详单签名串: %s", sig_str)
                return True, result_desc or "认证成功", sig_str
            return False, result_desc or f"认证失败(错误码:{result_code})", ""
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("详单二次认证请求异常: %s", e)
            return False, str(e), ""

    def get_cust_info_xml(self) -> str:
        """调用电信旧版 XML 网关业务码 custInfo，获取机主姓名 (Cust_Name)"""
        if not self.token:
            return ""

        ts = time.strftime("%Y%m%d%H%M%S")
        enc_phone = ENC(self.phone)
        client_type = f"#13.4.0#channel50#{self.device_model or 'iPhone'}#"

        xml_req = (
            f"<Request><HeaderInfos><Code>custInfo</Code>"
            f"<UserLoginName>{enc_phone}</UserLoginName>"
            f"<Token>{self.token}</Token>"
            f"<ClientType>{client_type}</ClientType>"
            f"<Timestamp>{ts}</Timestamp>"
            f"<ShopId>20004</ShopId>"
            f"<Source>120002</Source>"
            f"<SourcePassword>TiqmIZ</SourcePassword>"
            f"<BroadAccount></BroadAccount>"
            f"<BroadToken></BroadToken>"
            f"<FixedLineAccount></FixedLineAccount>"
            f"<FixedLineToken></FixedLineToken>"
            f"<ProvinceCode>{self.province_code}</ProvinceCode>"
            f"</HeaderInfos>"
            f"<Content><Attach>iPhone</Attach>"
            f"<FieldData><PhoneNbr>{self.phone}</PhoneNbr><PhoneType>0</PhoneType></FieldData>"
            f"</Content></Request>"
        )

        try:
            cipher = DES3.new(b"1234567`90koiuyhgtfrdews", DES3.MODE_CBC, b"\x00" * 8)
            encrypted = cipher.encrypt(pad(xml_req.encode("utf-8"), 8)).hex().upper()

            urls = [
                "https://appgologinsz.189.cn/map/clientXML?encrypted=true&repcipher=false",
                "https://appgologin.189.cn:9031/map/clientXML?encrypted=true&repcipher=false"
            ]

            headers = {
                "Content-Type": "application/xml; charset=utf-8",
                "User-Agent": UA
            }

            for url in urls:
                try:
                    resp = self.s.post(url, data=encrypted.encode("utf-8"), headers=headers, timeout=10)
                    if resp.status_code == 200:
                        text = resp.text
                        if "<Code>X201</Code>" in text or "token 过期" in text or "token失效" in text or "<Code>X110</Code>" in text:
                            _LOGGER.warning("电信 XML 网关返回 Token 已失效: %s", text[:200])
                            raise CarrierAuthExpiredError("电信登录凭证已失效 (XML网关报token过期)")
                        m = re.search(r"<Cust_Name>(.*?)</Cust_Name>", text)
                        if m:
                            name = m.group(1).strip()
                            if name:
                                _LOGGER.info("成功从电信 XML 网关 (custInfo) 获取到机主真实姓名: %s", name)
                                return name
                except CarrierAuthExpiredError:
                    raise
                except Exception as ex:
                    _LOGGER.debug("请求 XML 网关 %s 失败: %s", url, ex)
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("调用电信 custInfo XML 异常: %s", e)

        return ""

    def fetch_all_data(self, start_date: str = "", signature_string: str = "", signature_timestamp: float = 0.0) -> dict:
        """拉取电信全量业务数据"""
        if not self.token:
            raise CarrierAuthExpiredError("电信登录凭据缺失，需要重新认证")

        data_out = {}
        mask = lambda p: p[:3] + "****" + p[-4:] if len(p) == 11 else p

        # 1. 话费余额、本月消费与近半年账单
        try:
            fd_bal = {
                "account": ENC(self.phone), "queryFlag": "1", "provinceCode": self.province_code,
                "cityCode": self.city_code, "shopId": "20004", "accessAuth": "0",
                "developCode": "", "isChinatelecom": "1", "netType": ""
            }
            _, res_bal = self._service_post("query/queryPhoneBillBalance", "queryPhoneBillBalance", fd_bal)
            bal_data = res_bal.get("data") or {}
            charge_bean = bal_data.get("chargeBean") or {}
            charge_title = str(charge_bean.get("chargeTitle") or "")
            is_show_red = str(charge_bean.get("isShowRed") or "")
            voice_msg = str(bal_data.get("voiceMessage") or "")
            total_arrears = bal_data.get("totalArrears")

            is_arrears = (
                "欠费" in charge_title
                or "欠费" in voice_msg
                or is_show_red == "1"
                or (total_arrears is not None and float(total_arrears or 0) > 0)
            )

            try:
                raw_charge = float(charge_bean.get("charge", 0.0))
            except Exception:
                raw_charge = 0.0

            if is_arrears:
                arr_amt = float(total_arrears) if (total_arrears and float(total_arrears or 0) > 0) else raw_charge
                data_out["balance"] = -abs(arr_amt)
                data_out["balance_title"] = charge_title or "当前欠费"
            else:
                data_out["balance"] = raw_charge
                data_out["balance_title"] = charge_title or "当前号码余额"

            data_out["balance_general"] = charge_bean.get("charge", "0.00")
            data_out["balance_special"] = "0.00元"
            for cl in charge_bean.get("chargeList", []):
                if "专用" in cl.get("chargeListTitle", ""):
                    data_out["balance_special"] = cl.get("chargeListCharge", "0.00元")

            bill_exp = bal_data.get("billExpense") or {}
            val_list = bill_exp.get("valueList") or []
            try:
                data_out["charge"] = float(val_list[-1].get("amount", 0.0)) if val_list else 0.0
            except Exception:
                data_out["charge"] = 0.0

            history_bills = {}
            for v in reversed(val_list):
                t_title = v.get("title", "")
                t_amt = v.get("amount", "")
                if t_title and t_amt:
                    history_bills[f"{t_title}出账"] = f"{t_amt} 元"
            data_out["history_bills"] = history_bills
        except CarrierAuthExpiredError:
            raise
        except Exception as err:
            _LOGGER.warning("拉取电话话费与消费异常: %s", err)
            data_out["balance"] = 0.0
            data_out["charge"] = 0.0
            data_out["history_bills"] = {}

        # 2. 电信积分
        try:
            fd_int = {"account": ENC(self.phone), "clientType": "1", "shopId": "20004"}
            _, res_int = self._service_post("query/queryIntegral", "queryIntegral", fd_int)
            int_data = res_int.get("data") or {}
            try:
                data_out["integral"] = int(int_data.get("integral", 0))
            except Exception:
                data_out["integral"] = 0
        except Exception as err:
            _LOGGER.warning("拉取电信积分异常: %s", err)
            data_out["integral"] = 0

        # 3. 515G通用大流量池与共享流量 (userPackage + qryShareUsage)
        ts_cycle = time.strftime("%Y%m")
        try:
            # 3.1 从 userPackage (queryFlag="0") 获取全量流量池总额与剩余
            fd_pkg_flow = {
                "account": ENC(self.phone), "billingCycle": ts_cycle,
                "queryFlag": "0", "shopId": "20004", "clientType": "1"
            }
            _, res_pkg_flow = self._service_post("query/userPackage", "userPackage", fd_pkg_flow)
            flow_pkgs = ((res_pkg_flow.get("data") or {}).get("productOFFRatable") or {}).get("ratableResourcePackages") or []

            u_kb_total = 0
            b_kb_total = 0
            detailed_flow_pkgs = []

            for fp in flow_pkgs:
                u_kb_total += int(fp.get("usageAmount") or 0)
                b_kb_total += int(fp.get("balanceAmount") or 0)
                for sub in fp.get("productInfos", []):
                    s_name = sub.get("productOFFName") or "流量包"
                    s_rat = round(int(sub.get("ratableAmount") or 0) / 1024 / 1024, 2)
                    s_use = round(int(sub.get("usageAmount") or 0) / 1024 / 1024, 2)
                    s_bal = round(int(sub.get("balanceAmount") or 0) / 1024 / 1024, 2)
                    detailed_flow_pkgs.append(f"{s_name}: 剩余 {s_bal} GB | 已用 {s_use} GB | 共 {s_rat} GB")

            flow_used_gb = round(u_kb_total / 1024 / 1024, 2)
            flow_remain_gb = round(b_kb_total / 1024 / 1024, 2)
            flow_total_gb = round((u_kb_total + b_kb_total) / 1024 / 1024, 2)

            data_out["flow_remain_gb"] = flow_remain_gb
            data_out["flow_used_gb"] = flow_used_gb
            data_out["flow_total_gb"] = flow_total_gb
            data_out["detailed_flow_pkgs"] = detailed_flow_pkgs

            # 3.2 从 qryShareUsage 提取各成员已用流量明细
            fd_share = {
                "account": ENC(self.phone), "billingCycle": ts_cycle,
                "queryFlag": "1", "shopId": "20004", "clientType": "1"
            }
            _, res_share = self._service_post("query/qryShareUsage", "qryShareUsage", fd_share)
            share_data = res_share.get("data") or {}

            member_flow = {}
            for item in share_data.get("shareTypeBeans", []):
                if item.get("shareType") == "流量":
                    for info in item.get("shareUsageInfos", []):
                        for m in info.get("shareUsageAmounts", []):
                            raw_p = DEC(m.get("phoneNum"))
                            kb = int(m.get("usageAmount", 0))
                            member_flow[raw_p] = member_flow.get(raw_p, 0) + kb

            flow_members = []
            ordered_flow_phones = [self.phone] + [p for p in member_flow if p != self.phone]
            sub_cards = []
            for p in ordered_flow_phones:
                if p in member_flow:
                    is_self = (p == self.phone)
                    flow_members.append({
                        "label": "本机" if is_self else "副卡",
                        "phone": mask(p),
                        "used_gb": round(member_flow[p] / 1024 / 1024, 2)
                    })
                    if not is_self:
                        sub_cards.append(mask(p))
            data_out["flow_members"] = flow_members
            data_out["sub_cards"] = sub_cards
        except CarrierAuthExpiredError:
            raise
        except Exception as err:
            _LOGGER.warning("拉取电信流量池异常: %s", err)
            data_out["flow_remain_gb"] = 0.0
            data_out["flow_used_gb"] = 0.0
            data_out["flow_total_gb"] = 0.0
            data_out["detailed_flow_pkgs"] = []
            data_out["flow_members"] = []
            data_out["sub_cards"] = []

        # 4. 共享通话已用、剩余与套餐信息 (qryUserUsage + qryShareUsage)
        try:
            fd_usage = {
                "account": ENC(self.phone), "queryFlag": "1", "clientType": "1",
                "cityCode": self.city_code, "provinceCode": self.province_code, "isChinatelecom": "1",
                "netType": "", "userId": self.user_id, "developCode": "", "isNewUser": "0",
                "phoneType": "0", "shopId": "20004", "isFromInternational": "0"
            }
            _, res_usage = self._service_post("query/qryUserUsage", "qryUserUsage", fd_usage)
            usage_data = res_usage.get("data") or {}
            data_out["package_name"] = (usage_data.get("productOFFInformation") or {}).get("content", "5G畅享套餐")

            packages = usage_data.get("ratableResourcePackages") or []
            v_rem, v_used, v_total = 0, 0, 0
            voice_packages = []
            if packages:
                pkg = packages[0]
                prog = pkg.get("usageProgress") or {}
                tot_d = pkg.get("totalData") or {}
                try:
                    v_rem = int(float(tot_d.get("totalValue", 0)))
                    v_used = int(float(prog.get("leftBottomTitle", 0)))
                    v_total = int(float(prog.get("rightBottomTitle", 0)))
                except Exception:
                    pass
                for pinfo in pkg.get("productInfos", []):
                    p_title = pinfo.get("title", "")
                    p_u = pinfo.get("leftHighlight", "")
                    p_r = pinfo.get("rightHighlight", "")
                    p_tot = pinfo.get("rightCommon", "").replace("/", "")
                    voice_packages.append(f"{p_title}: 已用 {p_u} | 剩余 {p_r} | {p_tot}")

            data_out["voice_remain"] = v_rem
            data_out["voice_used"] = v_used
            data_out["voice_total"] = v_total
            data_out["voice_packages"] = voice_packages

            member_voice = {}
            for item in (share_data.get("shareTypeBeans") or []):
                if item.get("shareType") == "语音":
                    for info in item.get("shareUsageInfos", []):
                        for m in info.get("shareUsageAmounts", []):
                            raw_p = DEC(m.get("phoneNum"))
                            mins = int(m.get("usageAmount", 0))
                            member_voice[raw_p] = member_voice.get(raw_p, 0) + mins

            voice_members = []
            ordered_voice_phones = [self.phone] + [p for p in member_voice if p != self.phone]
            for p in ordered_voice_phones:
                if p in member_voice:
                    voice_members.append({
                        "label": "本机" if p == self.phone else "副卡",
                        "phone": mask(p),
                        "used_mins": member_voice[p]
                    })
            data_out["voice_members"] = voice_members
        except CarrierAuthExpiredError:
            raise
        except Exception as err:
            _LOGGER.warning("拉取电信通话用量异常: %s", err)
            data_out["package_name"] = "5G畅享套餐"
            data_out["voice_remain"] = 0
            data_out["voice_used"] = 0
            data_out["voice_total"] = 0
            data_out["voice_packages"] = []
            data_out["voice_members"] = []

        # 5. 宽带信息 (queryMyBroadBand)
        try:
            fd_bb = {
                "account": ENC(self.phone), "phoneNum": ENC(self.phone), "type": "1",
                "provinceCode": self.province_code, "cityCode": self.city_code, "shopId": "20004", "clientType": "1"
            }
            _, res_bb = self._service_post("query/queryMyBroadBand", "queryMyBroadBand", fd_bb)
            bb_list = (res_bb.get("data") or {}).get("queryMyBroadBandInfos") or []
            broadbands = []
            bb_info = {}
            if bb_list:
                b0 = bb_list[0]
                acc = b0.get("serialNumber", "")
                rate = b0.get("broadbandRate", "1000MB")
                pname = b0.get("productName", "天翼有线宽带")
                broadbands.append(f"{acc} ({pname} {rate})")
                bb_info = {
                    "宽带账号": acc,
                    "产品名称": pname,
                    "签约速率": rate,
                    "开通时间": b0.get("startDate", ""),
                    "到期时间": b0.get("endDate", ""),
                    "剩余有效天数": f"{b0.get('remainingDays', 0)} 天",
                    "装机地址": b0.get("address", ""),
                    "宽带归属": f"{self.province_name} {self.city_name}".strip(),
                }
            data_out["broadbands"] = broadbands
            data_out["broadband_info"] = bb_info
        except Exception as err:
            _LOGGER.warning("拉取电信宽带信息异常: %s", err)
            data_out["broadbands"] = []
            data_out["broadband_info"] = {}

        # 6. 账户名下资产与网龄信用 (queryAccountInfo)
        try:
            fd_acc = {"account": ENC(self.phone), "phoneNum": ENC(self.phone), "shopId": "20004", "clientType": "1"}
            _, res_acc = self._service_post("query/queryAccountInfo", "queryAccountInfo", fd_acc)
            acc_data = res_acc.get("data") or {}
            data_out["user_level"] = acc_data.get("starLevel", "普通用户")
            data_out["account_name"] = acc_data.get("accountName", "")
            data_out["credit_limit"] = (acc_data.get("phoneConfig") or {}).get("accountDetail", {}).get("creditAvailable", "0")
            vm = acc_data.get("voiceMessage", "")
            data_out["voice_message"] = vm

            # 从电信语音欢迎词中纯动态正则提取真实网龄 (如: 您网龄为一十年六个月)
            m_age = re.search(r"网龄为([^，,。]+)", vm)
            data_out["open_years"] = m_age.group(1) if m_age else "在网用户"

            fixed_lines = []
            for item in (acc_data.get("fixedLineConfig") or {}).get("otherNumbers", []):
                if item.get("account"):
                    fixed_lines.append(item.get("account"))
            data_out["fixed_lines"] = fixed_lines
        except Exception as err:
            _LOGGER.warning("拉取电信账户资产信息异常: %s", err)
            data_out["user_level"] = "普通用户"
            data_out["account_name"] = ""
            data_out["credit_limit"] = "0"
            data_out["fixed_lines"] = []
            data_out["open_years"] = "在网用户"

        # 7. 通过电信旧版 XML 网关 (业务码 custInfo) 获取机主真实姓名 (Cust_Name)
        try:
            cust_name = self.get_cust_info_xml()
            if cust_name:
                data_out["account_name"] = cust_name
        except CarrierAuthExpiredError:
            raise
        except Exception as err:
            _LOGGER.warning("获取电信机主姓名(Cust_Name)异常: %s", err)

        # 8. 通话记录与语音详单 (queryDetailsV2)
        # 二次认证成功后有效期为 30 分钟 (1800 秒)，30 分钟后自动失效，实体进入需重新认证状态
        today = datetime.date.today()
        query_year = today.year
        query_month = today.month
        start_day = 1

        if start_date:
            s = str(start_date).strip()
            # 兼容正则匹配: 2026-08-01, 2026/8/1, 2026.8.1, 2026-08 等
            m_date = re.match(r"^(\d{4})[-/.]?(\d{1,2})(?:[-/.]?(\d{1,2}))?$", s)
            if m_date:
                query_year = int(m_date.group(1))
                query_month = int(m_date.group(2))
                start_day = int(m_date.group(3)) if m_date.group(3) else 1
            else:
                digits = re.sub(r"\D", "", s)
                if len(digits) >= 6:
                    try:
                        query_year = int(digits[:4])
                        query_month = int(digits[4:6])
                        start_day = int(digits[6:8]) if len(digits) >= 8 else 1
                    except Exception:
                        pass

        if not (1 <= query_month <= 12):
            query_year = today.year
            query_month = today.month
            start_day = 1

        clean_start_date = f"{query_year:04d}{query_month:02d}{start_day:02d}"

        # 电信详单按自然月查询 (跨月区间会返回空): 用户只需给出起始日期/月份，
        # 截止日期一律自动取该月最后一天。接口对当月未来日期同样接受，
        # 只会返回截止当前时刻为止已产生的流水，因此当月也能安全用月末日期。
        _, last_day = calendar.monthrange(query_year, query_month)
        end_date_str = f"{query_year:04d}{query_month:02d}{last_day:02d}"

        display_start_date = f"{clean_start_date[:4]}-{clean_start_date[4:6]}-{clean_start_date[6:8]}"
        display_end_date = f"{end_date_str[:4]}-{end_date_str[4:6]}-{end_date_str[6:8]}"

        passed_seconds = 0.0
        is_expired = False
        remaining_minutes = 0
        if signature_timestamp > 0:
            passed_seconds = time.time() - signature_timestamp
            if passed_seconds >= 1800:
                is_expired = True
                _LOGGER.info("电信通话详单二次鉴权已满30分钟(已过 %.1f 秒)，自动失效", passed_seconds)
            else:
                remaining_minutes = max(1, int((1800 - passed_seconds) // 60))

        auto_signature = signature_string or getattr(self, "signature_string", "")
        # 如果未提供签名，或者已超过30分钟有效期
        if not auto_signature or is_expired:
            data_out["call_records"] = []
            data_out["call_count"] = 0
            data_out["last_call"] = {}
            data_out["call_need_auth"] = True
            data_out["call_auth_status"] = "已过期 (需重新认证)" if is_expired else "未认证 (需二次认证)"
            data_out["call_auth_remaining_minutes"] = 0
            data_out["call_start_date"] = display_start_date
            data_out["call_end_date"] = display_end_date
        else:
            try:
                fd_call = {
                    "account": ENC(self.phone),
                    "queryFlag": "1",
                    "isChinatelecom": "1",
                    "type": "1",            # 1=语音详单
                    "startDate": clean_start_date,  # 单月查询起始日期 (YYYYMMDD)
                    "endDate": end_date_str,        # 当月截止当天或历史月截止最后一天 (YYYYMMDD)
                    "shopId": "20004",
                    "phoneType": "69",      # Hook实测必填字段
                    "provinceCode": self.province_code,
                    "cityCode": self.city_code,
                    "sortId": "",
                    "validateType": "1",    # Hook实测: 1而非 0
                    "filterConditions": "",
                    "signatureString": auto_signature,
                    "accessAuth": "0"
                }
                _, res_call = self._service_post("query/queryDetailsV2", "queryDetailsV2", fd_call)
                resp_data = res_call.get("data") or {}
                v_detail = resp_data.get("voiceDetail") or {}
                v_list = v_detail.get("voiceDetailList") or []

                def _decrypt_calle_no(raw: str) -> str:
                    if not raw or not isinstance(raw, str):
                        return ""
                    # 电信 App 逆向算法 ASCIIDencrypt: 每一位字符 ASCII 码减 2
                    try:
                        return "".join(chr(ord(c) - 2) for c in raw)
                    except Exception:
                        return raw

                def _map_call_type(raw_type: str) -> str:
                    if not raw_type:
                        return "呼叫"
                    if "主叫" in raw_type or raw_type == "1":
                        return "呼叫"
                    if "被叫" in raw_type or raw_type == "2":
                        return "接听"
                    return raw_type

                def _format_call_time(raw: str, default_year: int) -> str:
                    if not raw or not isinstance(raw, str):
                        return ""
                    raw_str = raw.strip()
                    # 匹配类似: "9月26日 17:00:22", "09月26日 17:00:22", "2026-09-26 17:00:22", "09-26 17:00:22"
                    m = re.search(r"(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})[日]?\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?", raw_str)
                    if m:
                        y = int(m.group(1)) if m.group(1) else default_year
                        mo = int(m.group(2))
                        d = int(m.group(3))
                        h = int(m.group(4))
                        mi = int(m.group(5))
                        s = int(m.group(6)) if m.group(6) is not None else 0
                        return f"{y:04d}-{mo:02d}-{d:02d} {h:02d}:{mi:02d}:{s:02d}"
                    return raw_str

                call_records = []
                for item in v_list:
                    # 字段顺序与本地缓存/实体属性输出保持一致 (见 phone_region.RECORD_FIELDS)
                    call_records.append({
                        "call_time": _format_call_time(item.get("callTime", ""), query_year),
                        "type": _map_call_type(item.get("type", "")),   # 呼叫/接听
                        "call_type": item.get("callType", ""),          # 国内通话/漫游
                        "phone_number": _decrypt_calle_no(item.get("calleNo", "")),
                        "duration": item.get("duration", ""),
                        "location": item.get("callArea", ""),           # 通话地(本机所在地)
                        "location_coordinate": "",                      # 通话地坐标(本地地图数据)
                        "number_location": "",                          # 对方号码归属地(本地库查询)
                        "number_isp": "",                               # 对方运营商(本地库查询)
                        "number_location_coordinate": "",               # 对方归属地坐标(本地地图数据)
                        "fee": item.get("totalCharge", "0元"),
                    })

                # 用本地归属地库补充对方号码归属地/运营商 (库缺失/损坏时保持为空)
                enrich_call_records(call_records)

                result_code = str(res_call.get("resultCode") or "")
                result_desc = str(res_call.get("resultDesc") or "")

                # 检查接口返回是否指示鉴权失效 (如1009/1010/非0或错误码且无数据)
                if (result_code in ("1009", "1010") or result_code not in ("0", "0000")) and not call_records:
                    data_out["call_records"] = []
                    data_out["call_count"] = 0
                    data_out["last_call"] = {}
                    data_out["call_need_auth"] = True
                    data_out["call_auth_status"] = "详单授权已过期 (需重新认证)"
                    data_out["call_auth_remaining_minutes"] = 0
                else:
                    data_out["call_records"] = call_records
                    data_out["call_count"] = len(call_records)
                    data_out["last_call"] = call_records[0] if call_records else {}
                    data_out["call_need_auth"] = False
                    data_out["call_auth_status"] = f"有效 (约剩余 {remaining_minutes} 分钟)" if remaining_minutes else "有效"
                    data_out["call_auth_remaining_minutes"] = remaining_minutes

                data_out["call_start_date"] = display_start_date
                data_out["call_end_date"] = display_end_date
                _LOGGER.debug("电信通话记录拉取: %d 条 (时间区间: %s -> %s, 授权状态: %s)", len(call_records), display_start_date, display_end_date, data_out["call_auth_status"])
            except Exception as err:
                _LOGGER.debug("拉取电信通话记录异常: %s", err)
                data_out["call_records"] = []
                data_out["call_count"] = 0
                data_out["last_call"] = {}
                data_out["call_need_auth"] = True
                data_out["call_auth_status"] = "已过期 (需重新认证)"
                data_out["call_auth_remaining_minutes"] = 0
                data_out["call_start_date"] = display_start_date
                data_out["call_end_date"] = display_end_date

        # 9. 短信详单 (type=2) 与上网流量详单 (type=3)
        #    与语音详单共用同一次二次认证、同一个查询区间, 因此不额外发短信、不额外认证
        auth_ready = bool(auto_signature) and not is_expired
        auth_text = "已过期 (需重新认证)" if is_expired else "未认证 (需二次认证)"
        try:
            from ..phone_region import enrich_number_fields
        except Exception as err:  # 归属地库不可用时只是少一列信息
            _LOGGER.debug("归属地库不可用(短信记录将不带归属地): %s", err)
            enrich_number_fields = None  # type: ignore[assignment]

        for type_value, prefix, container_key, parser, label in (
            ("2", "sms", "shortMessageDetail", _parse_sms_detail, "短信详单"),
            ("3", "net", "trafficDetail", _parse_traffic_detail, "上网流量详单"),
        ):
            data_out[f"{prefix}_records"] = []
            data_out[f"{prefix}_count"] = 0
            data_out[f"{prefix}_daily"] = []
            data_out[f"{prefix}_total"] = {}
            data_out[f"{prefix}_last"] = {}
            data_out[f"{prefix}_start_date"] = display_start_date
            data_out[f"{prefix}_end_date"] = display_end_date
            if not auth_ready:
                data_out[f"{prefix}_status"] = auth_text
                continue
            try:
                resp = self._query_detail(type_value, clean_start_date, end_date_str, auto_signature)
                inner = resp.get("data") or {}
                container = inner.get(container_key) or {}
                result_code = str(resp.get("resultCode") or "")
                result_desc = str(resp.get("resultDesc") or "")
                parsed = parser(container, query_year)
                records = parsed.get("records") or []
                if prefix == "sms" and records and enrich_number_fields is not None:
                    # 补对端号码归属地/运营商/坐标 (失败不影响记录本体)
                    try:
                        enrich_number_fields(records)
                    except Exception as err:
                        _LOGGER.debug("短信记录补充归属地失败(已跳过): %s", err)
                data_out[f"{prefix}_records"] = records
                data_out[f"{prefix}_count"] = len(records)
                data_out[f"{prefix}_daily"] = parsed.get("daily") or []
                data_out[f"{prefix}_total"] = parsed.get("total") or {}
                data_out[f"{prefix}_last"] = records[0] if records else {}
                if prefix == "net":
                    data_out["net_sort_list"] = inner.get("sortList") or []
                    data_out["net_filter_list"] = inner.get("filterGroupList") or []
                if result_code in ("1009", "1010"):
                    data_out[f"{prefix}_status"] = f"{label}授权已过期 (需重新认证)"
                elif result_code not in ("0", "0000") and not records:
                    data_out[f"{prefix}_status"] = f"{label}查询失败 ({result_code} {result_desc})".strip()
                elif not records:
                    data_out[f"{prefix}_status"] = "有效 (本区间无记录)"
                elif remaining_minutes:
                    data_out[f"{prefix}_status"] = f"有效 (约剩余 {remaining_minutes} 分钟)"
                else:
                    data_out[f"{prefix}_status"] = "有效"
                _LOGGER.debug(
                    "电信%s拉取: %d 条 (区间 %s -> %s)",
                    label, len(records), display_start_date, display_end_date,
                )
            except Exception as err:
                data_out[f"{prefix}_status"] = f"查询异常 ({err})"
                _LOGGER.debug("拉取电信%s异常: %s", label, err)

        data_out["location"] = f"{self.province_name} {self.city_name}".strip() or "中国电信"
        data_out["account_status"] = "正常"
        return data_out

