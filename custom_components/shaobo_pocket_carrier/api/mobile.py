# -*- coding: utf-8 -*-
"""中国移动官方 App (12.5.5) 原生客户端 API 通信模块

基于中国移动 12.5 原生移动端接口体系与统一会话中心 (SessionServer-unity):
- 核心通信域名: https://clientaccess.10086.cn
- 数据加密体系: Mode 2 (AES-128-CBC / PKCS7Padding / Base64)
  * 请求加密 Key: b'bAIgvwAuA4tbDr9d'
  * 响应解密 Key: b'GS7VelkJl5IT1uwQ'
  * 固定向量 IV:  b'9791027341711819'
- 通信鉴权签名 (三层动态签名):
  * x-token: AES(f"{xk}_/{endpoint}_{x_time}_{x_nonce}")
  * xs:      MD5(f"{full_url}_{plain_json}_Leadeon/SecurityOrganization")
  * x-sign:  MD5(f"{x_token}_{x_time}_{x_nonce}_{jsessionid}")
- 接入方式: 填写抓包 Cookie 凭据 (JSESSIONID / UID / ticketID)
- 会话保活机制: 统一会话中心支持滑动顺延，轮询心跳自动维持会话存活 (稳定运行1个月以上)
- 核心四大业务接口:
  * 实时话费与余额: POST biz-orange/BN/realFeeQuery/getRealFee
  * 套餐余量(流量与语音): POST biz-orange/BH/newPlanRemainQry/getNewPlanRemainQry
  * 积分查询: POST biz-orange/BN/scoreQueryService/getScoreQuery
  * 用户基础信息: POST biz-orange/BN/userInformationService/getUserInformation
"""
import base64
import hashlib
import json
import logging
import random
import re
import ssl
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

from ..const import CarrierAuthExpiredError

_LOGGER = logging.getLogger(__name__)

# 中国移动 12.5 原生客户端 AES 密钥体系 (全平台固定)
AES_REQ_KEY = b"bAIgvwAuA4tbDr9d"
AES_RESP_KEY = b"GS7VelkJl5IT1uwQ"
AES_IV = b"9791027341711819"

# 客户端默认通用信封参数常量
DEFAULT_XK = "2408b2a5d0956f22ad08471f3c63d5d8e31dbca45e16a53875c4154317b270adacb3c15d"
DEFAULT_T = "83216123546aa27f10780c5c645b0e30"
DEFAULT_IMEI = "A903F8A96F7048B69764722BCF90EE8"
DEFAULT_CTID = "A903F8A96F7048B69764722BCF90EE81"
DEFAULT_CID = "bf8649694f1e86dbbe9fbcd3e26f92407695b550aa7b4d3e0f51934ac10c6666"
DEFAULT_AK = "F5AA34B89513F0D087CA0EF11A3277469DC74905"
DEFAULT_XC = "B2000"
DEFAULT_CV = "12.5.5"

# 接口基础域名
BASE_URL = "https://clientaccess.10086.cn"


def _build_cm_ssl_ctx():
    """创建适配移动服务端的 SSL 上下文 (支持旧版服务端 SSL 重协商)"""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        try:
            ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        except Exception:
            pass
        return ctx
    except Exception:
        return None


_GLOBAL_CM_SSL_CTX = _build_cm_ssl_ctx()


class _CMClientTLSAdapter(HTTPAdapter):
    """支持旧版服务端 SSL 重协商的 TLS 适配器"""

    def init_poolmanager(self, *args, **kwargs):
        if _GLOBAL_CM_SSL_CTX:
            kwargs["ssl_context"] = _GLOBAL_CM_SSL_CTX
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        if _GLOBAL_CM_SSL_CTX:
            kwargs["ssl_context"] = _GLOBAL_CM_SSL_CTX
        return super().proxy_manager_for(*args, **kwargs)


def aes_encrypt(plain_text: str) -> str:
    """AES-128-CBC 加密并转换为 Base64 (入参请求加密)"""
    cipher = AES.new(AES_REQ_KEY, AES.MODE_CBC, AES_IV)
    raw = cipher.encrypt(pad(plain_text.encode("utf-8"), 16))
    return base64.b64encode(raw).decode("utf-8")


