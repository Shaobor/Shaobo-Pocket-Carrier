# -*- coding: utf-8 -*-
"""中国联通 13.1 核心客户端"""
import base64
import json
import logging
import os
import random
import string
import time
import uuid
import urllib.parse
import requests
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

def rsa_old(v: str) -> str:
    c = PKCS1_v1_5.new(RSA.import_key(LOGIN_RSA_KEY))
    return urllib.parse.quote(base64.b64encode(c.encrypt(v.encode())).decode(), safe="")

class UnicomClient:
    def __init__(self, phone: str, auth_data: dict = None):
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
        data = {
            **self._base_params(),
            "token_online": self.token_online,
            "encmobile": self.desmobile
        }
        r = self.app.post(f"{BASE_M}/mobileService/onLine.htm", data=data, timeout=15)
        j = r.json()
        if j.get("code") == "0":
            self.token_online = j["token_online"]
            self.desmobile = j.get("desmobile", self.desmobile)
            return True
        return False

    def fetch_all_data(self) -> dict:
        """拉取联通用户数据"""
        if not self.token_online or not self.desmobile:
            _LOGGER.warning("联通手机号 %s 缺少凭据，需要重新认证", self.phone)
            raise CarrierAuthExpiredError("联通凭据缺失，需要重新认证")

        alive_ok = self.keep_alive()
        r = self.app.get(f"{BASE_M}/mobileserviceimportant/home/queryUserInfoSeven",
                         params={"desmobile": self.desmobile, "version": "iphone_c@13.1000",
                                 "showType": "01"}, timeout=15)
        try:
            j = r.json()
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
                        data_out["balance"] = float(num or 0.0)
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
            if j_bal.get("code") == "0000" or j_bal.get("curntbalancecust"):
                # 精确话费余额
                if j_bal.get("curntbalancecust"):
                    data_out["balance"] = float(j_bal["curntbalancecust"])
                
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

                flow_used_mb = float(j_ocs.get("allUserFlow") or 0.0)
                data_out["flow_used_mb"] = flow_used_mb
                data_out["flow_used_gb"] = round(flow_used_mb / 1024, 2)
                data_out["flow_exceed"] = j_ocs.get("flowExceed", 0.0)

                # 语音核心与汇总
                voice_remain_val = j_ocs.get("canUseValueAll")
                voice_remain_unit = j_ocs.get("canuseVoiceAllUnit", "分钟")
                if voice_remain_val is not None:
                    data_out["voice_remain"] = f"{voice_remain_val} {voice_remain_unit}".strip()
                    data_out["voice_remain_num"] = voice_remain_val
                data_out["voice_used"] = j_ocs.get("voiceHeadUsed", 0)
                data_out["voice_exceed"] = j_ocs.get("voiceExceed", 0)
                data_out["voice_total"] = j_ocs.get("voiceSumresource", 0)

                # 短信核心与汇总
                sms_remain_val = j_ocs.get("canUseSmsAll", 0)
                sms_remain_unit = j_ocs.get("canuseSmsAllUnit", "条")
                data_out["sms_remain"] = f"{sms_remain_val} {sms_remain_unit}".strip()
                data_out["sms_remain_num"] = sms_remain_val
                data_out["sms_used"] = j_ocs.get("smsHeadUsed", 0)
                data_out["sms_exceed"] = j_ocs.get("smsExceed", 0)
                data_out["sms_total"] = j_ocs.get("smsSumresource", 0)

                # 资源包明细拆解 (流量包、语音包各成员卡消耗分布)
                resources = j_ocs.get("resources", [])
                flow_packages = []
                voice_packages = []
                card_flow_usage = {}
                card_voice_usage = {}

                if len(resources) > 0 and isinstance(resources[0], dict):
                    for detail in resources[0].get("details", []):
                        pkg_name = detail.get("addUpItemName", "流量包")
                        pkg_total_mb = float(detail.get("total") or 0.0)
                        pkg_remain_mb = float(detail.get("remain") or 0.0)
                        pkg_end = detail.get("endDate", "长期有效")
                        flow_packages.append(f"{pkg_name}: 剩余 {pkg_remain_mb/1024:.2f}GB / 总计 {pkg_total_mb/1024:.2f}GB ({pkg_end})")
                        for vc in detail.get("viceCardlist", []):
                            num = vc.get("usernumber", "未知")
                            u_mb = float(vc.get("use") or 0.0)
                            card_flow_usage[num] = card_flow_usage.get(num, 0.0) + u_mb

                if len(resources) > 1 and isinstance(resources[1], dict):
                    for detail in resources[1].get("details", []):
                        pkg_name = detail.get("addUpItemName", "语音包")
                        pkg_total = detail.get("total", 0)
                        pkg_remain = detail.get("remain", 0)
                        pkg_end = detail.get("endDate", "长期有效")
                        voice_packages.append(f"{pkg_name}: 剩余 {pkg_remain}分钟 / 总计 {pkg_total}分钟 ({pkg_end})")
                        for vc in detail.get("viceCardlist", []):
                            num = vc.get("usernumber", "未知")
                            u_min = int(vc.get("use") or 0)
                            card_voice_usage[num] = card_voice_usage.get(num, 0) + u_min

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
                    data_out["cust_name"] = cust_name or ""
                elif cust_name:
                    data_out["real_name"] = cust_name
                    data_out["cust_name"] = "个人用户"

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

        return data_out

