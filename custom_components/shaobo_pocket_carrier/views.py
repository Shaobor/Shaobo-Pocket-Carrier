# -*- coding: utf-8 -*-
"""联通方案一：官方域名沙箱滑块 Web 视图与回调服务"""
import json
import logging
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# 全局共享会话缓存：flow_id -> {"client": UnicomClient, "app_id": str, "mobile_hex": str, "status": str, "error": str}
SLIDER_SESSIONS = {}

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国联通安全滑块验证</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #1f1c2c, #928dab);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .card {
            background: rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 20px;
            padding: 24px;
            max-width: 440px;
            width: 100%;
            text-align: center;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        .title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .subtitle {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.75);
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .frame-box {
            width: 100%;
            height: 310px;
            border-radius: 12px;
            overflow: hidden;
            background: #fff;
            margin-bottom: 16px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }
        .status-box {
            display: none;
            padding: 14px;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.6;
        }
        .success {
            background: rgba(76, 175, 80, 0.25);
            border: 1px solid rgba(76, 175, 80, 0.5);
            color: #a5d6a7;
        }
        .error {
            background: rgba(244, 67, 54, 0.25);
            border: 1px solid rgba(244, 67, 54, 0.5);
            color: #ef9a9a;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="title">中国联通安全滑块验证</div>
        <div class="subtitle">请在下方官方窗口中拖动滑块完成验证：</div>
        
        <div id="frameContainer" class="frame-box">
            <iframe id="riskFrame" src="https://img.client.10010.com/loginRisk/index.html"></iframe>
        </div>
        
        <div style="text-align:center;margin-top:6px;">
            <a href="javascript:void(0)" onclick="closeOrBack()" style="color:rgba(255,255,255,0.6);font-size:12px;text-decoration:none;">🔙 若未在新标签页打开，点此返回 Home Assistant</a>
        </div>

        <div id="statusBox" class="status-box"></div>
    </div>

    <script>
        const flowId = "__FLOW_ID__";
        const mobileHex = "__MOBILE_HEX__";

        function closeOrBack() {
            try {
                window.opener = null;
                window.open('', '_self');
                window.close();
            } catch(e) {}
            setTimeout(function() {
                if (!window.closed && history.length > 1) {
                    history.back();
                }
            }, 300);
        }

        function showStatus(text, isError) {
            const box = document.getElementById("statusBox");
            box.className = "status-box " + (isError ? "error" : "success");
            box.innerHTML = text;
            box.style.display = "block";
        }

        window.addEventListener("message", function(e) {
            const data = e.data;
            if (!data) return;

            // 官方联通页面加载完毕，向其注入风控参数启动腾讯滑块
            if (data.code === "myLoad") {
                const frame = document.getElementById("riskFrame");
                if (frame && frame.contentWindow) {
                    frame.contentWindow.postMessage({
                        mobile: mobileHex,
                        type: "10",
                        mainDesc: "拖动滑块完成安全验证"
                    }, "*");
                }
            } 
            // 官方页面在官方域名沙箱内验证通过，发回合法 resultToken
            else if (data.code === "0000" && data.resultToken) {
                showStatus("⏳ 滑块验证通过，正在请求下发短信...", false);
                document.getElementById("frameContainer").style.display = "none";
                
                fetch("/api/shaobo_pocket_carrier/verify_slider", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        flow_id: flowId,
                        result_token: data.resultToken
                    })
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        showStatus("✅ <b>滑块验证成功！短信已下发</b><br><span style='font-size:13px;opacity:0.85;display:inline-block;margin-top:6px;'>页面将在 <span id='countdown' style='font-weight:bold;color:#10b981;'>2</span> 秒后自动关闭，请切回 Home Assistant 输入短信验证码。<br><button onclick='closeOrBack()' style='margin-top:10px;padding:6px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;'>立即返回 Home Assistant</button></span>", false);
                        let timeLeft = 2;
                        const timer = setInterval(function() {
                            timeLeft--;
                            const cd = document.getElementById("countdown");
                            if (cd) cd.innerText = timeLeft;
                            if (timeLeft <= 0) {
                                clearInterval(timer);
                                closeOrBack();
                            }
                        }, 1000);
                    } else {
                        showStatus("❌ 短信下发失败: " + (res.message || "请稍后重试"), true);
                    }
                })
                .catch(err => {
                    showStatus("❌ 网络请求异常: " + err.message, true);
                });
            }
        });
    </script>
