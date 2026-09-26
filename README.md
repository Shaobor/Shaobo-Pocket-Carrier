<div align="center">

# 📱 掌上运营商 (Shaobo Pocket Carrier)

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://github.com/hacs/default)
[![version](https://img.shields.io/badge/Version-2.0.0-blue.svg?style=for-the-badge)](https://github.com/Shaobor/Shaobo-Pocket-Carrier/releases)
[![license](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home--Assistant-2026.1%2B-blueviolet.svg?style=for-the-badge)](https://www.home-assistant.io/)

**专为 Home Assistant 打造的双卡运营商统一管理集成**  
深度集成 **中国联通** 与 **中国电信** 掌厅核心服务，实时监控话费、流量、通话、套餐明细及账户状态。

[特性亮点](#-特性亮点) • [实体清单](#-传感器实体清单) • [安装方式](#-安装指南) • [配置说明](#-配置与重新认证) • [免责声明](#-免责声明)

---

</div>

## ✨ 特性亮点

- 🚀 **双运营商全能支持**：同时支持中国联通与中国电信，支持多手机号共存，以手机号为维度自动建立独立 Home Assistant 设备。
- 🛡️ **官方沙箱级滑块绕过**：集成独创的官方 iframe 沙箱通道（`/api/shaobo_pocket_carrier/slider`），完美通过联通与电信腾讯滑块校验，100% 秒下短信验证码。
- 🔐 **逆向安全通讯体系**：
  - 深度接入电信旧版 XML 业务网关 3DES（`DES-EDE3-CBC`）加密通信，实现机主脱敏真实姓名（`石**` 等）与入网资料动态拉取。
  - 适配联通官方余量明细核心接口（`queryOcsPackageFlowLeftContentRevisedInJune`），支持主套餐、多成员副卡额度及赠送流量包到期时间追踪。
- 🎯 **纯净原生实体规范**：严格遵循 Home Assistant 官方设计规范，实体名称**无冗余序号、无杂乱自定义前缀**（如：`话费余额`、`剩余通用流量`、`剩余语音`），开箱即用。
- 🔄 **官方标准 Reauth（重新认证流）**：Token 过期时在 HA 前端高亮提示“⚠️ 需要重新认证”，原地完成滑块短信验证，**历史实体与卡片完全保留，绝不产生重复条目**。
- 💾 **多层专属持久化**：凭证与状态持久化保存在专属安全存储中，容器重启无缝平稳恢复。

---

## 📊 传感器实体清单

每个号码在接入后将拥有规范统一的 **12 个核心实体**：

### 1. 中国联通 (China Unicom)
| 实体名称 | 标识符 (Entity ID) | 单位 | 核心附加属性 |
| :--- | :--- | :--- | :--- |
| **话费余额** | `sensor.unicom_balance` | 元 | 实时出账金额、信用额度、可用可用余额 |
| **剩余通用流量** | `sensor.unicom_common_flow` | GB | 主套餐名称、副卡各号码用量明细、流量包失效时间 |
| **剩余语音** | `sensor.unicom_voice` | 分钟 | 套餐通话总量、已用时长、副卡用量分布 |
| **剩余短信** | `sensor.unicom_sms` | 条 | 套餐短信额度、已发送条数、超出条数 |
| **机主姓名** | `sensor.unicom_real_name` | - | 脱敏真实姓名（`王**`）、脱敏身份证号、实名状态 |
| **归属地** | `sensor.unicom_location` | - | 省份、地市、当前接入网络 |
| **入网网龄** | `sensor.unicom_open_years` | - | 入网年份、累计月数 |
| **会员等级** | `sensor.unicom_level` | - | 会员等级名称、当前积分 |
| **我的企业** | `sensor.unicom_company` | - | 政企单位名（个人户显示“个人用户”） |
| **5G 速率** | `sensor.unicom_rate` | - | 5G 网络下行峰值速率服务等级 |
| **状态** | `sensor.unicom_status` | - | 正常 / 停机 / 异常状态检测 |
| **更新时间** | `sensor.unicom_update_time` | - | 最近一次成功同步数据的时间戳 |

### 2. 中国电信 (China Telecom)
| 实体名称 | 标识符 (Entity ID) | 单位 | 核心附加属性 |
| :--- | :--- | :--- | :--- |
| **话费余额** | `sensor.telecom_balance` | 元 | 可用余额、本月累计话费 |
| **当月消费** | `sensor.telecom_consumption` | 元 | 当月已消费明细、实时扣费总额 |
| **通用流量** | `sensor.telecom_common_flow` | GB | 共享/独享流量明细、已用与剩余 |
| **语音通话** | `sensor.telecom_voice` | 分钟 | 套餐通话总额、剩余语音、主副卡共享 |
| **机主姓名** | `sensor.telecom_real_name` | - | 官方 3DES 网关动态脱敏姓名、星级、信用额度 |
| **归属地** | `sensor.telecom_location` | - | 省份、城市、运营商标识 |
| **入网网龄** | `sensor.telecom_open_years` | - | 在网时长、入网时间 |
| **星级服务** | `sensor.telecom_star_level` | - | 星级评级、会员尊享特权 |
| **电信积分** | `sensor.telecom_points` | - | 可用天翼积分、年底即将到期积分 |
| **宽带与固话** | `sensor.telecom_broadband` | - | 关联光纤宽带、家庭固话业务状态 |
| **状态** | `sensor.telecom_status` | - | 正常在网 / 欠费 / 停机状态 |
| **更新时间** | `sensor.telecom_update_time` | - | 最近一次成功同步数据的时间戳 |

---

## 📦 安装指南

### 方式一：通过 HACS 安装（推荐）
1. 确保已在 Home Assistant 中安装并启用了 **HACS**。
2. 打开 **HACS** $\rightarrow$ 点击右上角三个点 $\rightarrow$ 选择 **「自定义存储库 (Custom repositories)」**。
3. 在弹窗中输入：
   - **存储库**：`https://github.com/Shaobor/Shaobo-Pocket-Carrier`
   - **类型**：`集成 (Integration)`
4. 点击 **添加**，在列表中找到 **掌上运营商 (Shaobo Pocket Carrier)** 并点击 **下载**。
5. 重启 Home Assistant。

### 方式二：手动安装
1. 下载本项目 Releases 中的最新发布压缩包。
2. 解压并将 `custom_components/shaobo_pocket_carrier` 文件夹完整拷贝至您的 Home Assistant 配置目录下的 `custom_components/` 中。
3. 重启 Home Assistant。

---

## ⚙️ 配置与重新认证

### 1. 初次添加集成
1. 进入 Home Assistant **设置** $\rightarrow$ **设备与服务** $\rightarrow$ 点击右下角 **「添加集成」**。
2. 搜索并选择 **掌上运营商**。
3. 选择您要添加的运营商（中国联通 / 中国电信），并输入 11 位手机号码。
4. **腾讯滑块验证**：
   - 联通用户：点击页面提示的 **「打开腾讯滑块验证页面」** 链接，在弹出窗口中完成官方拼图滑块，成功后系统将自动下发短信验证码并自动关闭窗口。
   - 电信用户：直接接收官方短信验证码。
5. 输入 6 位短信验证码，点击提交即可完成绑定。

### 2. 重新认证（Reauth）
当运营商 Token 自然过期或失效时，Home Assistant 会在集成卡片高亮提示 **“⚠️ 需要重新认证”**：
1. 点击集成卡片上的 **「重新认证」** 按钮。
2. 按照引导完成一次滑块与短信校验。
3. 验证成功后系统将**原地更新凭证并满血复活**所有实体，不会产生重复实体或丢失历史图表！

---

## ⚠️ 免责声明

1. 本项目仅供学习研究、技术交流以及个人智能家居仪表盘集成使用，请勿用于任何商业用途或大规模非正常频率爬取。
2. 接口通讯均直接连接运营商官方生产端点，项目不设立任何中转服务器，您的手机号及会话凭证均保存在您本地的 Home Assistant 设备中。
3. 请合理设置数据轮询间隔（默认 10~15 分钟），避免对运营商服务器造成不必要的负担。

---

## 📄 开源许可

本项目遵循 [MIT License](LICENSE) 开源授权。
欢迎提交 Issue 或 Pull Request 为项目添砖加瓦！
