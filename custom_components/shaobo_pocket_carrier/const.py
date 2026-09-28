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


CONF_SCAN_INTERVAL = "scan_interval"
CONF_CALL_START_DATE = "call_start_date"  # 通话记录查询起始日期/月份 (截止日期自动取该月最后一天)
CONF_SIGNATURE_STRING = "signature_string"  # 认证成功后动态保存的详单签名串
CONF_SIGNATURE_TIMESTAMP = "signature_timestamp"  # 详单认证成功时间戳 (有效期30分钟)
CONF_AUTH_USER_NAME = "auth_user_name"        # 用户手动输入认证通过的机主姓名缓存
CONF_AUTH_ID_CARD = "auth_id_card"            # 用户手动输入认证通过的身份证号缓存
CALL_AUTH_EXPIRE_SECONDS = 1800              # 详单二次认证有效期 30 分钟 (1800 秒)
CONF_AUTH_ACTION = "auth_action"          # 选项流中触发的认证动作
AUTH_ACTION_NONE = "none"                # 不执行认证
AUTH_ACTION_CALL_AUTH = "call_auth"      # 通话记录二次认证
MIN_SCAN_INTERVAL = 5                   # 最低禁止小于 5 分钟
DEFAULT_SCAN_INTERVAL_TELECOM = 30  # 电信默认 30 分钟
DEFAULT_SCAN_INTERVAL_UNICOM = 10   # 联通默认 10 分钟

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
SENSOR_CALL_RECORD = "call_record"      # 通话记录 (语音详单，需 signatureString)

# 通话流水(语音详单)二次认证控制实体 (仅中国电信)
# 二次认证三要素: 机主姓名 + 身份证号 + 短信验证码
ENTITY_CALL_AUTH_NAME = "call_auth_name"            # text: 机主姓名
ENTITY_CALL_AUTH_ID_CARD = "call_auth_id_card"      # text: 身份证号码
ENTITY_CALL_AUTH_CODE = "call_auth_code"            # text: 短信验证码
ENTITY_CALL_AUTH_BUTTON = "call_auth_secondary"     # button: 二次认证 / 手动拉取流水
ENTITY_CALL_QUERY_START_DATE = "call_query_start_date"   # date: 通话流水查询起始日期
CALL_AUTH_WAIT_SECONDS = 180                        # 下发验证码后等待写入并自动提交的最长秒数

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
SENSOR_OVERVIEW = "overview"            # 全设备数据聚合总览 (把各传感器状态/属性合并成一个实体)

# 数据总览实体中「通话流水清单」保留的条数上限 (0 = 全部保留)
# 注意: 单状态属性超过 recorder 上限 (约 16384 字节) 时 HA 会拒存该状态的属性并打印告警
CONF_OVERVIEW_CALL_LIMIT = "overview_call_limit"
OVERVIEW_CALL_LIMIT_DEFAULT = 0

# 数据总览实体的节点展示顺序 (按传感器 key, 未列出的自动排在其后)
OVERVIEW_NODE_ORDER = (
    SENSOR_ACCOUNT_STATUS,
    SENSOR_BALANCE,
    SENSOR_CHARGE,
    SENSOR_FEE_DEPOSIT,
    SENSOR_FEE_ROLLOVER,
    SENSOR_FLOW_REMAIN,
    SENSOR_FLOW_USED,
    SENSOR_FLOW_DIRECTIONAL,
    SENSOR_VOICE_REMAIN,
    SENSOR_VOICE_USED,
    SENSOR_SMS_REMAIN,
    SENSOR_INTEGRAL,
    SENSOR_STAR_LEVEL,
    SENSOR_MEMBER_LEVEL,
    SENSOR_REAL_NAME,
    SENSOR_PHONE,
    SENSOR_CUST_NAME,
    SENSOR_SPEED_SERVICE,
    SENSOR_BROADBAND,
    SENSOR_BROADBAND_COUNT,
    SENSOR_LOCATION,
    SENSOR_LAST_UPDATE,
    SENSOR_CALL_RECORD,
)

# 通话流水清单属性名 (在总览节点里按上限裁剪)
OVERVIEW_CALL_LIST_ATTR = "通话流水清单"

# 轮询间隔
UPDATE_INTERVAL_TELECOM = 1800  # 电信 30 分钟刷新一次
UPDATE_INTERVAL_UNICOM = 600    # 联通 10 分钟平稳保活并刷新一次

# 专属持久化存储文件名 (位于 <HA配置目录>/.storage/ 下)
STORAGE_KEY_TELECOM = "Shaobo_Telecom"
STORAGE_KEY_UNICOM = "Shaobo_Unicom"
STORAGE_VERSION = 1

# 通话流水(语音详单)本地缓存文件: 二次认证 30 分钟有效期内落盘，
# 认证失效后用缓存兜底展示，避免历史流水数据凭空消失
STORAGE_KEY_CALL_CACHE = "Shaobo_CallRecords"
CALL_CACHE_MAX_RECORDS = 5000   # 单号码最多缓存的流水条数 (按时间倒序保留最近)


class CarrierAuthExpiredError(Exception):
    """运营商登录凭据已失效异常，用于触发 Home Assistant 重新认证流 (Reauth)"""
    pass

