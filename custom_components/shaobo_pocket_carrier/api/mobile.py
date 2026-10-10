# -*- coding: utf-8 -*-
"""中国移动微信 H5 端 (wx.10086.cn) API 通信客户端

基于微信 H5 端接口体系重构:
- 核心加解密: AES-128-CBC / PKCS7Padding / 大写十六进制 HEX (Key: b'1234123412ABCDEF', IV: b'ABCDEF1234123412')
- 发送短信验证码: POST /website/bind/sendMsg
- 短信验证码登录: POST /website/bind/bindAccount/new
- 话费余额查询: GET /website/fareBalance?t={timestamp}
- 套餐流量查询: GET /website/personalHome/getNewFlow?t={timestamp}
- 语音通话查询: GET /website/personalHome/getNewVoice?videoFlag=1&t={timestamp}
- 积分查询: GET /website/score/news?t={timestamp}
- 个人基础信息: GET /website/personalHome/new/getFunctionsIndex?t={timestamp}
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

# AES 密钥体系 (全平台固定)
AES_KEY = b"1234123412ABCDEF"
AES_IV = b"ABCDEF1234123412"

# 顶象无感指纹 / 设备风控默认 AppId
DINGXIANG_APP_ID = "ad4755304a7a8694d3e52474c0247d4f"

# 基础域名
BASE_URL = "https://wx.10086.cn"


def _build_cm_ssl_ctx():
    """创建适配移动服务端的 SSL 上下文"""
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

# 模块导入时预先生成 SSL 上下文，避免在 Event Loop 内同步调用触发 HA blocking call 告警
_GLOBAL_CM_SSL_CTX = _build_cm_ssl_ctx()


class _CMClientTLSAdapter(HTTPAdapter):
    """支持旧版服务端 SSL 重协商的 TLS 适配器 (解决 Python 3.10+ OpenSSL 3.0+ unsafe legacy renegotiation 限制)"""

    def init_poolmanager(self, *args, **kwargs):
        if _GLOBAL_CM_SSL_CTX:
            kwargs["ssl_context"] = _GLOBAL_CM_SSL_CTX
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        if _GLOBAL_CM_SSL_CTX:
            kwargs["ssl_context"] = _GLOBAL_CM_SSL_CTX
        return super().proxy_manager_for(*args, **kwargs)


def aes_encrypt(plain_text: str) -> str:
    """AES-128-CBC 加密并转换为大写 Hex"""
    cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
    raw = cipher.encrypt(pad(plain_text.encode("utf-8"), 16))
    return raw.hex().upper()


def aes_decrypt(cipher_text: str) -> str:
    """解密大写 Hex 或 Base64 格式的密文"""
    text_clean = cipher_text.strip()
    # 优先尝试 Hex 解密
    if len(text_clean) >= 32 and all(c in "0123456789abcdefABCDEF" for c in text_clean):
        try:
            raw = bytes.fromhex(text_clean)
            cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
            return unpad(cipher.decrypt(raw), 16).decode("utf-8")
        except Exception as e:
            _LOGGER.debug("Hex 解密失败，尝试 Base64: %s", e)

    # 降级尝试 Base64 解密
    try:
        raw = base64.b64decode(text_clean)
        cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
        return unpad(cipher.decrypt(raw), 16).decode("utf-8")
    except Exception as e:
        raise ValueError(f"无法解密移动响应报文: {e}")


def parse_mobile_auth_data(raw_data: Any) -> Dict[str, Any]:
    """智能解析/规范化移动凭据数据 (支持字典、Cookie 字符串、JSON 等)"""
    res: Dict[str, Any] = {
        "cookies": {},
        "risk_token": "",
        "csrf_token": "",
    }
    if not raw_data:
        return res

    if isinstance(raw_data, dict):
        if "cookies" in raw_data and isinstance(raw_data["cookies"], dict):
            res["cookies"] = dict(raw_data["cookies"])
        elif "cookie" in raw_data and isinstance(raw_data["cookie"], str):
            # 将字符串解析为字典
            cookie_str = raw_data["cookie"]
            for item in re.finditer(r"([A-Za-z0-9_.-]+)=([^;,\s\"']+)", cookie_str):
                res["cookies"][item.group(1)] = item.group(2)
        else:
            # 可能是将 cookies 扁平保存在顶层的旧数据
            for k, v in raw_data.items():
                if k in ("risk_token", "csrf_token"):
                    res[k] = str(v)
                elif isinstance(v, (str, int)):
                    res["cookies"][k] = str(v)

        if "risk_token" in raw_data:
            res["risk_token"] = str(raw_data["risk_token"])
        if "csrf_token" in raw_data:
            res["csrf_token"] = str(raw_data["csrf_token"])
        return res

    if isinstance(raw_data, str):
        text = raw_data.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                d = json.loads(text)
                return parse_mobile_auth_data(d)
            except Exception:
                pass

        # 作为原始 Cookie 字符串提取
        for item in re.finditer(r"([A-Za-z0-9_.-]+)=([^;,\s\"']+)", text):
            res["cookies"][item.group(1)] = item.group(2)

    return res


def _generate_default_risk_token() -> str:
    """生成合法的默认设备指纹 Token (用于免验证码环境兜底)"""
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    random_part = "".join(random.choice(chars) for _ in range(32))
    return f"6ac9dedf{random_part}"


class MobileClient:
    """中国移动微信 H5 端数据接口调用客户端"""

    def __init__(self, phone: str, auth_data: Optional[Dict[str, Any]] = None):
        self.phone = phone.strip()
        self.auth_data = parse_mobile_auth_data(auth_data or {})
        self.cookies: Dict[str, str] = dict(self.auth_data.get("cookies") or {})
        self.risk_token: str = self.auth_data.get("risk_token") or _generate_default_risk_token()
        self.csrf_token: str = self.auth_data.get("csrf_token") or ""

        self.s = requests.Session()
        self.s.trust_env = False
        adapter = _CMClientTLSAdapter()
        self.s.mount("https://", adapter)
        self.s.mount("http://", adapter)

        # 预设通用 Headers (统一使用移动端 H5 UA 与移动官方 Referer)
        self.s.headers.update({
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Origin": "https://wx.10086.cn",
            "Referer": "https://wx.10086.cn/website/spa/main/newHome",
        })

        # 装载已有 Cookies
        self._load_cookies_to_session()

    def _init_session_context(self, force_clean: bool = True) -> None:
        """访问移动官方登录入口，自动获取全新会话 Cookie 与合法 csrf-token"""
        try:
            if force_clean:
                # 重新登录/发码前清理所有失效的历史 Cookies 与 token，避免被移动网关判定为非法会话
                self.s.cookies.clear()
                self.cookies.clear()
                self.csrf_token = ""

            # 1. 动态获取移动官方设备指纹 (ConstID)
            try:
                r_fp = self.s.get(
                    "https://yxfk.market.chinamobile.com:8081/mgt/decision-engine/udid/c1",
                    timeout=5,
                )
                m_token = re.search(r"\"data\"\s*:\s*\"([^\"]+)\"", r_fp.text)
                if m_token:
                    self.risk_token = m_token.group(1).strip()
            except Exception as e:
                _LOGGER.debug("获取移动官方设备指纹异常，使用兜底指纹: %s", e)

            # 2. 访问登录页面预热会话并提取 CSRF Token (必须使用移动端标准浏览器导航头)
            page_headers = {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
                "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Upgrade-Insecure-Requests": "1",
            }
            resp = self.s.get(f"{BASE_URL}/website/bind/bindAccount/new", headers=page_headers, timeout=10)
            self._sync_session_cookies()

            m_csrf = re.search(r"csrf\s*=\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]", resp.text)
            if m_csrf:
                self.csrf_token = m_csrf.group(1).strip()
                _LOGGER.debug("中国移动会话预热成功，取得全新 csrf-token: %s", self.csrf_token)
            else:
                _LOGGER.warning("未能在移动登录页面中解析到 csrf-token, HTTP 状态码: %s, 页面长度: %d", resp.status_code, len(resp.text))
        except Exception as err:
            _LOGGER.warning("中国移动会话预热请求失败: %s", err)

    def _load_cookies_to_session(self) -> None:
        """将 cookies 同步装入 requests.Session"""
        for k, v in self.cookies.items():
            self.s.cookies.set(k, v, domain="wx.10086.cn")

    def _sync_session_cookies(self) -> None:
        """从 requests.Session 提取最新 Cookie 并同步"""
        self.cookies.update(self.s.cookies.get_dict())

    def export_auth(self) -> Dict[str, Any]:
        """导出当前客户端完整认证与会话数据"""
        self._sync_session_cookies()
        return {
            "cookies": dict(self.cookies),
            "risk_token": self.risk_token,
            "csrf_token": self.csrf_token,
        }

    def _parse_response(self, resp: requests.Response) -> Dict[str, Any]:
        """统一解析并解密接口返回内容"""
        text = resp.text.strip()
        if not text:
            return {"http_status": resp.status_code, "raw_text": ""}

        # 检查是否为密文 (通常长度 >= 32 的十六进制串)
        if len(text) >= 32 and all(c in "0123456789abcdefABCDEF" for c in text):
            try:
                dec = aes_decrypt(text)
                data = json.loads(dec)
                if isinstance(data, dict):
                    data.setdefault("http_status", resp.status_code)
                    return data
            except Exception as e:
                _LOGGER.debug("解密密文异常: %s (原始文本前50字: %s)", e, text[:50])

        try:
            data = resp.json()
            if isinstance(data, dict):
                data.setdefault("http_status", resp.status_code)
                return data
        except Exception:
            try:
                dec = aes_decrypt(text)
                data = json.loads(dec)
                if isinstance(data, dict):
                    data.setdefault("http_status", resp.status_code)
                    return data
            except Exception:
                pass

        return {"http_status": resp.status_code, "raw_text": text}

    def _check_auth_expired(self, data: Dict[str, Any]) -> None:
        """检查返回报文中是否存在登录失效/未认证错误码或 404 升级拦截"""
        if not isinstance(data, dict):
            return

        # 移动接口在凭证(shareToken/d.sid)失效时，请求会被服务端拦截返回 404 HTML 或系统维护/升级提示
        http_status = data.get("http_status")
        raw_text = str(data.get("raw_text") or "")
        if http_status in (401, 403, 404) or any(
            kw in raw_text for kw in ("系统优化升级", "系统繁忙", "升级公告", "Mr86_bandFail", "<title>404</title>")
        ):
            raise CarrierAuthExpiredError(
                f"中国移动会话已过期 (HTTP {http_status}: 服务端会话拦截/维护页面)"
            )

        code = str(data.get("code") or data.get("status") or data.get("retCode") or data.get("resCode") or "")
        msg = str(data.get("msg") or data.get("message") or data.get("retDesc") or "")

        # 移动接口常见未登录或失效提示
        expired_codes = {"400001", "400006", "410000", "420000", "8051", "8052", "10008", "6001"}
        if code in expired_codes or any(
            kw in msg for kw in ("未登录", "重新登录", "会话已失效", "登录超时", "登录凭证已过期", "请先登录")
        ):
            raise CarrierAuthExpiredError(f"中国移动会话已过期: [{code}] {msg}")

    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """发起 HTTP 请求并处理加密和会话失效"""
        url = f"{BASE_URL}/{path.lstrip('/')}"
        kwargs.setdefault("timeout", 15)

        headers = kwargs.setdefault("headers", {})
        headers.setdefault("Accept", "application/json, text/plain, */*")
        headers.setdefault("Referer", f"{BASE_URL}/website/spa/main/newHome")
        headers.setdefault("Origin", BASE_URL)

        # 注入 csrf-token 头
        if self.csrf_token:
            headers["csrf-token"] = self.csrf_token

        try:
            resp = self.s.request(method, url, **kwargs)
            self._sync_session_cookies()
            data = self._parse_response(resp)
            self._check_auth_expired(data)
            return data
        except requests.RequestException as e:
            _LOGGER.debug("请求移动接口网络异常: %s, url: %s", e, url)
            raise
        except CarrierAuthExpiredError:
            raise

    def send_sms(self, risk_token: Optional[str] = None) -> Tuple[bool, str]:
        """向用户手机发送短信验证码

        :param risk_token: 顶象风控 Token (如为空则自动动态获取)
        :return: (是否下发成功, 提示信息)
        """
        # 1. 发送短信验证码前，强制刷新并预热全新干净会话与合法 csrf，避免失效 Cookie 导致网关拦截
        self._init_session_context(force_clean=True)

        if risk_token:
            self.risk_token = risk_token.strip()

        url_path = "website/bind/sendMsg"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "*/*",
            "Referer": f"{BASE_URL}/website/bind/bindAccount/new",
            "X-Requested-With": "XMLHttpRequest",
            "reqTmp": "2025080702",
        }
        if self.csrf_token:
            headers["csrf-token"] = self.csrf_token

        data = {
            "telephone": aes_encrypt(self.phone),
            "riskToken": self.risk_token,
        }

        try:
            res = self._request("POST", url_path, data=data, headers=headers)
            status = str(res.get("status") or res.get("code") or "")
            msg = str(res.get("message") or res.get("msg") or "")

            if status in ("0", 0, "200"):
                _LOGGER.info("移动手机号 %s 短信验证码下发成功", self.phone)
                return True, msg or "短信下发成功!"

            # 真实返回错误信息透传
            if msg and status:
                error_hint = f"{msg} (错误码: {status})"
            elif msg:
                error_hint = msg
            elif status:
                error_hint = f"移动接口下发失败 (错误码: {status})"
            elif "raw_text" in res:
                raw = res["raw_text"]
                m_title = re.search(r"<title>(.*?)</title>", raw, re.IGNORECASE)
                if m_title:
                    error_hint = f"移动官方提示: {m_title.group(1).strip()} (HTTP {res.get('http_status')})"
                else:
                    error_hint = f"移动接口异常响应: {raw[:80]}"
            else:
                error_hint = f"移动接口返回异常: {json.dumps(res, ensure_ascii=False)[:80]}"

            _LOGGER.warning("移动手机号 %s 短信验证码下发未成功: %s", self.phone, error_hint)
            return False, error_hint
        except Exception as e:
            _LOGGER.warning("移动手机号 %s 发送短信验证码请求异常: %s", self.phone, e)
            return False, f"网络请求异常: {e}"

    def login_with_sms(self, sms_code: str, risk_token: Optional[str] = None) -> Tuple[bool, str]:
        """提交短信验证码完成绑定登录

        :param sms_code: 用户收到的 6 位验证码
        :param risk_token: 顶象风控 Token
        :return: (是否登录成功, 提示信息)
        """
        code_str = sms_code.strip()
        if not code_str:
            return False, "验证码不能为空"

        if risk_token:
            self.risk_token = risk_token.strip()

        url_path = "website/bind/bindAccount/new"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": f"{BASE_URL}/website/bind/bindAccount/new",
        }
        payload = {
            "telephone": aes_encrypt(self.phone),
            "password": aes_encrypt(code_str),
            "pwdType": "02",
            "checkCtrol": 1,
            "bindSource": "",
            "sourcePage": "WMH_登录",
            "ys": "",
            "ysTitle": "",
            "constId": self.risk_token,
        }

        try:
            res = self._request("POST", url_path, json=payload, headers=headers)
            status = str(
                res.get("status")
                or res.get("returnCode")
                or res.get("code")
                or res.get("resCode")
                or res.get("retCode")
                or ""
            )
            msg = str(
                res.get("message")
                or res.get("msg")
                or res.get("descrip")
                or res.get("retDesc")
                or ""
            )

            # 优先识别失败错误码与错误信息 (如 6005 验证码有误)
            if status in ("6005", "400001", "8051", "8052") or any(
                kw in msg for kw in ("有误", "错误", "失效", "超限", "频繁", "失败")
            ):
                return False, msg or f"验证码错误或失效 (状态码: {status})"

            # 只要带有 shareToken，或状态码为 0/200/2710，或提示消息包含"成功"
            has_share_token = bool(self.cookies.get("shareToken") or self.s.cookies.get("shareToken"))
            is_success_msg = any(kw in msg for kw in ("成功", "0", "OK", "ok"))
            is_success_status = status in ("0", 0, "200", 200, "2710", "0000")

            if is_success_status or is_success_msg or has_share_token:
                self._sync_session_cookies()
                _LOGGER.info("移动手机号 %s 短信验证码登录成功，已保存会话 Cookies", self.phone)
                return True, "登录成功"

            return False, msg or f"登录失败(错误码: {status})"
        except Exception as e:
            _LOGGER.warning("移动手机号 %s 提交短信验证码登录异常: %s", self.phone, e)
            return False, str(e)

    def get_cust_base_info(self) -> Dict[str, Any]:
        """获取个人客户基础档案 (机主姓名、入网时间、网龄、主套餐等，亦供轻量探活)"""
        now_ts = str(int(time.time() * 1000))
        return self._request("GET", f"website/personalHome/getCustBaseInfo?t={now_ts}")

    def fetch_all_data(self) -> Dict[str, Any]:
        """全量拉取中国移动账户数据 (话费余额、套餐流量、语音通话、积分、基础信息)"""
        # 归属地优先通过本地离线号码归属地库查询
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
            "star_level": "0星级",
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

        now_ts = str(int(time.time() * 1000))
        success_modules = 0

        # 1. 实时话费与余额查询 (fareBalance)
        try:
            fee_res = self._request("GET", f"website/fareBalance?t={now_ts}")
            data_sec = fee_res.get("data") or {}
            real_fee_rsp = data_sec.get("realFeeQryRsp") or {}
            if isinstance(real_fee_rsp, dict) and real_fee_rsp:
                cur_fee = float(real_fee_rsp.get("curFeeTotal") or real_fee_rsp.get("curFee") or 0.0)
                real_fee = float(real_fee_rsp.get("realFee") or 0.0)
                owe_fee = float(real_fee_rsp.get("oweFee") or 0.0)
                data_out["balance"] = cur_fee
                data_out["charge"] = real_fee
                data_out["owed"] = owe_fee > 0
                data_out["owe_fee"] = owe_fee
                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动话费余额异常: %s", e)

        # 2. 套餐余量查询 (getNewFlow)
        try:
            flow_res = self._request("GET", f"website/personalHome/getNewFlow?t={now_ts}")
            obj = flow_res.get("object") or {}
            res_data = obj.get("resultData") or {}
            flow_sum_info = res_data.get("flowSumInfo") or []
            if isinstance(flow_sum_info, list) and flow_sum_info:
                total_remain_mb = 0.0
                total_used_mb = 0.0
                total_sum_mb = 0.0
                flow_pkgs = []

                # 优先寻找包含"总览"或汇总项
                has_overview = False
                for item in flow_sum_info:
                    name = str(item.get("cardName") or "")
                    rem_mb = float(item.get("flowRemain") or item.get("flowRemainNum") or 0.0)
                    usd_mb = float(item.get("flowUse") or item.get("flowUsdNum") or 0.0)
                    sum_mb = float(item.get("flowSum") or item.get("flowSumNum") or 0.0)

                    if "总览" in name or "国内总览" in name:
                        total_remain_mb = rem_mb
                        total_used_mb = usd_mb
                        total_sum_mb = sum_mb
                        has_overview = True

                    flow_pkgs.append(f"{name}: 剩余 {rem_mb/1024:.2f}GB / 共 {sum_mb/1024:.2f}GB")

                # 如果没有总览项，做累加
                if not has_overview:
                    for item in flow_sum_info:
                        rem_mb = float(item.get("flowRemain") or item.get("flowRemainNum") or 0.0)
                        usd_mb = float(item.get("flowUse") or item.get("flowUsdNum") or 0.0)
                        sum_mb = float(item.get("flowSum") or item.get("flowSumNum") or 0.0)
                        total_remain_mb += rem_mb
                        total_used_mb += usd_mb
                        total_sum_mb += sum_mb

                data_out["flow_remain"] = round(total_remain_mb / 1024.0, 2)
                data_out["flow_used"] = round(total_used_mb / 1024.0, 2)
                data_out["flow_total"] = round(total_sum_mb / 1024.0, 2)
                data_out["flow_packages"] = flow_pkgs
                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动套餐流量异常: %s", e)

        # 3. 语音通话余量查询 (getNewVoice)
        try:
            voice_res = self._request("GET", f"website/personalHome/getNewVoice?videoFlag=1&t={now_ts}")
            obj_v = voice_res.get("object") or {}
            res_v = obj_v.get("resultData") or {}
            sum_list = res_v.get("flowSumList") or []
            if isinstance(sum_list, list) and sum_list:
                voice_pkgs = []
                for item in sum_list:
                    name = str(item.get("cardName") or "")
                    rem_min = int(float(item.get("flowRemain") or 0))
                    usd_min = int(float(item.get("flowUse") or 0))
                    sum_min = int(float(item.get("flowSum") or 0))

                    if "语音" in name or "通话" in name:
                        data_out["voice_remain"] = rem_min
                        data_out["voice_used"] = usd_min
                        data_out["voice_total"] = sum_min
                        voice_pkgs.append(f"{name}: 剩余 {rem_min}分钟 / 共 {sum_min}分钟")
                    elif "短信" in name:
                        voice_pkgs.append(f"{name}: 剩余 {rem_min}条 / 共 {sum_min}条")

                if voice_pkgs:
                    data_out["voice_packages"] = voice_pkgs
                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动通话余量异常: %s", e)

        # 4. 积分查询 (score/news)
        try:
            score_res = self._request("GET", f"website/score/news?t={now_ts}")
            data_score = score_res.get("data") or {}
            val = data_score.get("availableScore") or data_score.get("score") or score_res.get("score")
            if val is not None:
                data_out["integral"] = int(float(val))
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.debug("拉取移动积分异常: %s", e)

        # 5. 个人客户基础档案 (getCustBaseInfo - 机主姓名、入网时间、网龄、主套餐等)
        try:
            cust_res = self.get_cust_base_info()
            bean = cust_res.get("bean") or {}
            cdata = bean.get("data") or {}
            if isinstance(cdata, dict) and cdata:
                # 提取真实机主姓名 (如 "丛*")
                name = cdata.get("userName") or cdata.get("custName")
                if name and str(name).strip():
                    data_out["real_name"] = str(name).strip()

                # 实名登记信息
                if cdata.get("realNameInfo"):
                    data_out["real_name_info"] = str(cdata["realNameInfo"]).strip()

                # 主套餐服务
                if cdata.get("tariffPackages"):
                    data_out["speed_service"] = str(cdata["tariffPackages"]).strip()

                # 入网时间与网龄
                begin_raw = str(cdata.get("userBegin") or "").strip()
                if len(begin_raw) >= 8:
                    try:
                        if len(begin_raw) >= 14:
                            data_out["user_begin"] = f"{begin_raw[0:4]}-{begin_raw[4:6]}-{begin_raw[6:8]} {begin_raw[8:10]}:{begin_raw[10:12]}:{begin_raw[12:14]}"
                        else:
                            data_out["user_begin"] = f"{begin_raw[0:4]}-{begin_raw[4:6]}-{begin_raw[6:8]}"
                    except Exception:
                        data_out["user_begin"] = begin_raw

                days = cdata.get("cmccDays")
                if days is not None and str(days).isdigit():
                    d_int = int(days)
                    if d_int >= 365:
                        years = d_int // 365
                        months = (d_int % 365) // 30
                        data_out["user_age"] = f"{years}年{months}个月 ({d_int}天)"
                    else:
                        data_out["user_age"] = f"{d_int}天"

                # 归属地补充
                loc = cdata.get("customerAssignment") or cdata.get("placeName")
                if loc and str(loc).strip():
                    data_out["location"] = str(loc).strip()
                success_modules += 1
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.warning("拉取移动客户基础档案异常: %s", e)

        # 6. 星级与资费关键信息补充 (getCustomerKeyMessage)
        try:
            key_res = self._request("GET", f"website/fareBalance/getCustomerKeyMessage?t={now_ts}")
            if isinstance(key_res, dict):
                star = key_res.get("telNumStar") or key_res.get("starLevel")
                if star and str(star).strip() and str(star).strip() != "未评级":
                    s_str = str(star).strip()
                    data_out["star_level"] = f"{s_str}星级" if not s_str.endswith("星级") else s_str
                elif star and str(star).strip() == "未评级":
                    data_out["star_level"] = "未评级"

                if not data_out.get("speed_service") and key_res.get("tariffPackages"):
                    data_out["speed_service"] = str(key_res["tariffPackages"]).strip()
        except CarrierAuthExpiredError:
            raise
        except Exception as e:
            _LOGGER.debug("拉取移动关键星级信息异常: %s", e)

        # 若没有任何核心模块获取到数据，说明会话凭证已失效或接口被拦截
        if success_modules == 0:
            raise CarrierAuthExpiredError("未能从中国移动接口获取到有效业务数据，会话可能已过期")

        return data_out
