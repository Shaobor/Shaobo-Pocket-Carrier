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
SENSOR_SMS_RECORD = "sms_record"        # 短信记录 (短信详单 type=2, 与通话记录共用同一次二次认证)
SENSOR_NET_RECORD = "net_record"        # 上网记录 (上网流量详单 type=3, 同上)

# 通话流水(语音详单)二次认证控制实体 (仅中国电信)
# 二次认证三要素: 机主姓名 + 身份证号 + 短信验证码
ENTITY_CALL_AUTH_NAME = "call_auth_name"            # text: 机主姓名
ENTITY_CALL_AUTH_ID_CARD = "call_auth_id_card"      # text: 身份证号码
ENTITY_CALL_AUTH_CODE = "call_auth_code"            # text: 短信验证码
ENTITY_CALL_AUTH_BUTTON = "call_auth_secondary"     # button: 二次认证 / 登录 / 手动拉取流水
ENTITY_CALL_QUERY_START_DATE = "call_query_start_date"   # date: 通话流水查询起始日期
ENTITY_CALL_QUERY_DAILY_RESET = "call_query_daily_reset"  # switch: 每天定时把查询起始日期恢复为当月 1 日
ENTITY_REGION_UPDATE_BUTTON = "region_db_update"      # button: 手动下载更新号码归属地库
ENTITY_REGION_AUTO_SWITCH = "region_auto_update"      # switch: 自动检查并更新号码归属地库
ENTITY_AUTO_LOGIN_SWITCH = "auto_login_switch"      # switch: 登录失效后自动短信登录
ENTITY_AUTO_QUERY_SWITCH = "auto_query_switch"      # switch: 自动获取通话记录 (定时 + 登录后)
ENTITY_AUTO_QUERY_TIME = "auto_query_time"          # time: 每日自动获取通话记录的时间
ENTITY_DETAIL_REFRESH_BUTTON = "detail_refresh"     # button: 刷新详单流水 (仅联通，联通详单无需二次认证)

CALL_AUTH_WAIT_SECONDS = 180    # 详单验证码等待窗口 (下发后等待写入并自动提交的最长秒数)
LOGIN_SMS_WAIT_SECONDS = 180    # 登录验证码等待窗口
AUTO_LOGIN_MAX_FAILURES = 3     # 自动登录连续失败达到该次数后停止自动登录
AFTER_LOGIN_QUERY_DELAY = 60    # 登录成功后延迟多少秒再自动获取通话记录 (避免两种验证码串味)
DEFAULT_AUTO_QUERY_TIME = "08:00:00"    # 自动获取通话记录的默认时间
DAILY_RESET_START_DATE_TIME = "06:00"   # 每日把「通话详单查询起始日期」恢复为当月 1 日的时间
EVENT_LOGIN_EXPIRED = f"{DOMAIN}_login_expired"     # 登录失效事件 (登录失效时抛出)
EVENT_LOGIN_SUCCESS = f"{DOMAIN}_login_success"     # 短信登录成功事件 (供自动获取模块监听)
LOGIN_CODE_LENGTH = 6           # 登录验证码位数 (login_with_sms 内部按 6 位处理)

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
SENSOR_ONLINE = "online"                # 账号在线状态 (在线/离线/未知)
SENSOR_LAST_UPDATE = "last_update"      # 最近刷新时间
SENSOR_OVERVIEW = "overview"            # 全设备数据聚合总览 (把各传感器状态/属性合并成一个实体)

# 数据总览实体中「通话流水清单」保留的条数上限 (0 = 全部保留)
# 注意: 单状态属性超过 recorder 上限 (约 16384 字节) 时 HA 会拒存该状态的属性并打印告警
CONF_OVERVIEW_CALL_LIMIT = "overview_call_limit"
OVERVIEW_CALL_LIMIT_DEFAULT = 0

# 数据总览实体的节点展示顺序 (按传感器 key, 未列出的自动排在其后)
OVERVIEW_NODE_ORDER = (
    SENSOR_ONLINE,
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
    SENSOR_SMS_RECORD,
    SENSOR_NET_RECORD,
)

# 清单类属性名 (在总览节点里按「总览保留条数」上限裁剪)
OVERVIEW_CALL_LIST_ATTR = "通话流水清单"
OVERVIEW_DETAIL_LIST_ATTRS = ("通话流水清单", "短信记录", "上网会话清单", "按天汇总")

