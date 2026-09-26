"""Constants for the China Carrier integration."""

DOMAIN = "shaobo_pocket_carrier"

CARRIER_TELECOM = "telecom"
CARRIER_UNICOM = "unicom"

CARRIER_NAMES = {
    CARRIER_TELECOM: "中国电信",
    CARRIER_UNICOM: "中国联通",
}

CONF_CARRIER = "carrier"
CONF_PHONE = "phone"
CONF_AUTH_DATA = "auth_data"

# 传感器键名
SENSOR_BALANCE = "balance"              # 话费余额
SENSOR_CHARGE = "charge"                # 本月消费
SENSOR_FLOW_REMAIN = "flow_remain"      # 剩余流量
SENSOR_FLOW_USED = "flow_used"          # 已用流量
SENSOR_FLOW_DIRECTIONAL = "flow_directional" # 定向流量
SENSOR_FEE_DEPOSIT = "fee_deposit"      # 本月存入话费
SENSOR_FEE_ROLLOVER = "fee_rollover"    # 上月结转话费
SENSOR_VOICE_REMAIN = "voice_remain"    # 剩余语音
SENSOR_VOICE_USED = "voice_used"        # 已用语音
SENSOR_SMS_REMAIN = "sms_remain"        # 剩余短信
SENSOR_INTEGRAL = "integral"            # 会员积分
SENSOR_STAR_LEVEL = "star_level"        # 用户星级
SENSOR_LOCATION = "location"            # 号码归属地
SENSOR_PHONE = "phone_number"            # 手机号码
SENSOR_MEMBER_LEVEL = "member_level"    # 会员等级
SENSOR_REAL_NAME = "real_name"          # 机主姓名
SENSOR_CUST_NAME = "cust_name"          # 单位户号/户名
SENSOR_SPEED_SERVICE = "speed_service"      # 速率服务
SENSOR_BROADBAND_COUNT = "broadband_count"  # 名下宽带
SENSOR_BROADBAND = "broadband"          # 宽带速率
SENSOR_ACCOUNT_STATUS = "account_status"# 账户状态
SENSOR_LAST_UPDATE = "last_update"      # 最近刷新时间

# 轮询间隔
UPDATE_INTERVAL_TELECOM = 1800  # 电信 30 分钟刷新一次
UPDATE_INTERVAL_UNICOM = 600    # 联通 10 分钟平稳保活并刷新一次

# 专属持久化存储文件名 (位于 <HA配置目录>/.storage/ 下)
STORAGE_KEY_TELECOM = "Shaobo_Telecom"
STORAGE_KEY_UNICOM = "Shaobo_Unicom"
STORAGE_VERSION = 1


class CarrierAuthExpiredError(Exception):
    """运营商登录凭据已失效异常，用于触发 Home Assistant 重新认证流 (Reauth)"""
    pass