def aes_decrypt(cipher_text: str) -> str:
    """AES-128-CBC 解密 Base64 格式的返回密文 (响应密文解密)"""
    text_clean = cipher_text.strip()
    try:
        raw = base64.b64decode(text_clean)
        cipher = AES.new(AES_RESP_KEY, AES.MODE_CBC, AES_IV)
        dec = cipher.decrypt(raw)
        return unpad(dec, 16).decode("utf-8")
    except Exception as e:
        raise ValueError(f"无法解密移动响应报文: {e}")


def parse_mobile_auth_data(raw_data: Any) -> Dict[str, Any]:
    """智能解析并规范化中国移动 12.5 凭据数据 (支持 Cookie 文本、cURL、JSON、字典等)"""
    res: Dict[str, Any] = {
        "cookies": {},
        "cookie": "",
        "xk": DEFAULT_XK,
        "t": DEFAULT_T,
        "imei": DEFAULT_IMEI,
        "ctid": DEFAULT_CTID,
        "cid": DEFAULT_CID,
    }
    if not raw_data:
        return res

    # 1. 字典格式
    if isinstance(raw_data, dict):
        if "cookies" in raw_data and isinstance(raw_data["cookies"], dict):
            res["cookies"] = dict(raw_data["cookies"])
        elif "cookie" in raw_data and isinstance(raw_data["cookie"], str):
            res.update(parse_mobile_auth_data(raw_data["cookie"]))
        else:
            # 扁平字典
            for k, v in raw_data.items():
                if k in ("xk", "t", "imei", "ctid", "cid"):
                    res[k] = str(v)
                elif isinstance(v, (str, int)):
                    res["cookies"][k] = str(v)

        for optional_key in ("xk", "t", "imei", "ctid", "cid"):
            if optional_key in raw_data and raw_data[optional_key]:
                res[optional_key] = str(raw_data[optional_key])

        # 重构 cookie 字符串
        if res["cookies"]:
            res["cookie"] = "; ".join(f"{k}={v}" for k, v in res["cookies"].items())
        return res

    # 2. 字符串格式 (Cookie 文本、cURL 文本、或 JSON 文本)
    if isinstance(raw_data, str):
        text = raw_data.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                d = json.loads(text)
                return parse_mobile_auth_data(d)
            except Exception:
                pass

        # 提取 xk / t 字段 (若抓包文本中出现)
        m_xk = re.search(r'["\']?xk["\']?\s*[:=]\s*["\']?([a-fA-F0-9]{32,128})["\']?', text)
        if m_xk:
            res["xk"] = m_xk.group(1).strip()
        m_t = re.search(r'["\']?t["\']?\s*[:=]\s*["\']?([a-fA-F0-9]{32})["\']?', text)
        if m_t:
            res["t"] = m_t.group(1).strip()

        # 智能匹配键值对，过滤 HTTP 协议保留关键字
        ignored_keys = {"path", "httponly", "secure", "domain", "expires", "max-age", "samesite"}
        for item in re.finditer(r"([A-Za-z0-9_.-]+)=([^;,\s\"'\r\n]+)", text):
            k, v = item.group(1), item.group(2)
            if k.lower() not in ignored_keys:
                res["cookies"][k] = v

        if res["cookies"]:
            res["cookie"] = "; ".join(f"{k}={v}" for k, v in res["cookies"].items())

    return res


