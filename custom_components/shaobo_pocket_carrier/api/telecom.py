import hashlib
import base64
import json
import os
import random
import string
import time
import uuid
import io
import logging
import re
import requests
import numpy as np
from PIL import Image
from Crypto.Cipher import AES, PKCS1_v1_5, DES3
from Crypto.Util.Padding import pad
from Crypto.PublicKey import RSA

from ..const import CarrierAuthExpiredError

_LOGGER = logging.getLogger(__name__)

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
        if code_str in ("1001", "2001", "9999") or any(k in reason_str for k in ["token", "失效", "过期", "重新登录", "鉴权失败"]):
            raise CarrierAuthExpiredError(f"电信登录凭证已失效 ({code_str}: {reason_str})")
        return hdr, res.get("responseData") or {}

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
                        m = re.search(r"<Cust_Name>(.*?)</Cust_Name>", text)
                        if m:
                            name = m.group(1).strip()
                            if name:
                                _LOGGER.info("成功从电信 XML 网关 (custInfo) 获取到机主真实姓名: %s", name)
                                return name
                except Exception as ex:
                    _LOGGER.debug("请求 XML 网关 %s 失败: %s", url, ex)
        except Exception as e:
            _LOGGER.warning("调用电信 custInfo XML 异常: %s", e)

        return ""

    def fetch_all_data(self) -> dict:
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
            try:
                data_out["balance"] = float(charge_bean.get("charge", 0.0))
            except Exception:
                data_out["balance"] = 0.0

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
        except Exception as err:
            _LOGGER.warning("获取电信机主姓名(Cust_Name)异常: %s", err)

        data_out["location"] = f"{self.province_name} {self.city_name}".strip() or "中国电信"
        data_out["account_status"] = "正常"
        return data_out