</body>
</html>
"""

class CarrierSliderPageView(HomeAssistantView):
    """提供滑块 HTML 页面的视图 (支持联通腾讯滑块)"""
    url = "/api/shaobo_pocket_carrier/slider"
    name = "api:shaobo_pocket_carrier:slider"
    requires_auth = False

    async def get(self, request):
        flow_id = request.query.get("flow_id", "")
        session = SLIDER_SESSIONS.get(flow_id)
        
        # 智能容错：若未传 flow_id 或未匹配上，自动绑定当前最新的活跃验证会话
        if not session and SLIDER_SESSIONS:
            flow_id = list(SLIDER_SESSIONS.keys())[-1]
            session = SLIDER_SESSIONS[flow_id]

        if not session:
            fallback_html = """<!DOCTYPE html>
            <html lang="zh-CN">
            <head><meta charset="UTF-8"><title>运营商安全验证</title>
            <style>body{background:#1f1c2c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}</style>
            </head>
            <body><div style="text-align:center;padding:20px;">
                <h2>⚠️ 暂无正在等待验证的手机号</h2>
                <p style="color:rgba(255,255,255,0.7);margin-top:10px;">请先在 Home Assistant 界面点击添加集成并输入手机号。</p>
            </div></body></html>"""
            return web.Response(text=fallback_html, content_type="text/html", status=200)

        mobile_hex = session.get("mobile_hex") or (session.get("client") and getattr(session["client"], "mobile_hex", "")) or ""
        html = HTML_TEMPLATE.replace("__FLOW_ID__", flow_id).replace("__MOBILE_HEX__", mobile_hex)
        return web.Response(text=html, content_type="text/html", status=200)


class CarrierSliderVerifyView(HomeAssistantView):
    """接收滑块完成凭证并下发短信的回调视图 (支持联通与移动)"""
    url = "/api/shaobo_pocket_carrier/verify_slider"
    name = "api:shaobo_pocket_carrier:verify_slider"
    requires_auth = False

    async def post(self, request):
        try:
            try:
                data = await request.json()
            except Exception:
                return web.json_response({"success": False, "message": "请求格式错误"}, status=400)

            flow_id = data.get("flow_id")
            result_token = data.get("result_token")
            ticket = data.get("ticket")
            randstr = data.get("randstr")

            session = SLIDER_SESSIONS.get(flow_id)
            if not session and SLIDER_SESSIONS:
                session = list(SLIDER_SESSIONS.values())[-1]

            if not session:
                return web.json_response({"success": False, "message": "验证会话不存在或已过期"}, status=404)

            client = session.get("client")
            if not client:
                return web.json_response({"success": False, "message": "客户端实例丢失"}, status=500)

            hass = request.app["hass"]

            # 联通处理
            if result_token:
                ok, msg = await hass.async_add_executor_job(client.send_sms_with_token, result_token)
            else:
                ok, msg = await hass.async_add_executor_job(client.submit_captcha, ticket, randstr)

            if ok:
                session["status"] = "sms_sent"
                _LOGGER.info("联通手机号 %s 方案一滑块验证通过，已成功下发短信验证码", client.phone)
                return web.json_response({"success": True, "message": msg or "短信验证码已下发"})
            else:
                session["status"] = "failed"
                session["error"] = msg
                _LOGGER.warning("联通手机号 %s 短信下发失败: %s", client.phone, msg)
                return web.json_response({"success": False, "message": msg or "短信下发被拦截，请稍后重试"})
        except Exception as exc:
            _LOGGER.error("处理滑块回调严重异常: %s", exc, exc_info=True)
            return web.json_response({"success": False, "message": f"服务器处理异常: {exc}"}, status=200)


MOBILE_TUTORIAL_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国移动抓包凭据获取教程 - 掌上运营商</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.85);
            --card-border: rgba(255, 255, 255, 0.12);
            --text-main: #f8fafc;
            --text-sub: #94a3b8;
            --primary: #0284c7;
            --accent: #10b981;
            --code-bg: rgba(15, 23, 42, 0.8);
            --danger-bg: rgba(239, 68, 68, 0.12);
            --danger-border: #ef4444;
            --danger-title: #f87171;
            --danger-text: #f1f5f9;
            --danger-strong: #fca5a5;
            --step-tip-bg: rgba(239, 68, 68, 0.12);
            --step-tip-border: #ef4444;
            --step-tip-text: #f1f5f9;
        }
        @media (prefers-color-scheme: light) {
            :root {
                --bg-color: #f1f5f9;
                --card-bg: rgba(255, 255, 255, 0.92);
                --card-border: rgba(0, 0, 0, 0.08);
                --text-main: #0f172a;
                --text-sub: #64748b;
                --primary: #0284c7;
                --accent: #059669;
                --code-bg: #e2e8f0;
                --danger-bg: #fff1f2;
                --danger-border: #f43f5e;
                --danger-title: #be123c;
                --danger-text: #1e293b;
                --danger-strong: #b91c1c;
                --step-tip-bg: #fff1f2;
                --step-tip-border: #e11d48;
                --step-tip-text: #1e293b;
            }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            background: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
            line-height: 1.6;
        }
        .container {
            width: 100%;
            max-width: 640px;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
            padding: 28px 24px;
            animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--card-border);
            padding-bottom: 16px;
        }
        .logo-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: linear-gradient(135deg, #0284c7, #10b981);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
        }
        .title-group h1 {
            font-size: 19px;
            font-weight: 700;
            letter-spacing: -0.3px;
        }
        .title-group p {
            font-size: 13px;
            color: var(--text-sub);
            margin-top: 2px;
        }
        .step-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .step-item {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--card-border);
            border-radius: 14px;
            padding: 16px;
            transition: transform 0.2s, border-color 0.2s;
        }
        .step-item:hover {
            border-color: var(--primary);
            transform: translateY(-1px);
        }
        .step-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .step-badge {
            background: var(--primary);
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 6px;
        }
        .step-title {
            font-size: 15px;
            font-weight: 600;
        }
        .step-desc {
            font-size: 13.5px;
            color: var(--text-sub);
        }
        .code-box {
            background: var(--code-bg);
            border-radius: 8px;
            padding: 8px 12px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px;
            color: #38bdf8;
            margin-top: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            word-break: break-all;
        }
        .btn-copy {
            background: var(--primary);
            color: #fff;
            border: none;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            flex-shrink: 0;
            margin-left: 8px;
            transition: background 0.2s;
        }
        .btn-copy:hover {
            background: #0369a1;
        }
        .highlight {
            color: #f59e0b;
            font-weight: 600;
        }
        .danger-card {
            background: var(--danger-bg);
            border: 2px solid var(--danger-border);
            border-radius: 12px;
            padding: 16px;
            margin-top: 14px;
            margin-bottom: 18px;
            font-size: 13.5px;
            color: var(--danger-text);
            line-height: 1.6;
            box-shadow: 0 4px 20px rgba(239, 68, 68, 0.12);
        }
        .danger-title {
            color: var(--danger-title);
            font-weight: 800;
            font-size: 15px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .text-red {
            color: var(--danger-strong);
            font-weight: 700;
        }
        .danger-tag {
            background: #ef4444;
            color: #ffffff;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            margin-right: 6px;
        }
        .step-danger-tip {
            margin-top: 8px;
            padding: 8px 12px;
            background: var(--step-tip-bg);
            border-left: 3.5px solid var(--step-tip-border);
            border-radius: 6px;
            color: var(--step-tip-text);
            font-size: 12px;
            line-height: 1.5;
        }
        .faq-card {
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 12px;
            padding: 12px 14px;
            margin-top: 18px;
            font-size: 13px;
        }
        .faq-title {
            color: var(--accent);
            font-weight: 600;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .footer-action {
            margin-top: 22px;
            display: flex;
            gap: 12px;
        }
        .btn-main {
            flex: 1;
            background: linear-gradient(135deg, var(--primary), #0369a1);
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 12px;
            font-size: 14.5px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
            transition: transform 0.15s, opacity 0.15s;
        }
        .btn-main:hover {
            opacity: 0.95;
            transform: translateY(-1px);
        }
        .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: rgba(15, 23, 42, 0.95);
            color: #38bdf8;
            padding: 8px 18px;
            border-radius: 20px;
            font-size: 13px;
            opacity: 0;
            pointer-events: none;
            transition: all 0.25s ease;
            box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            border: 1px solid rgba(56, 189, 248, 0.3);
        }
        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-icon">📱</div>
            <div class="title-group">
                <h1>中国移动抓包凭据获取教程</h1>
                <p>适用于小黄鸟 (HttpCanary)、StormSniffer、Stream、Thor、Reqable 等抓包工具</p>
            </div>
        </div>

        <!-- 红色醒目警示框 -->
        <div class="danger-card">
            <div class="danger-title">🚨 核心防掉线警示（防会话顶号必读）</div>
            <div style="margin-bottom: 8px;">
                <span class="danger-tag">红色重点</span><b class="text-red">抓包填入 Home Assistant 后，切勿在手机上再次打开中国移动 App！</b>
            </div>
            <div>
                • <b class="text-red">为什么会掉线/离线？</b> 中国移动服务端采用严格的<b>单设备最新会话互斥策略</b>。当您在手机上重新打开、冷启动或前台唤醒中国移动 App 时，App 底层会在毫秒级向服务器换签全新的 Session 并<b>强制注销踢掉旧凭据</b>，这会当场使填入 Home Assistant 的 Cookie 失效！<br>
                • <b class="text-red">稳定保活秘诀：</b> 抓包完成后请彻底划掉/退出手机上的移动 App。只要手机端<b>不再主动打开该 App</b>，Home Assistant 即可在后台<b>长期稳定保活</b>（实测已彻底打破 30 分钟硬限制，可持续保活数周以上）；<br>
                • <b class="text-red">强烈推荐方案：</b> 建议使用<b>备用机或电脑安卓模拟器</b>抓包供 Home Assistant 专用，主力机即可随意使用移动 App 而互不干扰。
            </div>
        </div>

        <div class="step-list">
            <!-- 步骤 1 -->
            <div class="step-item">
                <div class="step-header">
                    <span class="step-badge">步骤 1</span>
                    <span class="step-title">开启手机抓包</span>
                </div>
                <div class="step-desc">
                    在手机上打开抓包软件并启动抓包服务（需已安装并信任 CA 证书）：<br>
                    • <b>安卓 (Android)</b>：推荐使用 <b>小黄鸟 (HttpCanary)</b> 或 <b>Reqable</b>，点击右下角飞机图标启动抓包；<br>
                    • <b>苹果 (iOS)</b>：推荐使用 <b>StormSniffer</b>、<b>Stream</b> 等，启动抓包开关。
                </div>
            </div>

            <!-- 步骤 2 -->
            <div class="step-item">
                <div class="step-header">
                    <span class="step-badge">步骤 2</span>
                    <span class="step-title">刷新中国移动 App</span>
                </div>
                <div class="step-desc">
                    打开<b>“中国移动”官方 App</b>，在首页下拉刷新，或者点击底部导航栏的<b>“我的”</b>页面，直到屏幕上展示出当前话费和剩余流量。
                    <div class="step-danger-tip">
                        🔴 <b class="text-red">关键注意：</b>抓包成功并获取到 cURL 后，请<b>立即划掉退出手机上的移动 App</b>！后续切勿随意再次打开，否则 App 会签发新凭据而导致 HA 凭据失效。
                    </div>
                </div>
            </div>

            <!-- 步骤 3 -->
            <div class="step-item">
                <div class="step-header">
                    <span class="step-badge">步骤 3</span>
                    <span class="step-title">定位核心目标请求 (关键)</span>
                </div>
                <div class="step-desc">
                    返回抓包软件的抓包列表中，在上方搜索过滤栏输入以下关键词查找：
                </div>
                <div class="code-box">
                    <span>getFamilyCube</span>
                    <button class="btn-copy" onclick="copyText('getFamilyCube')">复制关键词</button>
                </div>
                <div class="step-desc" style="margin-top: 6px; font-size: 12px;">
                    💡 <i>备选域名过滤：</i> <code>h.app.coc.10086.cn</code>
                </div>
            </div>

            <!-- 步骤 4 -->
            <div class="step-item">
                <div class="step-header">
                    <span class="step-badge">步骤 4</span>
                    <span class="step-title">一键复制 cURL 凭据</span>
                </div>
                <div class="step-desc">
                    点击找到的 <code>/biz-orange/DH/MyPage/getFamilyCube</code> 请求：<br>
                    • <b>小黄鸟 (HttpCanary)</b>：长按该条请求记录，点击 <span class="highlight">“复制” ➔ “复制 cURL”</span>（或进入请求详情查看 Request 头的 <code>x-token</code>）；<br>
                    • <b>StormSniffer / Stream</b>：长按该请求选择 <span class="highlight">“复制为 cURL (bash)”</span>；<br>
                    • <b>备选方式</b>：切换到 Request Headers (请求头)，复制里面的 <code>x-token</code> 或完整请求头。
                </div>
            </div>

            <!-- 步骤 5 -->
            <div class="step-item">
                <div class="step-header">
                    <span class="step-badge">步骤 5</span>
                    <span class="step-title">粘贴到 Home Assistant 提交</span>
                </div>
                <div class="step-desc">
                    回到 Home Assistant 集成配置页面，将复制的整段内容完整粘贴至<b>“移动抓包凭据”</b>输入框中，系统会自动智能提取有效凭据并直接完成绑定！
                    <div class="step-danger-tip">
                        🚫 <b class="text-red">禁止操作：</b>提交成功后请直接在 HA 中查看卡片，<b>千万不要返回手机打开移动 App 验证</b>，否则刚绑定的凭据会被当场顶掉！
                    </div>
                </div>
            </div>
        </div>

        <div class="faq-card">
            <div class="faq-title">💡 常见问题与排查</div>
            <p>• <b class="text-red">为什么配置完没多久就提示重新登录/离线？</b><br>
            <span style="display:inline-block; margin-left: 14px; margin-top: 2px;"><b>99% 的原因是在抓包后手机端又打开了移动 App</b>。手机 App 启动会自动换发新票据，导致服务端单点注销了 HA 的旧凭据。只要关闭手机端 App，或使用备用机抓包，即可长期稳定运行。</span></p>
            <p style="margin-top: 6px;">• <b>凭据正常能用多久？</b> 只要手机端不主动打开移动 App 顶号，提取的会话凭据可在后台稳定轮询数周乃至更久；</p>
            <p style="margin-top: 4px;">• <b>失效了怎么办？</b> 如果未来收到凭据过期通知，只需按本教程重新抓包复制一次即可恢复。</p>
        </div>

        <div class="footer-action">
            <button class="btn-main" onclick="closeOrBack()">已掌握方法，关闭此窗口并返回</button>
        </div>
    </div>

    <div class="toast" id="toast">已复制到剪贴板</div>

    <script>
        function closeOrBack() {
            try {
                window.opener = null;
                window.open('', '_self');
                window.close();
            } catch(e) {}
            setTimeout(function() {
                if (!window.closed && history.length > 1) {
                    history.back();
                }
            }, 300);
        }

        function copyText(txt) {
            navigator.clipboard.writeText(txt).then(() => {
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 1800);
            });
        }
    </script>
</body>
</html>
"""


class CarrierMobileTutorialView(HomeAssistantView):
    """提供中国移动抓包教程页面的视图"""
    url = "/api/shaobo_pocket_carrier/mobile_tutorial"
    name = "api:shaobo_pocket_carrier:mobile_tutorial"
    requires_auth = False

    async def get(self, request):
        return web.Response(text=MOBILE_TUTORIAL_HTML, content_type="text/html", status=200)