class MobileClient:
    """中国移动 12.5 原生 App 客户端调用实现类"""

    def __init__(self, phone: str, auth_data: Optional[Dict[str, Any]] = None):
        self.phone = phone.strip()
        self.auth_data = parse_mobile_auth_data(auth_data or {})
        self.cookies: Dict[str, str] = dict(self.auth_data.get("cookies") or {})
        self.xk: str = self.auth_data.get("xk") or DEFAULT_XK

        # 推断省份与城市代号 (尝试利用归属地库)
        self.prov = "451"
        self.city = "0459"
        self._infer_prov_city()

        self.s = requests.Session()
        self.s.trust_env = False
        adapter = _CMClientTLSAdapter()
        self.s.mount("https://", adapter)
        self.s.mount("http://", adapter)

        # 装载初始 Cookies
        self._load_cookies_to_session()

    def _infer_prov_city(self) -> None:
        """根据手机号自动推导归属地省份/城市代码 (兜底使用默认值)"""
        try:
            from ..phone_region import get_index
            index = get_index()
            if index is not None:
                info = index.query(self.phone)
                if info is not None:
                    # 尝试保留省份或区号
                    area_code = info.get("area_code") or ""
                    if area_code:
                        self.city = area_code
        except Exception:
            pass

    def _load_cookies_to_session(self) -> None:
        """将 Cookies 同步装载入 Session"""
        for k, v in self.cookies.items():
            self.s.cookies.set(k, v, domain=".10086.cn")

    def _sync_session_cookies(self, resp: Optional[requests.Response] = None) -> None:
        """从响应中同步最新的 Set-Cookie (滑动续期核心)"""
        if resp is not None and resp.cookies:
            for k, v in resp.cookies.items():
                self.cookies[k] = v
                self.s.cookies.set(k, v, domain=".10086.cn")
        self.cookies.update(self.s.cookies.get_dict())

    def export_auth(self) -> Dict[str, Any]:
        """导出当前客户端完整认证数据 (包含滑动顺延的最新 Cookies)"""
        self._sync_session_cookies()
        auth_copy = dict(self.auth_data)
        auth_copy["cookies"] = dict(self.cookies)
        auth_copy["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        return auth_copy

    def _build_envelope(self, req_body: Dict[str, Any]) -> str:
        """构建 12.5 App 原生请求报文信封 (包含设备指纹与业务入参)"""
        envelope = {
            "tel": self.phone,
            "sv": "16.1.1",
            "nt": "3",
            "sn": "iPhone12,5",
            "prov": self.prov,
            "t": self.auth_data.get("t") or DEFAULT_T,
            "imei": self.auth_data.get("imei") or DEFAULT_IMEI,
            "city": self.city,
            "ctid": self.auth_data.get("ctid") or DEFAULT_CTID,
            "en": "0",
            "sp": "1242x2688",
            "reqBody": req_body,
            "cid": self.auth_data.get("cid") or DEFAULT_CID,
            "xk": self.xk,
            "xc": DEFAULT_XC,
            "ak": DEFAULT_AK,
            "cv": DEFAULT_CV,
            "sb": "apple",
            "st": 2,
        }
        return json.dumps(envelope, separators=(",", ":"))

    def _request(self, endpoint: str, req_body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """发起 Mode 2 标准原生加密请求并完成三层签名"""
        endpoint_clean = endpoint.lstrip("/")
        full_url = f"{BASE_URL}/{endpoint_clean}"
        now_ms = int(time.time() * 1000)
        x_time = str(now_ms)
        x_nonce = str(random.randint(10000000, 99999999))

        # 1. 组装信封明文与加密
        req_body = req_body or {}
        plain_json = self._build_envelope(req_body)
        encrypted_body = aes_encrypt(plain_json)

        # 2. 计算 x-token: AES(f"{xk}_/{endpoint}_{x_time}_{x_nonce}")
        token_raw = f"{self.xk}_/{endpoint_clean}_{x_time}_{x_nonce}"
        x_token = aes_encrypt(token_raw)

        # 3. 计算 xs: MD5(f"{full_url}_{plain_json}_Leadeon/SecurityOrganization")
        xs_raw = f"{full_url}_{plain_json}_Leadeon/SecurityOrganization"
        xs = hashlib.md5(xs_raw.encode("utf-8")).hexdigest()

        # 4. 提取 JSESSIONID 并计算 x-sign: MD5(f"{x_token}_{x_time}_{x_nonce}_{jsessionid}")
        jsessionid = self.cookies.get("JSESSIONID") or ""
        sign_raw = f"{x_token}_{x_time}_{x_nonce}_{jsessionid}"
        x_sign = hashlib.md5(sign_raw.encode("utf-8")).hexdigest()

        headers = {
            "User-Agent": "ChinaMobile/12.5.5 (iPhone; iOS 16.1.1; Scale/3.00)",
            "Content-Type": "application/Json",
            "Accept": "*/*",
            "Accept-Language": "zh-Hans;q=1, zh-Hans-CN;q=0.9, en-CN;q=0.8",
            "Connection": "keep-alive",
            "x-qen": "2",
            "x-time": x_time,
            "x-nonce": x_nonce,
            "x-token": x_token,
            "xs": xs,
            "x-sign": x_sign,
        }

        try:
            resp = self.s.post(full_url, data=encrypted_body, headers=headers, timeout=12)
            self._sync_session_cookies(resp)

            # 检查 HTTP 状态码
            if resp.status_code in (401, 403):
                raise CarrierAuthExpiredError(
                    f"中国移动会话已过期 (HTTP {resp.status_code}: 服务端鉴权拒绝)"
                )

            raw_text = resp.text.strip()
            if not raw_text:
                return {}

            # 解密返回密文
            dec_text = aes_decrypt(raw_text)
            data = json.loads(dec_text)
            if not isinstance(data, dict):
                raise ValueError("移动接口返回非字典数据")

            # 检查业务错误码
            ret_code = str(data.get("retCode") or data.get("code") or "")
            ret_desc = str(data.get("retDesc") or data.get("desc") or "")

            expired_codes = {"410000", "400001", "400006", "8051", "8052", "6001"}
            if ret_code in expired_codes or any(
                kw in ret_desc for kw in ("请重新登录", "重新登录", "未进行任何操作", "会话已失效", "请先登录", "凭据已失效")
            ):
                raise CarrierAuthExpiredError(
                    f"中国移动会话已过期: [{ret_code}] {ret_desc or '请重新登录'}"
                )

            return data
        except requests.RequestException as e:
            _LOGGER.debug("请求移动接口网络异常: %s, url: %s", e, full_url)
            raise
        except CarrierAuthExpiredError:
            raise

    # -------------------------------------------------------------------------
    # 四大原生业务接口
    # -------------------------------------------------------------------------

    def get_real_fee(self) -> Dict[str, Any]:
        """实时话费与余额查询 (biz-orange/BN/realFeeQuery/getRealFee)"""
        return self._request(
            "biz-orange/BN/realFeeQuery/getRealFee",
            {"cellNum": self.phone},
        )

    def get_plan_remain(self) -> Dict[str, Any]:
        """套餐余量 (流量与通话) 查询 (biz-orange/BH/newPlanRemainQry/getNewPlanRemainQry)"""
        return self._request(
            "biz-orange/BH/newPlanRemainQry/getNewPlanRemainQry",
            {"cellNum": self.phone},
        )

    def get_score(self) -> Dict[str, Any]:
        """积分查询 (biz-orange/BN/scoreQueryService/getScoreQuery)"""
        return self._request(
            "biz-orange/BN/scoreQueryService/getScoreQuery",
            {"cellNum": self.phone},
        )

    def get_user_info(self) -> Dict[str, Any]:
        """用户基础信息查询 (biz-orange/BN/userInformationService/getUserInformation)"""
        return self._request(
            "biz-orange/BN/userInformationService/getUserInformation",
            {"cellNum": self.phone},
        )

    def refresh_session(self) -> Dict[str, Any]:
        """主动保活心跳与刷新会话 (biz-orange/DN/refreshSession)"""
        return self._request(
            "biz-orange/DN/refreshSession",
            {"cellNum": self.phone},
        )

    def get_cust_base_info(self) -> Dict[str, Any]:
        """轻量探活与基础档案 (对齐 Coordinator 调用规范)"""
        return self.get_user_info()

    # -------------------------------------------------------------------------
    # 全量数据汇总与指标提取
    # -------------------------------------------------------------------------

    def fetch_all_data(self) -> Dict[str, Any]:
        """全量拉取中国移动账户数据 (话费余额、套餐流量、语音通话、积分、在网状态等)"""
        # 归属地优先通过离线库推断
        default_loc = ""
        try:
            from ..phone_region import get_index
            index = get_index()
            if index is not None:
                reg_info = index.query(self.phone)
                if reg_info is not None:
                    prov = reg_info.get("province", "")
                    city = reg_info.get("city", "")
                    if prov and city:
                        default_loc = f"{prov} {city}" if prov != city else prov
                    else:
                        default_loc = prov or city or ""
        except Exception:
            pass

        if not default_loc:
            default_loc = "中国移动"

        data_out: Dict[str, Any] = {
            "phone": self.phone,
            "carrier": "中国移动",
            "balance": 0.0,
            "charge": 0.0,
            "owed": False,
            "owe_fee": 0.0,
            "flow_remain": 0.0,
            "flow_used": 0.0,
            "flow_total": 0.0,
            "flow_packages": [],
            "voice_remain": 0,
            "voice_used": 0,
            "voice_total": 0,
            "voice_packages": [],
            "integral": 0,
            "star_level": "正常在网",
            "real_name": "已实名",
            "user_begin": "",
            "user_age": "",
            "real_name_info": "",
            "speed_service": "",
            "location": default_loc,
            "address": "",
            "business_hall": "",
            "account_status": "正常在网",
            "online": "在线",
            "last_update": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        # 0. 尝试主动刷新会话延长 TTL (心跳续命)
        try:
            self.refresh_session()
        except Exception as e:
            _LOGGER.debug("执行移动会话刷新心跳 (忽略): %s", e)

        success_modules = 0

        # 1. 实时话费与余额查询 (realFeeQuery/getRealFee) —— 核心模块
        try:
            fee_res = self.get_real_fee()
            rsp_body = fee_res.get("rspBody") or {}
            if isinstance(rsp_body, dict) and rsp_body:
                cur_fee = float(rsp_body.get("curFeeTotal") or rsp_body.get("curFee") or rsp_body.get("realBalanceFee") or 0.0)
                real_fee = float(rsp_body.get("realFee") or 0.0)
                owe_fee = float(rsp_body.get("oweFee") or 0.0)
                data_out["balance"] = cur_fee
                data_out["charge"] = real_fee
                data_out["owed"] = owe_fee > 0
                data_out["owe_fee"] = owe_fee
                success_modules += 1
        except CarrierAuthExpiredError:
            _LOGGER.debug("拉取移动话费接口报凭据失效")
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动话费余额异常: %s", e)

        # 2. 套餐余量查询 (newPlanRemainQry/getNewPlanRemainQry) —— 核心模块
        try:
            plan_res = self.get_plan_remain()
            rsp_body = plan_res.get("rspBody") or {}
            plan_qry_res = rsp_body.get("newPlanRemainQryRes") or {}

            # 流量提取
            flow_list_res = plan_qry_res.get("planRemianFlowListRes") or {}
            flow_items = flow_list_res.get("planRemianFlowRes") or []
            if isinstance(flow_items, list) and flow_items:
                total_remain_mb = 0.0
                total_used_mb = 0.0
                total_sum_mb = 0.0
                flow_pkgs = []

                for item in flow_items:
                    rem = float(item.get("flowRemainNum") or 0.0)
                    usd = float(item.get("flowUsdNum") or 0.0)
                    sm = float(item.get("flowSumNum") or 0.0)
                    unit = str(item.get("unit") or "03")

                    # 单位转换到 MB (03 为 MB, 04 为 GB, 02 为 KB)
                    if unit == "04":
                        rem *= 1024.0
                        usd *= 1024.0
                        sm *= 1024.0
                    elif unit == "02":
                        rem /= 1024.0
                        usd /= 1024.0
                        sm /= 1024.0

                    total_remain_mb += rem
                    total_used_mb += usd
                    total_sum_mb += sm

                    pkg_name = str(item.get("mealTypeDesc") or item.get("flowTypeDesc") or "流量套餐")
                    flow_pkgs.append(f"{pkg_name}: 剩余 {rem/1024:.2f}GB / 共 {sm/1024:.2f}GB")

                data_out["flow_remain"] = round(total_remain_mb / 1024.0, 2)
                data_out["flow_used"] = round(total_used_mb / 1024.0, 2)
                data_out["flow_total"] = round(total_sum_mb / 1024.0, 2)
                if flow_pkgs:
                    data_out["flow_packages"] = flow_pkgs
                success_modules += 1

            # 语音通话提取
            voice_list_res = plan_qry_res.get("planRemianVoiceListRes") or {}
            voice_items = voice_list_res.get("planRemianVoiceInfoRes") or []
            if isinstance(voice_items, list) and voice_items:
                total_v_rem = 0
                total_v_usd = 0
                total_v_sum = 0
                voice_pkgs = []

                for item in voice_items:
                    rem = int(float(item.get("voiceRemainNum") or 0))
                    usd = int(float(item.get("voiceUsdNum") or 0))
                    sm = int(float(item.get("voiceSumNum") or 0))
                    total_v_rem += rem
                    total_v_usd += usd
                    total_v_sum += sm

                    v_name = str(item.get("mealTypeDesc") or "语音通话")
                    voice_pkgs.append(f"{v_name}: 剩余 {rem}分钟 / 共 {sm}分钟")

                data_out["voice_remain"] = total_v_rem
                data_out["voice_used"] = total_v_usd
                data_out["voice_total"] = total_v_sum
                if voice_pkgs:
                    data_out["voice_packages"] = voice_pkgs

        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动套餐余量异常: %s", e)

        # 3. 积分查询 (scoreQueryService/getScoreQuery)
        try:
            score_res = self.get_score()
            rsp_body = score_res.get("rspBody") or {}
            val = rsp_body.get("pointValue") or rsp_body.get("score")
            if val is not None:
                data_out["integral"] = int(float(val))
                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.debug("拉取移动积分异常(忽略): %s", e)

        # 4. 用户信息查询 (userInformationService/getUserInformation)
        try:
            user_res = self.get_user_info()
            rsp_body = user_res.get("rspBody") or {}
            user_info = rsp_body.get("userInfo") or {}
            if isinstance(user_info, dict) and user_info:
                # 归属地信息
                loc = user_info.get("userAdd") or user_info.get("placeName")
                if loc and str(loc).strip():
                    data_out["location"] = str(loc).strip()

                # 入网时间与网龄
                begin_raw = str(user_info.get("userBegin") or "").strip()
                if begin_raw:
                    data_out["user_begin"] = begin_raw.split()[0]
                    try:
                        # 尝试计算网龄
                        begin_dt = time.strptime(begin_raw.split()[0], "%Y-%m-%d")
                        diff_days = int((time.time() - time.mktime(begin_dt)) / 86400)
                        if diff_days >= 365:
                            years = diff_days // 365
                            months = (diff_days % 365) // 30
                            data_out["user_age"] = f"{years}年{months}个月 ({diff_days}天)"
                        else:
                            data_out["user_age"] = f"{diff_days}天"
                    except Exception:
                        pass

                # 在网状态
                gsm_state = str(user_info.get("gsmState") or "")
                if gsm_state == "7":
                    data_out["account_status"] = "正常在网"
                elif gsm_state:
                    data_out["account_status"] = f"状态码: {gsm_state}"

                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.debug("拉取移动用户信息异常(忽略): %s", e)

        if success_modules == 0:
            raise CarrierAuthExpiredError("未能从中国移动核心接口获取到有效数据，会话凭据可能已失效")

        _LOGGER.info(
            "中国移动手机号 %s 本轮数据拉取成功: 余额=%.2f元, 剩余流量=%.2fGB, 模块成功数=%d",
            self.phone,
            data_out.get("balance", 0.0),
            data_out.get("flow_remain", 0.0),
            success_modules,
        )

        return data_out
