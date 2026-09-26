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
        
        <div id="statusBox" class="status-box"></div>
    </div>

    <script>
        const flowId = "__FLOW_ID__";
        const mobileHex = "__MOBILE_HEX__";

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
                        showStatus("✅ <b>滑块验证成功！短信已下发</b><br><span style='font-size:13px;opacity:0.85;display:inline-block;margin-top:6px;'>页面将在 <span id='countdown' style='font-weight:bold;color:#10b981;'>2</span> 秒后自动关闭，请切回 Home Assistant 输入短信验证码。<br><button onclick='window.close()' style='margin-top:10px;padding:6px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;'>立即关闭窗口</button></span>", false);
                        let timeLeft = 2;
                        const timer = setInterval(function() {
                            timeLeft--;
                            const cd = document.getElementById("countdown");
                            if (cd) cd.innerText = timeLeft;
                            if (timeLeft <= 0) {
                                clearInterval(timer);
                                try {
                                    window.opener = null;
                                    window.open('', '_self');
                                    window.close();
                                } catch(e) {}
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
    """提供滑块 HTML 页面的视图"""
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
            <head><meta charset="UTF-8"><title>中国联通验证服务</title>
            <style>body{background:#1f1c2c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}</style>
            </head>
            <body><div style="text-align:center;padding:20px;">
                <h2>⚠️ 暂无正在等待验证的联通手机号</h2>
                <p style="color:rgba(255,255,255,0.7);margin-top:10px;">请先在 Home Assistant 界面点击添加集成并输入联通手机号。</p>
            </div></body></html>"""
            return web.Response(text=fallback_html, content_type="text/html", status=200)

        mobile_hex = session.get("mobile_hex") or (session.get("client") and session["client"].mobile_hex) or ""
        html = HTML_TEMPLATE.replace("__FLOW_ID__", flow_id).replace("__MOBILE_HEX__", mobile_hex)
        return web.Response(text=html, content_type="text/html", status=200)


class CarrierSliderVerifyView(HomeAssistantView):
    """接收腾讯滑块完成凭证并下发短信的回调视图"""
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

            # 优先使用官方沙箱返回的 result_token 直接下发短信
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