# 总览实体里, 详单类节点只搬运这些子属性 (避免把整份属性复制一遍导致总览过大;
# 单个实体本身仍保留完整属性, 这里只影响「数据总览」这一份聚合数据)
OVERVIEW_NODE_ATTR_KEYS = {
    SENSOR_CALL_RECORD: ("通话流水清单",),
    SENSOR_SMS_RECORD: ("短信记录", "按天汇总"),
    SENSOR_NET_RECORD: ("上网会话清单", "按天汇总", "合计"),
}

# 固定实体 ID 后缀表 (按实体 key)
# 实体 ID 形如 <domain>.<手机号>_<后缀>，后缀一律使用简短英文单词 (不用拼音)，例如:
#   text.133xxxxxxxx_code / text.133xxxxxxxx_name / text.133xxxxxxxx_id_card
#   button.133xxxxxxxx_button / date.133xxxxxxxx_date
#   switch.133xxxxxxxx_auto_login / time.133xxxxxxxx_auto_query_time
#   sensor.133xxxxxxxx_balance / sensor.133xxxxxxxx_calls / sensor.133xxxxxxxx_overview
# 未列出的实体退化为使用实体 key 本身作为后缀。
# 目的: 让自动化/手机端转发脚本可以长期稳定引用，不受实体名称变化影响
ENTITY_ID_SUFFIXES = {
    # 控制类实体
    ENTITY_CALL_AUTH_NAME: "name",
    ENTITY_CALL_AUTH_ID_CARD: "id_card",
    ENTITY_CALL_AUTH_CODE: "code",
    ENTITY_CALL_AUTH_BUTTON: "button",
    ENTITY_CALL_QUERY_START_DATE: "date",
    ENTITY_CALL_QUERY_DAILY_RESET: "daily_reset",
    ENTITY_REGION_UPDATE_BUTTON: "update_region",
    ENTITY_REGION_AUTO_SWITCH: "auto_region_update",
    ENTITY_AUTO_LOGIN_SWITCH: "auto_login",
    ENTITY_AUTO_QUERY_SWITCH: "auto_query",
    ENTITY_AUTO_QUERY_TIME: "auto_query_time",
    # 与电信二次认证按钮同后缀 (两者各自只在本运营商创建)，前端卡片按同一个实体 ID 调用
    ENTITY_DETAIL_REFRESH_BUTTON: "button",
    # 传感器实体 (简短英文单词)
    SENSOR_OVERVIEW: "overview",            # 数据总览
    SENSOR_BALANCE: "balance",              # 话费余额
    SENSOR_CHARGE: "charge",                # 本月消费
    SENSOR_FLOW_REMAIN: "data",             # 剩余通用流量
    SENSOR_FLOW_USED: "data_used",          # 已用流量
    SENSOR_FLOW_DIRECTIONAL: "data_dir",    # 剩余定向流量
    SENSOR_FEE_DEPOSIT: "deposit",          # 本月存入话费
    SENSOR_FEE_ROLLOVER: "rollover",        # 上月结转话费
    SENSOR_VOICE_REMAIN: "voice",           # 共享通话剩余 / 剩余语音
    SENSOR_VOICE_USED: "voice_used",        # 共享通话已用 / 已用语音
    SENSOR_SMS_REMAIN: "sms_remain",        # 剩余短信
    SENSOR_CALL_RECORD: "calls",            # 通话记录
    SENSOR_SMS_RECORD: "sms",               # 短信记录
    SENSOR_NET_RECORD: "traffic",           # 上网记录
    SENSOR_INTEGRAL: "points",              # 积分
    SENSOR_STAR_LEVEL: "star",              # 用户星级
    SENSOR_MEMBER_LEVEL: "level",           # 会员等级
    SENSOR_REAL_NAME: "owner",              # 机主姓名
    SENSOR_PHONE: "phone",                  # 手机号码
    SENSOR_CUST_NAME: "account",            # 单位户号/户名
    SENSOR_SPEED_SERVICE: "service",        # 套餐服务 / 速率服务
    SENSOR_LOCATION: "location",            # 号码归属地
    SENSOR_ACCOUNT_STATUS: "status",        # 账户状态
    SENSOR_ONLINE: "online",                # 在线状态
    SENSOR_LAST_UPDATE: "updated",          # 数据最近更新
    SENSOR_BROADBAND: "broadband",          # 宽带速率
    SENSOR_BROADBAND_COUNT: "broadbands",   # 名下宽带
}

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

