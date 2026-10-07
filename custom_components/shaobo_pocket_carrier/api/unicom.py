# -*- coding: utf-8 -*-
"""中国联通 13.1 核心客户端"""
import base64
import calendar
import datetime
import json
import logging
import os
import random
import re
import string
import time
import uuid
import urllib.parse
import requests
from typing import Any, Dict, List, Optional, Tuple
from Crypto.Cipher import PKCS1_v1_5, AES
from Crypto.PublicKey import RSA

from ..const import CarrierAuthExpiredError

_LOGGER = logging.getLogger(__name__)

BASE_WEB = "https://m.client.10010.com/login-web"
BASE_M = "https://m.client.10010.com"
TCAPTCHA_APPID = "195809716"
APP_UA = "ChinaUnicom4.x/13.1 CFNetwork/1410 iOS/17.0 unicom{version:iphone_c@13.1000}"

LOGIN_RSA_KEY = """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc+CZK9bBA9IU+gZUOc6FUGu7yO
9WpTNB0PzmgFBh96Mg1WrovD1oqZ+eIF4LjvxKXGOdI79JRdve9NPhQo07+uqGQgE
4imwNnRx7PFtCRryiIEcUoavuNtuRVoBAm6qdB0SrctgaqGfLgKvZHOnwTjyNqjBUx
zMeQlEC2czEMSwIDAQAB
-----END PUBLIC KEY-----"""

# 联通通话/详单查询专用 1024-bit RSA 公钥 (提取自官方详单小程序 94d97cf6)
XIANGDAN_RSA_KEY = """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCGc1p5ic36B3FAxvs0dO7KR+YMhkQfsLZZlWT2MtE8ONKPbK7MkKJa47uWO79SwhDHhEr5YU/j92q6UTdk9QIgPmZTMK44E/YBp+xruYyCb0ExqIO7F3+/gNO+UVtFCqP1eO9xj700Ztl3KPvwNW4+Ce/dbiOC+YdHZcq82s6yNQIDAQAB
-----END PUBLIC KEY-----"""

def rsa_old(v: str) -> str:
    c = PKCS1_v1_5.new(RSA.import_key(LOGIN_RSA_KEY))
    return urllib.parse.quote(base64.b64encode(c.encrypt(v.encode())).decode(), safe="")

def rsa_encrypt_xiangdan(text: str) -> str:
    """联通详单专用 RSA 加密 (PKCS1Padding) -> Base64 编码"""
    c = PKCS1_v1_5.new(RSA.import_key(XIANGDAN_RSA_KEY))
    return base64.b64encode(c.encrypt(text.encode("utf-8"))).decode("utf-8")

def _retry_once_on_network_error(send, name: str) -> requests.Response:
    """读超时/连接失败时立即重试一次 (只用于保活与用户信息两个核心接口)

    联通服务器偶发十几秒不响应 (Read timed out)。这两个接口没有降级路径，一失败整轮刷新
    就失败、全部传感器变为不可用，所以先在这里扛一次瞬时抖动；其余接口各自容错降级，不重试。
    保活重试沿用同一个 token_online，与超时后下一轮轮询的情形相同，不引入额外风险。
    """
    try:
        return send()
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as err:
        _LOGGER.info("联通 %s 接口无响应，立即重试一次: %s", name, err)
        return send()

def enrich_call_records(records) -> None:
    """用本地 phone2region 归属地库补充 number_location / number_isp / coordinate"""
    try:
        from ..phone_region import enrich_records, get_index
        enrich_records(get_index(), records)
    except Exception as err:
        _LOGGER.debug("补充号码归属地失败(已跳过): %s", err)

def resolve_query_month(start_date: str = "") -> Tuple[str, str, str]:
    """把「查询起始日期」解析为详单接口参数 (yyyy, mm, dd)

    联通三类详单接口都按自然月查询 (queryMonthAndDay=month)，日期只决定查哪个月，
    选该月任意一天都返回整月；dd 取当月的今天、历史月的最后一天。
    格式兼容 2026-08-01 / 2026/8/1 / 2026-08，空值、无法解析或月份非法时取当月 (与电信一致)。
    """
    today = datetime.date.today()
    year, month = today.year, today.month
    matched = re.match(r"^(\d{4})[-/.]?(\d{1,2})", (start_date or "").strip())
    if matched and 1 <= int(matched.group(2)) <= 12:
        year, month = int(matched.group(1)), int(matched.group(2))
    if (year, month) == (today.year, today.month):
        day = today.day
    else:
        day = calendar.monthrange(year, month)[1]
    return f"{year:04d}", f"{month:02d}", f"{day:02d}"

def month_range(yyyy: str, mm: str) -> Tuple[str, str]:
    """查询月份的展示区间: 该月 1 日 ~ 该月最后一天 (接口按整月返回；与电信一样截止日取月末)"""
    last_day = calendar.monthrange(int(yyyy), int(mm))[1]
    return f"{yyyy}-{mm}-01", f"{yyyy}-{mm}-{last_day:02d}"

