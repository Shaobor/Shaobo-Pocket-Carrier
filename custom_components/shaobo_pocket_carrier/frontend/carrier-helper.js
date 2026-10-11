/**
 * 掌上运营商 - 全局辅助脚本 (Pocket Carrier Helper)
 * 作用:
 * 1. 拦截 Home Assistant 配置向导与页面中掌上运营商相关链接(中国移动抓包教程、中国联通滑块验证等)
 * 2. 无论当前链接为相对路径还是同源绝对路径，均强制在浏览器新标签页 (New Tab) 打开，
 *    彻底防止因同源跳转离开当前配置弹窗而丢失进度。
 */
(function () {
  if (typeof window === "undefined" || window._carrierHelperInitialized) return;
  window._carrierHelperInitialized = true;

  function handleAnchorClick(e) {
    try {
      const path = e.composedPath ? e.composedPath() : [];
      let anchor = null;
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (el && el.tagName === "A" && el.href) {
          anchor = el;
          break;
        }
      }

      if (!anchor || !anchor.href) return;

      const href = anchor.href;
      if (
        href.includes("/api/shaobo_pocket_carrier/mobile_tutorial") ||
        href.includes("/api/shaobo_pocket_carrier/slider") ||
        href.includes("/api/shaobo_pocket_carrier/verify_slider")
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } catch (err) {}
  }

  // 使用捕获阶段 (capture: true) 拦截所有穿透 Shadow DOM 的点击事件
  window.addEventListener("click", handleAnchorClick, true);
})();