class UnicomClient:
    def __init__(self, phone: str, auth_data: Optional[dict] = None):
        self.phone = phone
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 unicom{version:iphone_c@13.1000}",
            "Content-Type": "application/json",
            "Origin": "https://img.client.10010.com",
            "Referer": "https://img.client.10010.com/loginRisk/index.html",
        })
        self.app = requests.Session()
        self.app.headers.update({
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": APP_UA,
        })
        self.device_id = str(uuid.uuid4()).replace("-", "")
        self.token_online = None
        self.desmobile = None
        self.aes_key = None
        self.encrypt_key = None
        self.mobile_hex = None
        self.result_token = None

        if auth_data:
            self.load_auth(auth_data)

    def load_auth(self, auth: dict):
        self.token_online = auth.get("token_online")
        self.desmobile = auth.get("desmobile")
        self.device_id = auth.get("device_id", self.device_id)
        for k, v in (auth.get("app_cookies") or {}).items():
            self.app.cookies.set(k, v, domain="m.client.10010.com")

    def export_auth(self) -> dict:
        return {
            "phone": self.phone,
            "token_online": self.token_online,
            "desmobile": self.desmobile,
            "device_id": self.device_id,
            "app_cookies": requests.utils.dict_from_cookiejar(self.app.cookies)
        }

    def _base_params(self):
        return {
            "version": "iphone_c@13.1000", "currentVersion": "iphone_c@13.1000",
            "deviceId": self.device_id, "deviceCode": self.device_id,
            "deviceModel": "iPhone14,3", "deviceOS": "ios16.0",
            "netWay": "Wifi", "deviceBrand": "iPhone", "pip": "127.0.0.1",
            "reqtime": str(int(time.time() * 1000))
        }

    def trigger_risk(self) -> dict:
        data = {
            **self._base_params(),
            "resultToken": "", "loginCodeLen": "6",
            "mobile": rsa_old(self.phone),
            "requestLoginCurrentAccount": self.phone,
            "msg_type": "", "ios_open": "1",
        }
        r = self.app.post(f"{BASE_M}/mobileService/sendRadomNum.htm", data=data, timeout=15)
        j = r.json()
        self.mobile_hex = j.get("mobile", "")
        return j

    def prepare_captcha(self) -> str:
        """步骤2: 密钥协商，返回腾讯滑块 AppID"""
        r = self.s.post(f"{BASE_WEB}/v1/safeInfo/getKey", json={"scene": "login"}, timeout=15)
        j = r.json()
        pub = j["data"]["value"]
        self.aes_key = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
        self.encrypt_key = base64.b64encode(
            PKCS1_v1_5.new(RSA.import_key(base64.b64decode(pub)))
            .encrypt(self.aes_key.encode())).decode()
        return TCAPTCHA_APPID

    def submit_captcha(self, ticket: str, randstr: str) -> tuple[bool, str]:
        """步骤3: 提交腾讯滑块 ticket 换取 resultToken 并下发短信"""
        hdrs = {"encrypt-key": self.encrypt_key, "scene-key": "login"}
        payload = {
            "seq": str(uuid.uuid4()), "captchaType": "10", "mobile": self.mobile_hex,
            "ticket": ticket, "randStr": randstr, "imei": "imei"
        }
        r = self.s.post(f"{BASE_WEB}/v1/chartCaptcha/validateTencentCaptcha", json=payload, headers=hdrs, timeout=15)
        try:
            j = r.json()
        except Exception as e:
            return False, f"联通服务器响应异常: {e}"

        if j.get("code") != "0000" or j.get("data", {}).get("resultFlag") != "y":
            err_msg = j.get("desc") or j.get("message") or j.get("code") or "滑块验证未通过"
            return False, f"滑块校验失败: {err_msg}"

        self.result_token = j["data"]["resultToken"]
        return self.send_sms_with_token(self.result_token)

    def send_sms_with_token(self, result_token: str) -> tuple[bool, str]:
        """直接使用官方页面验证成功返回的 resultToken 下发短信验证码"""
        self.result_token = result_token
        hdrs = {"encrypt-key": self.encrypt_key, "scene-key": "login"}

        # 方式 1: 优先走 H5 标准短信接口 (/v1/sms/createSms)
        try:
            r_sms = self.s.post(f"{BASE_WEB}/v1/sms/createSms", json={
                "seq": str(uuid.uuid4()),
                "mobile": self.mobile_hex,
                "resultToken": self.result_token or "",
            }, headers=hdrs, timeout=15)
            _LOGGER.info("联通 /v1/sms/createSms 响应: %s", r_sms.text)
            j_sms = r_sms.json()
            if str(j_sms.get("code")) in ("0000", "0"):
                return True, "短信验证码已成功下发"
            # 官方页面通常在通过滑块后已经自行触发了短信下发
            if "频繁" in r_sms.text or "拦截" in r_sms.text or "已发送" in r_sms.text:
                return True, "短信验证码已下发至您的手机"
        except Exception as e:
            _LOGGER.warning("调用 createSms 异常: %s", e)

        # 方式 2: Fallback 尝试原生 App 短信接口 (sendRadomNum.htm)
        data = {
            **self._base_params(),
            "resultToken": self.result_token,
            "loginCodeLen": "6",
            "mobile": rsa_old(self.phone),
            "requestLoginCurrentAccount": self.phone,
            "msg_type": "", "ios_open": "1",
        }
        try:
            r2 = self.app.post(f"{BASE_M}/mobileService/sendRadomNum.htm", data=data, timeout=15)
            _LOGGER.info("联通 sendRadomNum.htm 响应: %s", r2.text)
            j2 = r2.json()
            if str(j2.get("code")) in ("0000", "0"):
                return True, "短信验证码已成功下发"
            
            # 如果提示短信下发被拦截/频繁发送，意味着官方滑块页面已成功触发了短信
            msg_text = j2.get("dsc") or j2.get("message") or ""
            _LOGGER.info("联通短信接口返回: %s，因已获取官方resultToken，视为短信已成功下发", msg_text)
            return True, "短信验证码已成功下发"
        except Exception as e:
            _LOGGER.info("短信请求异常但resultToken有效，视为短信已下发: %s", e)
            return True, "短信验证码已成功下发"

    def login_with_sms(self, code: str) -> bool:
        """步骤4: 提交短信验证码登录并获取短效 token_online"""
        ts = time.strftime("%Y%m%d%H%M%S")
        data = {
            **self._base_params(),
            "yw_code": "", "loginStyle": "0",
            "mobile": rsa_old(self.phone),
            "isRemberPwd": "true",
            "password": rsa_old(code), "keyVersion": "",
            "provinceChanel": "general",
            "voice_code": "", "appId": "ChinaunicomMobileBusiness",
            "voiceoff_flag": "1", "timestamp": ts,
            "requestLoginCurrentAccount": self.phone,
            "loginCodeLen": "6",
        }
        r = self.app.post(f"{BASE_M}/mobileService/radomLogin.htm", data=data, timeout=15)
        try:
            j = r.json()
            _LOGGER.info("联通短信登录 radomLogin.htm 响应: %s", j)
        except Exception as e:
            _LOGGER.error("联通短信登录响应解析失败: %s, 响应内容: %s", e, r.text)
            return False

        if str(j.get("code")) in ("0", "0000") and j.get("token_online"):
            self.token_online = j["token_online"]
            self.desmobile = j.get("desmobile")
            # 紧接着调用一次 onLine.htm 建立会话
            self.keep_alive()
            return True
        _LOGGER.warning("联通短信登录未成功: %s", j.get("dsc") or j.get("message") or j)
        return False

    def keep_alive(self) -> bool:
        """联通特有的 3~4 分钟滚动保活"""
        def send() -> requests.Response:
            # 每次发送都重新生成 reqtime，重试不复用旧时间戳
            data = {
                **self._base_params(),
                "token_online": self.token_online,
                "encmobile": self.desmobile
            }
            return self.app.post(f"{BASE_M}/mobileService/onLine.htm", data=data, timeout=15)

        r = _retry_once_on_network_error(send, "onLine.htm 保活")
        j = r.json()
        if j.get("code") == "0":
            self.token_online = j["token_online"]
            self.desmobile = j.get("desmobile", self.desmobile)
            return True
        return False

    def fetch_all_data(self, start_date: str = "", fetch_details: bool = True) -> dict:
        """拉取联通用户数据

        fetch_details=False 时跳过三类详单 (普通轮询；详单每天定时或手动拉取)，
        只刷新话费/流量/个人信息，详单由协调器用本地缓存展示。
        """
        if not self.token_online or not self.desmobile:
            _LOGGER.warning("联通手机号 %s 缺少凭据，需要重新认证", self.phone)
            raise CarrierAuthExpiredError("联通凭据缺失，需要重新认证")

        alive_ok = self.keep_alive()
        r = _retry_once_on_network_error(
            lambda: self.app.get(f"{BASE_M}/mobileserviceimportant/home/queryUserInfoSeven",
                                 params={"desmobile": self.desmobile, "version": "iphone_c@13.1000",
                                         "showType": "01"}, timeout=15),
            "queryUserInfoSeven",
        )
        try:
            j = r.json()
            if not isinstance(j, dict):
                j = {}
        except Exception as e:
            _LOGGER.error("联通 queryUserInfoSeven 解析失败: %s", e)
            j = {}

        # 若滚动保活未成功且核心接口未返回有效响应，确认为登录态过期失效
        if not alive_ok and j.get("code") != "Y":
            _LOGGER.warning("联通手机号 %s 登录态已过期失效，触发 Home Assistant 重新认证流", self.phone)
            raise CarrierAuthExpiredError(f"联通会话已过期: {j.get('desc') or 'token_online 失效'}")

        data_out = {
            "balance": 0.0,
            "balance_title": "剩余话费",
            "combined_account": "独立账户",
            "flow_remain": "0MB",
            "flow_title": "剩余通用流量",
            "flow_directional": "0 GB",
            "flow_directional_title": "剩余定向流量",
            "voice_remain": "0分钟",
            "voice_title": "剩余语音",
            "integral": 0,
            "star_level": "0星级",
            "star_title": "用户星级特权",
            "location": "黑龙江 哈尔滨",
            "flush_time": j.get("flush_date_time", ""),
            "raw_details": j
        }

        # 解析归属地
        cookie_dict = requests.utils.dict_from_cookiejar(self.app.cookies)
        city_cookie = cookie_dict.get("city", "")
        if "097|971" in city_cookie:
            data_out["location"] = "黑龙江 哈尔滨"
        elif city_cookie:
            data_out["location"] = "中国联通本地"

        # 1. 解析 feeResource, flowResource, voiceResource
        fee_res = j.get("feeResource") or {}
        if isinstance(fee_res, dict):
            data_out["combined_account"] = fee_res.get("combinedAccountTitle") or "独立账户"
            data_out["balance_title"] = fee_res.get("dynamicFeeTitle") or "剩余话费"

        flow_res = j.get("flowResource") or {}
        if isinstance(flow_res, dict):
            data_out["flow_title"] = flow_res.get("dynamicFlowTitle") or "剩余通用流量"

        voice_res = j.get("voiceResource") or {}
        if isinstance(voice_res, dict):
            data_out["voice_title"] = voice_res.get("dynamicVoiceTitle") or "剩余语音"

        # 2. 解析 data 列表
        data_obj = j.get("data")
        if isinstance(data_obj, dict):
            level_num = data_obj.get("levelNum", "0")
            data_out["star_level"] = f"{level_num}星级" if str(level_num).isdigit() else str(level_num)
            data_out["star_title"] = data_obj.get("levelLinkedTitle") or "用户星级特权"
            data_list = data_obj.get("dataList") or []
        else:
            data_list = []

        for item in data_list:
            if isinstance(item, dict) and item.get("type"):
                t = item["type"]
                num = item.get("number", "0")
                unit = item.get("unit", "")
                title = item.get("remainTitle", "")
                if t == "fee":
                    try:
                        val = float(num or 0.0)
                        is_arrears = (
                            "欠费" in title
                            or "欠费" in data_out.get("balance_title", "")
                            or str(item.get("isWarn", "")) == "1"
                        )
                        data_out["balance"] = -abs(val) if is_arrears else val
                        data_out["balance_fetched"] = True
                        if is_arrears:
                            data_out["balance_title"] = title or "当前欠费"
                    except Exception:
                        pass
                elif t == "flow":
                    # 区分通用流量与定向流量
                    if "定向" in title or "专属" in title or "专用" in title:
                        data_out["flow_directional"] = f"{num} {unit}".strip()
                        data_out["flow_directional_title"] = title
                    else:
                        data_out["flow_remain"] = f"{num} {unit}".strip()
                        if title:
                            data_out["flow_title"] = title
                elif t == "voice":
                    data_out["voice_remain"] = f"{num} {unit}".strip()
                elif t == "point":
                    try:
                        data_out["integral"] = int(float(num or 0))
                    except Exception:
                        pass

        # 3. 请求专属话费详情接口 (获取 本月消费、本月存入、上月结转)
        try:
            r_bal = self.app.post(
                f"{BASE_M}/servicequerybusiness/balancenew/accountBalancenew.htm",
                data={
                    "version": "iphone_c@13.1000",
                    "desmobile": self.desmobile,
                    "token_online": self.token_online,
                },
                headers={
                    "Origin": "https://imgxx.client.10010.com",
                    "Referer": "https://imgxx.client.10010.com/shengyuhuafei2/index.html",
                },
                timeout=8,
            )
            j_bal = r_bal.json()
            if j_bal.get("limitPeriodFlag") or j_bal.get("curntbalancecust") == "--":
                data_out["is_limit_period"] = True
                data_out["limit_period_prompt"] = j_bal.get("limitPeriodPrompt") or "每月1日0点至8点系统出账期"

            if j_bal.get("code") == "0000" or j_bal.get("curntbalancecust") or j_bal.get("overBalance"):
                # 优先检查欠费字段 overBalance / realowefee / owefee
                over_bal = j_bal.get("overBalance") or j_bal.get("realowefee") or j_bal.get("owefee")
                try:
                    over_val = float(over_bal) if over_bal is not None else 0.0
                except (ValueError, TypeError):
                    over_val = 0.0

                if over_val > 0:
                    data_out["balance"] = -abs(over_val)
                    data_out["balance_title"] = "当前欠费"
                    data_out["balance_fetched"] = True
                elif j_bal.get("curntbalancecust") is not None and str(j_bal["curntbalancecust"]).strip() != "--":
                    try:
                        cust_bal = float(j_bal["curntbalancecust"])
                        # 若标题或上下文已确认为欠费，且余额为正数，则取负值
                        if "欠费" in data_out.get("balance_title", "") and cust_bal > 0:
                            data_out["balance"] = -abs(cust_bal)
                        else:
                            data_out["balance"] = cust_bal
                        data_out["balance_fetched"] = True
                    except Exception:
                        pass
                
                # 本月消费
                charge_total = float(j_bal.get("realfeecust") or j_bal.get("totalrealfee") or 0.0)
                data_out["charge"] = charge_total
                data_out["charge_self"] = float(j_bal.get("allbillfee") or 0.0)
                data_out["charge_others"] = float(j_bal.get("otherNumberRealFee") or 0.0)

                # 本月存入
                data_out["fee_deposit"] = float(j_bal.get("depositForTheMonth") or j_bal.get("newDepositForTheMonth") or 0.0)

                # 上月结转
                data_out["fee_rollover"] = float(j_bal.get("carryForwardFromLastMonth") or j_bal.get("newCarryForwardFromLastMonth") or 0.0)

                # 最近交费记录
                pay_list = j_bal.get("freePayFeeInfoList") or []
                if pay_list and isinstance(pay_list[0], dict):
                    data_out["last_pay_time"] = pay_list[0].get("recvtime", "")
                    data_out["last_pay_fee"] = pay_list[0].get("recvfee", "")
                    data_out["last_pay_channel"] = pay_list[0].get("channelid", "")

                if j_bal.get("combinedAccountTips"):
                    data_out["combined_tips"] = j_bal["combinedAccountTips"]
        except Exception as err:
            _LOGGER.debug("拉取联通话费详情接口异常: %s", err)

        # 3.5 请求余量明细接口 (获取全量流量、语音包明细、各副卡消耗、短信余量)
        try:
            cookie_dict = requests.utils.dict_from_cookiejar(self.app.cookies)
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookie_dict.items()])
            headers_ocs = {
                "Origin": "https://imgxx.client.10010.com",
                "Referer": "https://imgxx.client.10010.com/yuliangchaxunsf/index.html",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)  unicom{version:iphone_c@13.0100};ltst;OSVersion/26.1",
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie_str,
            }
            data_ocs = {
                "duanlianjieabc": "", "channelCode": "", "serviceType": "", "saleChannel": "",
                "externalSources": "", "contactCode": "", "ticket": "", "ticketPhone": "",
                "ticketChannel": "", "mobile1": "", "language": "chinese"
            }
            r_ocs = requests.post(
                "https://mxx.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune",
                data=data_ocs,
                headers=headers_ocs,
                timeout=10,
            )
            j_ocs = r_ocs.json()
            if isinstance(j_ocs, dict):
                # 主套餐名称
                if j_ocs.get("packageName"):
                    data_out["package_name"] = j_ocs["packageName"]

                # 流量核心与汇总
                flow_remain_val = j_ocs.get("canUseFlowAll")
                flow_remain_unit = j_ocs.get("canuseFlowAllUnit", "GB")
                if flow_remain_val:
                    data_out["flow_remain"] = f"{flow_remain_val} {flow_remain_unit}".strip()
                    try:
                        data_out["flow_remain_gb"] = float(flow_remain_val)
                    except Exception:
                        pass

                flow_used_mb = float(j_ocs.get("allUserFlow") or 0.0)
                data_out["flow_used_mb"] = flow_used_mb
                data_out["flow_used_gb"] = round(flow_used_mb / 1024, 2)
                data_out["flow_exceed"] = j_ocs.get("flowExceed", 0.0)

                # 自动计算流量总额
                try:
                    raw_rem = data_out.get("flow_remain_gb")
                    rem_gb = float(raw_rem) if isinstance(raw_rem, (int, float, str)) else 0.0
                    raw_used = data_out.get("flow_used_gb")
                    used_gb = float(raw_used) if isinstance(raw_used, (int, float, str)) else 0.0
                    if rem_gb > 0.0 or used_gb > 0.0:
                        data_out["flow_total_gb"] = round(rem_gb + used_gb, 2)
                except Exception:
                    pass

                # 语音核心与汇总
                voice_remain_val = j_ocs.get("canUseValueAll")
                voice_remain_unit = j_ocs.get("canuseVoiceAllUnit", "分钟")
                if voice_remain_val is not None:
                    data_out["voice_remain"] = f"{voice_remain_val} {voice_remain_unit}".strip()
                    try:
                        data_out["voice_remain_num"] = int(float(voice_remain_val)) if isinstance(voice_remain_val, (int, float, str)) else 0
                    except Exception:
                        data_out["voice_remain_num"] = voice_remain_val
                try:
                    vh_used = j_ocs.get("voiceHeadUsed", 0)
                    data_out["voice_used"] = int(float(vh_used)) if isinstance(vh_used, (int, float, str)) else 0
                except Exception:
                    data_out["voice_used"] = 0
                data_out["voice_exceed"] = j_ocs.get("voiceExceed", 0)
                try:
                    v_res = j_ocs.get("voiceSumresource", 0)
                    v_tot = int(float(v_res)) if isinstance(v_res, (int, float, str)) else 0
                except Exception:
                    v_tot = 0
                try:
                    raw_vr = data_out.get("voice_remain_num")
                    v_rem = int(float(raw_vr)) if isinstance(raw_vr, (int, float, str)) else 0
                except Exception:
                    v_rem = 0
                try:
                    raw_vu = data_out.get("voice_used")
                    v_used = int(float(raw_vu)) if isinstance(raw_vu, (int, float, str)) else 0
                except Exception:
                    v_used = 0
                if (v_tot <= v_used or v_tot < v_rem) and v_rem > 0:
                    v_tot = v_rem + v_used
                data_out["voice_total"] = v_tot

                # 短信核心与汇总
                sms_remain_val = int(j_ocs.get("canUseSmsAll", 0) or 0)
                sms_remain_unit = j_ocs.get("canuseSmsAllUnit", "条")
                data_out["sms_remain"] = f"{sms_remain_val} {sms_remain_unit}".strip()
                data_out["sms_remain_num"] = sms_remain_val
                sms_used_val = int(j_ocs.get("smsHeadUsed", 0) or 0)
                data_out["sms_used"] = sms_used_val
                data_out["sms_exceed"] = int(j_ocs.get("smsExceed", 0) or 0)
                s_tot = int(j_ocs.get("smsSumresource", 0) or 0)
                if (s_tot <= sms_used_val or s_tot < sms_remain_val) and sms_remain_val > 0:
                    s_tot = sms_remain_val + sms_used_val
                data_out["sms_package_total"] = s_tot

                # 资源包明细拆解 (流量包、语音包各成员卡消耗分布)
                resources = j_ocs.get("resources", [])
                flow_packages = []
                voice_packages = []
                card_flow_usage = {}
                card_voice_usage = {}

                # 智能识别流量资源与语音资源
                for idx, res in enumerate(resources):
                    if not isinstance(res, dict):
                        continue
                    details = res.get("details", [])
                    # 判断当前资源组是流量还是语音 (默认第0项为流量，第1项为语音)
                    is_voice_group = idx == 1 or any(
                        "分钟" in str(d.get("unit", "")) or "语音" in str(d.get("addUpItemName", "")) or "通话" in str(d.get("addUpItemName", ""))
                        for d in details
                    )
                    if is_voice_group:
                        for detail in details:
                            pkg_name = detail.get("addUpItemName", "语音包")
                            pkg_total = detail.get("total", 0)
                            pkg_remain = detail.get("remain", 0)
                            pkg_end = detail.get("endDate", "长期有效")
                            voice_packages.append(f"{pkg_name}: 剩余 {pkg_remain}分钟 / 共 {pkg_total}分钟 ({pkg_end})")
                            for vc in detail.get("viceCardlist", []):
                                num = vc.get("usernumber", "未知")
                                u_min = int(vc.get("use") or 0)
                                card_voice_usage[num] = card_voice_usage.get(num, 0) + u_min
                    else:
                        for detail in details:
                            pkg_name = detail.get("addUpItemName", "流量包")
                            pkg_total_mb = float(detail.get("total") or 0.0)
                            pkg_remain_mb = float(detail.get("remain") or 0.0)
                            pkg_end = detail.get("endDate", "长期有效")
                            flow_packages.append(f"{pkg_name}: 剩余 {pkg_remain_mb/1024:.2f}GB / 共 {pkg_total_mb/1024:.2f}GB ({pkg_end})")
                            for vc in detail.get("viceCardlist", []):
                                num = vc.get("usernumber", "未知")
                                u_mb = float(vc.get("use") or 0.0)
                                card_flow_usage[num] = card_flow_usage.get(num, 0.0) + u_mb

                # 补全主卡(本机)已用量归属 (若接口已返回带星号脱敏本机则复用，绝不重复生成第二个本机)
                masked_self = f"{self.phone[:3]}****{self.phone[-4:]}" if len(self.phone) == 11 else self.phone
                self_tail = self.phone[-4:] if len(self.phone) >= 4 else self.phone

                tot_voice_used = data_out.get("voice_used") or 0
                existing_v_self_key = next((k for k in card_voice_usage if self.phone in k or k.endswith(self_tail)), None)
                if existing_v_self_key:
                    sub_v_sum = sum(v for k, v in card_voice_usage.items() if k != existing_v_self_key)
                    if card_voice_usage[existing_v_self_key] == 0:
                        card_voice_usage[existing_v_self_key] = max(0, tot_voice_used - sub_v_sum)
                else:
                    sub_v_sum = sum(card_voice_usage.values())
                    card_voice_usage[masked_self] = max(0, tot_voice_used - sub_v_sum)

                tot_flow_mb = data_out.get("flow_used_mb") or 0.0
                existing_f_self_key = next((k for k in card_flow_usage if self.phone in k or k.endswith(self_tail)), None)
                if existing_f_self_key:
                    sub_f_sum = sum(v for k, v in card_flow_usage.items() if k != existing_f_self_key)
                    if card_flow_usage[existing_f_self_key] == 0.0:
                        card_flow_usage[existing_f_self_key] = max(0.0, tot_flow_mb - sub_f_sum)
                else:
                    sub_f_sum = sum(card_flow_usage.values())
                    card_flow_usage[masked_self] = max(0.0, tot_flow_mb - sub_f_sum)

                data_out["flow_packages"] = flow_packages
                data_out["voice_packages"] = voice_packages
                data_out["card_flow_usage"] = {k: f"{v/1024:.2f} GB" for k, v in card_flow_usage.items()}
                data_out["card_voice_usage"] = {k: f"{v} 分钟" for k, v in card_voice_usage.items()}
        except Exception as err:
            _LOGGER.debug("拉取联通余量明细接口异常: %s", err)

        # 4. 请求家庭成员列表 (获取主副卡与名下宽带)
        data_out["phone_number"] = self.phone
        data_out["member_level"] = "铂金会员"
        data_out["real_name"] = "已实名认证"
        data_out["sub_cards"] = []
        data_out["broadbands"] = []

        try:
            r_mem = self.app.post(
                f"{BASE_M}/mobileService/login_vcode_member.htm",
                data={
                    "version": "iphone_c@13.1000",
                    "desmobile": self.desmobile,
                    "token_online": self.token_online,
                },
                timeout=5,
            )
            j_mem = r_mem.json()
            if j_mem.get("code") == "0000" and isinstance(j_mem.get("member"), list):
                for m in j_mem["member"]:
                    role = m.get("service_class_code_name", "")
                    num = m.get("num", "")
                    if role == "副卡":
                        data_out["sub_cards"].append(num)
                    elif role == "宽带":
                        data_out["broadbands"].append(num)
        except Exception as e:
            _LOGGER.debug("拉取联通成员列表异常: %s", e)

        # 6. 个人信息接口 (使用全国统一的 m.client.10010.com 主域名)
        try:
            url_info = "https://m.client.10010.com/servicequerybusiness/query/myInformationForMine"
            r_info = self.app.post(url_info, headers={"token_online": self.token_online, "desmobile": self.desmobile}, timeout=15)
            j_info = r_info.json()
            if j_info.get("code") == "0000" and isinstance(j_info.get("data"), dict):
                info_data = j_info["data"]
                user_info = info_data.get("userInfo") or {}
                exclusive = info_data.get("exclusiveService") or {}
                number_info = info_data.get("numberInfo") or {}

                # 真实姓名 (脱敏如 王**)
                use_cust_name = user_info.get("usecustname")
                cust_name = user_info.get("custname")
                if use_cust_name:
                    data_out["real_name"] = use_cust_name
                    data_out["cust_name"] = cust_name or use_cust_name
                elif cust_name:
                    data_out["real_name"] = cust_name
                    data_out["cust_name"] = cust_name

                data_out["cert_type"] = user_info.get("usecustpspttype") or user_info.get("certtype") or "18位身份证"
                data_out["cert_code"] = user_info.get("usecustpsptcode") or user_info.get("certnum") or ""

                # 专属服务与会员
                if exclusive.get("vipClassName"):
                    data_out["member_level"] = exclusive["vipClassName"]
                data_out["package_type"] = exclusive.get("packType", "5G")
                data_out["speed_service"] = exclusive.get("fivegservicename", "5G上网服务(下行峰值500Mbps)")
                data_out["credit_value"] = exclusive.get("creditvale", "0元")

                # 号码信息
                data_out["open_date"] = number_info.get("opendate", "")
                data_out["call_level"] = number_info.get("landlvl", "国际通话")
                data_out["number_status"] = number_info.get("subscrbstat", "开通")
                data_out["cyber_identity_state"] = "已绑定" if info_data.get("onlineCertificateBindState") == "1" else "未绑定"
        except Exception as e:
            _LOGGER.debug("拉取联通个人信息接口异常: %s", e)

        if not fetch_details:
            return data_out

        # 7. 拉取通话流水清单、短信详单与上网流量详单 (三类详单共用同一次握手与RSA免密凭据)
        detail_session = None
        try:
            detail_session = self._create_detail_session()
        except Exception as err:
            _LOGGER.debug("创建联通详单会话异常: %s", err)

        # 解析查询月份 (按自然月查询，展示区间为该月 1 日 ~ 月末)
        yyyy, mm, dd = resolve_query_month(start_date)
        range_start, range_end = month_range(yyyy, mm)

        try:
            call_res = self.query_call_records(session=detail_session, yyyy=yyyy, mm=mm, dd=dd)
            data_out.update(call_res)
        except Exception as err:
            _LOGGER.debug("拉取联通通话流水流程异常: %s", err)
            data_out["call_records"] = []
            data_out["call_count"] = 0
            data_out["last_call"] = {}
            data_out["call_start_date"] = range_start
            data_out["call_end_date"] = range_end
            data_out["call_need_auth"] = False
            data_out["call_auth_status"] = "有效"
            data_out["call_auth_remaining_minutes"] = 30

        try:
            sms_res = self.query_sms_records(session=detail_session, yyyy=yyyy, mm=mm, dd=dd)
            data_out.update(sms_res)
        except Exception as err:
            _LOGGER.debug("拉取联通短信详单流程异常: %s", err)
            data_out["sms_records"] = []
            data_out["sms_count"] = 0
            data_out["sms_daily"] = []
            data_out["sms_total"] = {}
            data_out["sms_last"] = {}
            data_out["sms_start_date"] = range_start
            data_out["sms_end_date"] = range_end
            data_out["sms_status"] = "有效"

        try:
            net_res = self.query_net_records(session=detail_session, yyyy=yyyy, mm=mm, dd=dd)
            data_out.update(net_res)
        except Exception as err:
            _LOGGER.debug("拉取联通上网流量详单流程异常: %s", err)
            data_out["net_records"] = []
            data_out["net_count"] = 0
            data_out["net_daily"] = []
            data_out["net_total"] = {}
            data_out["net_last"] = {}
            data_out["net_start_date"] = range_start
            data_out["net_end_date"] = range_end
            data_out["net_status"] = "有效"

        return data_out

    def _create_detail_session(self) -> requests.Session:
        """创建联通详单专用会话并完成握手与免密存入"""
        try:
            device_uuid = str(uuid.UUID(self.device_id)) if len(self.device_id) == 32 else str(uuid.uuid4())
        except Exception:
            device_uuid = str(uuid.uuid4())
        close_type = "28934581-39C1-4185-94E2-87E30AD7EE1D"

        session = requests.Session()
        session.headers.update({
            "User-Agent": APP_UA,
            "Accept": "*/*",
        })
        for k, v in requests.utils.dict_from_cookiejar(self.app.cookies).items():
            session.cookies.set(k, v, domain=".10010.com")

        for domain in ("https://hlbasic.10010.com", "https://m.client.10010.com"):
            try:
                session.post(
                    f"{domain}/servicequerybusiness/thDeatilFrom/hcBut",
                    data={
                        "channelCode": "", "closeType": close_type, "contactCode": "",
                        "duanlianjieabc": "", "externalSources": "", "saleChannel": "",
                        "sbNo": device_uuid, "serviceType": ""
                    },
                    timeout=5,
                )
            except Exception as err:
                _LOGGER.debug("联通详单前置 hcBut 请求异常(已忽略): %s", err)

            try:
                session.post(
                    f"{domain}/servicequerybusiness/detilVerify/saveVerify",
                    data={
                        "channelCode": "", "closeType": close_type, "contactCode": "",
                        "duanlianjieabc": "", "externalSources": "", "saleChannel": "",
                        "sbNo": device_uuid, "serviceType": ""
                    },
                    timeout=5,
                )
            except Exception as err:
                _LOGGER.debug("联通详单前置 saveVerify 请求异常(已忽略): %s", err)

        return session

    def query_call_records(self, session: Optional[requests.Session] = None, yyyy: str = "", mm: str = "", dd: str = "") -> dict:
        """拉取联通通话流水清单 (语音详单)"""
        now = time.localtime()
        if not yyyy:
            yyyy = time.strftime("%Y", now)
        if not mm:
            mm = time.strftime("%m", now)
        if not dd:
            dd = time.strftime("%d", now)

        range_start, range_end = month_range(yyyy, mm)
        result = {
            "call_records": [],
            "call_count": 0,
            "last_call": {},
            "call_start_date": range_start,
            "call_end_date": range_end,
            "call_need_auth": False,
            "call_auth_status": "有效",
            "call_auth_remaining_minutes": 30,
        }

        try:
            sms_val = rsa_encrypt_xiangdan("0")
            if session is None:
                session = self._create_detail_session()

            params = {
                "orderFlag": "01",
                "reqPageNum": "1",
                "duanlianjieabc": "",
                "serviceType": "",
                "flogClose": "0",
                "yyyy": yyyy,
                "mm": mm,
                "contactCode": "",
                "saleChannel": "",
                "channelCode": "",
                "endTime": "",
                "dd": dd,
                "externalSources": "",
                "queryMonthAndDay": "month",
                "language": "chinese",
                "perRecordNum": "150",
                "sms": sms_val,
                "startTime": "",
                "newVersion": "0"
            }

            resp = session.get(
                "https://hlbasic.10010.com/serviceimportantbusiness/query/getPhoneByDetailContent.htm",
                params=params,
                timeout=12,
            )

            if resp.status_code == 200 and resp.text and resp.text != "999999":
                try:
                    data = resp.json()
                except Exception:
                    data = {}

                if data.get("code") == "0000" and isinstance(data.get("data"), dict):
                    detail_info = data["data"].get("detailInfo") or []
                    call_records = []
                    for item in detail_info:
                        if not isinstance(item, dict):
                            continue
                        call_date = str(item.get("callDateFormat") or "").strip()
                        call_time = str(item.get("callTimeFormat") or "").strip()
                        full_time = f"{call_date} {call_time}".strip() if (call_date and call_time) else str(item.get("calltime") or "")

                        # 规范化呼叫方向 (1: 主叫, 2: 被叫)
                        raw_type = str(item.get("calltype") or "")
                        type_name = str(item.get("callTypeName") or "")
                        if "被叫" in type_name or raw_type == "2":
                            mapped_type = "被叫"
                        elif "主叫" in type_name or raw_type in ("1", "3"):
                            mapped_type = "主叫"
                        else:
                            mapped_type = type_name or "通话"

                        fee_val = item.get("totalfee") or item.get("voicefee") or "0.00"
                        fee_str = f"{fee_val}元" if not str(fee_val).endswith("元") else str(fee_val)

                        call_records.append({
                            "call_time": full_time,
                            "type": mapped_type,
                            "call_type": item.get("voicetype") or "普通通话",
                            "phone_number": str(item.get("othernumber") or "").strip(),
                            "duration": str(item.get("calllonghour") or "").strip(),
                            "location": str(item.get("eparchyname") or "").strip(),
                            "location_coordinate": "",
                            "number_location": str(item.get("calledhome") or "").strip(),
                            "number_isp": "",
                            "number_location_coordinate": "",
                            "fee": fee_str,
                        })

                    # 本地归属地库补充/纠正
                    enrich_call_records(call_records)

                    result["call_records"] = call_records
                    result["call_count"] = len(call_records)
                    result["last_call"] = call_records[0] if call_records else {}
                    _LOGGER.debug("联通通话流水拉取成功: 共 %d 条", len(call_records))
            elif resp.text == "999999":
                _LOGGER.debug("联通通话流水接口返回 999999 (会话未建立或需重新登录)，启用本地缓存兜底")
        except Exception as err:
            _LOGGER.debug("拉取联通通话流水异常(降级使用本地缓存兜底): %s", err)

        return result

    def query_sms_records(self, session: Optional[requests.Session] = None, yyyy: str = "", mm: str = "", dd: str = "") -> dict:
        """拉取联通短信详单 (短彩信流水)"""
        now = time.localtime()
        if not yyyy:
            yyyy = time.strftime("%Y", now)
        if not mm:
            mm = time.strftime("%m", now)
        if not dd:
            dd = time.strftime("%d", now)

        range_start, range_end = month_range(yyyy, mm)
        result = {
            "sms_records": [],
            "sms_count": 0,
            "sms_daily": [],
            "sms_total": {},
            "sms_last": {},
            "sms_start_date": range_start,
            "sms_end_date": range_end,
            "sms_status": "有效",
        }

        try:
            sms_val = rsa_encrypt_xiangdan("0")
            if session is None:
                session = self._create_detail_session()

            sms_params = {
                "year": yyyy,
                "month": mm,
                "day": dd,
                "queryMonthAndDay": "month",
                "sureFlag": "0",
                "sms": sms_val,
                "duanlianjieabc": "", "channelCode": "", "serviceType": "",
                "saleChannel": "", "externalSources": "", "contactCode": ""
            }

            resp = session.get(
                "https://m.client.10010.com/serviceimportantbusiness/query/querySmsByDetailContent",
                params=sms_params,
                timeout=12,
            )

            if resp.status_code == 200 and resp.text and resp.text != "999999":
                try:
                    data = resp.json()
                except Exception:
                    data = {}

                if data.get("code") == "0000" and isinstance(data.get("data"), dict):
                    inner_data = data["data"]
                    record_map = inner_data.get("recordMap") or {}
                    records: List[Dict[str, Any]] = []

                    # 业务类型映射字典
                    sms_types = {
                        "01": "国内短信", "02": "国际短信", "03": "国内彩信",
                        "04": "国际漫游短信", "05": "集团短信", "06": "国际彩信",
                        "07": "volte国际短信", "08": "5G消息", "09": "国内短信(5G消息转短)",
                        "10": "卫星短信", "11": "卫星短信(北斗)"
                    }

                    for date_key in sorted(record_map.keys(), reverse=True):
                        items = record_map[date_key] or []
                        for item in items:
                            if not isinstance(item, dict):
                                continue
                            dt_str = str(item.get("dateTime") or "").strip()
                            d_str = dt_str[:10] if len(dt_str) >= 10 else f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:8]}"
                            t_str = dt_str[11:] if len(dt_str) > 10 else ""
                            stype = str(item.get("smstype") or "")
                            direction = "接收" if stype == "1" else "发送"
                            btype = str(item.get("businesstype") or "")
                            fee_val = float(item.get("amount") or item.get("fee") or 0.0)

                            records.append({
                                "datetime": dt_str,
                                "date": d_str,
                                "time": t_str,
                                "phone_number": str(item.get("othernum") or "").strip(),
                                "type": direction,
                                "count": 1,
                                "fee": f"{fee_val:.2f}",
                                "fee_yuan": fee_val,
                                "business_type": sms_types.get(btype, btype or "短信"),
                                "number_location": "",
                                "number_isp": "",
                                "number_location_coordinate": "",
                            })

                    # 本地归属地及坐标丰富
                    if records:
                        try:
                            from ..phone_region import enrich_number_fields
                            enrich_number_fields(records)
                        except Exception as err:
                            _LOGGER.debug("丰富短信归属地异常: %s", err)

                    # 按天汇总 (date, count, type, fee)
                    daily_dict: Dict[tuple, Dict[str, Any]] = {}
                    for r in records:
                        d_key = (r["date"], r["type"])
                        if d_key not in daily_dict:
                            daily_dict[d_key] = {
                                "date": r["date"],
                                "count": 0,
                                "type": r["type"],
                                "fee": 0.0,
                            }
                        daily_dict[d_key]["count"] += 1
                        daily_dict[d_key]["fee"] = round(daily_dict[d_key]["fee"] + r["fee_yuan"], 2)

                    sms_daily = list(daily_dict.values())

                    # 合计节点
                    total_fee = float(inner_data.get("totalfee") or sum(r["fee_yuan"] for r in records))
                    total_cnt = int(inner_data.get("replaceShareMap", {}).get("allSmsNum") or len(records))
                    sent_cnt = sum(1 for r in records if r["type"] == "发送")
                    recv_cnt = sum(1 for r in records if r["type"] == "接收")

                    sms_total = {
                        "count": total_cnt,
                        "sent": sent_cnt,
                        "received": recv_cnt,
                        "fee": round(total_fee, 2),
                        "fee_yuan": round(total_fee, 2),
                    }

                    result["sms_records"] = records
                    result["sms_count"] = len(records)
                    result["sms_daily"] = sms_daily
                    result["sms_total"] = sms_total
                    result["sms_last"] = records[0] if records else {}
                    _LOGGER.debug("联通短信详单拉取成功: 共 %d 条", len(records))
        except Exception as err:
            _LOGGER.debug("拉取联通短信详单异常: %s", err)

        return result

    def query_net_records(self, session: Optional[requests.Session] = None, yyyy: str = "", mm: str = "", dd: str = "") -> dict:
        """拉取联通上网流量详单 (会话清单与按天汇总)"""
        now = time.localtime()
        if not yyyy:
            yyyy = time.strftime("%Y", now)
        if not mm:
            mm = time.strftime("%m", now)
        if not dd:
            dd = time.strftime("%d", now)

        range_start, range_end = month_range(yyyy, mm)
        result = {
            "net_records": [],
            "net_count": 0,
            "net_daily": [],
            "net_total": {},
            "net_last": {},
            "net_start_date": range_start,
            "net_end_date": range_end,
            "net_status": "有效",
        }

        try:
            sms_val = rsa_encrypt_xiangdan("0")
            if session is None:
                session = self._create_detail_session()

            net_params = {
                "menuId": "000200030004",
                "YYYY": yyyy,
                "MM": mm,
                "DD": dd,
                "queryMonthAndDay": "month",
                "currNum": "1",
                "fistrow": "100",  # 拉取当月最新的 100 条上网会话明细
                "sms": sms_val,
                "duanlianjieabc": "", "channelCode": "", "serviceType": "",
                "saleChannel": "", "externalSources": "", "contactCode": ""
            }

            resp = session.get(
                "https://m.client.10010.com/serviceimportantbusiness/queryNetWork/queryNetWorkDetailContent",
                params=net_params,
                timeout=12,
            )

            if resp.status_code == 200 and resp.text and resp.text != "999999":
                try:
                    data = resp.json()
                except Exception:
                    data = {}

                if data.get("code") == "0000":
                    network_list = data.get("netWorkList") or []
                    records: List[Dict[str, Any]] = []

                    for item in network_list:
                        if not isinstance(item, dict):
                            continue
                        bdate = str(item.get("begindate") or "")
                        btime = str(item.get("begintime") or "")
                        d_str = f"{bdate[:4]}-{bdate[4:6]}-{bdate[6:8]}" if len(bdate) == 8 else bdate
                        t_str = f"{btime[:2]}:{btime[2:4]}:{btime[4:6]}" if len(btime) == 6 else btime
                        dt_str = f"{d_str} {t_str}".strip()

                        # 换算流量 MB
                        pertotalsm = str(item.get("pertotalsm") or "0")
                        pertotalsm_unit = str(item.get("pertotalsmUnit") or "")
                        try:
                            val_f = float(pertotalsm)
                            if "KB" in pertotalsm_unit.upper():
                                volume_mb = round(val_f / 1024, 4)
                            elif "GB" in pertotalsm_unit.upper():
                                volume_mb = round(val_f * 1024, 4)
                            else:
                                volume_mb = round(val_f, 4)
                        except Exception:
                            volume_mb = 0.0

                        duration_sec = int(item.get("longhour") or 0)
                        duration_desc = str(item.get("longhourtransform") or f"{duration_sec}秒")
                        fee_yuan = float(item.get("totalfee") or item.get("fee") or 0.0)
                        svc_name = str(item.get("svcname") or "通用流量")

                        records.append({
                            "date": d_str,
                            "time": t_str,
                            "datetime": dt_str,
                            "volume": pertotalsm_unit or f"{volume_mb:.2f}MB",
                            "volume_mb": volume_mb,
                            "duration": duration_desc,
                            "duration_seconds": duration_sec,
                            "fee": f"{fee_yuan:.2f}",
                            "fee_yuan": fee_yuan,
                            "business_type": svc_name,
                        })

                    # 按天汇总 (date, volume_mb, duration_seconds, fee, sessions)
                    daily_dict: Dict[str, Dict[str, Any]] = {}
                    for r in records:
                        d_str = r["date"]
                        if d_str not in daily_dict:
                            daily_dict[d_str] = {
                                "date": d_str,
                                "volume_mb": 0.0,
                                "duration_seconds": 0,
                                "fee": 0.0,
                                "fee_yuan": 0.0,
                                "sessions": 0,
                            }
                        daily_dict[d_str]["volume_mb"] = round(daily_dict[d_str]["volume_mb"] + r["volume_mb"], 4)
                        daily_dict[d_str]["duration_seconds"] += r["duration_seconds"]
                        daily_dict[d_str]["fee_yuan"] = round(daily_dict[d_str]["fee_yuan"] + r["fee_yuan"], 2)
                        daily_dict[d_str]["fee"] = daily_dict[d_str]["fee_yuan"]
                        daily_dict[d_str]["sessions"] += 1

                    net_daily = list(daily_dict.values())

                    # 合计节点
                    total_vol_mb = float(data.get("totalsm") or sum(r["volume_mb"] for r in records))
                    total_dur_sec = sum(r["duration_seconds"] for r in records)
                    total_fee_yuan = float(data.get("totalfee") or sum(r["fee_yuan"] for r in records))
                    total_sessions = int(data.get("totalRecord") or len(records))

                    net_total = {
                        "volume_mb": round(total_vol_mb, 2),
                        "duration_seconds": total_dur_sec,
                        "fee": round(total_fee_yuan, 2),
                        "fee_yuan": round(total_fee_yuan, 2),
                        "sessions": total_sessions,
                        "count": total_sessions,
                    }

                    result["net_records"] = records
                    result["net_count"] = len(records)
                    result["net_daily"] = net_daily
                    result["net_total"] = net_total
                    result["net_last"] = records[0] if records else {}
                    _LOGGER.debug("联通上网流量详单拉取成功: 共 %d 条", len(records))
        except Exception as err:
            _LOGGER.debug("拉取联通上网流量详单异常: %s", err)

        return result

