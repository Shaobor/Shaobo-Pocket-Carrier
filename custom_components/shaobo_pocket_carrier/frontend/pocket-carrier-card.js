/**
 * pocket-carrier-card —— 掌上运营商集成配套的通讯卡片
 *
 * 由 room-elves-card (https://github.com/chjspp520/room-elves-card) 的 comm 卡片提取而来，
 * 只保留 comm 独立模式用到的代码与样式；元素名不同，可与完整版 room-elves-card 同时安装。
 *
 * 用法 (原 room-elves-card 写法只需改 type，standalone_type 可省略):
 *   type: custom:pocket-carrier-card
 *   name: 我的通讯
 *   tel_1: 13800138000
 *   tel_1_name: 我的
 */

// EChartsMixin
const bt = {
  _preloadEcharts() {
    const t = this.constructor;
    t._globalEchartsPromise ||
      t._globalEchartsLoaded ||
      this._loadEchartsUnified().catch((e) => {
        (console.warn("[ECharts] 预加载失败（将在实际使用时重试）:", e), (t._globalEchartsPromise = null));
      });
  },
  _loadEchartsUnified() {
    const t = this.constructor;
    return t._globalEchartsLoaded && "undefined" != typeof echarts
      ? (this._patchEchartsInstanceTracking(echarts), Promise.resolve(echarts))
      : (t._globalEchartsPromise ||
        (t._globalEchartsPromise = new Promise((e, a) => {
          if ("undefined" != typeof echarts)
            return ((t._globalEchartsLoaded = !0), this._patchEchartsPassiveEvents(), void e(echarts));
          const n = (o = 0) => {
            const i = document.createElement("script");
            ((i.src = "https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"),
              (i.onload = () => {
                "undefined" != typeof echarts
                  ? ((t._globalEchartsLoaded = !0),
                    this._patchEchartsPassiveEvents(),
                    this._patchEchartsInstanceTracking(echarts),
                    e(echarts))
                  : a(new Error("[ECharts] CDN加载后全局变量未定义"));
              }),
              (i.onerror = () => {
                if (o < 3) {
                  const t = 1e3 * Math.pow(2, o);
                  (console.warn(`[ECharts] CDN加载失败，${t / 1e3}s后第${o + 1}次重试...`),
                    this._timers.setTimeout(() => n(o + 1), t));
                } else a(new Error("[ECharts] CDN加载失败（已重试3次）"));
              }),
              document.head.appendChild(i));
          };
          (() => {
            const a = document.createElement("script");
            ((a.src = "/local/pobaby_package/js/echarts.min.js"),
              (a.onload = () => {
                "undefined" != typeof echarts
                  ? ((t._globalEchartsLoaded = !0),
                    this._patchEchartsPassiveEvents(),
                    this._patchEchartsInstanceTracking(echarts),
                    e(echarts))
                  : n();
              }),
              (a.onerror = n),
              document.head.appendChild(a));
          })();
        })),
        t._globalEchartsPromise);
  },
  _patchEchartsInstanceTracking(t) {
    if (!t || t.__rmInstanceTracked || "function" != typeof t.init) return;
    t.__rmInstanceTracked = !0;
    const e = t.init;
    t.init = function (a, n, o) {
      if (!a) return e.call(t, a, n, o);
      try {
        const t = a._echartsInstance;
        t && "function" == typeof t.dispose && !t.isDisposed() && t.dispose();
      } catch (t) { }
      const i = e.call(t, a, n, o);
      try {
        a._echartsInstance = i;
        const t = i.dispose;
        "function" == typeof t &&
          (i.dispose = function () {
            try {
              a._echartsInstance === i && (a._echartsInstance = null);
            } catch (t) { }
            return t.apply(this, arguments);
          });
      } catch (t) { }
      return i;
    };
  },
  _patchEchartsPassiveEvents() {
    const t = this.constructor;
    if (t._echartsPassivePatched) return;
    t._echartsPassivePatched = !0;
    const e = new Set(["wheel", "mousewheel", "touchstart", "touchmove"]),
      a = HTMLElement.prototype,
      n = a.addEventListener;
    a.addEventListener = function (t, a, o) {
      if (e.has(t)) {
        if (this && "function" == typeof this.closest && this.closest("[data-rm-passive-exempt]"))
          return n.call(this, t, a, o);
        "boolean" == typeof o
          ? (o = { capture: o, passive: !0 })
          : o && "object" == typeof o
            ? void 0 === o.passive && (o = { ...o, passive: !0 })
            : (o = { passive: !0 });
      }
      return n.call(this, t, a, o);
    };
  },
};

const St = (t) => {
  try {
    return "function" != typeof t ? "" : String(t).replace(/\s+/g, " ").slice(0, 52);
  } catch (t) {
    return "";
  }
};

class Et {
  constructor() {
    ((this.intervals = new Set()),
      (this.timeouts = new Set()),
      (this.rafs = new Set()),
      (this.resizeDebounceTimer = null),
      (this._meta = new Map()));
  }
  setInterval(t, e) {
    const a = setInterval(() => {
      t();
    }, e);
    return (this.intervals.add(a), this._meta.set(a, { kind: "interval", delay: e, at: Date.now(), src: St(t) }), a);
  }
  setTimeout(t, e) {
    const a = setTimeout(() => {
      (this.timeouts.delete(a), this._meta.delete(a), t());
    }, e);
    return (this.timeouts.add(a), this._meta.set(a, { kind: "timeout", delay: e, at: Date.now(), src: St(t) }), a);
  }
  requestAnimationFrame(t) {
    const e = requestAnimationFrame(() => {
      (this.rafs.delete(e), t());
    });
    return (this.rafs.add(e), e);
  }
  clearInterval(t) {
    null != t && (clearInterval(t), this.intervals.delete(t), this._meta.delete(t));
  }
  clearTimeout(t) {
    null != t && (clearTimeout(t), this.timeouts.delete(t), this._meta.delete(t));
  }
  cancelAnimationFrame(t) {
    null != t && (cancelAnimationFrame(t), this.rafs.delete(t));
  }
  clearAll() {
    (this.intervals.forEach((t) => clearInterval(t)),
      this.intervals.clear(),
      this.timeouts.forEach((t) => clearTimeout(t)),
      this.timeouts.clear(),
      this.rafs.forEach((t) => cancelAnimationFrame(t)),
      this.rafs.clear(),
      this.resizeDebounceTimer && (clearTimeout(this.resizeDebounceTimer), (this.resizeDebounceTimer = null)),
      this._meta.clear());
  }
  describe() {
    const t = Date.now(),
      e = [];
    return (
      this._meta.forEach((a, n) => {
        ("interval" === a.kind ? this.intervals.has(n) : "timeout" === a.kind && this.timeouts.has(n)) &&
          e.push({ id: n, kind: a.kind, delay: a.delay, ageMs: Math.max(0, t - a.at), src: a.src || "" });
      }),
      e.sort((t, e) => t.delay - e.delay),
      e
    );
  }
}

class At {
  static _instances = [];
  static _nextId = 1;
  constructor(t) {
    ((this._card = t),
      (this._instanceId = At._nextId++),
      At._instances.push(this),
      (this.baseZIndex = 1e3),
      (this.layerGap = 10),
      (this.stack = []),
      (this.nextId = 1),
      (this.maxStackDepth = 100),
      (this._domToIdWeakMap = new WeakMap()),
      (this._scrollLockedElements = null),
      (this._scrollLockHandlers = null),
      (this._docScrollLockedElements = null));
  }
  getNextZIndex(t = "popup", e) {
    const a = this._card;
    this.stack.length >= this.maxStackDepth &&
      (console.warn(`[Z-Index Manager] 栈深度已达上限 (${this.maxStackDepth})，执行垃圾回收`),
        this._garbageCollect(),
        this.stack.length >= this.maxStackDepth &&
        (console.warn("[Z-Index Manager] 垃圾回收后仍超限，强制重置栈"), this.clearAll()));
    const n = this.stack.length,
      o = this.baseZIndex + n * this.layerGap * 2 + 2,
      i = o - 2,
      r = this.nextId++;
    this.stack.push({ id: r, type: t, zIndex: o, overlayZIndex: i });
    const s = this.stack[this.stack.length - 1];
    return (
      e && "undefined" != typeof WeakRef && (s.domRef = new WeakRef(e)),
      0 === n && a._lockBodyScroll && !a.constructor._globalForceLockScroll && a._lockBodyScroll(),
      this.stack.length > 1 && this._disableLowerOverlays(),
      { id: r, zIndex: o, overlayZIndex: i }
    );
  }
  releaseZIndex(t) {
    const e = this._card,
      a = this.stack.findIndex((e) => e.id === t);
    -1 !== a && this.stack.splice(a, 1);
    try {
      (e?.shadowRoot
        ? e.shadowRoot.querySelectorAll(`[data-z-index-id="${t}"]`)
        : document.querySelectorAll(`[data-z-index-id="${t}"]`)
      ).forEach((t) => t.remove());
    } catch (t) { }
    (this.stack.length > 0 && this._restoreTopOverlay(),
      0 === this.stack.length &&
      e._unlockBodyScroll &&
      !e.constructor._globalForceLockScroll &&
      (this._unlockAllScrollContainers(), e._unlockBodyScroll()));
  }
  _disableLowerOverlays() {
    const t = this._card;
    if (!t.shadowRoot) return;
    const e = t.shadowRoot.querySelectorAll(".popup-overlay"),
      a = new Set(["bubble", "traffic-bubble", "timeline-tooltip", "calendar-popup", "select-dropdown", "toast"]);
    let n = null;
    for (let t = this.stack.length - 1; t >= 0; t--)
      if (!a.has(this.stack[t].type)) {
        n = this.stack[t];
        break;
      }
    (e.forEach((t) => {
      const e = t.dataset.zIndexId;
      (n && e && parseInt(e) === n.id) ||
        (void 0 === t._origPointerEvents && (t._origPointerEvents = t.style.pointerEvents || ""),
          void 0 === t._origBackdropFilter &&
          ((t._origBackdropFilter = t.style.backdropFilter || ""),
            (t._origWebkitBackdropFilter = t.style.webkitBackdropFilter || "")),
          (t.style.pointerEvents = "none"),
          (t.style.backdropFilter = "none"),
          (t.style.webkitBackdropFilter = "none"));
    }),
      this._lockLowerScrollContainers(n));
  }
  _restoreTopOverlay() {
    const t = this._card;
    if (!t.shadowRoot) return;
    const e = new Set(["bubble", "traffic-bubble", "timeline-tooltip", "calendar-popup", "select-dropdown", "toast"]);
    let a = null;
    for (let t = this.stack.length - 1; t >= 0; t--)
      if (!e.has(this.stack[t].type)) {
        a = this.stack[t];
        break;
      }
    a &&
      (t.shadowRoot.querySelectorAll(".popup-overlay").forEach((t) => {
        const e = t.dataset.zIndexId;
        e && parseInt(e) === a.id
          ? (void 0 !== t._origPointerEvents &&
            ((t.style.pointerEvents = t._origPointerEvents), delete t._origPointerEvents),
            void 0 !== t._origBackdropFilter &&
            ((t.style.backdropFilter = t._origBackdropFilter), delete t._origBackdropFilter),
            void 0 !== t._origWebkitBackdropFilter &&
            ((t.style.webkitBackdropFilter = t._origWebkitBackdropFilter), delete t._origWebkitBackdropFilter))
          : ((t.style.pointerEvents = "none"),
            (t.style.backdropFilter = "none"),
            (t.style.webkitBackdropFilter = "none"));
      }),
        this._unlockAllScrollContainers(),
        this.stack.length > 1 && this._lockLowerScrollContainers(a));
  }
  _lockLowerScrollContainers(t) {
    const e = this._card;
    if (!e.shadowRoot) return;
    (this._scrollLockedElements || (this._scrollLockedElements = []),
      this._scrollLockHandlers || (this._scrollLockHandlers = []),
      this._docScrollLockedElements || (this._docScrollLockedElements = []));
    for (let t = this.stack.length - 1; t >= 0; t--)
      if (this.stack[t].zIndex) {
        this.stack[t].zIndex;
        break;
      }
    const a = new Set();
    (e.shadowRoot.querySelectorAll(".generic-arrow-bubble").forEach((t) => {
      (a.add(t), t.querySelectorAll("*").forEach((t) => a.add(t)));
    }),
      e.shadowRoot.querySelectorAll(".scene-mode-overlay").forEach((t) => {
        a.add(t);
      }));
    const n = this.stack[this.stack.length - 1];
    n &&
      void 0 !== n.id &&
      e.shadowRoot.querySelectorAll(`[data-z-index-id="${n.id}"]`).forEach((t) => {
        (a.add(t), t.querySelectorAll("*").forEach((t) => a.add(t)));
      });
    const o = (t) => {
      const e = t.overflowY,
        a = t.overflowX;
      return "auto" === e || "scroll" === e || "auto" === a || "scroll" === a;
    };
    e.shadowRoot.querySelectorAll("*").forEach((t) => {
      if (a.has(t)) return;
      if (t.querySelector && t.querySelector(".generic-arrow-bubble")) return;
      const e = window.getComputedStyle(t);
      o(e) &&
        (void 0 === t._origOverflowY &&
          ((t._origOverflowY = t.style.overflowY),
            (t._origOverflow = t.style.overflow),
            (t._origWebkitOverflowScrolling = t.style.webkitOverflowScrolling),
            (t._origTouchAction = t.style.touchAction)),
          (t.style.overflowY = "hidden"),
          (t.style.overflow = "hidden"),
          (t.style.webkitOverflowScrolling = "auto"),
          (t.style.touchAction = "none"),
          this._scrollLockedElements.includes(t) || this._scrollLockedElements.push(t));
    });
    try {
      const t = document.querySelectorAll("*"),
        a = new Set();
      let n = e;
      for (; n && n.host;) (a.add(n.host), (n = n.getRootNode ? n.getRootNode() : null));
      t.forEach((t) => {
        if (a.has(t)) return;
        if (t.getRootNode && t.getRootNode() !== document) return;
        const e = window.getComputedStyle(t);
        o(e) &&
          (void 0 === t._docOrigOverflow &&
            ((t._docOrigOverflow = t.style.overflow),
              (t._docOrigOverflowY = t.style.overflowY),
              (t._docOrigTouchAction = t.style.touchAction)),
            (t.style.overflow = "hidden"),
            (t.style.overflowY = "hidden"),
            (t.style.touchAction = "none"),
            this._docScrollLockedElements.includes(t) || this._docScrollLockedElements.push(t));
      });
    } catch (t) { }
    const i = [
      ".popup-overlay",
      ".device-popup",
      ".light-control-popup",
      ".light-card-popup",
      ".automation-popup",
      ".consumables-popup",
      ".ac-control-popup",
      ".phone-control-popup",
      ".media-control-popup",
      ".socket-control-popup",
      ".person-popup",
      ".person-popup-container",
      ".entity-details-popup",
      ".free-layout-popup",
      ".more-info-popup",
      ".custom-card-popup",
      ".curtain-control-popup",
      ".overview-control-popup",
    ];
    i.forEach((t) => {
      e.shadowRoot.querySelectorAll(t).forEach((t) => {
        a.has(t) ||
          ("none" !== t.style.pointerEvents &&
            void 0 === t._origTouchAction &&
            ((t._origTouchAction = t.style.touchAction), (t.style.touchAction = "none")));
      });
    });
    const r = (t) => {
      t.preventDefault();
    };
    i.forEach((t) => {
      e.shadowRoot.querySelectorAll(t).forEach((t) => {
        a.has(t) ||
          ("none" !== t.style.pointerEvents &&
            (t._scrollLockBound ||
              (t.addEventListener("touchmove", r, { passive: !1 }),
                (t._scrollLockBound = !0),
                this._scrollLockHandlers.push({ el: t, handler: r }))));
      });
    });
  }
  _unlockAllScrollContainers() {
    this._scrollLockedElements &&
      (this._scrollLockedElements.forEach((t) => {
        (void 0 !== t._origOverflowY && ((t.style.overflowY = t._origOverflowY), delete t._origOverflowY),
          void 0 !== t._origOverflow && ((t.style.overflow = t._origOverflow), delete t._origOverflow),
          void 0 !== t._origWebkitOverflowScrolling &&
          ((t.style.webkitOverflowScrolling = t._origWebkitOverflowScrolling), delete t._origWebkitOverflowScrolling),
          void 0 !== t._origTouchAction && ((t.style.touchAction = t._origTouchAction), delete t._origTouchAction));
      }),
        (this._scrollLockedElements = []),
        this._docScrollLockedElements &&
        (this._docScrollLockedElements.forEach((t) => {
          (void 0 !== t._docOrigOverflow && ((t.style.overflow = t._docOrigOverflow), delete t._docOrigOverflow),
            void 0 !== t._docOrigOverflowY && ((t.style.overflowY = t._docOrigOverflowY), delete t._docOrigOverflowY),
            void 0 !== t._docOrigTouchAction &&
            ((t.style.touchAction = t._docOrigTouchAction), delete t._docOrigTouchAction));
        }),
          (this._docScrollLockedElements = [])),
        this._scrollLockHandlers &&
        (this._scrollLockHandlers.forEach(({ el: t, handler: e }) => {
          (t.removeEventListener("touchmove", e),
            delete t._scrollLockBound,
            void 0 !== t._origTouchAction && ((t.style.touchAction = t._origTouchAction), delete t._origTouchAction));
        }),
          (this._scrollLockHandlers = [])));
  }
  getTopZIndex() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }
  getStackDepth() {
    return this.stack.length;
  }
  static closeAllInstances() {
    let t = 0;
    return (
      At._instances.forEach((e) => {
        try {
          t += e.closeAll();
        } catch (t) { }
      }),
      t
    );
  }
  clearAll() {
    ((this.stack = []), (this.nextId = 1));
  }
  dispose() {
    this.clearAll();
    try {
      this._unlockAllScrollContainers();
    } catch (t) { }
    const t = At._instances.indexOf(this);
    (-1 !== t && At._instances.splice(t, 1), (this._card = null));
  }
  closeAll() {
    const t = this._card;
    let e = 0;
    if (0 === this.stack.length)
      return (
        (t?.shadowRoot ? t.shadowRoot.querySelectorAll("[data-z-index-id]") : []).forEach((t) => {
          (t.remove(), e++);
        }),
        e
      );
    for (let a = this.stack.length - 1; a >= 0; a--) {
      const n = this.stack[a].id,
        o = t?.shadowRoot ? t.shadowRoot.querySelectorAll(`[data-z-index-id="${n}"]`) : [];
      if (0 === o.length) {
        const t = document.querySelector(`[data-z-index-id="${n}"]`);
        t && (t.remove(), e++);
      } else
        o.forEach((t) => {
          (t.remove(), e++);
        });
      this.releaseZIndex(n);
    }
    return (this.clearAll(), e);
  }
  getById(t) {
    return this.stack.find((e) => e.id === t) || null;
  }
  _garbageCollect() {
    if ("undefined" != typeof document && document.body) {
      this.stack.length;
      for (let t = this.stack.length - 1; t >= 0; t--) {
        const e = this.stack[t];
        let a = !1;
        if (e.domRef) {
          const t = e.domRef.deref();
          a = t && t.isConnected;
        } else {
          let t = document.querySelector(`[data-z-index-id="${e.id}"]`);
          (!t &&
            this._card &&
            this._card.shadowRoot &&
            (t = this._card.shadowRoot.querySelector(`[data-z-index-id="${e.id}"]`)),
            (a = t && t.isConnected));
        }
        a || this.stack.splice(t, 1);
      }
    }
  }
}

// ScrollLockMixin
const Kt = {
  _initScrollLockProperties() {
    ((this._scrollLocked = !1),
      (this._savedScrollY = 0),
      (this._savedScrollX = 0),
      (this._popupScrollElements = null),
      (this._overlayTouchMoveHandler = null),
      (this._prohibitScrollConfig = null),
      (this._prohibitScrollEntity = null),
      (this._forceLockScroll = !1),
      (this._bodyStyleObserver = null));
  },
  _lockBodyScroll() {
    // 独立卡片模式：绝不篡改宿主 document.body 与 html 样式，防止破坏 Home Assistant 顶栏与侧边栏
    return;
  },
  _unlockBodyScroll() {
    return;
  },
};

// StylesMixin
const ie = {
  _applyDynamicCssVariables() {
    const t = this.shadowRoot.querySelector(".room-card") || this.shadowRoot.host;
    if (!t) return;
    const e = this.isMobile,
      a = this.head && "300px" === this.cardStyle.width ? "auto" : this.cardStyle.width;
    (t.style.setProperty("--room-card-width", a),
      t.style.setProperty("--room-card-height", this.cardStyle.height),
      t.style.setProperty("--room-card-border-radius", this.cardStyle.borderRadius),
      t.style.setProperty("--room-card-bg", this.cardStyle.background || this.cardStyle.backgroundColor),
      t.style.setProperty("--room-card-backdrop-filter", e ? "none" : this.cardStyle.backdropFilter),
      t.style.setProperty("--room-card-shadow", this.cardStyle.boxShadow),
      t.style.setProperty("--room-card-width-raw", this.cardStyle.width),
      t.style.setProperty("--room-opt-bd-sm", e ? "none" : "blur(6px)"),
      t.style.setProperty("--room-opt-bd-md", e ? "none" : "blur(10px)"),
      t.style.setProperty("--room-opt-f-entity", e ? "none" : "drop-shadow(0 0 2px rgba(127, 140, 141, 0.3))"),
      t.style.setProperty("--room-opt-f-blue", e ? "none" : "drop-shadow(0 0 3px rgba(52, 152, 219, 0.4))"),
      t.style.setProperty("--room-opt-f-color", e ? "none" : "drop-shadow(0 0 3px currentColor)"),
      t.style.setProperty("--room-opt-f-amber", e ? "none" : "drop-shadow(0 0 3px rgba(255, 193, 7, 0.5))"),
      t.style.setProperty("--room-opt-f-gray", e ? "none" : "drop-shadow(0 0 2px rgba(102, 102, 102, 0.4))"));
  },
};

const re = {
  "--room-calendar-weekday-color": "rgba(255, 255, 255, 0.5)",
  "--room-calendar-day-color": "rgba(255, 255, 255, 0.4)",
  "--room-calendar-day-bg": "rgba(255, 255, 255, 0.08)",
  "--room-calendar-today-bg": "rgba(255, 152, 0, 0.15)",
  "--room-calendar-today-color": "#ffb74d",
  "--room-calendar-today-border": "#ff9f09",
  "--room-calendar-selected-border": "#3498db",
  "--room-calendar-selected-bg": "rgba(52, 152, 219, 0.2)",
  "--room-calendar-hover-bg": "rgba(255, 255, 255, 0.12)",
  "--room-calendar-selected-hover-bg": "rgba(52, 152, 219, 0.3)",
  "--room-calendar-has-data-color": "#64b5f6",
  "--room-calendar-has-data-bg": "rgba(33, 150, 243, 0.15)",
  "--room-calendar-has-data-mark-bg": "#42a5f5",
  "--room-calendar-has-data-hover-bg": "rgba(33, 150, 243, 0.25)",
  "--room-calendar-api-data-color": "#ffcc80",
  "--room-calendar-api-data-bg": "rgba(255, 183, 77, 0.15)",
  "--room-calendar-api-data-hover-bg": "rgba(255, 183, 77, 0.25)",
  "--room-btn-on-bg": "linear-gradient(135deg, #27ae60, #1e8449)",
  "--room-btn-off-bg": "linear-gradient(135deg, #c0392b, #922b21)",
  "--room-btn-toggle-bg": "linear-gradient(135deg, #2980b9, #1a5276)",
  "--room-btn-custom-bg": "linear-gradient(135deg, #8e44ad, #6c3483)",
  "--room-du-running-color": "#f58220",
};

const se = (() => {
  const t = re;
  return {
    light: {
      "--room-card-bg": "rgba(255, 255, 255, 0.8)",
      "--room-card-shadow": "0 8px 32px rgba(0, 0, 0, 0.1)",
      "--room-card-hover-shadow": "0 12px 40px rgba(0, 0, 0, 0.15)",
      "--room-primary-text": "#2c3e50",
      "--room-secondary-text": "rgba(0, 0, 0, 0.6)",
      "--room-icon-color": "rgba(0, 0, 0, 0.7)",
      "--room-button-bg": "rgba(0, 0, 0, 0.05)",
      "--room-button-active-bg": "rgba(0, 0, 0, 0.12)",
      "--room-popup-bg": "rgba(255, 255, 255, 0.98)",
      "--room-popup-shadow": "0 20px 60px rgba(0, 0, 0, 0.15)",
      "--room-popup-border": "rgba(0, 0, 0, 0.1)",
      "--room-overlay-bg": "rgba(0, 0, 0, 0.4)",
      "--room-entity-value": "rgba(0, 0, 0, 0.8)",
      "--room-entity-name": "rgba(0, 0, 0, 0.6)",
      "--room-slider-bg": "rgba(0, 0, 0, 0.1)",
      "--room-slider-track": "rgba(52, 152, 219, 0.8)",
      "--room-input-bg": "rgba(255, 255, 255, 0.9)",
      "--room-input-border": "rgba(0, 0, 0, 0.1)",
      "--room-input-text": "rgba(0, 0, 0, 0.8)",
      "--room-toast-bg": "#3498db",
      "--room-confirm-bg": "rgba(255, 255, 255, 0.95)",
      "--room-confirm-shadow": "0 10px 40px rgba(0, 0, 0, 0.2)",
      "--room-title-bg": "linear-gradient(135deg, rgba(52, 152, 219, 0.9), rgba(41, 128, 185, 0.9))",
      "--room-title-text": "white",
      "--room-primary-text-bg": "rgba(255, 255, 255, 0.8)",
      "--room-primary-text-border": "rgba(255, 255, 255, 0.4)",
      "--room-dropdown-bg": "rgba(255, 255, 255, 0.98)",
      "--room-dropdown-shadow": "0 8px 32px rgba(0, 0, 0, 0.15)",
      "--room-dropdown-item-hover": "rgba(52, 152, 219, 0.1)",
      "--room-dropdown-item-active": "rgba(52, 152, 219, 0.2)",
      "--room-calendar-weekday-color": "#7f8c8d",
      "--room-calendar-day-color": "#9e9e9e",
      "--room-calendar-day-bg": "#f5f5f5",
      "--room-calendar-today-bg": "#f3e5f5",
      "--room-calendar-today-color": "#7b1fa2",
      "--room-calendar-today-border": "#ff9f09",
      "--room-calendar-selected-border": "#3498db",
      "--room-calendar-selected-bg": "#e3f2fd",
      "--room-calendar-hover-bg": "#eeeeee",
      "--room-calendar-selected-hover-bg": "#bbdefb",
      "--room-calendar-has-data-color": "#1976d2",
      "--room-calendar-has-data-bg": "#e3f2fd",
      "--room-calendar-has-data-mark-bg": "#2196f3",
      "--room-calendar-has-data-hover-bg": "#bbdefb",
      "--room-calendar-api-data-color": "#795548",
      "--room-calendar-api-data-bg": "#fff8e1",
      "--room-calendar-api-data-hover-bg": "#ffecb3",
      "--room-btn-default-bg": "rgba(0, 0, 0, 0.05)",
      "--room-btn-default-shadow": "0 0 8px rgba(52, 152, 219, 0.2)",
      "--room-btn-on-bg": "linear-gradient(135deg, #2ecc71, #27ae60)",
      "--room-btn-on-shadow": "0 4px 12px rgba(46, 204, 113, 0.3)",
      "--room-btn-off-bg": "linear-gradient(135deg, #e74c3c, #c0392b)",
      "--room-btn-off-shadow": "0 4px 12px rgba(231, 76, 60, 0.3)",
      "--room-btn-toggle-bg": "linear-gradient(135deg, #3498db, #2980b9)",
      "--room-btn-toggle-shadow": "0 4px 12px rgba(52, 152, 219, 0.3)",
      "--room-btn-custom-bg": "linear-gradient(135deg, #9b59b6, #8e44ad)",
      "--room-btn-custom-shadow": "0 4px 12px rgba(155, 89, 182, 0.3)",
      "--room-card-border": "rgba(0, 0, 0, 0.08)",
      "--room-popup-card-bg": "rgba(240, 240, 245, 0.95)",
      "--room-popup-card-border": "rgba(0, 0, 0, 0.08)",
      "--room-popup-card-hover-bg": "rgba(235, 235, 240, 0.98)",
      "--room-popup-divider": "#c2c2c2",
      "--room-du-running-color": "#f58220",
      "--room-weather-icon-filter": "brightness(0) saturate(100%)",
      "--room-nas-text-primary": "#333",
      "--room-nas-text-secondary": "#666",
      "--room-nas-text-muted": "#888",
      "--room-nas-text-title": "#2c3e50",
      "--room-nas-drive-bg": "linear-gradient(180deg, rgba(235,235,240,0.95) 0%, rgba(225,225,232,0.98) 100%)",
      "--room-nas-drive-border": "rgba(0,0,0,0.08)",
      "--room-nas-drive-border-hover": "rgba(0,0,0,0.15)",
      "--room-nas-drive-icon": "#78909c",
      "--room-nas-sys-icon": "#e65100",
      "--room-nas-divider": "rgba(0,0,0,0.08)",
      "--room-nas-section-bg": "rgba(0,0,0,0.03)",
      "--room-nas-tile-bg": "rgba(0,0,0,0.03)",
      "--room-nas-tile-border": "rgba(0,0,0,0.05)",
      "--room-nas-bubble-border": "rgba(0,0,0,0.08)",
    },
    dark: {
      "--room-card-bg": "rgba(40, 40, 40, 0.9)",
      "--room-card-shadow": "0 8px 32px rgba(0, 0, 0, 0.3)",
      "--room-card-hover-shadow": "0 12px 40px rgba(0, 0, 0, 0.4)",
      "--room-primary-text": "rgba(255, 255, 255, 0.9)",
      "--room-secondary-text": "rgba(255, 255, 255, 0.6)",
      "--room-icon-color": "rgba(255, 255, 255, 0.7)",
      "--room-button-bg": "rgba(255, 255, 255, 0.08)",
      "--room-button-active-bg": "rgba(255, 255, 255, 0.15)",
      "--room-popup-bg": "rgba(30, 30, 30, 0.98)",
      "--room-popup-shadow": "0 20px 60px rgba(0, 0, 0, 0.4)",
      "--room-popup-border": "rgba(255, 255, 255, 0.1)",
      "--room-overlay-bg": "rgba(0, 0, 0, 0.6)",
      "--room-entity-value": "rgba(255, 255, 255, 0.9)",
      "--room-entity-name": "rgba(255, 255, 255, 0.6)",
      "--room-slider-bg": "rgba(255, 255, 255, 0.1)",
      "--room-slider-track": "rgba(52, 152, 219, 0.8)",
      "--room-input-bg": "rgba(50, 50, 50, 0.9)",
      "--room-input-border": "rgba(255, 255, 255, 0.15)",
      "--room-input-text": "rgba(255, 255, 255, 0.9)",
      "--room-toast-bg": "#2980b9",
      "--room-confirm-bg": "rgba(40, 40, 40, 0.95)",
      "--room-confirm-shadow": "0 10px 40px rgba(0, 0, 0, 0.4)",
      "--room-title-bg": "linear-gradient(135deg, rgba(52, 152, 219, 0.8), rgba(41, 128, 185, 0.8))",
      "--room-title-text": "white",
      "--room-primary-text-bg": "rgba(60, 60, 60, 0.9)",
      "--room-primary-text-border": "rgba(255, 255, 255, 0.15)",
      "--room-dropdown-bg": "rgba(40, 40, 40, 0.98)",
      "--room-dropdown-shadow": "0 8px 32px rgba(0, 0, 0, 0.4)",
      "--room-dropdown-item-hover": "rgba(52, 152, 219, 0.2)",
      "--room-dropdown-item-active": "rgba(52, 152, 219, 0.3)",
      ...t,
      "--room-btn-default-bg": "rgba(255, 255, 255, 0.12)",
      "--room-btn-default-shadow": "0 0 8px rgba(52, 152, 219, 0.3)",
      "--room-btn-on-shadow": "0 4px 12px rgba(39, 174, 96, 0.4)",
      "--room-btn-off-shadow": "0 4px 12px rgba(192, 57, 43, 0.4)",
      "--room-btn-toggle-shadow": "0 4px 12px rgba(41, 128, 185, 0.4)",
      "--room-btn-custom-shadow": "0 4px 12px rgba(142, 68, 173, 0.4)",
      "--room-card-border": "rgba(255, 255, 255, 0.12)",
      "--room-popup-card-bg": "rgba(50, 50, 55, 0.95)",
      "--room-popup-card-border": "rgba(255, 255, 255, 0.12)",
      "--room-popup-card-hover-bg": "rgba(60, 60, 65, 0.98)",
      "--room-popup-divider": "rgba(255, 255, 255, 0.12)",
      "--room-weather-icon-filter": "brightness(0) saturate(100%) invert()",
      "--room-nas-text-primary": "#e0e0e0",
      "--room-nas-text-secondary": "#ccc",
      "--room-nas-text-muted": "#888",
      "--room-nas-text-title": "#e0e0e0",
      "--room-nas-drive-bg": "linear-gradient(180deg, rgba(40,42,52,0.9) 0%, rgba(30,32,40,0.95) 100%)",
      "--room-nas-drive-border": "rgba(255,255,255,0.06)",
      "--room-nas-drive-border-hover": "rgba(255,255,255,0.2)",
      "--room-nas-drive-icon": "#607d8b",
      "--room-nas-sys-icon": "#ff9800",
      "--room-nas-divider": "rgba(255,255,255,0.08)",
      "--room-nas-section-bg": "rgba(255,255,255,0.03)",
      "--room-nas-tile-bg": "rgba(255,255,255,0.03)",
      "--room-nas-tile-border": "rgba(255,255,255,0.04)",
      "--room-nas-bubble-border": "rgba(255,255,255,0.08)",
    },
    black: {
      "--room-card-bg": "rgba(0, 0, 0, 0.95)",
      "--room-card-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
      "--room-card-hover-shadow": "0 12px 40px rgba(0, 0, 0, 0.6)",
      "--room-primary-text": "rgb(255, 255, 255)",
      "--room-secondary-text": "rgba(255, 255, 255, 0.6)",
      "--room-icon-color": "rgba(255, 255, 255, 0.8)",
      "--room-button-bg": "rgba(255, 255, 255, 0.1)",
      "--room-button-active-bg": "rgba(255, 255, 255, 0.2)",
      "--room-popup-bg": "rgba(10, 10, 10, 0.98)",
      "--room-popup-shadow": "0 20px 60px rgba(0, 0, 0, 0.6)",
      "--room-popup-border": "rgba(255, 255, 255, 0.08)",
      "--room-overlay-bg": "rgba(0, 0, 0, 0.7)",
      "--room-entity-value": "rgb(255, 255, 255)",
      "--room-entity-name": "rgba(255, 255, 255, 0.6)",
      "--room-slider-bg": "rgba(255, 255, 255, 0.1)",
      "--room-slider-track": "rgba(52, 152, 219, 0.9)",
      "--room-input-bg": "rgba(20, 20, 20, 0.95)",
      "--room-input-border": "rgba(255, 255, 255, 0.1)",
      "--room-input-text": "rgb(255, 255, 255)",
      "--room-toast-bg": "#2196F3",
      "--room-confirm-bg": "rgba(10, 10, 10, 0.95)",
      "--room-confirm-shadow": "0 10px 40px rgba(0, 0, 0, 0.6)",
      "--room-title-bg": "linear-gradient(135deg, rgba(52, 152, 219, 0.9), rgba(41, 128, 185, 0.9))",
      "--room-title-text": "white",
      "--room-primary-text-bg": "rgba(30, 30, 30, 0.95)",
      "--room-primary-text-border": "rgba(255, 255, 255, 0.1)",
      "--room-dropdown-bg": "rgba(10, 10, 10, 0.98)",
      "--room-dropdown-shadow": "0 8px 32px rgba(0, 0, 0, 0.6)",
      "--room-dropdown-item-hover": "rgba(52, 152, 219, 0.25)",
      "--room-dropdown-item-active": "rgba(52, 152, 219, 0.35)",
      ...t,
      "--room-btn-default-bg": "rgba(255, 255, 255, 0.15)",
      "--room-btn-default-shadow": "0 0 8px rgba(52, 152, 219, 0.35)",
      "--room-btn-on-shadow": "0 4px 12px rgba(39, 174, 96, 0.5)",
      "--room-btn-off-shadow": "0 4px 12px rgba(192, 57, 43, 0.5)",
      "--room-btn-toggle-shadow": "0 4px 12px rgba(41, 128, 185, 0.5)",
      "--room-btn-custom-shadow": "0 4px 12px rgba(142, 68, 173, 0.5)",
      "--room-popup-card-bg": "rgba(30, 30, 35, 0.95)",
      "--room-popup-card-border": "rgba(255, 255, 255, 0.1)",
      "--room-popup-card-hover-bg": "rgba(40, 40, 45, 0.98)",
      "--room-popup-divider": "rgba(255, 255, 255, 0.1)",
      "--room-weather-icon-filter": "brightness(0) saturate(100%) invert()",
      "--room-nas-text-primary": "#e0e0e0",
      "--room-nas-text-secondary": "#ccc",
      "--room-nas-text-muted": "#888",
      "--room-nas-text-title": "#e0e0e0",
      "--room-nas-drive-bg": "linear-gradient(180deg, rgba(25,25,30,0.9) 0%, rgba(15,15,20,0.95) 100%)",
      "--room-nas-drive-border": "rgba(255,255,255,0.04)",
      "--room-nas-drive-border-hover": "rgba(255,255,255,0.15)",
      "--room-nas-drive-icon": "#607d8b",
      "--room-nas-sys-icon": "#ff9800",
      "--room-nas-divider": "rgba(255,255,255,0.06)",
      "--room-nas-section-bg": "rgba(255,255,255,0.02)",
      "--room-nas-tile-bg": "rgba(255,255,255,0.02)",
      "--room-nas-tile-border": "rgba(255,255,255,0.03)",
      "--room-nas-bubble-border": "rgba(255,255,255,0.06)",
    },
    darkgray: {
      "--room-card-bg": "rgba(34, 34, 34, 0.95)",
      "--room-card-shadow": "0 8px 32px rgba(0, 0, 0, 0.4)",
      "--room-card-hover-shadow": "0 12px 40px rgba(0, 0, 0, 0.5)",
      "--room-primary-text": "rgb(255, 255, 255)",
      "--room-secondary-text": "rgba(255, 255, 255, 0.6)",
      "--room-icon-color": "rgba(255, 255, 255, 0.8)",
      "--room-button-bg": "rgba(255, 255, 255, 0.1)",
      "--room-button-active-bg": "rgba(255, 255, 255, 0.18)",
      "--room-popup-bg": "rgba(30, 30, 30, 0.98)",
      "--room-popup-shadow": "0 20px 60px rgba(0, 0, 0, 0.5)",
      "--room-popup-border": "rgba(255, 255, 255, 0.08)",
      "--room-overlay-bg": "rgba(0, 0, 0, 0.6)",
      "--room-entity-value": "rgb(255, 255, 255)",
      "--room-entity-name": "rgba(255, 255, 255, 0.6)",
      "--room-slider-bg": "rgba(255, 255, 255, 0.1)",
      "--room-slider-track": "rgba(52, 152, 219, 0.9)",
      "--room-input-bg": "rgba(50, 50, 50, 0.95)",
      "--room-input-border": "rgba(255, 255, 255, 0.1)",
      "--room-input-text": "rgb(255, 255, 255)",
      "--room-toast-bg": "#2196F3",
      "--room-confirm-bg": "rgba(34, 34, 34, 0.95)",
      "--room-confirm-shadow": "0 10px 40px rgba(0, 0, 0, 0.5)",
      "--room-title-bg": "linear-gradient(135deg, rgba(52, 152, 219, 0.85), rgba(41, 128, 185, 0.85))",
      "--room-title-text": "white",
      "--room-primary-text-bg": "rgba(50, 50, 50, 0.95)",
      "--room-primary-text-border": "rgba(255, 255, 255, 0.1)",
      "--room-dropdown-bg": "rgba(34, 34, 34, 0.98)",
      "--room-dropdown-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
      "--room-dropdown-item-hover": "rgba(52, 152, 219, 0.2)",
      "--room-dropdown-item-active": "rgba(52, 152, 219, 0.3)",
      ...t,
      "--room-btn-default-bg": "rgba(255, 255, 255, 0.12)",
      "--room-btn-default-shadow": "0 0 8px rgba(52, 152, 219, 0.3)",
      "--room-btn-on-shadow": "0 4px 12px rgba(39, 174, 96, 0.4)",
      "--room-btn-off-shadow": "0 4px 12px rgba(192, 57, 43, 0.4)",
      "--room-btn-toggle-shadow": "0 4px 12px rgba(41, 128, 185, 0.4)",
      "--room-btn-custom-shadow": "0 4px 12px rgba(142, 68, 173, 0.4)",
      "--room-popup-card-bg": "rgba(45, 45, 50, 0.95)",
      "--room-popup-card-border": "rgba(255, 255, 255, 0.1)",
      "--room-popup-card-hover-bg": "rgba(55, 55, 60, 0.98)",
      "--room-popup-divider": "rgba(255, 255, 255, 0.1)",
      "--room-weather-icon-filter": "brightness(0) saturate(100%) invert()",
      "--room-nas-text-primary": "#e0e0e0",
      "--room-nas-text-secondary": "#ccc",
      "--room-nas-text-muted": "#888",
      "--room-nas-text-title": "#e0e0e0",
      "--room-nas-drive-bg": "linear-gradient(180deg, rgba(45,47,55,0.9) 0%, rgba(35,37,45,0.95) 100%)",
      "--room-nas-drive-border": "rgba(255,255,255,0.06)",
      "--room-nas-drive-border-hover": "rgba(255,255,255,0.18)",
      "--room-nas-drive-icon": "#607d8b",
      "--room-nas-sys-icon": "#ff9800",
      "--room-nas-divider": "rgba(255,255,255,0.08)",
      "--room-nas-section-bg": "rgba(255,255,255,0.03)",
      "--room-nas-tile-bg": "rgba(255,255,255,0.03)",
      "--room-nas-tile-border": "rgba(255,255,255,0.04)",
      "--room-nas-bubble-border": "rgba(255,255,255,0.08)",
    },
    transparent: {
      "--room-card-bg": "rgba(0, 0, 0, 0.3)",
      "--room-card-shadow": "0 8px 32px rgba(0, 0, 0, 0.3)",
      "--room-card-hover-shadow": "0 12px 40px rgba(0, 0, 0, 0.4)",
      "--room-primary-text": "rgba(255, 255, 255, 0.5)",
      "--room-secondary-text": "rgba(255, 255, 255, 0.6)",
      "--room-icon-color": "rgba(255, 255, 255, 0.7)",
      "--room-button-bg": "rgba(255, 255, 255, 0.05)",
      "--room-button-active-bg": "rgba(255, 255, 255, 0.12)",
      "--room-popup-bg": "rgba(30, 30, 30, 0.1)",
      "--room-popup-shadow": "0 20px 60px rgba(0, 0, 0, 0.4)",
      "--room-popup-border": "rgba(255, 255, 255, 0.1)",
      "--room-overlay-bg": "rgba(0, 0, 0, 0.1)",
      "--room-entity-value": "rgba(220, 220, 220, 1)",
      "--room-entity-name": "rgba(220, 220, 220, 0.8)",
      "--room-slider-bg": "rgba(255, 255, 255, 0.1)",
      "--room-slider-track": "rgba(52, 152, 219, 0.8)",
      "--room-input-bg": "rgba(50, 50, 50, 0.9)",
      "--room-input-border": "rgba(255, 255, 255, 0.15)",
      "--room-input-text": "rgba(255, 255, 255, 0.9)",
      "--room-toast-bg": "#2980b9",
      "--room-confirm-bg": "rgba(30, 30, 30, 0.1)",
      "--room-confirm-shadow": "0 10px 40px rgba(0, 0, 0, 0.4)",
      "--room-title-bg": "linear-gradient(135deg, rgba(52, 152, 219, 0.5), rgba(41, 128, 185, 0.5))",
      "--room-title-text": "white",
      "--room-primary-text-bg": "rgba(60, 60, 60, 0.6)",
      "--room-primary-text-border": "rgba(255, 255, 255, 0.1)",
      "--room-dropdown-bg": "rgba(30, 30, 30, 0.3)",
      "--room-dropdown-shadow": "0 8px 32px rgba(0, 0, 0, 0.1)",
      "--room-dropdown-item-hover": "rgba(52, 152, 219, 0.2)",
      "--room-dropdown-item-active": "rgba(52, 152, 219, 0.3)",
      ...t,
      "--room-btn-default-bg": "rgba(255, 255, 255, 0.18)",
      "--room-btn-default-shadow": "0 0 8px rgba(52, 152, 219, 0.4)",
      "--room-btn-on-shadow": "0 4px 12px rgba(39, 174, 96, 0.5)",
      "--room-btn-off-shadow": "0 4px 12px rgba(192, 57, 43, 0.5)",
      "--room-btn-toggle-shadow": "0 4px 12px rgba(41, 128, 185, 0.5)",
      "--room-btn-custom-shadow": "0 4px 12px rgba(142, 68, 173, 0.5)",
      "--room-popup-card-bg": "rgba(50, 50, 55, 0.6)",
      "--room-popup-card-border": "rgba(255, 255, 255, 0.15)",
      "--room-popup-card-hover-bg": "rgba(60, 60, 65, 0.7)",
      "--room-popup-divider": "rgba(255, 255, 255, 0.15)",
      "--room-weather-icon-filter": "brightness(0) saturate(100%) invert()",
      "--room-nas-text-primary": "#e0e0e0",
      "--room-nas-text-secondary": "#ccc",
      "--room-nas-text-muted": "#888",
      "--room-nas-text-title": "#e0e0e0",
      "--room-nas-drive-bg": "linear-gradient(180deg, rgba(40,42,52,0.75) 0%, rgba(30,32,40,0.8) 100%)",
      "--room-nas-drive-border": "rgba(255,255,255,0.08)",
      "--room-nas-drive-border-hover": "rgba(255,255,255,0.22)",
      "--room-nas-drive-icon": "#607d8b",
      "--room-nas-sys-icon": "#ff9800",
      "--room-nas-divider": "rgba(255,255,255,0.1)",
      "--room-nas-section-bg": "rgba(255,255,255,0.04)",
      "--room-nas-tile-bg": "rgba(255,255,255,0.04)",
      "--room-nas-tile-border": "rgba(255,255,255,0.05)",
      "--room-nas-bubble-border": "rgba(255,255,255,0.1)",
    },
  };
})();

// ThemeMixin
const le = {
  _initThemeProperties() {
    ((this._themeConfig = null),
      (this._currentTheme = "light"),
      (this._themeTimer = null),
      (this._systemThemeMediaQuery = null),
      (this._lastThemeName = null),
      (this._lastThemeEntityState = null));
  },
  _parseDarkLightTheme() {
    const t = this._darkLightTheme;
    if (t && "string" == typeof t) {
      const e = t.split(",").map((t) => t.trim());
      if (e.length >= 2) {
        const t = Object.keys(se);
        return [t.includes(e[0]) ? e[0] : "dark", t.includes(e[1]) ? e[1] : "light"];
      }
    }
    return ["dark", "light"];
  },
  _getThemeByTime() {
    const t = new Date().getHours(),
      [e, a] = this._parseDarkLightTheme();
    return t >= 6 && t < 18 ? a : e;
  },
  _getSystemTheme() {
    const [t, e] = this._parseDarkLightTheme();
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? t : e;
  },
  _stopThemeTimer() {
    this._themeTimer && (this._timers.clearInterval(this._themeTimer), (this._themeTimer = null));
  },
  _toggleThemeListener(t = !0, e) {
    (this._stopThemeTimer(),
      this._systemThemeMediaQuery &&
      (this._systemThemeMediaQuery.removeEventListener &&
        this._systemThemeMediaQuery.removeEventListener("change", this._systemThemeChangeHandler),
        (this._systemThemeMediaQuery = null)),
      t &&
      ((e && "system" !== e) ||
        (window.matchMedia &&
          ((this._systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")),
            (this._systemThemeChangeHandler = (t) => {
              const e = t.matches ? this._parseDarkLightTheme()[0] : this._parseDarkLightTheme()[1];
              this._applyThemeInternal(e);
            }),
            this._systemThemeMediaQuery.addEventListener("change", this._systemThemeChangeHandler))),
        (e && "time" !== e) ||
        (this._themeTimer = this._timers.setInterval(() => {
          const t = this._getThemeByTime();
          this._lastThemeName !== t &&
            ((this._lastThemeName = t), (this._lastThemeUpdate = Date.now()), this._applyThemeInternal(t));
        }, 6e4))));
  },
  _handleSpecialThemeMode(t) {
    const [e, a] = this._parseDarkLightTheme();
    return "off" === t
      ? { themeName: e, needsListener: !1 }
      : "on" === t
        ? { themeName: a, needsListener: !1 }
        : "time" === t
          ? { themeName: this._getThemeByTime(), needsListener: !0, listenerType: "time" }
          : "phone" === t || "device" === t
            ? { themeName: this._getSystemTheme(), needsListener: !0, listenerType: "system" }
            : null;
  },
  _handleEntityTheme(t) {
    return this._hass && this._hass.states[t] ? this._determineTheme(this._hass.states[t].state) : null;
  },
  _determineTheme(t) {
    const e = this._handleSpecialThemeMode(t);
    if (e) return e.themeName;
    if ("object" == typeof t && null !== t) {
      if (t.value && se[t.value]) return t.value;
      if (t.entity && this._hass) {
        const e = this._handleEntityTheme(t.entity);
        if (e) return e;
      }
    }
    if ("string" == typeof t) {
      const e = this._handleEntityTheme(t);
      if (e) return e;
      if (se[t]) return t;
    }
    return this._parseDarkLightTheme()[1];
  },
  _determineThemeFromEntityState(t, e) {
    return e && se[t] ? t : this._determineTheme(t);
  },
  _updateTheme() {
    const t = this._themeConfig;
    if (void 0 === t && this._lastThemeName) return;
    let e = !1;
    if (
      ((("object" == typeof t && null !== t && t.entity) || ("string" == typeof t && t.includes("."))) && (e = !0),
        e && !this._hass)
    )
      return;
    this._toggleThemeListener(!1);
    let a,
      n = "light",
      o = !1;
    if (null != t) {
      const e = this._handleSpecialThemeMode(t);
      (e ? ((n = e.themeName), (o = e.needsListener), (a = e.listenerType)) : (n = this._determineTheme(t)),
        (this._lastThemeName = n));
    }
    (o && this._toggleThemeListener(!0, a), this._applyThemeInternal(n));
  },
  _initTheme() {
    this._themeConfig && this._updateTheme();
  },
  _updateThemeFromEntity() {
    if (!this._themeConfig || !this._hass) return;
    const t = this._themeConfig;
    let e, a;
    if ("object" == typeof t && null !== t && t.entity && this._hass.states[t.entity])
      ((e = this._hass.states[t.entity].state), (a = t.entity.toLowerCase().includes("select")));
    else {
      if ("string" != typeof t || !t.includes(".") || !this._hass.states[t]) return;
      ((e = this._hass.states[t].state), (a = t.toLowerCase().includes("select")));
    }
    if (e === this._lastThemeEntityState) return;
    this._lastThemeEntityState = e;
    const n = this._determineThemeFromEntityState(e, a);
    n !== this._lastThemeName && ((this._lastThemeName = n), this._applyThemeInternal(n));
  },
};

// BubblePopupMixin
const be = {
  _showBubble(t) {
    const e = window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? 500 : 0,
      a = Date.now(),
      {
        target: n,
        content: o,
        placement: i = "auto",
        width: r,
        maxWidth: s = "90vw",
        maxHeight: c = "60vh",
        minWidth: l,
        className: d = "",
        arrowOffset: p = 0,
        arrowColor: h = null,
        gap: u = 10,
        minSpace: m = 200,
        closeOnClickAway: f = !0,
        closeOnTargetClick: g = !0,
        clickPoint: y = null,
        expandDirection: b = "auto",
        showBackdrop: x = !1,
        animation: v = "spring",
        onClose: _,
      } = t,
      w = n.getBoundingClientRect();
    let C = y ? y.x : w.left + w.width / 2,
      k = y ? y.y : w.top + w.height / 2;
    const { id: S, zIndex: E } = this._zIndexManager.getNextZIndex("bubble"),
      T = document.createElement("div");
    ((T.className = `generic-arrow-bubble anim-${v} ${d}`.trim()),
      (T._zIndexId = S),
      (T._animationType = v),
      Object.assign(T.style, {
        position: "fixed",
        zIndex: E,
        width: r ? ("number" == typeof r ? `${r}px` : r) : void 0,
        minWidth: l ? ("number" == typeof l ? `${l}px` : l) : void 0,
        maxWidth: "number" == typeof s ? `${s}px` : s,
        maxHeight: "number" == typeof c ? `${c}px` : c,
        background: "var(--room-popup-bg, rgba(255,255,255,0.98))",
        borderRadius: "20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        border: "1px solid var(--room-popup-border, rgba(0,0,0,0.08))",
        opacity: "0",
        visibility: "hidden",
        overflow: "visible",
      }));
    const $ = document.createElement("div");
    let A;
    (Object.assign($.style, {
      position: "absolute",
      width: "0",
      height: "0",
      borderLeft: "10px solid transparent",
      borderRight: "10px solid transparent",
      pointerEvents: "none",
    }),
      "string" == typeof o
        ? ((A = document.createElement("div")), (A.innerHTML = o))
        : (A = o instanceof HTMLElement ? o : document.createElement("div")),
      T.appendChild($),
      T.appendChild(A),
      (T.style.touchAction = "pan-y"),
      (T.style.overscrollBehavior = "contain"),
      T.addEventListener("wheel", (t) => t.stopPropagation(), { passive: !0 }),
      T.addEventListener(
        "touchmove",
        (t) => {
          (t.stopPropagation(),
            !t.target.closest(".bubble-content-scrollable") &&
            !t.target.closest(".scene-mode-progress-list") &&
            t.cancelable &&
            t.preventDefault());
        },
        { passive: !1 },
      ),
      (this.shadowRoot || document.body).appendChild(T),
      (T.style.animation = "none"));
    const D = T.getBoundingClientRect(),
      L = D.width || r || 300,
      N = D.height || 200,
      M = document.createElement("div");
    M.className = "bubble-content-scrollable";
    const I = "number" == typeof c ? `${c}px` : c || "60vh",
      z = ("string" == typeof I && I.endsWith("vh")) || ("string" == typeof I && I.endsWith("px")) ? "auto" : "visible";
    if (
      (Object.assign(M.style, {
        overflowY: z,
        overflowX: "hidden",
        maxWidth: "100%",
        maxHeight: I,
        overscrollBehavior: "contain",
        touchAction: "auto" === z ? "pan-y" : "none",
      }),
        A.parentNode === T && T.removeChild(A),
        M.appendChild(A),
        T.appendChild(M),
        "auto" === z)
    ) {
      let t = 0;
      (M.addEventListener(
        "touchstart",
        (e) => {
          t = e.touches[0].clientY;
        },
        { passive: !0 },
      ),
        M.addEventListener(
          "touchmove",
          (e) => {
            if (
              e.target.closest(".scene-mode-progress-list") ||
              e.target.closest(".hw-body") ||
              e.target.closest(".eh-bubble-list") ||
              e.target.closest(".ikuai-log-list") ||
              e.target.closest(".recently-used-list") ||
              e.target.closest(".recently-used-timeline-list") ||
              e.target.closest(".way-detail-usage-list") ||
              e.target.closest(".uc-hour-date-pop-content")
            )
              return;
            const a = M,
              n = a.scrollTop,
              o = a.scrollHeight,
              i = n <= 0,
              r = n + a.clientHeight >= o - 1,
              s = e.touches[0].clientY,
              c = s - t;
            (((i && c > 0) || (r && c < 0)) && e.cancelable && e.preventDefault(), (t = s));
          },
          { passive: !1 },
        ));
    }
    let P = C - L / 2 + p;
    ((P = Math.max(8, Math.min(P, window.innerWidth - L - 8))), (T.style.left = `${P}px`));
    let R = C - P - 10 + p;
    R = Math.max(0, Math.min(R, L - 20));
    let H = i;
    if ("auto" === i) {
      const t = k,
        e = window.innerHeight - k,
        a = u + N;
      H = t >= a ? "top" : e >= a ? "bottom" : t > e ? "top" : "bottom";
    }
    this._lastBubbleClickPoint = y;
    const F = this._findAnchorEdge(n, H, w),
      q = F?._isAvatar;
    if (F && (!y || q)) {
      ((C = F.x),
        (k = F.y),
        (P = C - L / 2 + p),
        (P = Math.max(8, Math.min(P, window.innerWidth - L - 8))),
        (T.style.left = `${P}px`));
      let t = C - P - 10 + p;
      ((t = Math.max(0, Math.min(t, L - 20))), (R = t));
    }
    {
      const t = window.innerHeight,
        e = 12,
        a = (e) => {
          const a = String(null == e ? "" : e).trim();
          return a.endsWith("vh") ? (parseFloat(a) / 100) * t : a.endsWith("px") ? parseFloat(a) : 0.6 * t;
        },
        n = "top" === H ? k - u - e : t - k - u - e,
        o = Math.max(120, Math.min(a(I), n));
      ((M.style.maxHeight = `${o}px`), (T.style.maxHeight = `${o + 2}px`));
    }
    ("top" === H
      ? ((T.style.top = k - u - N + 1 - 10 + "px"),
        (T.style.transformOrigin = "bottom center"),
        ($.style.bottom = "-10px"),
        ($.style.top = "auto"),
        ($.style.borderTop = `10px solid ${h || "var(--room-popup-bg, rgba(255,255,255,0.98))"}`),
        ($.style.borderBottom = "none"))
      : ((T.style.top = k + u - 1 + 10 + "px"),
        (T.style.transformOrigin = "top center"),
        ($.style.top = "-10px"),
        ($.style.borderBottom = `10px solid ${h || "var(--room-popup-bg, rgba(255,255,255,0.98))"}`),
        ($.style.borderTop = "none")),
      ($.style.left = `${R}px`),
      (T._arrow = $),
      (T._target = n),
      (T._placement = H),
      (T._anchorX = C),
      (T._anchorY = k),
      (T._gap = u),
      (T._arrowSize = 10),
      (T._bubbleW = L),
      (T.dataset.placement = H),
      (T._expandDirection = "auto" === b ? ("top" === H ? "up" : "down") : b),
      (T._lastHeight = T.getBoundingClientRect().height),
      (T._onClose = _),
      (T.style.visibility = "visible"),
      (T.style.opacity = ""),
      (T.style.animation = ""));
    let O = !1;
    const B = () => {
      if (O) return;
      if (
        ((O = !0),
          (T._bubbleClosed = !0),
          T._closeHandler && (document.removeEventListener("click", T._closeHandler, !0), (T._closeHandler = null)),
          T._targetClickHandler &&
          T._target &&
          T._hasTargetClickHandler &&
          (T._target.removeEventListener("click", T._targetClickHandler, !0), (T._targetClickHandler = null)),
          T._backdrop)
      ) {
        const t = T._backdrop;
        (t.classList.remove("visible"),
          this._timers.setTimeout(() => {
            t.parentNode && t.parentNode.removeChild(t);
          }, 260),
          (T._backdrop = null));
      }
      (this._zIndexManager.releaseZIndex(T._zIndexId), (T._zIndexId = null), T.classList.add("closing"));
      const t = { spring: 200, fade: 150, slide: 200, none: 0 }[T._animationType || "spring"] || 200;
      (this._timers.setTimeout(() => {
        T.parentNode && T.parentNode.removeChild(T);
      }, t),
        T._onClose && T._onClose());
    };
    if (((T._closeFn = B), x)) {
      const t = document.createElement("div");
      ((t.className = "scene-mode-overlay"),
        (t.style.zIndex = String(E - 1)),
        t.style.setProperty("--scene-overlay-cx", `${C}px`),
        t.style.setProperty("--scene-overlay-cy", `${k}px`),
        t.addEventListener("click", (t) => {
          if ((t.stopPropagation(), e > 0 && Date.now() - a < e)) return;
          const n = document.querySelector(".calendar-popup-container");
          if (n && !n.contains(t.target)) {
            this._calendarPopupCloseHandler &&
              (document.removeEventListener("click", this._calendarPopupCloseHandler),
                (this._calendarPopupCloseHandler = null));
            const t = n.dataset.zIndexId;
            return (t && this._zIndexManager.releaseZIndex(parseInt(t)), void n.remove());
          }
          B();
        }),
        t.addEventListener("wheel", (t) => t.preventDefault(), { passive: !1 }),
        t.addEventListener(
          "touchmove",
          (t) => {
            t.cancelable && t.preventDefault();
          },
          { passive: !1 },
        ),
        (this.shadowRoot || document.body).appendChild(t),
        requestAnimationFrame(() => {
          t.classList.add("visible");
        }),
        (T._backdrop = t));
    }
    if (f) {
      const t = (t) => {
        if (e > 0 && Date.now() - a < e) return;
        const o = t.composedPath(),
          i = o.includes(T),
          r = o.includes(n),
          s =
            t.target &&
            (t.target.closest?.(".calendar-popup-container") || t.target.closest?.(".select-dropdown-popup"));
        i || r || s || B();
      };
      ((T._closeHandler = t), this._timers.setTimeout(() => document.addEventListener("click", t, !0), 50));
    }
    return (
      g &&
      ((T._targetClickHandler = (t) => {
        (t.stopPropagation(), B());
      }),
        n.addEventListener("click", T._targetClickHandler, !0),
        (T._hasTargetClickHandler = !0)),
      {
        bubble: T,
        close: B,
        enableClickAway: () => {
          if (T._closeHandler) return;
          const t = (t) => {
            if (e > 0 && Date.now() - a < e) return;
            const o = t.composedPath(),
              i = o.includes(T),
              r = o.includes(n),
              s =
                t.target &&
                (t.target.closest?.(".calendar-popup-container") || t.target.closest?.(".select-dropdown-popup"));
            i || r || s || B();
          };
          ((T._closeHandler = t), this._timers.setTimeout(() => document.addEventListener("click", t, !0), 50));
        },
      }
    );
  },
  _findAnchorEdge(t, e, a) {
    if (!t || !e) return null;
    const n = a || t.getBoundingClientRect(),
      o = "function" == typeof t.querySelectorAll,
      i = t.classList && (t.classList.contains("user-avatar") || t.classList.contains("user-avatar-thumb"));
    let r = o ? t.querySelector(".user-avatar") : null,
      s = o ? t.querySelector(".user-avatar-thumb") : null,
      c = i ? t : r || s;
    if (!c) {
      const t = this._lastBubbleClickPoint;
      if (t) {
        const e = [this.shadowRoot, document].filter(Boolean);
        for (const a of e) {
          const e = a.querySelectorAll(".user-avatar, .user-avatar-thumb");
          for (const a of e) {
            const e = a.getBoundingClientRect();
            if (t.x >= e.left && t.x <= e.right && t.y >= e.top && t.y <= e.bottom) {
              c = a;
              break;
            }
          }
          if (c) break;
          if (e.length > 0) {
            let a = 50;
            for (const n of e) {
              const e = n.getBoundingClientRect(),
                o = e.left + e.width / 2,
                i = e.top + e.height / 2,
                r = Math.sqrt((t.x - o) ** 2 + (t.y - i) ** 2);
              r < a && ((a = r), (c = n));
            }
            if (c) break;
          }
        }
        if (!c)
          for (const a of e) {
            const e = a.querySelectorAll(".popup-header");
            for (const a of e) {
              const e = a.querySelectorAll("*");
              for (const a of e)
                if (("50%" === a.style.borderRadius || "50%" === a.style.borderRadius) && a.style.border) {
                  const e = a.getBoundingClientRect(),
                    n = e.left + e.width / 2,
                    o = e.top + e.height / 2;
                  if (Math.sqrt((t.x - n) ** 2 + (t.y - o) ** 2) < e.width) {
                    c = a;
                    break;
                  }
                }
              if (c) break;
            }
            if (c) break;
          }
      }
    }
    if (c) {
      const t = c.getBoundingClientRect(),
        a = 10,
        n = "top" === e ? -a : a;
      return { x: t.left + t.width / 2, y: ("top" === e ? t.top : t.bottom) + n, _isAvatar: !0 };
    }
    if (!o) return { x: n.left + n.width / 2, y: "top" === e ? n.top : n.bottom, _isAvatar: !1 };
    const l = this._findSmallestVisualChild(t, n);
    if (!l) return { x: n.left + n.width / 2, y: "top" === e ? n.top : n.bottom, _isAvatar: !1 };
    const d = l.getBoundingClientRect();
    return { x: d.left + d.width / 2, y: "top" === e ? d.top : d.bottom, _isAvatar: !1 };
  },
  _findSmallestVisualChild(t, e) {
    if (!t || "function" != typeof t.querySelectorAll) return null;
    const a = t.querySelectorAll("ha-icon");
    if (a.length > 0) {
      let t = a[0],
        e = 1 / 0;
      for (const n of a) {
        const a = n.getBoundingClientRect(),
          o = a.width * a.height;
        o > 0 && o < e && ((e = o), (t = n));
      }
      if (e < 1 / 0) return t;
    }
    const n = t.querySelectorAll("*");
    let o = null,
      i = 1 / 0;
    const r = e || t.getBoundingClientRect(),
      s = r.width * r.height;
    for (const t of n) {
      const e = t.getBoundingClientRect(),
        a = e.width * e.height;
      a > 0 && a < 0.8 * s && a < i && ((i = a), (o = t));
    }
    return o;
  },
};

// PopupShowMixin
const xe = {
  _showToast(t, e = "info") {
    const a = this._zIndexManager.getNextZIndex("toast"),
      n = document.createElement("div");
    ((n.className = `universal-toast toast-${e}`),
      (n.textContent = t),
      (n.dataset.zIndexId = a.id),
      (n.style.cssText = `\n      position: fixed;\n      bottom: 20px;\n      left: 50%;\n      transform: translateX(-50%);\n      padding: 10px 20px;\n      border-radius: 8px;\n      color: white;\n      font-size: 14px;\n      z-index: ${a.zIndex};\n      animation: toastFadeIn 0.3s ease;\n    `),
      (n.style.background = "success" === e ? "#2ecc71" : "error" === e ? "#e74c3c" : "#3498db"),
      document.body.appendChild(n),
      this._timers.setTimeout(() => {
        ((n.style.opacity = "0"),
          this._timers.setTimeout(() => {
            const t = n.dataset.zIndexId;
            (t && this._zIndexManager.releaseZIndex(parseInt(t)), n.remove());
          }, 300));
      }, 2e3));
  },
};

// TimerSetupMixin
const _e = {
  _durationTickSharedSentinel: () => "shared-duration-tick",
  _ensureDurationTicker() {
    this._durationTicker || (this._durationTicker = this._timers.setInterval(() => this._tickDurations(), 1e3));
  },
  _unregisterDurationTick(t, e, a) {
    if (e && e !== this._durationTickSharedSentinel())
      try {
        this._timers.clearInterval(e);
      } catch (t) { }
    const n = this._durationTickTargets;
    if (!n || !n.length) return;
    const o = "idle" === a;
    for (let e = n.length - 1; e >= 0; e--) {
      const a = n[e];
      a.el === t && !!a.idle === o && n.splice(e, 1);
    }
    0 === n.length &&
      this._durationTicker &&
      (this._timers.clearInterval(this._durationTicker), (this._durationTicker = null));
  },
  _tickDurations() {
    if (!1 === this._isPageVisible) return;
    const t = this._durationTickTargets;
    if (!t || !t.length) return;
    const e = Date.now();
    for (let a = t.length - 1; a >= 0; a--) {
      const n = t[a];
      if (n.el.isConnected) {
        if (!(e < n.next))
          if (((n.next = e + n.interval), n.idle)) {
            if (!1 !== n.gate && !this._isLowFreqInView(n.el)) continue;
            this._enqueueLowFreqTask(n);
          } else
            try {
              n.fn();
            } catch (t) { }
      } else t.splice(a, 1);
    }
  },
  _registerLowFreqTask(t, e, a, n) {
    if (!t || "function" != typeof e) return this._durationTickSharedSentinel();
    const o = n || {},
      i = a || 1e4;
    if (this.constructor && !1 === this.constructor._enableLowFreqScheduler) return this._timers.setInterval(e, i);
    this._durationTickTargets || (this._durationTickTargets = []);
    const r = this._durationTickTargets;
    for (let a = 0; a < r.length; a++)
      if (r[a].el === t && r[a].idle)
        return ((r[a].fn = e), (r[a].interval = i), (r[a].gate = !1 !== o.gate), this._durationTickSharedSentinel());
    const s = this._lowFreqSeq || 0;
    this._lowFreqSeq = s + 1;
    const c = Math.max(1e3, Math.floor(i / 5));
    return (
      r.push({ el: t, fn: e, interval: i, next: Date.now() + (s % 5) * c, idle: !0, gate: !1 !== o.gate }),
      !1 !== o.gate && this._ensureLowFreqObserver(t),
      this._ensureDurationTicker(),
      this._durationTickSharedSentinel()
    );
  },
  _unregisterLowFreqTask(t, e) {
    this._unregisterDurationTick(t, e, "idle");
  },
  _ensureLowFreqObserver(t) {
    "function" == typeof IntersectionObserver &&
      (this._lowFreqVisible || (this._lowFreqVisible = new Map()),
        this._lowFreqObserver ||
        (this._lowFreqObserver = new IntersectionObserver(
          (t) => {
            for (let e = 0; e < t.length; e++) {
              const a = t[e],
                n = this._lowFreqVisible.get(a.target);
              if ((this._lowFreqVisible.set(a.target, a.isIntersecting), a.isIntersecting && !1 === n)) {
                const t = this._durationTickTargets;
                if (t) for (let e = 0; e < t.length; e++) t[e].el === a.target && t[e].idle && (t[e].next = 0);
              }
            }
          },
          { rootMargin: "120px" },
        )),
        this._lowFreqObserver.observe(t));
  },
  _isLowFreqInView(t) {
    if (!t || !t.isConnected) return !1;
    if (!this._lowFreqVisible) return !0;
    const e = this._lowFreqVisible.get(t);
    return void 0 === e || e;
  },
  _enqueueLowFreqTask(t) {
    (this._lowFreqQueue || (this._lowFreqQueue = []), this._lowFreqQueue.push(t), this._pumpLowFreqQueue());
  },
  _pumpLowFreqQueue() {
    if (this._lowFreqBusy) return;
    const t = this._lowFreqQueue;
    if (!t || !t.length) return;
    this._lowFreqBusy = !0;
    const e = () => {
      this._lowFreqBusy = !1;
      const e = t.shift();
      if (e)
        try {
          e.fn();
        } catch (t) { }
      t.length && this._pumpLowFreqQueue();
    };
    "function" == typeof requestIdleCallback
      ? (this._lowFreqIdleHandle = requestIdleCallback(e, { timeout: 1e3 }))
      : (this._lowFreqIdleHandle = this._timers.setTimeout(e, 0));
  },
  _disposeLowFreq() {
    if (null !== this._lowFreqIdleHandle && void 0 !== this._lowFreqIdleHandle) {
      try {
        "function" == typeof cancelIdleCallback && cancelIdleCallback(this._lowFreqIdleHandle);
      } catch (t) { }
      try {
        this._timers.clearTimeout(this._lowFreqIdleHandle);
      } catch (t) { }
      this._lowFreqIdleHandle = null;
    }
    (this._lowFreqObserver && (this._lowFreqObserver.disconnect(), (this._lowFreqObserver = null)),
      this._lowFreqVisible && this._lowFreqVisible.clear(),
      this._lowFreqQueue && (this._lowFreqQueue.length = 0),
      (this._lowFreqBusy = !1),
      (this._lowFreqSeq = 0));
  },
};

const we = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });

// HtmlUtilsMixin
const Te = {
  _escapeHtml: (t) => (null == t ? "" : String(t).replace(/[&<>"']/g, (t) => we[t])),
};

// ConfigMixin
const Be = {
  normalizeCardConfig: (t, e) => ({
    entity: e.entity || "",
    name: e.name || "",
    icon: e.icon || null,
    on_icon: e.on_icon || e.icon,
    off_icon: e.off_icon || e.icon,
    on_color: e.on_color || "#2ecc71",
    off_color: e.off_color || "#95a5a6",
    unit: e.unit || "",
    map_table: e.map_table || null,
    confirm: e.confirm || !1,
    show_history: e.show_history || !1,
    update_interval: e.update_interval ?? 0,
    tap_action: e.tap_action || null,
    placeholder: e.placeholder || "请输入文本...",
    submit_icon: e.submit_icon || "mdi:send",
    button_icon: e.button_icon || e.icon || "mdi:gesture-tap-button",
    icon_color: e.icon_color || null,
    min: e.min || 0,
    max: e.max || 100,
    step: e.step || 1,
    card_config: e.card_config || null,
    total_entity: e.total_entity || null,
    used_entity: e.used_entity || null,
    show_duration: e.show_duration,
    height: e.height || null,
    width: e.width || null,
    content: e.content || "",
    entities: e.entities || {},
    way: e.way || null,
    format: e.format || null,
    scenes: e.scenes || [],
    scene_mode: e.scene_mode || null,
    layer_mode: e.layer_mode || "double",
    open_mode: e.open_mode || "double",
    fabric_entity: e.fabric_entity || null,
    sheer_entity: e.sheer_entity || null,
    ...e,
  }),
};

// 授权字段清单 (room-elves-card v5.11.8 中变量名为 uo)
const uo = ["详单授权状态", "授权剩余有效时长", "自动提交等待中", "最近下发验证码时间", "验证码填写时间", "验证码状态", "最近执行时间", "最近执行结果"];
const Ba = uo;

// CommCardMixin (升级自 room-elves-card v5.11.8 通讯卡模块)
const ja = { _commFieldAliases: { account_status: ["账户状态", "帐号状态", "账号状态"], balance: ["话费余额", "可用余额", "余额"], charge: ["本月消费", "本月出账", "本月费用"], fee_deposit: ["本月存入话费", "存入话费"], fee_rollover: ["上月结转话费", "结转话费"], flow_remain: ["剩余通用流量", "剩余流量"], flow_used: ["已用流量", "流量已用", "通用流量已用"], flow_directional: ["定向流量"], voice_remain: ["共享通话剩余", "剩余通话", "剩余语音"], voice_used: ["共享通话已用", "已用通话", "已用语音"], sms_remain: ["剩余短信", "短信剩余"], integral: ["电信积分", "会员积分", "积分"], star_level: ["用户星级", "星级"], member_level: ["会员等级"], real_name: ["机主姓名", "机主"], phone_number: ["手机号码", "手机号"], cust_name: ["单位户号", "户名"], speed_service: ["套餐服务", "套餐"], broadband: ["宽带速率"], broadband_count: ["名下宽带"], location: ["号码归属地", "归属地"], last_update: ["数据最近更新", "最近更新", "刷新时间"], call_record: ["通话记录", "通话详单"], sms_record: ["短信记录"], traffic_record: ["上网记录"] }, _commMemberPalette: ["#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#00b4d8", "#e91e63", "#795548", "#607d8b"], _commRemainColor: "rgba(128, 128, 128, 0.28)", showCommPopup(e, t) { const n = e || {}; let o = null; return this.showPopup({ content: () => (o = this._commBuildRoot(n), this._startCommRefresh(o, n), o), className: "comm-popup", style: `\n        width: ${n.width ? n.width : "720px"};\n        max-width: 96vw;\n        max-height: 88vh;\n        overflow: hidden;\n        border-radius: 16px;\n        padding: 0;\n      `, triggerButton: t || null, showOverlay: !0, showBackground: !0, popupPosition: n.popup_position || "center", onClose: () => { this._commTeardown(o) }, onDestroy: () => { this._commTeardown(o) } }) }, createCommCard(e, t = {}) { const n = e || {}, o = this._commBuildRoot(n); return o._commOptions = t, this._startCommRefresh(o, n), o }, updateCommCard(e, t) { if (!e || "comm" !== e.dataset.cardType) return; const n = t || e._commConfig || {}; e._commConfig = n; const o = this._commLoadAll(n), a = this._commAnalysisOn(e); if (a !== !!e._commAnalysisOnCache) return e._commAnalysisOnCache = a, this._commRebuildPanels(e, n, o), void this._commSyncDots(e); o.signature && o.signature === e._commSignature || (e._commSignature = o.signature, o.dataSignature && o.dataSignature === e._commDataSignature ? this._commRefreshAuthSurfaces(e, n, o) : (e._commDataSignature = o.dataSignature, this._commRebuildPanels(e, n, o))) }, _commRefreshAuthSurfaces(e, t, n) { if (!e) return; const o = this._commActiveContext(e, t, n), a = this._commAuthConfig(o), i = e.querySelector(".comm-tag-auth"); if (i && a) { const e = this._commAuthStatus(a.button, o.data), t = i.querySelector(".comm-tag-text"); t && (t.textContent = e.text || "详单认证"), i.classList.toggle("ok", "ok" === e.tone), i.classList.toggle("danger", "danger" === e.tone), i.title = "详单认证：验证码 / 起始日期 / 二次认证" + (e.raw ? `（${e.raw}）` : "") } ["_commAuthBubble", "_commSimBubble", "_commPkgBubble", "_commFeeBubble"].forEach(t => { const n = e[t]; n && (n.bubble && n.bubble.isConnected ? n.render(o) : e[t] = null) }) }, _commTelEntities(e) { const t = String(e || ""); return { overview: `sensor.${t}_overview`, button: `button.${t}_button`, code: `text.${t}_code`, date: `date.${t}_date`, calls: `sensor.${t}_calls`, update_region: `button.${t}_update_region`, daily_reset: `switch.${t}_daily_reset`, auto_login: `switch.${t}_auto_login`, auto_region_update: `switch.${t}_auto_region_update`, auto_query: `switch.${t}_auto_query`, auto_query_time: `time.${t}_auto_query_time` } }, _commExpandTelConfig(e) {
  const t = e || {};
  return Object.keys(t)
    .filter(k => /^tel(_\d+)?$/i.test(k))
    .sort((a, b) => Number((a.match(/\d+/) || [0])[0]) - Number((b.match(/\d+/) || [0])[0]))
    .map(k => {
      const p = String(void 0 === t[k] || null === t[k] ? "" : t[k]).replace(/\D/g, "");
      if (!p) return null;
      const o = this._commTelEntities(p);
      const nameKey = Object.keys(t).find(item => item.toLowerCase() === `${k}_name`.toLowerCase());
      const customName = nameKey ? String(t[nameKey] || "").trim() : "";
      return {
        entity: t[`${k}_entity`] || t[`${k}_overview`] || o.overview,
        name: customName || null,
        button: t[`${k}_button`] || o.button,
        code: t[`${k}_code`] || o.code,
        date: t[`${k}_date`] || o.date,
        calls: t[`${k}_calls`] || o.calls,
        update_region: t[`${k}_update_region`] || o.update_region,
        daily_reset: t[`${k}_daily_reset`] || o.daily_reset,
        auto_login: t[`${k}_auto_login`] || o.auto_login,
        auto_region_update: t[`${k}_auto_region_update`] || o.auto_region_update,
        auto_query: t[`${k}_auto_query`] || o.auto_query,
        auto_query_time: t[`${k}_auto_query_time`] || o.auto_query_time
      };
    })
    .filter(Boolean);
}, _commLoadAll(e) { const t = e || {}, n = [], o = e => { let t = null, o = null, a = null; "string" == typeof e ? t = e : e && "object" == typeof e && (t = e.entity || e.entity_id || null, o = e.name || null, a = { button: e.button || "", code: e.code || "", date: e.date || "", calls: e.calls || "", update_region: e.update_region || "", daily_reset: e.daily_reset || "", auto_login: e.auto_login || "", auto_region_update: e.auto_region_update || "", auto_query: e.auto_query || "", auto_query_time: e.auto_query_time || "" }), t && (n.some(e => e.entityId === t) || n.push({ entityId: t, name: o, auth: a })) }; o(t.entity), Array.isArray(t.entities) && t.entities.forEach(o), this._commExpandTelConfig(t).forEach(o); const a = new Map; n.forEach(e => a.set(e.entityId, this._commParseOverview(e.entityId))); const i = n.map(e => { const n = a.get(e.entityId) || {}, o = n.phone || "", i = o.length >= 4 ? o.slice(-4) : "", r = this._commAccountView(n, t) || {}; return { entityId: e.entityId, name: e.name || "", carrier: n.carrier || "", phone: o, ok: !!n.ok, balance: r.balance ? r.balance.value : null, owed: !!r.owed, label: e.name || n.carrier || "号码", tail: i ? `****${i}` : "", auth: e.auth || null } }), r = [], s = e => { e && ["button", "code", "date", "calls", "update_region", "daily_reset", "auto_login", "auto_region_update", "auto_query", "auto_query_time"].forEach(t => { const n = e[t]; n && -1 === r.indexOf(n) && r.push(n) }) }; s(t), n.forEach(e => s(e.auth)); const c = n.map(e => `${e.entityId}#${this._commDataFingerprint(a.get(e.entityId))}`).join("|"), l = `${c}||${r.map(e => { const t = this.hass && this.hass.states ? this.hass.states[e] : null; return `${e}@${t ? t.last_updated || t.last_changed || "" : "none"}` }).join("|")}`; return { accounts: i, dataMap: a, signature: l, dataSignature: c } }, _commDataFingerprint(e) { if (!e || !e.ok) return "none"; const t = [String(e.phone || ""), String(e.carrier || "")], n = e.nodes || {}; return Object.keys(n).forEach(e => { const o = n[e] || {}; t.push(`<${e}>`), Object.keys(o).forEach(e => { if (-1 !== uo.indexOf(e)) return; const n = o[e]; if (Array.isArray(n)) { const o = n[0] && n[0].call_time ? n[0].call_time : "", a = n.length && n[n.length - 1] && n[n.length - 1].call_time ? n[n.length - 1].call_time : ""; t.push(`${e}=[${n.length}]${o}~${a}`) } else t.push(`${e}=${String(n)}`) }) }), t.join(";") }, _commParseOverview(e) { const t = this.hass && this.hass.states ? this.hass.states[e] : null; if (!t) return { entityId: e, ok: !1, reason: `实体不存在或未加载：${e}`, nodes: {}, carrier: "", phone: "", lastUpdated: "" }; const n = t.attributes || {}, o = {}; if (Object.keys(n).forEach(e => { const t = n[e]; t && "object" == typeof t && !Array.isArray(t) && t.entity_id && (o[e] = t) }), !Object.keys(o).length) return { entityId: e, ok: !1, reason: `该实体不是「数据总览」实体（未发现节点属性）：${e}`, nodes: {}, carrier: "", phone: "", lastUpdated: "" }; const a = this._commFieldNode(o, "phone_number", null), i = this._commPropAny(o, "运营商") || "", r = a && a.state ? String(a.state) : this._commPropAny(o, "手机号码") || ""; return { entityId: e, ok: !0, reason: "", nodes: o, carrier: i, phone: /^\d{6,}$/.test(r) ? r : "", lastUpdated: t.last_updated || t.last_changed || "" } }, _commFieldNode(e, t, n) { if (!e) return null; const o = [], a = n && n[t]; a && o.push(String(a)); const i = this._commFieldAliases[t]; if (i && o.push(...i), !o.length) return null; const r = Object.keys(e).map(t => ({ name: t, base: this._commStripSeq(t), node: e[t] })); for (const e of o) { const t = r.find(t => t.base === e); if (t) return t.node } const s = [...o].sort((e, t) => t.length - e.length); for (const e of s) { const t = r.find(t => t.base.includes(e)); if (t) return t.node } return null }, _commStripSeq: e => String(e || "").replace(/\s*\(\d+\)\s*$/, "").trim(), _commProp(e, t) { if (!e || !t || !t.length) return; for (const n of t) if (void 0 !== e[n] && null !== e[n] && "" !== e[n]) return e[n]; const n = Object.keys(e); for (const o of n) if ("entity_id" !== o && "icon" !== o && "unit" !== o && "单位" !== o && t.some(e => o.includes(e))) { const t = e[o]; if (null != t && "" !== t) return t } }, _commPropAny(e, t) { const n = Object.values(e || {}); for (const e of n) { if (!e || "object" != typeof e) continue; const n = e[t]; if (null != n && "" !== n) return n } return "" }, _commNum(e) { if (null == e) return null; if ("number" == typeof e) return isFinite(e) ? e : null; const t = String(e).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return t ? parseFloat(t[0]) : null }, _commFmtNum(e, t = 2) { if (null == e || "" === e || !isFinite(Number(e))) return ""; const n = Number(e), o = Math.abs(n); return String(o > 0 && o < .01 ? n : Number(n.toFixed(t))) }, _commRingNum(e) { const t = this._commNum(e); if (null === t) return ""; const n = Math.round(t); return 0 === n && t > 0 ? "<1" : String(n) }, _commMoney(e) { const t = this._commFmtNum(e); return "" === t ? "" : `${t} 元` }, _commUnitOf: e => e ? String(e["单位"] || e.unit || e.unit_of_measurement || "").trim() : "", _commParsePack(e) { const t = String(e || ""); if (!t) return null; const n = e => { const n = t.match(new RegExp(e + "\\s*([\\d.]+)\\s*([A-Za-z\\u4e00-\\u9fa5]{1,4})?")); return n ? { value: parseFloat(n[1]), unit: n[2] || "" } : null }, o = n("剩余"), a = n("已用"), i = n("共"); return o || a || i ? { remain: o ? o.value : null, used: a ? a.value : null, total: i ? i.value : null, unit: i && i.unit || o && o.unit || a && a.unit || "" } : null }, _commMergeMembers(e, t) {
  const n = Array.isArray(e) ? e : [], o = Array.isArray(t) ? t : [];
  const combined = [...n, ...o];
  const map = new Map();
  combined.forEach(item => {
    const m = (item.name || "").match(/^(本机|主卡|副卡)\s*(.+)$/);
    const phoneStr = m ? m[2].trim() : (item.name || "");
    const tail = phoneStr.length >= 4 ? phoneStr.slice(-4) : phoneStr;
    const dedupeKey = m ? `${m[1]}_${tail}` : item.name;
    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, item);
    } else {
      const existing = map.get(dedupeKey);
      const existVal = Number(existing.value) || 0;
      const newVal = Number(item.value) || 0;
      if (newVal > existVal || (newVal === existVal && String(item.name).includes("*"))) {
        map.set(dedupeKey, item);
      }
    }
  });
  return Array.from(map.values());
},
_commMergePacks(e, t) {
  const n = Array.isArray(e) ? e : [], o = Array.isArray(t) ? t : [];
  if (!n.length) return o;
  if (!o.length) return n;
  const a = new Map();
  n.forEach(e => a.set(e.label, e));
  o.forEach(e => {
    if (!a.has(e.label)) a.set(e.label, e);
  });
  return Array.from(a.values());
},
_commMembersFromNode(e) {
  if (!e) return [];
  const t = [];
  const seen = new Set();
  const sortedKeys = Object.keys(e).sort((a, b) => (a.includes("*") ? -1 : 1));
  sortedKeys.forEach(n => {
    const o = n.match(/^(本机|主卡|副卡)\s*\((.+?)\)$/);
    if (!o) return;
    const role = o[1];
    const phoneStr = o[2];
    const tail = phoneStr.length >= 4 ? phoneStr.slice(-4) : phoneStr;
    const dedupeKey = `${role}_${tail}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const a = this._commNum(e[n]);
    null !== a && t.push({ name: `${role} ${phoneStr}`, value: a });
  });
  return t;
}, _commPacksFromNode(e) { if (!e) return []; const t = []; return Object.keys(e).forEach(n => { if (!/^(流量包|语音包)\s*\d+$/.test(n)) return; const o = this._commParsePack(e[n]); if (!o) return; const a = o.unit || ""; t.push({ label: n, text: `剩余 ${this._commFmtNum(o.remain) || "—"} ${a} / 共 ${this._commFmtNum(o.total) || "—"} ${a}`, percent: o.total ? (o.used || 0) / o.total * 100 : 0 }) }), t }, _commBuildRoot(e) { const t = e || {}, n = document.createElement("div"); n.className = "comm-card", n.dataset.cardType = "comm", n._commConfig = t; const o = String(t.initial_tab || ""); n._commAnalysisOnCache = this._commAnalysisOn(n), n._commActiveTab = "records" === o || "analysis" === o && n._commAnalysisOnCache ? o : "account", n._commPhoneMasked = !0, n._commAuthDraft = {}, n._commCallFilter = null, n._commSmsFilter = null, n._commTrafficFilter = null, n._commCallSort = null, n._commPlaceScope = "location", n._commDetailView = "list", n._commRecordTab = this._commRecordDefaultTab(), n._commMapView = null, n._commDailyHover = 0, n._durationCardRef = this; const a = this._commLoadAll(t); n._commSignature = a.signature, n._commDataSignature = a.dataSignature, n._commActiveEntity = this._commPickActive(n, a.accounts), n.appendChild(this._commBuildHeader(t, a.accounts, n)); const i = document.createElement("div"); return i.className = "comm-panels", n.appendChild(i), this._commFillPanels(i, n, t, a), n.appendChild(this._commBuildDots(n._commActiveTab, n)), this._commBindSwipe(i, n), this._commMountRings(n), n }, _commPickActive(e, t) { const n = e && e._commActiveEntity; return n && t.some(e => e.entityId === n) ? n : t.length ? t[0].entityId : null }, _commBuildHeader(e, t, n) { const o = document.createElement("div"); o.className = "comm-header"; const a = String(e && e.name || "").trim(); if (a) { const e = document.createElement("div"); e.className = "comm-title-wrap"; const t = document.createElement("div"); t.className = "comm-title", t.textContent = a, e.appendChild(t), o.appendChild(e) } return t.length > 1 && o.appendChild(this._commBuildAccountTabs(t, n._commActiveEntity, n)), o }, _commBuildAccountTabs(e, t, n) { const o = document.createElement("div"); o.className = "comm-accounts"; const a = Math.max(0, e.findIndex(e => e.entityId === t)); o.style.setProperty("--comm-acc-count", String(e.length)), o.style.setProperty("--comm-acc-index", String(a)), e.forEach(e => { const a = document.createElement("button"); a.type = "button", a.className = "comm-account-tab" + (e.entityId === t ? " active" : ""), e.ok || a.classList.add("offline"), a.dataset.entity = e.entityId; const i = document.createElement("span"); i.className = "comm-account-balance", i.textContent = null === e.balance || void 0 === e.balance ? "—" : `¥${Number(e.balance).toFixed(2)}`, a.appendChild(i); const r = document.createElement("span"); r.className = "comm-account-name", r.textContent = e.name || e.carrier || e.tail || "", a.appendChild(r), e.owed && a.classList.add("owed"), a.title = [e.name, e.carrier, this._commPhoneText(e.phone, n)].filter(Boolean).join(" · "), a.addEventListener("click", e => { e.stopPropagation(), this._switchCommAccount(a) }), o.appendChild(a) }); const i = document.createElement("span"); return i.className = "comm-account-slider", o.appendChild(i), o }, _commApplyTab(e, t) { e && t && (e._commActiveTab = t, e.querySelectorAll(".comm-panel").forEach(e => { e.classList.toggle("active", e.dataset.panel === t) }), e.querySelectorAll(".comm-dot").forEach(e => { e.classList.toggle("active", e.dataset.tab === t) })) }, _commLayoutPages(e, t, n, o) { if (!e) return; const a = this._commTabOrder(e), i = Math.max(0, a.indexOf(t)); this._commEnsurePanel(e, a[i]); const r = e.querySelector(".comm-panels"); r && r.classList.add("comm-swiping"), e.querySelectorAll(".comm-panel").forEach(e => { const t = a.indexOf(e.dataset.panel); t < 0 || (o ? e.style.removeProperty("transition") : e.style.transition = "none", e.style.transform = `translateX(calc(${100 * (t - i)}% + ${n || 0}px))`) }), o && (e._commSwipeTimer && this._timers.clearTimeout(e._commSwipeTimer), e._commSwipeTimer = this._timers.setTimeout(() => { e._commSwipeTimer = null, e.isConnected && (this._commApplyTab(e, t), e.querySelectorAll(".comm-panel").forEach(e => { e.style.removeProperty("transform"), e.style.removeProperty("transition") }), r && r.classList.remove("comm-swiping")) }, 340)) }, _commSwitchTo(e, t) { if (!e || !t) return; e._commSwipeTimer && (this._timers.clearTimeout(e._commSwipeTimer), e._commSwipeTimer = null); const n = e.querySelector(".comm-panels"); n && n.classList.contains("comm-swiping") ? this._commLayoutPages(e, t, 0, !0) : (this._commLayoutPages(e, e._commActiveTab, 0, !1), window.requestAnimationFrame(() => { e.isConnected && this._commLayoutPages(e, t, 0, !0) })) }, _commSwipeOffset(e, t) { const n = this._commTabOrder(e), o = Math.max(0, n.indexOf(e._commActiveTab)); return 0 === o && t > 0 || o === n.length - 1 && t < 0 ? .35 * t : t }, _commAnalysisOn(e) { const t = (e && e._commConfig || {}).analysis; if (null == t || "" === t) return !1; if ("boolean" == typeof t) return t; if ("number" == typeof t) return t > 0; const n = String(t).trim().toLowerCase(); if (["false", "off", "no", "0", "null", "undefined"].indexOf(n) >= 0) return !1; if (["true", "on", "yes", "1"].indexOf(n) >= 0) return !0; const o = this && (this.hass || this._hass) || e && e._commHass || null, a = o && o.states ? o.states[n] : null; if (!a) return e && !e._commAnalysisWarned && (e._commAnalysisWarned = !0, console.warn(`[comm] analysis 配置的实体读不到：${n}（实体不存在？拼写？）—— 按"关"处理`)), !1; const i = String(a.state || "").trim().toLowerCase(); if (["on", "true", "home", "open", "playing", "unlocked"].indexOf(i) >= 0) return !0; const r = Number(i); return Number.isFinite(r) && r > 0 }, _commTabOrder(e) { const t = ["account", "records"]; return this._commAnalysisOn(e) && t.push("analysis"), t }, _commSyncDots(e) { const t = this._commTabOrder(e); t.indexOf(e._commActiveTab) < 0 && (e._commActiveTab = t[t.length - 1]); const n = e.querySelector(".comm-dots"); n && n.replaceWith(this._commBuildDots(e._commActiveTab, e)), this._commLayoutPages(e, e._commActiveTab, 0, !1) }, _commTabLabel: e => ({ account: "账户", records: "通讯记录", analysis: "统计分析" }[e] || e), _commBuildDots(e, t) { const n = document.createElement("div"); return n.className = "comm-dots", this._commTabOrder(t).forEach(t => { const o = this._commTabLabel(t), a = document.createElement("button"); a.type = "button", a.className = "comm-dot" + (e === t ? " active" : ""), a.dataset.tab = t, a.title = o, a.setAttribute("aria-label", o), n.appendChild(a) }), n.addEventListener("click", e => { const t = e.target.closest(".comm-dot"), o = n.closest(".comm-card"); if (!t || !o) return; e.stopPropagation(); const a = this._commTabOrder(o), i = a.indexOf(o._commActiveTab), r = a.indexOf(t.dataset.tab); r < 0 || r === i || this._commSwitchTo(o, a[r]) }), n }, _commBindSwipe(e, t) { if (!e) return; let n = 0, o = 0, a = 0, i = 1, r = !1, s = null, c = 0, l = 0, d = 0, p = !1, h = null; const u = () => { (() => { if (p && null !== h && e.hasPointerCapture && e.hasPointerCapture(h)) try { e.releasePointerCapture(h) } catch (e) { } p = !1 })(), r = !1, s = null, d = 0 }; e.addEventListener("pointerdown", p => { "mouse" === p.pointerType && 0 !== p.button || p.target.closest("input, textarea, button, a") || p.target.closest(".comm-map-canvas") || (t._commSwipeTimer && (this._timers.clearTimeout(t._commSwipeTimer), t._commSwipeTimer = null, this._commApplyTab(t, t._commActiveTab), t.querySelectorAll(".comm-panel").forEach(e => { e.style.removeProperty("transform"), e.style.removeProperty("transition") }), e.classList.remove("comm-swiping")), n = p.clientX, o = p.clientY, c = p.clientX, l = p.timeStamp || Date.now(), a = 0, d = 0, s = null, r = !0, h = p.pointerId, i = e.clientWidth || 1) }), e.addEventListener("pointermove", i => { if (!r) return; const m = i.clientX - n, f = i.clientY - o; if (!s) { if (Math.abs(m) < 6 && Math.abs(f) < 6) return; if (s = Math.abs(m) > 1.2 * Math.abs(f) ? "x" : "y", "x" !== s) return void u(); if (null !== h && !p) try { e.setPointerCapture(h), p = !0 } catch (e) { } try { const e = this._commTabOrder(t), n = Math.max(0, e.indexOf(t._commActiveTab)), o = e[m < 0 ? n + 1 : n - 1]; o && this._commEnsurePanel(t, o) } catch (e) { } } if ("x" !== s) return; const g = i.timeStamp || Date.now(), y = g - l; y > 0 && (d = (i.clientX - c) / y, c = i.clientX, l = g), a = m, this._commLayoutPages(t, t._commActiveTab, this._commSwipeOffset(t, a), !1) }), e.addEventListener("pointerup", () => { if (!r) return; const e = "x" === s, n = a, o = d; if (u(), !e) return; const c = this._commTabOrder(t), l = Math.max(0, c.indexOf(t._commActiveTab)), p = .28 * i; let h = l; n <= -p || o <= -.35 && n < -12 ? h = Math.min(l + 1, c.length - 1) : (n >= p || o >= .35 && n > 12) && (h = Math.max(l - 1, 0)), this._commSwitchTo(t, c[h]) }), e.addEventListener("pointercancel", () => { if (!r) return; const e = "x" === s; u(), e && this._commSwitchTo(t, t._commActiveTab) }) }, _switchCommAccount(e) { if (!e) return; const t = e.closest(".comm-card"); if (!t) return; const n = e.dataset.entity; if (!n || n === t._commActiveEntity) return; t._commActiveEntity = n, t._commAuthDraft = {}, t._commCallFilter = null, t._commSmsFilter = null, t._commTrafficFilter = null, t._commCallSort = null, t._commDailyHover = 0; const o = t._commConfig || {}; this._commRebuildPanels(t, o, this._commLoadAll(o)) }, _commFillPanels(e, t, n, o) { e.textContent = ""; const a = this._commActiveContext(t, n, o); e._commCtx = a, e._commConfig = n, this._commEnsureRecordsScrollClose(t); const i = t && t._commActiveTab || "account"; this._commTabOrder(t).forEach(o => { if ("account" === o || o === i) return void e.appendChild(this._commBuildPanel(o, a, t, n)); const r = document.createElement("div"); r.className = "comm-panel", r.dataset.panel = o, r.dataset.commPending = "1", e.appendChild(r) }) }, _commBuildPanel(e, t, n, o) { return "records" === e ? this._commBuildRecordsPanel(t, n) : "analysis" === e ? this._commBuildAnalysisPanel(n) : this._commBuildAccountPanel(t, n) }, _commEnsureRecordsScrollClose(e) { e && !e._commScrollCloseBound && (e._commScrollCloseBound = !0, e.addEventListener("scroll", t => { const n = t.target; n && n.dataset && "records" === n.dataset.panel && (void 0 !== n._commLastScrollTop ? n.scrollTop !== n._commLastScrollTop && (n._commLastScrollTop = n.scrollTop, this._commCloseDailyTip(e)) : n._commLastScrollTop = n.scrollTop) }, { capture: !0, passive: !0 })) }, _commEnsurePanel(e, t) { if (!e || !t) return; const n = e.querySelector ? e.querySelector(".comm-panels") : null; if (!n) return; "account" !== t && n.querySelector('.comm-panel[data-panel="account"][data-comm-pending="1"]') && this._commEnsurePanel(e, "account"); const o = n.querySelector(`.comm-panel[data-panel="${t}"][data-comm-pending="1"]`); if (!o) return; const a = n._commCtx, i = n._commConfig || e._commConfig || {}; try { const n = this._commBuildPanel(t, a, e, i); n.classList.toggle("active", e._commActiveTab === t), o.replaceWith(n) } catch (e) { try { o.textContent = "内容加载失败" } catch (e) { } return } "account" === t && this._commMountRings(e) }, _commEmptyConfigReason(e) { const t = Object.keys(e || {}), n = t.filter(e => /tel/i.test(e)); let o = "未解析出任何号码：请在卡片配置里写电话号码（如 tel_1: 13363902961），或沿用旧的 entity / entities（如 sensor.xxx_shu_ju_zong_lan）。"; return n.length ? o += ` 收到的疑似号码键：${n.join("、")} —— 键名需形如 tel_1 / tel_2（小写 tel + 下划线 + 序号；只配一个号码也可直接写 tel）。` : t.length && (o += ` 当前收到的配置键：${t.join("、")}。`), o }, _commActiveContext(e, t, n) { const o = e._commActiveEntity, a = o && n.dataMap.get(o) || { ok: !1, reason: this._commEmptyConfigReason(t), nodes: {} }; return { config: t || {}, account: n.accounts.find(e => e.entityId === o) || null, data: a } }, _commRebuildPanels(e, t, n) { const o = e.querySelector(".comm-panels"); if (!o) return; this._commCloseDailyTip(e), this._commCloseTransientBubble(e, "_commRingTip"), this._commCloseTransientBubble(e, "_commMiniTip"), this._commDisposeRings(o), this._commAnaDispose(o), e._commActiveEntity = this._commPickActive(e, n.accounts), this._commFillPanels(o, e, t, n); const a = e.querySelector(".comm-header"); a && a.replaceWith(this._commBuildHeader(t, n.accounts, e)), this._commMountRings(e); const i = this._commActiveContext(e, t, n);["_commAuthBubble", "_commSimBubble", "_commPkgBubble", "_commFeeBubble"].forEach(t => { const n = e[t]; n && (n.bubble && n.bubble.isConnected ? n.render(i) : e[t] = null) }) }, _commBuildAccountPanel(e, t) { const n = e.data, o = e.config, a = document.createElement("div"); if (a.className = "comm-panel" + ("account" === t._commActiveTab ? " active" : ""), a.dataset.panel = "account", !n || !n.ok) return a.appendChild(this._commEmpty(n && n.reason || "暂无数据")), a; const i = this._commAccountView(n, o), r = document.createElement("div"); r.className = "comm-body", r.appendChild(this._commHero(i, t, e)); const s = this._commSection("流量", "mdi:cloud-download-outline"); s.body.appendChild(this._commDuoRing({ percent: i.flow.percent, remain: i.flow.remain, used: i.flow.used, total: i.flow.total, unit: i.flow.unit, caption: "剩余占比", color: "#2196f3", members: i.flow.members, packs: i.flow.packs })), r.appendChild(s.section); const c = this._commSection("通话", "mdi:phone-outgoing-outline"); c.body.appendChild(this._commDuoRing({ percent: i.voice.percent, remain: i.voice.remain, used: i.voice.used, total: i.voice.total, unit: i.voice.unit, caption: "剩余占比", color: "#4caf50", members: i.voice.members, packs: i.voice.packs })), r.appendChild(c.section); const l = this._commFooter(i); return l && r.appendChild(l), a.appendChild(r), a }, _commRecordDefaultTab: () => "overview", _commRecordTab(e) { const t = e && e._commRecordTab; return "overview" === t || "call" === t || "traffic" === t || "sms" === t ? t : this._commRecordDefaultTab() }, _commRecordDir(e) { const t = e && e._commRecordDir; return "out" === t || "in" === t ? t : "" }, _commDirWords: e => "call" === e ? { out: "呼叫", in: "接听" } : { out: "发送", in: "接收" }, _commDirFor(e, t) { return "traffic" === e ? "" : this._commRecordDir(t) }, _commDirOf(e) { const t = e || {}, n = this._commCallDirArrow(t.type || t.msg_type || t.call_type || ""); return "→" === n ? "out" : "←" === n ? "in" : "" }, _commFilterByDir(e, t) { const n = "out" === t || "in" === t ? t : ""; return n ? (e || []).filter(e => this._commDirOf(e) === n) : e || [] }, _commDirToggle(e, t) { const n = this._commRecordDir(e), o = this._commDirWords(t), a = document.createElement("div"); return a.className = "comm-dir-toggle", [{ key: "", label: "全部", tip: "显示全部方向" }, { key: "out", label: o.out, tip: `只看「${o.out}」的记录` }, { key: "in", label: o.in, tip: `只看「${o.in}」的记录` }].forEach(t => { const o = document.createElement("button"); o.type = "button", o.className = "comm-dir-key" + (n === t.key ? " active" : ""), o.dataset.dir = t.key || "all", o.textContent = t.label, o.title = t.tip, o.addEventListener("click", n => { n.stopPropagation(), this._commRecordDir(e) !== t.key && (e._commRecordDir = t.key, this._commRefreshRecordsPanel(e)) }), a.appendChild(o) }), a }, _commThisMonth() { const e = new Date; return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}` }, _commRecordMonth(e) { const t = String(e && e._commRecordMonth || "").trim(); return /^\d{4}-\d{2}$/.test(t) ? t : this._commThisMonth() }, _commRecordIsThisMonth(e) { return this._commRecordMonth(e) === this._commThisMonth() }, _commGotoRecordMonth(e, t) { e._commRecordMonth = t, e._commCallFilter = null, e._commSmsFilter = null, e._commTrafficFilter = null, this._commRefreshRecordsPanel(e) }, _commMonthShift(e, t) { const n = /^(\d{4})-(\d{2})$/.exec(String(e || "")); if (!n) return ""; const o = new Date(Number(n[1]), Number(n[2]) - 1 + (Number(t) || 0), 1); return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, "0")}` }, _commMonthPicker(e, t, n) { return this._periodPicker({ mode: "ym", cur: e, today: this._commThisMonth(), loadMeta: () => this._commMonthsMeta(t), onPick: e => this._commGotoRecordMonth(t, e), close: n }) }, _commDayPicker(e, t, n) { return this._periodPicker({ mode: "md", cur: e, today: this._commAnaTodayMd(), onPick: t, close: n }) }, _commMonthsMeta(e) { if (e._commMonthsMeta) return e._commMonthsMeta; const t = this._commAnaReq(e, { type: "months", order: "asc", limit: 0 }).then(e => { const t = (e && e.months || []).map(e => String(e || "")).filter(e => /^\d{4}-\d{2}$/.test(e)); return { months: t, set: new Set(t), first: String(e && e.span && e.span.first || t[0] || ""), last: String(e && e.span && e.span.last || t[t.length - 1] || "") } }).catch(() => (e._commMonthsMeta = null, null)); return e._commMonthsMeta = t, t }, _commRecordMonthBar(e) { if (!this._commAnaCfg(e).ready) return document.createElement("div"); const t = this._commRecordMonth(e), n = this._commRecordIsThisMonth(e), o = document.createElement("div"); o.className = "comm-record-month"; const a = document.createElement("button"); a.type = "button", a.className = "comm-month-nav", a.title = "上一个月"; const i = document.createElement("ha-icon"); i.setAttribute("icon", "mdi:chevron-left"), a.appendChild(i), a.addEventListener("click", n => { n.stopPropagation(), e._commRecordMonth = this._commMonthShift(t, -1), this._commRefreshRecordsPanel(e) }); const r = document.createElement("button"); r.type = "button", r.className = "comm-month-label" + (n ? " now" : ""), r.textContent = t, r.title = `点击选择年月（当前 ${t}` + (n ? "，数据来自实体）" : "，数据来自本地库）"), r.addEventListener("click", n => { n.stopPropagation(); let o = null; const a = this._commMonthPicker(t, e, () => { o && o.close && o.close() }); o = this._commMiniBubble(r, `选择年月 · 当前 ${t}`, a, e, "bottom") }); const s = document.createElement("button"); s.type = "button", s.className = "comm-month-nav", s.title = n ? "已经是最新月份" : "下一个月", n && (s.disabled = !0); const c = document.createElement("ha-icon"); if (c.setAttribute("icon", "mdi:chevron-right"), s.appendChild(c), s.addEventListener("click", o => { o.stopPropagation(), n || this._commGotoRecordMonth(e, this._commMonthShift(t, 1)) }), o.appendChild(a), o.appendChild(r), o.appendChild(s), !n) { const t = document.createElement("button"); t.type = "button", t.className = "comm-month-back", t.textContent = "本月", t.title = "回到本月（改回实体数据）", t.addEventListener("click", t => { t.stopPropagation(), this._commGotoRecordMonth(e, this._commThisMonth()) }), o.appendChild(t) } return o }, _commOverviewTopN(e, t, n, o) { const a = o > 0 ? o : 3, i = new Map; return (e || []).forEach(e => { let o; try { o = t(e) } catch (e) { o = "" } if (o = String(null == o ? "" : o).trim(), !o) return; const a = i.get(o) || { key: o, count: 0, weight: 0, items: [] }; if (a.count += 1, a.items.push(e), n) { const t = this._commNum(n(e)); null !== t && (a.weight += t) } i.set(o, a) }), [...i.values()].sort((e, t) => t.weight !== e.weight ? t.weight - e.weight : t.count !== e.count ? t.count - e.count : e.key < t.key ? -1 : e.key > t.key ? 1 : 0).slice(0, a) }, _commOverviewMonthDays(e, t) { if (t) return Math.max(1, (new Date).getDate()); const n = /^(\d{4})-(\d{2})$/.exec(String(e || "")); return n ? new Date(Number(n[1]), Number(n[2]), 0).getDate() : 0 }, _commOverviewGroups(e) { const t = e || {}, n = t.card, o = e => { const t = String(null == e ? "" : e).trim(); return t ? ("function" == typeof this._commPeerText ? this._commPeerText(t, n) : "") || t : "" }, a = [], i = t.month || "", r = t.call && t.call.items || []; if (r.length) { let e = 0, t = 0; r.forEach(n => { e += 1, t += this._commDurationSeconds(n && n.duration) }); const n = this._commOverviewTopN(r, e => e && e.party_name || e && e.phone_number, e => this._commDurationSeconds(e && e.duration), 3), i = n.length ? n[0].weight : 0; a.push({ key: "call", label: "电话", icon: "mdi:phone-log", total: `共 ${e} 次` + (t > 0 ? ` · ${this._commFormatDuration(t)}` : ""), rows: n.map((e, t) => { const n = this._commOverviewTopN(e.items, e => e && e.location, null, 1)[0], a = this._commOverviewTopN(e.items, e => e && e.number_location, null, 1)[0], r = n ? n.key : "", s = a ? a.key : "", c = r && s ? `${r}→${s}` : r || s; return { rank: t + 1, name: o(e.key), place: c, value: `${e.count} 次` + (e.weight > 0 ? ` · ${this._commFormatDuration(e.weight)}` : ""), ratio: i > 0 ? Math.min(1, e.weight / i) : 1 } }) }) } else a.push({ key: "call", label: "电话", icon: "mdi:phone-log", muted: !0, tip: t.isThisMonth ? "本月暂无通话记录" : `${i} 暂无通话记录` }); const s = t.smsView; if (s && s.count) { const e = this._commOverviewTopN(s.items, e => e && e.party_name || e && e.phone_number, () => 1, 3), t = e.length ? e[0].count : 0, n = [`共 ${this._commFmtNum(s.count)} 条`]; (s.sent || s.received) && n.push(`发 ${s.sent} · 收 ${s.received}`), s.fee > 0 && n.push(`${this._commFmtNum(s.fee)} 元`), a.push({ key: "sms", label: "短信", icon: "mdi:message-text-outline", total: n.join(" · "), rows: e.map((e, n) => { const a = this._commOverviewTopN(e.items, e => e && e.location, null, 1)[0], i = this._commOverviewTopN(e.items, e => e && (e.party_place || e.number_location), null, 1)[0], r = a ? a.key : "", s = i ? i.key : ""; return { rank: n + 1, name: o(e.key), place: r && s ? `${r}→${s}` : r || s, value: `${this._commFmtNum(e.count)} 条`, ratio: t > 0 ? Math.min(1, e.count / t) : 1 } }) }) } else { const e = String(t.smsNode && t.smsNode.state || "").split(/[（(]/)[0].trim(); a.push({ key: "sms", label: "短信", icon: "mdi:message-text-outline", muted: !0, tip: e ? `短信：${e}` : t.isThisMonth ? "本月暂无短信记录" : `${i} 暂无短信记录` }) } const c = t.trafficView; if (c) { const e = this._commOverviewDayUsage(t.trafficNode, c.items).slice(0, 3), n = e.length ? e[0].mb : 0, o = this._commOverviewMonthDays(t.month, t.isThisMonth), i = o > 0 ? (Number(c.volumeMb) || 0) / o : 0, r = [`共 ${this._commDataSize(c.volumeMb)}`]; c.seconds && r.push(this._commFormatDuration(c.seconds)), i > 0 && r.push(`日均 ${this._commDataSize(i)}`), c.sessions && r.push(`${c.sessions} 个会话`), a.push({ key: "traffic", label: "流量", icon: "mdi:web", total: r.join(" · "), rows: e.map((e, t) => ({ rank: t + 1, name: `${e.date.slice(5)} ${this._commWeekdayText(e.date)}`.trim(), place: "", value: this._commDataSize(e.mb) + (e.sessions ? ` · ${e.sessions} 个会话` : ""), ratio: n > 0 ? Math.min(1, e.mb / n) : 1 })) }) } else a.push({ key: "traffic", label: "流量", icon: "mdi:web", muted: !0, tip: "未找到「上网记录」节点" }); return a }, _commOverviewDayUsage(e, t) { const n = [], o = Array.isArray(e && e["按天汇总"]) ? e["按天汇总"] : []; if (o.length) o.forEach(e => { const t = String(e && e.date || ""); /^\d{4}-\d{2}-\d{2}/.test(t) && n.push({ date: t.slice(0, 10), mb: this._commNum(e && e.volume_mb) || 0, sessions: this._commNum(e && e.sessions) || 0 }) }); else { const e = new Map; (t || []).forEach(t => { const n = String(t && t.datetime || "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return; const o = e.get(n) || { date: n, mb: 0, sessions: 0 }; o.mb += this._commNum(t && t.volume_mb) || 0, o.sessions += 1, e.set(n, o) }), e.forEach(e => n.push(e)) } return n.sort((e, t) => t.mb - e.mb || e.date.localeCompare(t.date)), n }, _commWeekdayText(e) { const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e || "")); if (!t) return ""; const n = new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3])); return isNaN(n.getTime()) ? "" : "周" + "日一二三四五六".charAt(n.getDay()) }, _commOverviewSection(e, t) { const n = t || {}, o = document.createElement("div"); if (o.className = "comm-ov-sections", o.appendChild(this._commOverviewOneGroup(e, n, n.isThisMonth ? "本月概览" : `${n.month || ""} 概览`)), n.isThisMonth) { const t = this._commOverviewTodayCtx(n); t && o.appendChild(this._commOverviewOneGroup(e, t, "今日概览")) } return o }, _commOverviewTodayCtx(e) { const t = e || {}, n = this._commTodayKey(), o = e => String(e && (e.call_time || e.datetime || e.time) || "").slice(0, 10) === n, a = (t.call && t.call.items || []).filter(o), i = (t.smsView && t.smsView.items || []).filter(o); let r = 0, s = 0, c = 0; i.forEach(e => { const t = this._commSmsDirection(e && e.type); "out" === t ? r += 1 : "in" === t && (s += 1); const n = this._commNum(e && e.fee); null !== n && (c += n) }); const l = (Array.isArray(t.trafficNode && t.trafficNode["按天汇总"]) ? t.trafficNode["按天汇总"] : []).find(e => String(e && e.date || "").slice(0, 10) === n) || null, d = (t.trafficView && t.trafficView.items || []).filter(o); let p = l && this._commNum(l.volume_mb) || 0, h = l && this._commNum(l.sessions) || 0, u = 0; d.length && (d.forEach(e => { u += this._commNum(e && e.duration_seconds) || 0 }), l || (p = d.reduce((e, t) => e + (this._commNum(t && t.volume_mb) || 0), 0), h = d.length)); const m = p > 0 || h > 0 ? [{ date: n, volume_mb: p, sessions: h }] : []; return a.length || i.length || m.length ? { card: t.card, month: "今日", isThisMonth: !1, call: { items: a }, smsView: i.length ? { items: i, count: i.length, sent: r, received: s, fee: c } : null, smsNode: null, trafficView: m.length ? { items: d, volumeMb: p, seconds: u, sessions: h, fee: 0 } : null, trafficNode: { "按天汇总": m } } : null }, _commOverviewOneGroup(e, t, n) { const o = t || {}, a = this._commSection(n, "mdi:view-dashboard-outline"), i = document.createElement("span"); i.className = "comm-ov-note", i.textContent = "本机详单 · 与下方各页同源", a.head.appendChild(i); const r = document.createElement("div"); return r.className = "comm-ov", this._commOverviewGroups(Object.assign({ card: e }, o)).forEach(e => { const t = document.createElement("div"); t.className = "comm-ov-card" + (e.muted ? " comm-ov-muted" : ""); const n = document.createElement("div"); n.className = "comm-ov-ghead"; const o = document.createElement("ha-icon"); o.className = "comm-ov-icon", o.setAttribute("icon", e.icon), n.appendChild(o); const a = document.createElement("span"); if (a.className = "comm-ov-glabel", a.textContent = e.label, n.appendChild(a), e.total) { const t = document.createElement("span"); t.className = "comm-ov-gtotal", t.textContent = e.total, n.appendChild(t) } if (t.appendChild(n), e.muted) { const n = document.createElement("div"); n.className = "comm-ov-tip", n.textContent = e.tip || "暂无数据", t.appendChild(n) } else (e.rows || []).forEach(e => { const n = document.createElement("div"); n.className = "comm-ov-row"; const o = document.createElement("span"); o.className = "comm-ov-rank comm-ov-rank-" + e.rank, o.textContent = String(e.rank), n.appendChild(o); const a = document.createElement("span"); a.className = "comm-ov-who"; const i = document.createElement("span"); if (i.className = "comm-ov-name", i.textContent = e.name, a.appendChild(i), e.place) { const t = document.createElement("em"); t.className = "comm-ov-place", t.textContent = e.place, a.appendChild(t) } n.appendChild(a); const r = document.createElement("span"); r.className = "comm-ov-bar"; const s = document.createElement("i"); s.className = "comm-ov-fill"; const c = Math.max(0, Math.min(1, Number(e.ratio) || 0)); s.style.width = `${Math.round(100 * c)}%`, r.appendChild(s), n.appendChild(r); const l = document.createElement("span"); l.className = "comm-ov-val", l.textContent = e.value, n.appendChild(l), t.appendChild(n) }); r.appendChild(t) }), a.body.appendChild(r), a.section }, _commRecordTabs(e, t, n) { const o = document.createElement("div"); o.className = "comm-record-tabs"; const a = [{ key: "overview", label: "概览", icon: "mdi:view-dashboard-outline" }, { key: "call", label: "通话", icon: "mdi:phone-log" }, { key: "traffic", label: "流量", icon: "mdi:web" }, { key: "sms", label: "短信", icon: "mdi:message-text-outline" }].filter(e => n && n[e.key]); if (a.length < 2) return o; const i = document.createElement("div"); return i.className = "comm-record-tabs-slot", a.forEach(n => { const o = document.createElement("button"); o.type = "button", o.className = "comm-record-tab" + (n.key === t ? " active" : ""), o.dataset.tab = n.key; const a = document.createElement("ha-icon"); a.setAttribute("icon", n.icon), o.appendChild(a); const r = document.createElement("span"); r.textContent = n.label, o.appendChild(r), o.title = `只显示${n.label}相关内容`, o.addEventListener("click", t => { t.stopPropagation(), o.classList.contains("active") || (e._commRecordTab = n.key, this._commRefreshRecordsPanel(e)) }), i.appendChild(o) }), o.appendChild(i), o }, _commHistStore: e => (e._commHist || (e._commHist = new Map), e._commHist), _commHistCallNode(e, t) { const n = this._commHistStore(e), o = `call|${t}`; if (n.has(o)) return n.get(o); if (n.set(o, null), !this._commAnaCfg(e).ready) return null; const a = e => (e || []).map(e => { const t = this._commAnaToLegacyCall(e); return t.fee = Number(e.cost) || 0, t.duration = this._commFormatDuration(e.duration), t }); return Promise.all([this._commAnaReq(e, { type: "records", month: t, channels: "语音", sort: "time", order: "desc", limit: 2e3 }), this._commAnaReq(e, { type: "stats", granularity: "day", month: t, channels: "语音", fill: 1 })]).then(([i, r]) => { const s = a(i && i.rows), c = r && r.total || {}, l = { "本月通话次数": Number(c.count) || s.length, "查询起始日期": `${t}-01`, "通话流水清单": s, "按天汇总": r && r.rows || [] }; n.set(o, l), this._commRefreshRecordsPanel(e) }).catch(() => { n.set(o, { "本月通话次数": 0, "查询起始日期": `${t}-01`, "通话流水清单": [], "按天汇总": [] }), this._commRefreshRecordsPanel(e) }), null }, _commHistRecordNode(e, t, n) { const o = this._commHistStore(e), a = `${n}|${t}`; if (o.has(a)) return o.get(a); if (o.set(a, null), !this._commAnaCfg(e).ready) return null; const i = "sms" === n, r = i ? e => ({ datetime: String(e.time || ""), type: String(e.msg_type || ""), fee: Number(e.cost) || 0, phone_number: String(e.party_number || ""), party_name: String(e.party_name || ""), location: String(e.location || ""), location_coordinate: String(e.location_coordinate || ""), party_place: String(e.party_place || ""), party_coordinate: String(e.party_coordinate || "") }) : e => ({ datetime: String(e.time || ""), volume_mb: Number(e.traffic_usage) || 0, duration_seconds: Number(e.duration) || 0, fee: Number(e.cost) || 0, location: String(e.location || ""), location_coordinate: String(e.location_coordinate || "") }); return this._commAnaReq(e, { type: "records", month: t, channels: i ? "短信" : "流量", sort: "time", order: "desc", limit: 5e3 }).then(t => { const n = (t && t.rows || []).map(r); o.set(a, i ? { "短信记录": n } : { "上网会话清单": n }), this._commRefreshRecordsPanel(e) }).catch(() => { o.set(a, i ? { "短信记录": [] } : { "上网会话清单": [] }), this._commRefreshRecordsPanel(e) }), null }, _commRecordTopBar(e, t, n) { const o = document.createElement("div"); o.className = "comm-record-top"; const a = this._commRecordTabs(e, t, n); a.childNodes.length && o.appendChild(a); const i = this._commRecordMonthBar(e); return i.childNodes.length && o.appendChild(i), o }, _commBuildRecordsPanel(e, t) { const n = e.data, o = e.config, a = document.createElement("div"); if (a.className = "comm-panel" + ("records" === t._commActiveTab ? " active" : ""), a.dataset.panel = "records", !n || !n.ok) return a.appendChild(this._commEmpty(n && n.reason || "暂无数据")), a; this._commAnaCfg(t).ready || (t._commRecordMonth = ""); const i = this._commRecordMonth(t), r = this._commRecordIsThisMonth(t), s = r ? this._commFieldNode(n.nodes, "call_record", o && o.fields || {}) : this._commHistCallNode(t, i); if (!s) return a.appendChild(this._commEmpty(r ? "未找到「通话记录」节点（可用配置 fields.call_record 指定节点名）" : `正在读取 ${i} 的本地库数据…`)), a; const c = document.createElement("div"); c.className = "comm-body"; const l = this._commCallView(s), d = this._commPlaceScope(t), p = this._commCallStats(s, l.items, d, this._commDirFor("call", t)), h = this._commSection(r ? "本月通话" : `${i} 通话`, "mdi:phone-log"), u = document.createElement("div"); u.className = "comm-mini-grid", u.appendChild(this._commMini("总次数", `${this._commFmtNum(p.count)} 次`, { title: "点击查看接听 / 呼叫次数", onClick: e => { const n = p.count - p.answerCount - p.dialCount; this._commMiniBubble(e, "通话次数构成", [["接听", `${p.answerCount} 次`], ["呼叫", `${p.dialCount} 次`], ["其它（未接等）", n > 0 ? `${n} 次` : ""]], t) } })), u.appendChild(this._commMini("总时长", this._commFormatDuration(p.seconds), { title: "点击查看接听 / 呼叫时长", onClick: e => { const n = p.seconds - p.answerSeconds - p.dialSeconds; this._commMiniBubble(e, "通话时长构成", [["接听累计", this._commFormatDuration(p.answerSeconds)], ["呼叫累计", this._commFormatDuration(p.dialSeconds)], ["其它（未接等）", n > 0 ? this._commFormatDuration(n) : ""]], t) } })); const m = p.fee ? { title: "点击查看费用最高的三通", onClick: e => this._commMiniBubble(e, "费用最高的三通", p.topFee.map((e, n) => [`#${n + 1}  ${e.time || ""}`.trim(), `${this._commPhoneText(e.number, t)} · ${this._commFmtNum(e.fee)} 元`]), t) } : {}; u.appendChild(this._commMini("总费用", `${this._commFmtNum(p.fee)} 元`, m)); const f = p.places.length ? { title: "点击查看各地点的时长与次数", onClick: e => this._commMiniBubble(e, `${this._commPlaceScopeLabel(d)} · 时长与次数`, p.places.map(e => [e.name, `${this._commFormatDuration(e.seconds)} · ${e.count} 次`]), t) } : {}; u.appendChild(this._commMini("通话地点", p.places.length ? `${p.places.length} 个` : "—", f)), h.body.appendChild(u), p.daily && (h.body.appendChild(this._commSubTitle("每日通话时长")), h.body.appendChild(this._commDailyChart(p.daily, t))); const g = t._commCallFilter || null, y = this._commPlaceToneMap(l.items); if (p.top.length) { const e = this._commRankN(t), n = e ? p.top.slice(0, e) : p.top, o = e && p.top.length > e ? ` / 共 ${p.top.length} 个` : "", a = this._commSubTitle(e ? `通话时长 Top${e}${o}` : `通话时长榜 · ${p.top.length} 个号码`); a.appendChild(this._commRankNToggle(t)), h.body.appendChild(a), h.body.appendChild(this._commRankList(n, t, g && "number" === g.type ? g.value : "")) } if (p.places.length) { const e = this._commSubTitle("通话地点"); e.appendChild(this._commPlaceScopeToggle(t)), e.appendChild(this._commDirToggle(t, "call")), h.body.appendChild(e); const n = document.createElement("div"); n.className = "comm-place-list", p.places.forEach(e => { const o = document.createElement("span"), a = y.has(e.name) ? y.get(e.name) : 0, i = !(!g || "place" !== g.type || g.scope !== d || (Array.isArray(g.values) ? -1 === g.values.indexOf(e.name) : g.value !== e.name)); o.className = "comm-place comm-place-tone-" + a + (i ? " active" : ""), o.textContent = `${e.name} · ${e.count} 次`, o.title = `点击筛选「${this._commPlaceScopeLabel(d)} = ${e.name}」的通话记录`, o.addEventListener("click", n => { n.stopPropagation(), this._commToggleCallFilter(t, { type: "place", scope: d, value: e.name }) }), n.appendChild(o) }), h.body.appendChild(n) } const b = o && o.fields || {}, x = r ? this._commFieldNode(n.nodes, "sms_record", b) : this._commHistRecordNode(t, i, "sms"), _ = r ? this._commFieldNode(n.nodes, "traffic_record", b) : this._commHistRecordNode(t, i, "traffic"), v = x ? this._commSmsView(x) : null, w = _ ? this._commTrafficView(_) : null, C = g ? l.items.filter(e => this._commCallMatch(e, g)) : l.items, k = g ? "place" === g.type ? Array.isArray(g.values) ? `${this._commPlaceScopeLabel(g.scope)} ${g.values.length > 2 ? `${g.values.length} 处` : g.values.join("、")}` : `${this._commPlaceScopeLabel(g.scope)} ${g.value}` : this._commPeerText(g.value, t) : "", S = g ? "place" === g.type ? `${this._commPlaceScopeLabel(g.scope)}：${Array.isArray(g.values) ? g.values.join("、") : g.value}` : `号码：${this._commPeerText(g.value, t)}` : "", E = "map" === t._commDetailView ? "map" : "list", T = g ? "通话明细" : C.length ? `通话明细 · ${C.length} 条` : "通话明细", $ = this._commSection(T, "map" === E ? "mdi:map-marker-path" : "mdi:format-list-bulleted"); if ($.head.appendChild(this._commViewToggle(t)), g) { const e = document.createElement("div"); e.className = "comm-filter-bar"; const n = document.createElement("span"); n.className = "comm-filter-text", n.textContent = `${k} · ${C.length} / 共 ${l.items.length} 条`, e.appendChild(n); const o = document.createElement("button"); o.type = "button", o.className = "comm-filter-clear", o.textContent = "清除筛选", o.title = `当前筛选 ${S}`, o.addEventListener("click", e => { e.stopPropagation(), this._commToggleCallFilter(t, null) }), e.appendChild(o), $.section.insertBefore(e, $.body) } if (C.length) if ("map" === E) $.body.appendChild(this._commMigrationChart(C, t, d, g)); else { const e = t._commCallSort || null; $.body.appendChild(this._commSortBar(t, e)), $.body.appendChild(this._commCallList(this._commSortCalls(C, e, d), y, t)) } else { const e = document.createElement("div"); e.className = "comm-tip", e.textContent = g ? "当前筛选条件下没有通话记录。" : "暂无通话流水。详单授权失效时集成只保留本地缓存，重新认证后可拉取最新明细。", $.body.appendChild(e) } const A = v ? this._commSmsSection(v, t).section : null, D = w ? this._commTrafficSection(w, t).section : null, N = { overview: !0, call: !0, traffic: !r || !!D, sms: !r || !!A }; let L = this._commRecordTab(t); return N[L] || (L = this._commRecordDefaultTab()), c.appendChild(this._commRecordTopBar(t, L, N)), "overview" === L ? c.appendChild(this._commOverviewSection(t, { month: i, isThisMonth: r, call: l, smsView: v, trafficView: w, smsNode: x, trafficNode: _ })) : "traffic" === L ? c.appendChild(D || this._commEmpty(`正在读取 ${i} 的流量数据…`)) : "sms" === L ? c.appendChild(A || this._commEmpty(`正在读取 ${i} 的短信数据…`)) : (c.appendChild(h.section), c.appendChild($.section)), a.appendChild(c), a }, _commAnaTabs() { return [{ key: "概览" }, ...this._commAnaChannels()] }, _commAnaChannels: () => [{ key: "语音", up: "呼叫", down: "接听" }, { key: "短信", up: "发送", down: "接收" }, { key: "微信", up: "发送", down: "接收", peerDim: "party_name" }, { key: "流量", up: "流量", down: "" }], _commAnaChannel(e) { const t = this._commAnaChannels(); return t.find(t => t.key === e.channel) || t[0] }, _commAnaCfg(e) { const t = e && e._commConfig || {}, n = this && this.config || {}, o = String(t.api_base_url || n.api_base_url || "/api/ha_data_store").replace(/\/+$/, ""), a = String(t.key || n.key || "").trim(), i = this._commAnalysisOn(e); return { base: o, key: a, url: `${o}/comm`, enabled: i, ready: !(!i || !a) } }, _commAnaState: e => (e._commAna || (e._commAna = { view: "today", channel: "概览", scope: { kind: "all" }, peer: null, md: "", yearFilter: "", placeFilter: null, rankBy: "count", cache: new Map, data: null, loading: !1, error: null, reqId: 0 }), e._commAna), _commAnaQueryString(e) { const t = e || {}; return Object.keys(t).filter(e => void 0 !== t[e] && null !== t[e] && "" !== t[e]).sort().map(e => `${encodeURIComponent(e)}=${encodeURIComponent(t[e])}`).join("&") }, _commAnaPeek(e, t) { const n = e && e._commAna; return n && n.cache && n.cache.get(this._commAnaQueryString(t)) || null }, _commAnaReq(e, t) { const n = this._commAnaCfg(e), o = this._commAnaState(e), a = this._commAnaQueryString(t), i = o.cache.get(a); if (i) return i; const r = `${n.url}?${a}&key=${encodeURIComponent(n.key)}`, s = fetch(r).then(e => e.json().catch(() => ({ success: !1, error: `HTTP ${e.status}` }))).then(e => { if (!e || !1 === e.success) throw new Error(e && e.error || "查询失败"); return e }).catch(e => { throw o.cache.delete(a), e }); return o.cache.set(a, s), s }, _commAnaPeerParams(e) { const t = e && e.peer || null; return t ? t.number ? { party_numbers: t.number } : { party_names: t.name } : {} }, _commAnaRangeParams(e) { const t = {}, n = e.scope || { kind: "all" }; return "year" === n.kind ? t.year = n.key : "month" === n.kind ? t.month = n.key : "day" === n.kind && (t.date = n.key), e.channel && (t.channels = e.channel), Object.assign(t, this._commAnaPeerParams(e)), t }, _commAnaGranularity(e) { const t = e.scope && e.scope.kind || "all"; return "all" === t ? "year" : "year" === t ? "month" : "month" === t ? "day" : "hour" }, _commAnaListParams(e, t, n, o) { const a = e.placeFilter && e.placeFilter.value ? e.placeFilter : null; if (!t) { const e = { type: "stats", granularity: o, fill: 1, ...n }; return a && (e[a.field] = a.value), e } const i = { type: "onthisday", mode: "detail", date: this._commAnaMd(e).md, channels: e.channel, limit: 200, ...this._commAnaPeerParams(e) }; return e.yearFilter && (i.years = e.yearFilter), a && (i[a.field] = a.value), i }, _commAnaMapParams(e, t, n) { const o = { type: "geoflows", limit: 2e3, nodes_limit: 0 }; return t ? (o.md = this._commAnaMd(e).md, o.channels = e.channel, Object.assign(o, this._commAnaPeerParams(e))) : Object.assign(o, n), o }, _commAnaChannelParams(e, t) { const n = this._commAnaChannels().find(e => e.key === t) || this._commAnaChannels()[0], o = Object.assign({}, e, { channel: n.key }), a = this._commAnaRangeParams(o), i = this._commAnaGranularity(o), r = "today" === o.view, s = this._commAnaMd(o).md, c = r ? { type: "onthisday", date: s, granularity: "year", channels: n.key, ...this._commAnaPeerParams(o) } : { type: "stats", granularity: i, fill: 1, ...a }, l = { chart: n.down ? { ...c, msg_types: n.up } : c, years: c, list: this._commAnaListParams(o, r, a, i), map: this._commAnaMapParams(o, r, a) }; if (!o.peer && this._commAnaRankNeeded(o)) { const e = n.peerDim || "party_number", t = this._commAnaRankBy(o), i = 300; r ? l.rank = { type: "onthisday", date: s, mode: "ranking", dimension: "party_name", by: t, channels: n.key, limit: i } : "party_number" === e ? (l.rank = { type: "ranking", dimension: "party_name", by: t, ...a, limit: i }, l.rankPeers = { type: "parties", by: t, ...a, limit: 5e3 }) : l.rank = { type: "ranking", dimension: e, by: t, ...a, limit: i } } return r || "day" !== (o.scope || {}).kind || (l.dayDetail = { type: "records", date: String(o.scope.key || ""), sort: "time", order: "desc", limit: 200, channels: n.key, ...this._commAnaPeerParams(o) }), "流量" === n.key && (l.places = { type: "crosstab", rows: "location", metric: "traffic_usage", ...a }), n.down && (l.down = { ...c, msg_types: n.down }), { ch: n, params: l } }, _commAnaLoad(e, t, n) { if (!t) return; if (!this._commAnaCfg(e).ready) return void this._commAnaPaint(e, t, n); if ("概览" === n.channel) return void this._commAnaOverviewLoad(e, t, n); const o = this._commAnaGranularity(n), { params: a } = this._commAnaChannelParams(n, n.channel), i = {}; Object.keys(a).forEach(t => { i[t] = this._commAnaReq(e, a[t]) }); const r = ++n.reqId; n.loading = !0, n.error = null, this._commAnaPaint(e, t, n), Promise.all(Object.entries(i).map(([e, t]) => t.then(t => [e, t]))).then(a => { if (r !== n.reqId) return; const i = Object.fromEntries(a); n.data = { ...i, gran: "today" === n.view ? "year" : o }, n.loading = !1, this._commAnaPaint(e, t, n) }).catch(o => { r === n.reqId && (n.loading = !1, n.error = o && o.message || String(o), this._commAnaPaint(e, t, n)) }) }, _commAnaOverviewLoad(e, t, n) { const o = ++n.reqId; n.error = null, n.loading = !0; const a = this._commAnaOverviewSnapshot(e, n, "peek"); n.data = { overview: a.entries }, this._commAnaPaint(e, t, n); const i = this._commAnaOverviewSnapshot(e, n, "req"); n.data = { overview: i.entries }, i.entries.forEach(a => { a.chSettled.then(() => { a.done = !0, o === n.reqId && this._commAnaPaint(e, t, n) }) }), i.settled.then(() => { o === n.reqId && (n.loading = !1, !i.entries.some(e => Object.keys(e.values).length > 0) && i.entries.every(e => e.failed) && (n.error = "四个渠道都没读到数据（检查 API Key / 本地数据服务）"), this._commAnaPaint(e, t, n)) }) }, _commAnaOverviewSnapshot(e, t, n) { const o = []; return { entries: this._commAnaChannels().map(a => { const { ch: i, params: r } = this._commAnaChannelParams(t, a.key), s = { ch: i, seen: !1, failed: !1, done: "req" !== n, values: {}, chSettled: null }, c = []; return Object.keys(r).forEach(t => { const a = "req" === n ? this._commAnaReq(e, r[t]) : this._commAnaPeek(e, r[t]); if (!a) return; s.seen = !0; const i = a.then(e => { s.values[t] = e }, () => { s.failed = !0 }); c.push(i), o.push(i) }), s.chSettled = Promise.all(c), s }), settled: Promise.all(o) } }, _commAnaOverviewNote(e, t) { const n = []; if ("today" === e.view) { const { md: t, custom: o } = this._commAnaMd(e); n.push(o ? `历年 ${t}` : `历年今日（${t}）`) } else n.push("全部数据"), "all" !== (e.scope || { kind: "all" }).kind && n.push(this._commAnaScopeLabel(e)); return n.push(e.peer ? `指定人 ${this._commPeerText(e.peer.label, t) || e.peer.label}` : "全部联系人"), e.yearFilter && n.push(`明细筛 ${e.yearFilter} 年`), e.placeFilter && e.placeFilter.value && n.push(`明细筛 ${e.placeFilter.value}`), n.join(" · ") }, _commAnaOverviewSection(e, t, n) { const o = this._commSection("概览", "mdi:view-dashboard-outline"), a = document.createElement("span"); a.className = "comm-ov-note", a.textContent = t.loading ? "正在读取四个渠道…" : `口径：${this._commAnaOverviewNote(t, e)} · 四渠道同源`, a.title = "四个渠道都按这个口径统计；与各渠道页逐字同键，切过去数字一致", o.head.appendChild(a); const i = document.createElement("div"); return i.className = "comm-ov", (n && n.overview || this._commAnaChannels().map(e => ({ ch: e, seen: !1, values: {} }))).forEach(n => i.appendChild(this._commAnaOverviewCard(e, t, n))), o.body.appendChild(i), o.section }, _commAnaChannelIcon: e => ({ "语音": "mdi:phone-log", "短信": "mdi:message-text-outline", "微信": "mdi:wechat", "流量": "mdi:web" }[e] || "mdi:chart-donut"), _commAnaOverviewTotal(e, t) { const n = [t.chart, t.down].filter(Boolean).map(e => e && e.total || {}), o = n.length ? n : [(t.years || {}).total || {}], a = e => o.reduce((t, n) => t + (Number(n && n[e]) || 0), 0), i = a("count"), r = a("traffic_usage"), s = a("duration"), c = a("cost"); if (!i && !r) return ""; if ("流量" === e.key) return r > 0 ? `共 ${this._commDataSize(r)} · ${this._commFmtNum(i)} 次` : `共 ${this._commFmtNum(i)} 次`; let l = `共 ${this._commFmtNum(i)} 条`; if (2 === n.length) { const t = Number(n[0].count || 0), o = Number(n[1].count || 0); (t || o) && (l += ` · ${e.up} ${this._commFmtNum(t)} · ${e.down} ${this._commFmtNum(o)}`) } if ("语音" === e.key && s > 0 && (l += ` · ${this._commFormatDuration(s)}`), c > 0 && (l += ` · ${this._commFmtNum(c)} 元`), "语音" === e.key) { const e = o.reduce((e, t) => Math.max(e, Number(t && t.party_count) || 0), 0); e > 0 && (l += ` · ${this._commFmtNum(e)} 人`) } return l }, _commAnaFlowPlaces(e, t) { const n = t || {}; if (!e || "today" !== e.view) return n.places && n.places.rows || []; const o = new Map; return (n.list && n.list.rows || []).forEach(e => { const t = String(e && e.location || "").trim(), n = t || "未标注地点", a = o.get(n) || { key: n, count: 0, traffic_usage: 0, unnamed: !t }; a.count += 1, a.traffic_usage += Number(e && e.traffic_usage || 0), o.set(n, a) }), [...o.values()].sort((e, t) => t.traffic_usage - e.traffic_usage || t.count - e.count) }, _commAnaOverviewYears(e, t, n) { if ("year" !== ("today" === e.view ? "year" : this._commAnaGranularity(e))) return null; const o = new Map, a = e => (e || []).forEach(e => { const t = String(e && e.bucket || "").trim(); if (!t) return; const n = o.get(t) || { bucket: t, count: 0, duration: 0, cost: 0, traffic_usage: 0 }; n.count += Number(e && e.count || 0), n.duration += Number(e && e.duration || 0), n.cost += Number(e && e.cost || 0), n.traffic_usage += Number(e && e.traffic_usage || 0), o.set(t, n) }); a(t.chart && t.chart.rows), a(t.down && t.down.rows); const i = "流量" === n.key, r = [...o.values()].filter(e => i ? e.traffic_usage > 0 : e.count > 0).sort((e, t) => e.bucket < t.bucket ? 1 : e.bucket > t.bucket ? -1 : 0); if (r.length < 2) return null; const s = e => i ? this._commDataSize(e.traffic_usage) : `${this._commFmtNum(e.count)} 条`, c = e => `${e.bucket} 年 · ${this._commFmtNum(e.count)} 条` + (e.duration ? ` · ${this._commFormatDuration(e.duration)}` : "") + (e.cost ? ` · ${this._commFmtNum(e.cost)} 元` : "") + (i && e.traffic_usage ? ` · ${this._commDataSize(e.traffic_usage)}` : ""), l = document.createElement("div"); if (l.className = "comm-ana-ov-years", r.slice(0, 12).forEach(e => { const t = document.createElement("span"); t.className = "comm-ana-ov-year"; const n = document.createElement("b"); n.textContent = e.bucket, t.appendChild(n), t.appendChild(document.createTextNode(s(e))), t.title = c(e), l.appendChild(t) }), r.length > 12) { const e = r.slice(12), t = document.createElement("span"); t.className = "comm-ana-ov-year comm-ana-ov-year-more", t.textContent = `+${e.length} 年`, t.title = e.map(e => `${e.bucket} ${s(e)}`).join(" · "), l.appendChild(t) } return l }, _commAnaOverviewCard(e, t, n) { const o = n.ch, a = n.values || {}, i = Object.keys(a).length, r = document.createElement("div"); r.className = "comm-ov-card" + (i ? "" : " comm-ov-muted"); const s = document.createElement("div"); s.className = "comm-ov-ghead"; const c = document.createElement("ha-icon"); c.className = "comm-ov-icon", c.setAttribute("icon", this._commAnaChannelIcon(o.key)), s.appendChild(c); const l = document.createElement("span"); l.className = "comm-ov-glabel", l.textContent = o.key, s.appendChild(l); const d = this._commAnaOverviewTotal(o, a); if (d) { const e = document.createElement("span"); e.className = "comm-ov-gtotal", e.textContent = d, s.appendChild(e) } if (r.appendChild(s), !i) { if (t.loading) { const e = document.createElement("div"); return e.className = "comm-ov-tip", e.textContent = "读取中…", r.appendChild(e), r } const a = document.createElement("button"); return a.type = "button", a.className = "comm-ov-tip comm-ana-ov-go", a.textContent = (n.failed ? "读取失败 · 点这里去看" : "没读到数据 · 点这里去看") + o.key, a.title = `切到「${o.key}」并重新加载它`, a.addEventListener("click", t => { t.stopPropagation(), this._commAnaGoChannel(e, o.key) }), r.appendChild(a), r } const p = this._commAnaOverviewYears(t, a, o); p && r.appendChild(p); const h = new Map; ((a.dayDetail || {}).rows || []).concat((a.list || {}).rows || []).forEach(e => { const t = String(e && e.party_number || "").trim(), n = String(e && e.party_name || "").trim(); if (!t || !n) return; h.has(t) || h.set(t, n); const o = this._commAnaNormNum(t); o && o !== t && !h.has(o) && h.set(o, n) }); const u = "流量" === o.key, m = u ? this._commAnaFlowPlaces(t, a) : (a.rank || {}).rows || [], f = "短信" === o.key || "微信" === o.key, g = (a.dayDetail || {}).rows || (a.list || {}).rows || [], y = f ? g.filter(e => this._commContentOf(e)) : [], b = new Map; y.forEach(e => this._commAnaOverviewPeerKeys(e).forEach(t => ((e, t) => { e && (b.has(e) || b.set(e, []), b.get(e).push(t)) })(t, e))); const x = new Set, _ = new Map, v = (e, t) => { e && /^\d{4}$/.test(t) && (_.has(e) || _.set(e, new Set), _.get(e).add(t)) }; g.forEach(e => { const t = String(e && e.time || "").slice(0, 4); t && (u ? v(`m:${String(e && e.location || "").trim()}`, t) : this._commAnaOverviewPeerKeys(e).forEach(e => v(e, t))) }); const w = e => { const t = new Set; return (u ? [`m:${String(e && e.key || "").trim()}`] : this._commAnaOverviewPeerKeys(e, h)).forEach(e => { const n = _.get(e); n && n.forEach(e => t.add(e)) }), [...t].sort().reverse() }, C = new Set(g.map(e => String(e && e.time || "").slice(0, 4)).filter(Boolean)).size > 1; if (m.length) { const n = m.slice(0, 3), i = u ? "traffic_usage" : "count", s = Math.max(...n.map(e => Number(e && e[i] || 0)), 1); if (n.forEach((n, a) => { const i = C ? w(n) : [], c = this._commAnaOverviewJump(e, t, o.key, n, u), l = this._commAnaOverviewRow(e, n, a + 1, s, h, u ? "traffic" : "count", i, c), d = []; this._commAnaOverviewPeerKeys(n, h).forEach(e => { x.add(e), (b.get(e) || []).forEach(e => { d.indexOf(e) < 0 && d.push(e) }) }), d.sort((e, t) => String(t && t.time || "").localeCompare(String(e && e.time || ""))), r.appendChild(this._commAnaOverviewItem(l, d, e)) }), u && "today" === t.view) { const e = ((a.list || {}).rows || []).length, t = Number((a.list || {}).total || e) || e; if (t > e) { const n = document.createElement("div"); n.className = "comm-ov-tip", n.textContent = `按已加载的 ${this._commFmtNum(e)} / 共 ${this._commFmtNum(t)} 条明细聚合`, r.appendChild(n) } } } else if (t.loading && !n.done) { const e = document.createElement("div"); e.className = "comm-ov-tip", e.textContent = "读取中…", r.appendChild(e) } else { const e = document.createElement("div"); e.className = "comm-ov-tip", e.textContent = u ? "这个口径下没有带地点的上网记录" : "这个口径下没有记录", r.appendChild(e) } if (f && y.length) { const t = y.filter(e => this._commAnaOverviewPeerKeys(e).every(e => !x.has(e))); if (t.length) { const n = document.createElement("div"); n.className = "comm-ana-ov-msgs comm-ana-ov-leftover"; const o = document.createElement("span"); o.className = "comm-ana-ov-leftover-label", o.textContent = "其他联系人 · 最新", n.appendChild(o), this._commAnaOverviewMsgs(e, n, t), r.appendChild(n) } } return r }, _commAnaNormNum: e => String(null == e ? "" : e).replace(/[^\d]/g, ""), _commAnaOverviewPeerKeys(e, t) { if (!e) return []; const n = [], o = String(e.party_number || "").trim(), a = String(e.key || "").trim(), i = String(e.party_name || "").trim(), r = this._commAnaNormNum(o), s = /^[\d\s\-+()]+$/.test(a) ? this._commAnaNormNum(a) : "", c = r || s; if (c) { n.push(`n:${c}`); const e = t ? String(t.get(o) || "").trim() || String(t.get(c) || "").trim() : ""; e && n.push(`m:${e}`) } const l = i || (s ? "" : a); return l && n.push(`m:${l}`), n }, _commAnaOverviewItem(e, t, n) { if (!t || !t.length) return e; const o = document.createElement("div"); o.className = "comm-ov-item", o.appendChild(e); const a = document.createElement("div"); return a.className = "comm-ana-ov-msgs", this._commAnaOverviewMsgs(n, a, t), o.appendChild(a), o }, _commAnaOverviewMsgs(e, t, n) { const o = n.slice(3); if (n.slice(0, 3).forEach(n => t.appendChild(this._commAnaOverviewMsg(e, n))), !o.length) return; const a = document.createElement("button"); a.type = "button", a.className = "comm-ana-ov-more"; let i = !1; const r = () => i ? "收起" : `展开还有 ${o.length} 条`; a.textContent = r(), a.title = `共 ${n.length} 条（默认先给 3 条）`; const s = []; a.addEventListener("click", n => { n.stopPropagation(), i = !i, i ? o.forEach(n => { const o = this._commAnaOverviewMsg(e, n); s.push(o), t.insertBefore(o, a) }) : (s.forEach(e => e.remove()), s.length = 0), a.textContent = r() }), t.appendChild(a) }, _commAnaOverviewRow(e, t, n, o, a, i, r, s) { const c = "traffic" === i, l = document.createElement("div"); l.className = "comm-ov-row"; const d = document.createElement("span"); d.className = "comm-ov-rank comm-ov-rank-" + n, d.textContent = String(n), l.appendChild(d); const p = document.createElement("span"); p.className = "comm-ov-who"; const h = document.createElement("span"); h.className = "comm-ov-name"; const u = String(t && t.party_number || "").trim(), m = String(t && t.key || "").trim(), f = u || (/^[\d\s\-+]+$/.test(m) ? m : ""), g = String(t && t.party_name || "").trim() || (f && a ? String(a.get(f) || "").trim() || String(a.get(this._commAnaNormNum(f)) || "").trim() : "") || m; h.textContent = c ? g || "—" : g ? this._commPeerText(g, e) : u ? this._commPhoneText(u, e) : "未知", p.appendChild(h); const y = c ? "" : String(t && (t.location || t.party_place) || "").trim(); if (y) { const e = document.createElement("em"); e.className = "comm-ov-place", e.textContent = y, p.appendChild(e) } if (l.appendChild(p), r && r.length) { const e = document.createElement("span"); e.className = "comm-ana-ov-rowyears", r.forEach(t => { const n = document.createElement("span"); n.className = "comm-ana-ov-year comm-ov-year", n.textContent = t, n.title = `${t} 年有记录`, e.appendChild(n) }), l.classList.add("comm-ov-row-years"), l.appendChild(e) } const b = document.createElement("span"); b.className = "comm-ov-bar"; const x = document.createElement("i"); x.className = "comm-ov-fill"; const _ = Number(t && t[c ? "traffic_usage" : "count"] || 0) / o; x.style.width = `${Math.round(100 * Math.max(0, Math.min(1, _)))}%`, b.appendChild(x), l.appendChild(b); const v = document.createElement("span"); v.className = "comm-ov-val"; const w = Number(t && t.count || 0); if (c) v.textContent = `${this._commDataSize(Number(t && t.traffic_usage || 0))} · ${this._commFmtNum(w)} 次`; else { const e = Number(t && t.duration || 0); v.textContent = `${this._commFmtNum(w)} 条` + (e > 0 ? ` · ${this._commFormatDuration(e)}` : "") } return l.appendChild(v), s && s.run && (l.classList.add("comm-ana-ov-link"), l.title = s.hint, l.addEventListener("click", e => { e.stopPropagation(), s.run() })), l }, _commAnaOverviewJump(e, t, n, o, a) { if (a) { const n = String(o && o.key || "").trim(); return !n || o && o.unnamed ? null : { hint: `看「${n}」的上网记录（切到流量）`, run: () => { t.channel = "流量", this._commAnaTogglePlace(e, { field: "places", value: n }) } } } const i = String(o && o.party_number || "").trim(), r = String(o && o.key || "").trim(), s = i || (/^[\d\s\-+]+$/.test(r) ? r : ""), c = String(o && o.party_name || "").trim() || (s ? "" : r); if (!s && !c) return null; const l = c || s; return { hint: `看「${this._commPeerText(l, e) || l}」的${n}记录（切到${n}，口径不变）`, run: () => this._commAnaGoto(e, { channel: n, peer: { number: s, name: c, label: l } }) } }, _commAnaOverviewMsg(e, t) { const n = document.createElement("div"); n.className = "comm-ana-ov-msg"; const o = String(t && t.party_number || "").trim(), a = String(t && t.party_name || "").trim(), i = document.createElement("span"); i.className = "comm-ana-ov-who", i.textContent = (a ? this._commPeerText(a, e) : "") || (o ? this._commPhoneText(o, e) : "") || "—", n.appendChild(i); const r = document.createElement("span"); r.className = "comm-ana-ov-at", r.textContent = String(t && t.time || "").slice(5, 16), r.title = String(t && t.time || ""), n.appendChild(r); const s = String(t && t.time || "").slice(0, 4); if (/^\d{4}$/.test(s)) { const e = document.createElement("span"); e.className = "comm-ana-ov-year", e.textContent = s, e.title = `${s} 年的记录`, n.appendChild(e) } const c = this._commContentOf(t); return n.appendChild(this._commContentTag(e, c, { time: String(t && t.time || ""), content: c, channel: String(t && t.channel || ""), partyNumber: o, partyName: a })), n }, _commAnaGoChannel(e, t) { const n = this._commAnaState(e); if (!t || n.channel === t) return; n.channel = t, n.data = null; const o = e && e.querySelector(".comm-ana"); o && this._commAnaLoad(e, o, n) }, _commBuildAnalysisPanel(e) { const t = document.createElement("div"); t.className = "comm-panel" + ("analysis" === e._commActiveTab ? " active" : ""), t.dataset.panel = "analysis"; const n = document.createElement("div"); n.className = "comm-body comm-ana", t.appendChild(n); const o = this._commAnaState(e); return this._commAnaPaint(e, n, o), !this._commAnaCfg(e).ready || o.data || o.error || this._commAnaLoad(e, n, o), t }, _commAnaPaint(e, t, n) { const o = this._commAnaCfg(e); if (this._commAnaDispose(t), t.textContent = "", t.classList.toggle("comm-ana-busy", !!n.loading), t.classList.toggle("comm-ana-hero-view", "today" === n.view), !o.ready) return void t.appendChild(this._commEmpty(o.enabled ? "统计分析缺少 API Key：请在卡片配置里补 `key`（本地数据服务的 API Key）" : "未启用统计分析：在卡片配置里加 `analysis: true`（也可填开关实体，如 `analysis: input_boolean.show_page3`）与 `key` 即可显示第三页")); if (t.appendChild(this._commAnaHeader(e, n)), "概览" === n.channel) return void (n.error ? t.appendChild(this._commTipLine(`统计查询失败：${n.error}`)) : t.appendChild(this._commAnaOverviewSection(e, n, n.data))); if (n.error) return void t.appendChild(this._commTipLine(`统计查询失败：${n.error}`)); if (!n.data) return void t.appendChild(this._commTipLine(n.loading ? "正在读取本地通讯库…" : "暂无数据")); const a = n.data; t.appendChild(this._commAnaChart(e, n, a)), t.appendChild(this._commAnaKpi(e, n, a)); const i = this._commAnaRank(e, n, a); i && t.appendChild(i), t.appendChild(this._commAnaMap(e, n, a)), t.appendChild(this._commAnaList(e, n, a)) }, _commAnaHeader(e, t) { const n = document.createElement("div"); n.className = "comm-ana-head"; const o = document.createElement("div"); o.className = "comm-ana-crumbs"; const a = this._commAnaCrumbItems(t, e); a.forEach((t, n) => { if (n) { const e = document.createElement("span"); e.className = "comm-ana-crumb-sep", e.textContent = "›", o.appendChild(e) } const i = n === a.length - 1, r = document.createElement("button"); r.type = "button", r.className = "comm-ana-crumb" + (i ? " current" : ""), r.textContent = t.label, i ? r.disabled = !0 : r.addEventListener("click", n => { n.stopPropagation(), this._commAnaGoto(e, t.to) }), o.appendChild(r) }); const i = document.createElement("button"); i.type = "button", i.className = "comm-ana-swap", i.textContent = "today" === t.view ? "查看全部数据" : "历史上的今天", i.addEventListener("click", n => { n.stopPropagation(), this._commAnaGoto(e, "today" === t.view ? { view: "all", scope: { kind: "all" } } : { view: "today" }) }), o.appendChild(i); const r = document.createElement("button"); if (r.type = "button", r.className = "comm-ana-peer" + (t.peer ? " active" : ""), t.peer) { const n = document.createElement("span"); n.className = "comm-ana-peer-name", n.textContent = this._commPeerText(t.peer.label, e) || t.peer.label, r.appendChild(n); const o = document.createElement("span"); o.className = "comm-ana-peer-clear", o.textContent = "✕", r.title = `点名字可重选 · 点 ✕ 清除「${this._commPeerText(t.peer.label, e) || t.peer.label}」`, r.appendChild(o) } else r.textContent = "查某人", r.title = "按指定的人 / 号码查询（跨渠道、跨时间）"; r.addEventListener("click", n => { n.stopPropagation(), t.peer && n.target && "comm-ana-peer-clear" === n.target.className ? this._commAnaGoto(e, { peer: null, scope: { kind: "all" } }) : this._commAnaPeerPick(e) }), o.appendChild(r); const s = this._commAnaMdBtn(e, t); s && o.appendChild(s); const c = this._commAnaTodayBtn(e, t); c && o.appendChild(c), n.appendChild(o); const l = document.createElement("div"); l.className = "comm-record-tabs"; const d = document.createElement("div"); return d.className = "comm-record-tabs-slot", this._commAnaTabs().forEach(n => { const o = document.createElement("button"); o.type = "button", o.className = "comm-record-tab" + (n.key === t.channel ? " active" : ""), o.textContent = n.key, o.addEventListener("click", a => { a.stopPropagation(), t.channel !== n.key && (t.channel = n.key, t.data = null, this._commAnaLoad(e, o.closest(".comm-ana"), t)) }), d.appendChild(o) }), l.appendChild(d), n.appendChild(l), n }, _commAnaCrumbItems(e, t) { const n = e.peer ? this._commPeerText(e.peer.label, t) || e.peer.label : ""; if ("today" === e.view) { const { md: t, custom: o } = this._commAnaMd(e), a = [{ label: o ? `历年 ${t}` : "历史上的今天", to: { view: "today", peer: null, md: "" } }]; return e.peer && a.push({ label: n, to: {} }), a } const o = [{ label: "全部数据", to: { scope: { kind: "all" }, peer: null } }]; e.peer && o.push({ label: n, to: { scope: { kind: "all" } } }); const a = e.scope || { kind: "all" }; if ("all" === a.kind) return o; const i = String(a.key).slice(0, 4); if (o.push({ label: `${i} 年`, to: { scope: { kind: "year", key: i } } }), "year" === a.kind) return o; const r = String(a.key).slice(0, 7); return o.push({ label: r, to: { scope: { kind: "month", key: r } } }), "month" === a.kind || o.push({ label: String(a.key).slice(5), to: { scope: { kind: "day", key: a.key } } }), o }, _commAnaGoto(e, t) { const n = this._commAnaState(e); t.channel && (n.channel = t.channel), t.view && (n.view = t.view), t.scope && (n.scope = t.scope), "all" === n.view && (n.yearFilter = ""), Object.prototype.hasOwnProperty.call(t, "peer") && (n.peer = t.peer || null), Object.prototype.hasOwnProperty.call(t, "md") && (n.md = String(t.md || "")), n.data = null; const o = e && e.querySelector(".comm-ana"); o && this._commAnaLoad(e, o, n) }, _commAnaPeerPick(e) { if (!this._commAnaCfg(e).ready) return; const t = document.createElement("div"); t.className = "comm-peer-pick"; const n = document.createElement("div"); n.className = "comm-peer-tip", n.textContent = "输入号码或姓名；也可以直接从下面的常用联系人里选", t.appendChild(n); const o = document.createElement("div"); o.className = "comm-peer-row"; const a = document.createElement("input"); a.type = "text", a.className = "comm-peer-input", a.placeholder = "号码 / 姓名", o.appendChild(a); const i = document.createElement("button"); i.type = "button", i.className = "comm-peer-go", i.textContent = "查询", o.appendChild(i), t.appendChild(o); const r = document.createElement("div"); r.className = "comm-peer-msg", t.appendChild(r); const s = document.createElement("div"); s.className = "comm-peer-list", s.textContent = "正在读取常用联系人…", t.appendChild(s); let c = null; const l = (t, n) => { const o = String(n || "").trim() || String(t || "").trim(); c && c(), this._commAnaGoto(e, { peer: { number: String(t || "").trim(), name: String(n || "").trim(), label: o }, scope: { kind: "all" } }) }, d = () => { const t = String(a && a.value || "").trim(); if (!t) return void (r.textContent = "请输入号码或姓名"); const n = /^\d{5,}$/.test(t); r.textContent = "查询中…", this._commAnaReq(e, n ? { type: "contact", party_number: t } : { type: "contact", party_name: t }).then(e => { (e.total || {}).count ? l(n ? t : "", n ? "" : t) : r.textContent = n ? `没有找到号码 ${t} 的记录` : `没有找到「${t}」的记录` }).catch(e => { r.textContent = `查询失败：${e.message}` }) }; i.addEventListener("click", e => { e.stopPropagation(), d() }), a.addEventListener("keydown", e => { "Enter" === e.key && (e.stopPropagation(), d()) }), c = this.showPopup({ className: "comm-peer-popup", showOverlay: !0, showBackground: !0, popupPosition: "center", content: () => t, onClose: () => { c = null } }), this._commAnaReq(e, { type: "parties", limit: 8 }).then(t => { const n = (t.rows || []).filter(e => e && (e.party_number || e.party_name)); s.textContent = "", n.length ? n.forEach(t => { const n = String(t.party_number || "").trim(), o = String(t.party_name || "").trim(), a = document.createElement("button"); a.type = "button", a.className = "comm-peer-item"; const i = document.createElement("span"); i.className = "comm-peer-name", i.textContent = o ? this._commPeerText(o, e) : this._commPhoneText(n, e) || n, o && n && (i.title = this._commPhoneText(n, e)), a.appendChild(i); const r = document.createElement("span"); r.className = "comm-peer-count", r.textContent = `${this._commFmtNum(t.count || 0)} 条`, a.appendChild(r), a.addEventListener("click", e => { e.stopPropagation(), l(n, o) }), s.appendChild(a) }) : s.textContent = "暂无联系人数据" }).catch(e => { s.textContent = `读取联系人失败：${e.message}` }) }, _commAnaDispose(e) { e && e.querySelectorAll && e.querySelectorAll(".comm-ana-canvas, .comm-ana-map-canvas, .comm-trend-canvas").forEach(e => { const t = e._commAnaChart; if (t && "function" == typeof t.dispose) try { t.dispose() } catch (e) { } if (e._commAnaChart = null, "function" == typeof e._commReleasePause) try { e._commReleasePause() } catch (e) { } e._commReleasePause = null }) }, _commAnaBucketLabel(e, t) { const n = String(e || ""); return "year" === t ? n : "month" === t ? `${Number(n.slice(5, 7))}月` : "day" === t ? String(Number(n.slice(8, 10))) : "hour" === t ? `${Number(n)}时` : n }, _commAnaChart(e, t, n) { const o = document.createElement("div"); o.className = "comm-ana-chart"; const a = document.createElement("div"); a.className = "comm-ana-canvas", o.appendChild(a); const i = this._commAnaChannel(t), r = (n.chart && n.chart.rows || []).filter(e => e && e.bucket), s = (n.down && n.down.rows || []).filter(e => e && e.bucket); if (!r.length && !s.length) return a.remove(), o.appendChild(this._commTipLine("这个范围内没有记录。")), o; const c = n.gran || "year", l = [...new Set([...r, ...s].map(e => String(e.bucket)))].sort(), d = new Map(r.map(e => [String(e.bucket), e])), p = new Map(s.map(e => [String(e.bucket), e])), h = "流量" === i.key, u = h && [...r, ...s].some(e => void 0 !== e.traffic_usage), m = u ? "traffic_usage" : "count", f = (e, t) => Number((e.get(t) || {})[m]) || 0, g = u ? Math.max(0, ...l.map(e => Math.abs(f(d, e))), ...l.map(e => Math.abs(f(p, e)))) : 0, y = u && g >= 1e3, b = u ? y ? "（GB）" : "（MB）" : "", x = [{ name: (i.up || "全部") + b, type: "bar", stack: "ana", barMaxWidth: 18, data: l.map(e => f(d, e)), itemStyle: { color: "#4A90E2", borderRadius: [3, 3, 0, 0] } }]; i.down && x.push({ name: i.down + b, type: "bar", stack: "ana", barMaxWidth: 18, data: l.map(e => -f(p, e)), itemStyle: { color: "#50E3C2", borderRadius: [0, 0, 3, 3] } }); const _ = { grid: { left: 4, right: 8, top: 22, bottom: 2, containLabel: !0 }, legend: { show: !0, top: 0, right: 0, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10, color: "#8a8a8a" } }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: e => { const t = l[e && e[0] && e[0].dataIndex || 0], n = [`<b>${this._commAnaBucketLabel(t, c)}</b>`]; return [[i.up, d.get(t)], [i.down, p.get(t)]].forEach(([e, t]) => { if (!e || !t) return; if (h) { const o = void 0 !== t.traffic_usage ? `${this._commDataSize(t.traffic_usage)} · ` : ""; return void n.push(`${e}：${o}${t.count || 0} 条`) } const o = t.duration ? ` · ${this._commFormatDuration(t.duration)}` : ""; n.push(`${e}：${t.count || 0} 条${o}`) }), n.push('<span style="opacity:.6">点击可下钻</span>'), n.join("<br>") } }, xAxis: { type: "category", data: l.map(e => this._commAnaBucketLabel(e, c)), axisLabel: { fontSize: 10, color: "#8a8a8a", interval: "auto" }, axisLine: { lineStyle: { color: "rgba(0,0,0,0.12)" } }, axisTick: { show: !1 } }, yAxis: { type: "value", axisLabel: { fontSize: 10, color: "#8a8a8a", formatter: e => { const t = Math.abs(Number(e)) || 0; if (!u) return t; const n = y ? t / 1024 : t; return `${n >= 10 || Number.isInteger(n) ? Math.round(n) : Math.round(10 * n) / 10} ${y ? "GB" : "MB"}` } }, splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } } }, series: x }; return this._loadEchartsUnified().then(t => { if (!a.isConnected || !e.isConnected) return; const n = t.init(a); a._commAnaChart = n, n.setOption(_), n.on("click", t => { t && void 0 !== t.dataIndex && this._commAnaDrill(e, l[t.dataIndex]) }); const o = new ResizeObserver(() => { if (a.isConnected) try { n.resize() } catch (e) { } else o.disconnect() }); o.observe(a) }).catch(() => { a.remove(), o.appendChild(this._commTipLine("图表组件未加载，无法绘制统计图（可检查 echarts.min.js）。")) }), h && !u && o.appendChild(this._commTipLine("流量按使用量统计需要后端返回 traffic_usage（当前统计接口未返回），暂按条数显示。")), o }, _commAnaKpi(e, t, n) { const o = this._commAnaChannel(t), a = n.chart && n.chart.total || {}, i = n.down && n.down.total || {}, r = { count: (a.count || 0) + (i.count || 0), duration: (a.duration || 0) + (i.duration || 0), cost: (a.cost || 0) + (i.cost || 0), party_count: Math.max(a.party_count || 0, i.party_count || 0), active_days: Math.max(a.active_days || 0, i.active_days || 0) }, s = "流量" === t.channel, c = (a.traffic_usage || 0) + (i.traffic_usage || 0), l = this._commAnaFlowPlaces(t, n).filter(e => e && e.key && !e.unnamed), d = document.createElement("div"); d.className = "comm-mini-grid"; const p = e => [[o.up, e(a)], [o.down, e(i)]].filter(([e, t]) => e && t); if (s ? d.appendChild(this._commMini("条数", `${this._commFmtNum(r.count || 0)} 条`, { title: "点击查看上网会话概览", onClick: t => this._commMiniBubble(t, "上网会话概览", [["会话次数", `${this._commFmtNum(r.count || 0)} 次`], ["有上网的天数", r.active_days ? `${this._commFmtNum(r.active_days)} 天` : ""], ["单次平均", r.count && c ? this._commDataSize(c / r.count) : ""], ["日均", r.active_days && c ? this._commDataSize(c / r.active_days) : ""]], e) })) : d.appendChild(this._commMini("条数", `${this._commFmtNum(r.count || 0)} 条`, { title: "点击查看分方向的条数", onClick: t => this._commMiniBubble(t, "条数构成", p(e => e.count ? `${this._commFmtNum(e.count)} 条` : ""), e) })), s) d.appendChild(this._commMini("流量", c > 0 ? this._commDataSize(c) : "—", l.length ? { title: "点击查看各地点的流量", onClick: t => this._commMiniBubble(t, "各地点的流量", l.map(e => [e.key, `${this._commDataSize(e.traffic_usage || 0)} · ${this._commFmtNum(e.count || 0)} 次`]), e) } : { title: "该范围上网流量合计（traffic_usage，单位 MB）；没有带地点的记录，无法按地点拆" })); else { const n = "语音" === t.channel && r.duration > 0; d.appendChild(this._commMini("时长", n ? this._commFormatDuration(r.duration) : "—", n ? { title: "点击查看分方向的时长", onClick: t => this._commMiniBubble(t, "时长构成", p(e => e.duration ? this._commFormatDuration(e.duration) : ""), e) } : {})) } if (d.appendChild(this._commMini("金额", `${this._commFmtNum(r.cost || 0)} 元`, r.cost ? { title: "点击查看分方向的金额", onClick: t => this._commMiniBubble(t, "金额构成", p(e => e.cost ? `${this._commFmtNum(e.cost)} 元` : ""), e) } : {})), s) d.appendChild(this._commMini("地点", l.length ? `${l.length} 个` : "—", l.length ? { title: "点击查看各地点的活跃度", onClick: t => this._commMiniBubble(t, "地点活跃度", l.map(e => [e.key, `${this._commFmtNum(e.count || 0)} 次` + (e.active_days ? ` · ${this._commFmtNum(e.active_days)} 天` : "") + (e.traffic_usage ? ` · ${this._commDataSize(e.traffic_usage)}` : "")]), e) } : {})); else { const t = n.rank && n.rank.rows || [], o = (n.rank && n.rank.rows ? n.rank.rows.length : 0) || n.rank && n.rank.total_keys || 0, a = o || t.length, i = new Map; (n.list && n.list.rows || []).forEach(e => { const t = String(e && e.party_number || "").trim(), n = String(e && e.party_name || "").trim(); t && n && !i.has(t) && i.set(t, n) }), d.appendChild(this._commMini("联系人", a ? `${this._commFmtNum(a)} 人` : "—", t.length ? { title: "点击查看联系人排行", onClick: n => { const a = t.slice(0, 10).map((t, n) => { const o = String(t.party_number || "").trim(), a = String(t.party_name || "").trim() || i.get(o) || String(t.key || "").trim(), r = a ? this._commPeerText(a, e) : o ? this._commPhoneText(o, e) : "未知", s = [`${this._commFmtNum(t.count || 0)} 条`]; return t.duration && s.push(this._commFormatDuration(t.duration)), t.cost && s.push(`${this._commFmtNum(t.cost)} 元`), [`${n + 1}. ${r}`, s.join(" · ")] }); this._commMiniBubble(n, o ? `联系人 · 共 ${this._commFmtNum(o)} 人` : `联系人 · Top ${t.length}`, a, e) } } : { title: o ? "该范围的联系人数（暂无排行数据）" : "该范围没有可识别的联系人" })) } return d }, _commAnaRank(e, t, n) { if (t.peer) return null; if (!this._commAnaRankNeeded(t)) return null; const o = this._commAnaRankBy(t), a = "语音" === t.channel, i = n.rank && n.rank.rows || [], r = n.rankPeers && n.rankPeers.rows || [], s = this._commRankN(e), c = this._commAnaRankMerge(o, i, r, 0), l = c.length, d = s > 0 ? c.slice(0, s) : c, p = document.createElement("div"); p.className = "comm-ana-rank"; const h = "today" === t.view ? "历年今日联系排行" : "联系排行", u = s > 0 && l > s ? ` · 共 ${this._commFmtNum(l)} 人` : "", m = this._commSubTitle(`${h}${s ? ` Top${s}` : ""}${u}`); if (m.appendChild(this._commRankNToggle(e, () => this._commAnaReload(e))), a) { const n = document.createElement("button"); n.type = "button", n.className = "comm-ana-rank-by", n.textContent = "duration" === o ? "按时长" : "按条数", n.title = "duration" === o ? "当前按时长排序，点击改为按条数" : "当前按条数排序，点击改为按时长", n.addEventListener("click", n => { n.stopPropagation(), t.rankBy = "duration" === o ? "count" : "duration", this._commAnaReload(e) }), m.appendChild(n) } p.appendChild(m); const f = document.createElement("div"); return f.className = "comm-ana-rank-box", d.forEach((t, n) => { const a = t.num, i = t.name, r = i ? this._commPeerText(i, e) : a ? this._commPhoneText(a, e) : "未知", s = i ? { number: "", name: i } : { number: a, name: "" }, c = document.createElement("button"); c.type = "button", c.className = "comm-ana-rank-item"; const l = t.numbers.length > 1 ? `${t.numbers.length} 个号码 · ` : ""; c.title = i ? `${this._commNameText(i, e)} · ${l}点击查看档案` : a ? `${this._commPhoneText(a, e)} · 点击查看档案` : "点击查看档案"; const d = document.createElement("span"); d.className = "comm-ana-rank-no", d.textContent = String(n + 1), c.appendChild(d); const p = document.createElement("span"); p.className = "comm-ana-rank-name", p.textContent = r, c.appendChild(p); const h = document.createElement("span"); h.className = "comm-ana-rank-val"; const u = `${this._commFmtNum(t.count || 0)} 条`, m = t.duration ? this._commFormatDuration(t.duration) : ""; h.textContent = "duration" === o ? m ? `${m} · ${u}` : u : m ? `${u} · ${m}` : u, c.appendChild(h), c.addEventListener("click", t => { t.stopPropagation(), (a || i) && this._commAnaGoto(e, { peer: Object.assign({ label: i || this._commPhoneText(a, e) || a }, s), scope: { kind: "all" } }) }); const g = document.createElement("span"); g.className = "comm-ana-rank-info", g.title = "查看该联系人的档案（总量 / 首末 / 平均间隔）"; const y = document.createElement("ha-icon"); y.setAttribute("icon", "mdi:information-outline"), g.appendChild(y), g.addEventListener("click", t => { t.stopPropagation(); const n = i || a; n && this._commAnaOpenContact(e, g, n, i) }), c.appendChild(g), f.appendChild(c) }), p.appendChild(f), p }, _commAnaRankMerge(e, t, n, o) { const a = new Map; (n || []).forEach(e => { const t = String(e && e.party_name || "").trim(), n = String(e && e.party_number || "").trim(); if (!t || !n) return; a.has(t) || a.set(t, []); const o = a.get(t); o.indexOf(n) < 0 && o.push(n) }); const i = new Map; (t || []).forEach(e => { if (!e) return; const t = String(e.key || e.party_name || "").trim(); t && i.set(`n:${t}`, { name: t, num: "", numbers: a.get(t) || [], count: Number(e.count) || 0, duration: Number(e.duration) || 0, cost: Number(e.cost) || 0 }) }), (n || []).forEach(e => { const t = String(e && e.party_name || "").trim(), n = String(e && e.party_number || "").trim(); if (t || !n) return; const o = `p:${n}`; i.has(o) || i.set(o, { name: "", num: n, numbers: [n], count: Number(e.count) || 0, duration: Number(e.duration) || 0, cost: Number(e.cost) || 0 }) }); const r = "duration" === e ? "duration" : "count", s = [...i.values()].sort((e, t) => t[r] - e[r] || t.count - e.count), c = Number(o); return c > 0 ? s.slice(0, c) : s }, _commAnaRankBy: e => "duration" !== e.rankBy ? "count" : "语音" === e.channel ? "duration" : "count", _commAnaRankNeeded: e => "流量" !== e.channel, _commAnaMdBtn(e, t) { if (!t || "today" !== t.view) return null; const { md: n, custom: o } = this._commAnaMd(t), a = document.createElement("button"); return a.type = "button", a.className = "comm-ana-peer comm-ana-md" + (o ? " active" : ""), a.textContent = o ? n : "日期", a.title = o ? `当前看的是历年 ${n}，点击换一个月日（点面包屑「历史上的今天」回到今天）` : "指定月日，看历史上那一天都发生过什么", a.addEventListener("click", o => { o.stopPropagation(); let i = null; const r = this._commDayPicker(n, n => { t.md = n, this._commAnaReload(e) }, () => { i && i.close && i.close() }); i = this._commMiniBubble(a, `选择月日 · 当前 ${n}`, r, e, "bottom") }), a }, _commAnaTodayBtn(e, t) { if (!t || "today" !== t.view) return null; const { md: n, custom: o } = this._commAnaMd(t); if (!o || n === this._commAnaTodayMd()) return null; const a = document.createElement("button"); return a.type = "button", a.className = "comm-ana-peer comm-ana-today", a.textContent = "今日", a.title = `回到今天（${this._commAnaTodayMd()}）`, a.addEventListener("click", n => { n.stopPropagation(), t.md = "", this._commAnaReload(e) }), a }, _commAnaScopeLabel(e) { if ("today" === e.view) { const { md: t, custom: n } = this._commAnaMd(e); return n ? `历年 ${t}` : `历年今日（${t}）` } const t = e.scope || { kind: "all" }; return "year" === t.kind ? `${t.key} 年` : "month" === t.kind || "day" === t.kind ? String(t.key) : "全部数据" }, _commAnaTodayMd() { const e = new Date; return `${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}` }, _commAnaMd(e) { const t = String(e && e.md || "").trim(); return /^\d{2}-\d{2}$/.test(t) ? { md: t, custom: !0 } : { md: this._commAnaTodayMd(), custom: !1 } }, _commAnaList(e, t, n) { if ("today" !== t.view) return this._commAnaSummary(e, t, n); const o = n.list && n.list.rows || [], a = n.list && n.list.total || o.length, i = e => String(e && e.time || "").slice(0, 4), r = [...new Set(o.map(i).filter(Boolean))].sort().reverse(), s = r.length > 1, c = document.createElement("div"); c.className = "comm-ana-list"; const l = this._commAnaScopeLabel(t), d = this._commAnaScopeYears(t, n), p = o.length < a ? `显示最近 ${o.length} / 共 ${this._commFmtNum(a)} 条` : `共 ${o.length} 条`, h = d.length > 1 && r.length && r.length < d.length ? ` · 仅 ${r.join(" / ")} 年` : "", u = "流量" === String(t.channel || ""), m = u ? ` · ${this._commAnaDayGroups(o).length} 天（按日折叠）` : "", f = this._commSubTitle(`明细 · ${l} · ${p}${h}${m}`), g = this._commAnaYearChips(e, t, n); g && f.appendChild(g), c.appendChild(f); const y = this._commAnaFilterBar(e, t, o, a); y && c.appendChild(y); const b = []; o.forEach(e => { const t = i(e), n = b[b.length - 1]; n && n.year === t ? n.rows.push(e) : b.push({ year: t, rows: [e] }) }); const x = document.createElement("div"); return x.className = "comm-ana-rows", b.forEach(t => { s && t.year && x.appendChild(this._commAnaYearHead(t.year, u ? this._commAnaGroupSum(t.rows) : null)), u ? this._commAnaDayGroups(t.rows).forEach(t => { const n = this._commAnaDayRow(e, t); x.appendChild(n.row), x.appendChild(n.box) }) : t.rows.forEach(t => x.appendChild(this._commAnaRow(t, e))) }), c.appendChild(x), c }, _commAnaSummary(e, t, n) { const o = this._commAnaChannel(t), a = this._commAnaGranularity(t), i = (n.list && n.list.rows || []).filter(e => e && Number(e.count) > 0).sort((e, t) => String(t.bucket).localeCompare(String(e.bucket))), r = document.createElement("div"); r.className = "comm-ana-list"; const s = { year: "按年", month: "按月", day: "按日", hour: "按小时" }[a] || ""; r.appendChild(this._commSubTitle(`汇总 · ${this._commAnaScopeLabel(t)} · ${s} · ${i.length} 项`)); const c = this._commAnaFilterBar(e, t, i, n.list && n.list.total || 0); if (c && r.appendChild(c), !i.length) return r.appendChild(this._commTipLine("该范围没有记录。")), r; const l = e => "流量" === o.key ? this._commDataSize(e.traffic_usage || 0) : "语音" === o.key && e.duration ? this._commFormatDuration(e.duration) : "", d = new Map(((n.chart || {}).rows || []).map(e => [String(e.bucket), e])), p = new Map(((n.down || {}).rows || []).map(e => [String(e.bucket), e])), h = "流量" === o.key ? "流量" : "", u = ["1fr"]; o.down && u.push("auto", "auto"), u.push("auto"), h && u.push("auto"); const m = document.createElement("div"); m.className = "comm-ana-sum-table", m.style && m.style.setProperty && m.style.setProperty("--comm-sum-cols", u.join(" ")); const f = (e, t, n, o) => { const a = document.createElement("div"); n && (a.className = n); const i = document.createElement("span"); if (i.className = "comm-ana-sum-main", i.textContent = t, a.appendChild(i), o) { const e = document.createElement("span"); e.className = "comm-ana-sum-sub", e.textContent = o, a.appendChild(e) } return e.appendChild(a), a }, g = document.createElement("div"); g.className = "comm-ana-sum-head"; const y = [{ year: "年份", month: "月份", day: "日期", hour: "时段" }[a] || "时间"]; o.down && y.push(o.up, o.down), y.push("合计"), h && y.push(h), y.forEach(e => { const t = document.createElement("div"); t.textContent = e, g.appendChild(t) }), m.appendChild(g); const b = "语音" === o.key && i.some(e => Number(e.duration) > 0), x = (e, t) => { const n = Number((e.get(t) || {}).duration) || 0; return n ? this._commFormatDuration(n) : "" }, _ = "hour" !== a; if (i.forEach(t => { const n = String(t.bucket || ""), i = this._commAnaBucketFull(n, a), r = document.createElement("div"); r.className = "comm-ana-sum-tr" + (_ ? " drill" : ""), f(r, i), o.down && (f(r, this._commFmtNum(Number((d.get(n) || {}).count) || 0), "up", b ? x(d, n) : ""), f(r, this._commFmtNum(Number((p.get(n) || {}).count) || 0), "down", b ? x(p, n) : "")), f(r, this._commFmtNum(t.count || 0), "total", b && Number(t.duration) ? this._commFormatDuration(t.duration) : ""), h && f(r, l(t)), _ && (r.title = `查看 ${i} 的下一层`, r.addEventListener("click", t => { t.stopPropagation(), this._commAnaDrill(e, n) })), m.appendChild(r) }), i.length > 1) { const e = e => String(e.bucket), t = (t, n) => t.get(e(n)) || {}, n = e => i.reduce((t, n) => t + (Number(e(n)) || 0), 0), a = document.createElement("div"); a.className = "comm-ana-sum-total", f(a, "总计"), o.down && (f(a, this._commFmtNum(n(e => t(d, e).count)), "up", b ? this._commFormatDuration(n(e => t(d, e).duration)) : ""), f(a, this._commFmtNum(n(e => t(p, e).count)), "down", b ? this._commFormatDuration(n(e => t(p, e).duration)) : "")), f(a, this._commFmtNum(n(e => e.count)), "total", b ? this._commFormatDuration(n(e => e.duration)) : ""), h && f(a, this._commDataSize(n(e => e.traffic_usage))), m.appendChild(a) } return r.appendChild(m), n.dayDetail && r.appendChild(this._commAnaDayRecords(e, t, n.dayDetail)), r }, _commAnaDayRecords(e, t, n) { const o = n && n.rows || [], a = Number(n && n.total || 0) || o.length, i = String((t.scope || {}).key || ""), r = t.peer ? this._commPeerText(t.peer.label, e) || t.peer.label : "", s = r ? `「${r}」` : "", c = document.createElement("div"); c.className = "comm-ana-list"; const l = o.length < a ? `显示最近 ${o.length} / 共 ${this._commFmtNum(a)} 条` : `共 ${o.length} 条`; if (c.appendChild(this._commSubTitle(`逐条记录 · ${i} ${s}· ${l}`)), !o.length) return c.appendChild(this._commTipLine("这一天没有记录。")), c; const d = document.createElement("div"); return d.className = "comm-ana-rows", o.forEach(t => d.appendChild(this._commAnaRow(t, e))), c.appendChild(d), c }, _commAnaBucketFull(e, t) { const n = String(e || ""); return "year" === t ? `${n} 年` : "hour" === t ? `${Number(n)} 时` : n }, _commAnaYearHead(e, t) { const n = document.createElement("div"); n.className = "comm-ana-year"; const o = document.createElement("span"); if (o.className = "comm-ana-year-label", o.textContent = `${e} 年`, n.appendChild(o), t) { const e = document.createElement("span"); e.className = "comm-ana-year-sum", e.textContent = this._commAnaTrafficSumText(t), n.appendChild(e) } return n }, _commAnaDayGroups(e) { const t = []; return (e || []).forEach(e => { const n = e || {}, o = String(n.time || n.datetime || "").slice(0, 10); let a = t[t.length - 1]; a && a.day === o || (a = { day: o, rows: [], mb: 0, seconds: 0 }, t.push(a)), a.rows.push(e), a.mb += Number(null != n.traffic_usage ? n.traffic_usage : n.volume_mb) || 0, a.seconds += Number(null != n.duration ? n.duration : n.duration_seconds) || 0 }), t }, _commAnaGroupSum(e) { const t = { mb: 0, seconds: 0, rows: e || [] }; return (e || []).forEach(e => { t.mb += Number(e && e.traffic_usage || 0) || 0, t.seconds += Number(e && e.duration || 0) || 0 }), t }, _commAnaTrafficSumText(e) { const t = [this._commDataSize(e && e.mb || 0)]; return e && e.seconds && t.push(this._commFormatDuration(e.seconds)), t.push(`${this._commFmtNum((e && e.rows || []).length)} 条`), t.join(" · ") }, _commAnaDayRow(e, t, n) { const o = document.createElement("button"); o.type = "button", o.className = "comm-ana-dayrow", o.title = `展开 ${t.day} 的逐条记录`; const a = document.createElement("ha-icon"); a.className = "comm-ana-dayrow-caret", a.setAttribute("icon", "mdi:chevron-right"), o.appendChild(a); const i = document.createElement("span"); i.className = "comm-ana-dayrow-day", i.textContent = t.day, o.appendChild(i); const r = document.createElement("span"); r.className = "comm-ana-dayrow-val", r.textContent = this._commAnaTrafficSumText(t), o.appendChild(r); const s = document.createElement("div"); s.className = "comm-ana-dayrows"; const c = "function" == typeof n ? n : t => this._commAnaRow(t, e); return t.rows.forEach(e => s.appendChild(c(e))), o.addEventListener("click", e => { e.stopPropagation(), (() => { const e = o.classList.toggle("open"); s.classList.toggle("open", e), o.title = `${e ? "收起" : "展开"} ${t.day} 的逐条记录` })() }), { row: o, box: s } }, _commAnaScopeYears(e, t) { const n = (e.scope || { kind: "all" }).kind; if ("today" !== e.view && "all" !== n) return []; const o = (t.years && t.years.rows || []).map(e => String(e && e.bucket || "")).filter(e => /^\d{4}$/.test(e)); return [...new Set(o)].sort().reverse() }, _commAnaYearChips(e, t, n) { const o = this._commAnaScopeYears(t, n); if (o.length < 2) return null; const a = document.createElement("span"); return a.className = "comm-ana-years", o.forEach(n => { const o = document.createElement("button"); o.type = "button", o.className = "comm-ana-year-chip" + (t.yearFilter === n ? " active" : ""), o.textContent = n, o.title = t.yearFilter === n ? `取消 ${n} 年筛选` : `只看 ${n} 年的明细`, o.addEventListener("click", t => { t.stopPropagation(), this._commAnaToggleYear(e, n) }), a.appendChild(o) }), a }, _commAnaToggleYear(e, t) { const n = this._commAnaState(e); n.yearFilter = n.yearFilter === t ? "" : t, this._commAnaReload(e) }, _commAnaTogglePlace(e, t) { const n = this._commAnaState(e), o = !(!t || !n.placeFilter || n.placeFilter.field !== t.field || n.placeFilter.value !== t.value); n.placeFilter = o || !t ? null : t, this._commAnaReload(e) }, _commAnaReload(e) { const t = e && e.querySelector(".comm-ana"); t && this._commAnaLoad(e, t, this._commAnaState(e)) }, _commAnaFilterBar(e, t, n, o) { const a = []; if (t.yearFilter && a.push(`${t.yearFilter} 年`), t.placeFilter && t.placeFilter.value) { const e = "party_places" === t.placeFilter.field ? "对方归属地" : "通讯地点"; a.push(`${e} ${t.placeFilter.value}`) } if (!a.length) return null; const i = document.createElement("div"); i.className = "comm-filter-bar"; const r = document.createElement("span"); r.className = "comm-filter-text"; const s = n.length; r.textContent = `${a.join(" · ")} · ${s}${o && o > s ? ` / 共 ${this._commFmtNum(o)} 条` : " 条"}`, i.appendChild(r); const c = document.createElement("button"); return c.type = "button", c.className = "comm-filter-clear", c.textContent = "清除筛选", c.title = `当前筛选：${a.join(" · ")}`, c.addEventListener("click", n => { n.stopPropagation(), t.yearFilter = "", t.placeFilter = null, this._commAnaReload(e) }), i.appendChild(c), i }, _commAnaToLegacyCall(e) { const t = e || {}; return { call_time: t.time, time: t.time, type: t.msg_type, channel: t.channel, location: t.location, location_coordinate: t.location_coordinate, number_location: t.party_place, number_location_coordinate: t.party_coordinate, number_isp: t.party_isp, phone_number: t.party_number, party_name: t.party_name, my_number: t.my_number, duration: t.duration, fee: t.cost } }, _commGeoGraphFromApi(e, t) { const n = (e && e.cities || []).map(e => ({ name: String(e && e.name || ""), coord: this._commCoord(e && e.coord), count: Number(e && e.count || 0), mine: Number(e && e.mine || 0), other: Number(e && e.other || 0) })).filter(e => e.name && e.coord); return { cities: n, flows: (e && e.flows || []).map(e => ({ from: String(e && e.from || ""), to: String(e && e.to || ""), fromCoord: this._commCoord(e && e.fromCoord), toCoord: this._commCoord(e && e.toCoord), dir: "in" === (e && e.dir) ? "in" : "out", count: Number(e && e.count || 0), seconds: Number(e && e.seconds || 0), calls: [] })).filter(e => e.fromCoord && e.toCoord), missing: Number(e && e.missing || 0), tones: this._commPlaceToneMap(t && t.length ? t : n.map(e => ({ location: e.name }))) } }, _commAnaMapAnim: e => !(!e || !0 !== e._commAnaMapAnim), _commAnaMapFs: e => !(!e || !0 !== e._commAnaMapFs), _commAnaAnimToggle(e) { const t = this._commAnaMapAnim(e), n = document.createElement("button"); n.type = "button", n.className = "comm-ana-anim-toggle" + (t ? " active" : ""), n.dataset.on = t ? "1" : "0"; const o = document.createElement("span"); o.className = "comm-ana-anim-dot", n.appendChild(o); const a = document.createElement("span"); return a.textContent = "动画", n.appendChild(a), n.title = t ? "当前显示流向动画，点击改静态（更省 CPU）" : "当前为静态地图，点击播放流向 / 涟漪动画", n.addEventListener("click", t => { t.stopPropagation(), e._commAnaMapAnim = !this._commAnaMapAnim(e), this._commAnaReload(e) }), n }, _commAnaMap(e, t, n) { const o = document.createElement("div"); o.className = "comm-ana-map"; const a = n.map || {}, i = this._commGeoGraphFromApi(a); if (!i.cities.length) return o.appendChild(this._commTipLine("当前范围没有带坐标的记录，无法绘制地图。")), o; const r = this._commAnaMapAnim(e), s = document.createElement("div"); s.className = "comm-map-canvas comm-ana-map-canvas", s.dataset.rmPassiveExempt = "1", this._commAnaMapFs(e) && o.classList.add("map-fullscreen"); const c = this._commSubTitle("通话地图"); c.appendChild(this._commAnaAnimToggle(e)), c.appendChild(this._commMapFullscreenBtn(o, s, t => { e._commAnaMapFs = t }, e)), o.appendChild(c), o.appendChild(s); const l = document.createElement("div"); l.className = "comm-map-legend"; const d = Number(a.total_records || 0), p = [`${i.cities.length} 个地点`, `${i.flows.length} 条流向`]; return d && p.push(`来自 ${d} 条记录`), p.push("点地点即筛选明细"), i.missing && p.unshift(`${i.missing} 条缺坐标未上图`), l.textContent = p.join(" · "), o.appendChild(l), this._loadEchartsUnified().then(e => this._commLoadChinaMap(e).then(() => e)).then(t => { if (!s.isConnected || !e.isConnected) return; const n = t.init(s, null, this._commMapInitOpts()); s._commAnaChart = n, s._commReleasePause = this._commMapAutoPause(n, s), n.setOption(this._commMigrationOption(i, i.tones, "location", null, e._commAnaMapView, r)); let o = 0; n.on("georoam", () => { const t = Date.now(); if (t - o < 200) return; if (o = t, n.isDisposed()) return; const a = (n.getOption().geo || [])[0] || {}; void 0 !== a.zoom && (e._commAnaMapView = { zoom: a.zoom, center: a.center }) }), n.on("click", t => this._commAnaMapClick(e, i, t)); const a = new ResizeObserver(() => { if (s.isConnected) try { n.resize() } catch (e) { } else a.disconnect() }); a.observe(s) }).catch(() => { s.remove(), o.appendChild(this._commTipLine("地图组件未加载，无法绘制通话地图（可检查 echarts / china.js）。")) }), o }, _commAnaMapClick(e, t, n) { if (n) { if ("geo" === n.componentType) { const o = this._commCitiesInProvince(t, n.name), a = o.filter(e => e.mine).map(e => e.name), i = o.filter(e => e.other).map(e => e.name), r = !a.length && i.length, s = r ? i : a; return void (s.length && this._commAnaTogglePlace(e, { field: r ? "party_places" : "places", value: s.join(",") })) } if ("通话地点" === n.seriesName) { const o = String(n.data && n.data.name || n.name || "").trim(); if (!o) return; const a = t.cities.find(e => e.name === o), i = !!a && !a.mine && !!a.other; this._commAnaTogglePlace(e, { field: i ? "party_places" : "places", value: o }) } } }, _commAnaDir(e) { const t = String(e || ""); return /接听|接收|收到|来信|被叫|来电|呼入/.test(t) ? "in" : /呼叫|发送|发出|发信|主叫|呼出|去电/.test(t) ? "out" : "" }, _commAnaRow(e, t) { const n = document.createElement("div"); n.className = "comm-ana-row"; const o = String(e && e.time || ""), a = document.createElement("span"); a.className = "comm-ana-row-time", a.textContent = o.slice(0, 16), a.title = o, n.appendChild(a); const i = document.createElement("span"); i.className = "comm-ana-row-tag " + (this._commAnaDir(e && e.msg_type) || "mid"), i.textContent = e && (e.msg_type || e.channel) || "", n.appendChild(i); const r = document.createElement("span"); r.className = "comm-ana-row-peer"; const s = String(e && e.party_number || "").trim(), c = String(e && e.party_name || "").trim(); r.textContent = (c ? this._commPeerText(c, t) : "") || (s ? this._commPhoneText(s, t) : e && e.traffic_type || e && e.location || "") || "—", n.appendChild(r); const l = document.createElement("span"); if (l.className = "comm-ana-row-val", "流量" === String(e && e.channel || "")) { const t = this._commDataSize(e && e.traffic_usage || 0), n = e && e.duration ? this._commFormatDuration(e.duration) : ""; l.textContent = n ? `${t} · ${n}` : t, l.title = n ? `${t} · 上网时长 ${n}` : t } else e && e.duration ? l.textContent = this._commFormatDuration(e.duration) : e && e.cost && (l.textContent = `${this._commFmtNum(e.cost)} 元`); n.appendChild(l); const d = this._commContentOf(e); return d && n.appendChild(this._commContentTag(t, d, { time: o, content: d, channel: String(e && e.channel || ""), partyNumber: s, partyName: String(e && e.party_name || "").trim() })), n }, _commContentOf: e => e && "object" == typeof e ? String(e.content || e["内容"] || "").trim() : "", _commContentTag(e, t, n) { if (!t) return null; const o = document.createElement("button"); return o.type = "button", o.className = "comm-content-tag", o.textContent = this._commContentPreview(t, e) || "内容", o.title = "点击打开聊天窗口", o.addEventListener("click", t => { t.stopPropagation(), this._commChatOpen(e, n || {}) }), o }, _commContentPreview(e, t) { const n = String(e || "").replace(/\s+/g, " ").trim(); return n ? t && !1 === t._commPhoneMasked ? n.length > 10 ? `${n.slice(0, 10)}…` : n : n.length > 2 ? `${n.slice(0, 2)}***` : `${n}***` : "" }, _commChatOpen(e, t) { if (!this._commAnaCfg(e).ready) return; const n = t || {}, o = String(n.partyNumber || "").trim(), a = String(n.partyName || "").trim(); if (!o && !a) return; const i = a || this._commPhoneText(o, e) || "聊天记录", r = String(n.time || "").trim(), s = { channel: String(n.channel || "").trim(), empty: "boolean" == typeof (e && e._commChatEmpty) ? e._commChatEmpty : "微信" === String(n.channel || "").trim(), anchor: "", focus: r, focusContent: String(n.content || ""), peerNum: o, peerName: a, before: 0, after: 0, lastTime: "", earliest: "", fillTries: 0, total: 0, loading: !1, doneBefore: !1, doneAfter: !1, byFirst: !1, atFirst: !1, days: new Set, byChannel: null, dayCache: new Map, periodsCache: new Map, seeded: !1 }; let c = null, l = null, d = null, p = null, h = null, u = null, m = null; const f = () => a ? { party_names: a } : { party_numbers: o }, g = (e, t) => { const n = { type: "chat", mode: "detail", ...f(), limit: 30, fields: "time,msg_type,channel,content,duration,cost,party_name,party_number" }; if ("after" === e) { n.order = "asc", n.offset = s.after; const e = this._commChatNextSecond(s.lastTime); e && (n.start = e) } else if ("first" === e) n.order = "asc", n.offset = 0; else if (n.order = "desc", n.offset = s.before, s.anchor && t) { let e = `${s.anchor} 00:00:00`, t = `${s.anchor} 23:59:59`; if (/^\d{4}-\d{2}-\d{2}$/.test(s.anchor)) { const n = e => String(e).padStart(2, "0"), o = e => `${e.getFullYear()}-${n(e.getMonth() + 1)}-${n(e.getDate())}`, a = new Date(`${s.anchor}T00:00:00`), i = new Date(a); i.setDate(i.getDate() - 1); const r = new Date(a); r.setDate(r.getDate() + 1), e = `${o(i)} 00:00:00`, t = `${o(r)} 23:59:59` } n.start = e, n.end = t, n.limit = 0 } else if (s.anchor) { const e = this._commChatPrevSecond(s.earliest || `${s.anchor} 00:00:00`); e && (n.end = e) } else s.focus && (n.end = s.focus); return s.channel && (n.channels = s.channel), s.empty && (n.empty_content = 0), n }, y = (e, t) => { l && (l.textContent = e, l.classList.toggle("busy", !!t)) }, b = () => { if (!d) return; const e = s.empty ? "已过滤空内容 · " : "", t = s.byChannel || []; if (!t.length) return void (d.textContent = s.total ? `${e}共 ${this._commFmtNum(s.total)} 条` : ""); const n = t.reduce((e, t) => e + Number(t.count || 0), 0); d.textContent = `${e}共 ${this._commFmtNum(n)} 条 · ` + t.map(e => `${e.key} ${this._commFmtNum(e.count)}`).join(" · ") }, x = () => s.empty && !s.before ? " · 正文为空的消息已过滤（点顶栏「过滤空内容」可显示全部）" : "", _ = () => { if (s.doneBefore && s.doneAfter) return void y("已到最早 / 最晚" + x(), !1); if (s.doneBefore && s.atFirst && !s.doneAfter && s.before) return void y(`已到最早 · 共 ${this._commFmtNum(s.before)} 条 · 下滑看更晚` + x(), !1); if (s.doneBefore) return void y(s.before ? `已到最早 · 共 ${this._commFmtNum(s.before)} 条` : (s.anchor ? `${s.anchor} 前后都没有记录` : "没有记录") + x(), !1); const e = [`上滑加载更早（已 ${this._commFmtNum(s.before)} 条）`]; s.anchor && e.push(s.doneAfter ? `已到最晚（+${this._commFmtNum(s.after)} 条）` : `下滑看更晚（已 ${this._commFmtNum(s.after)} 条）`), y(e.join(" · ") + x(), !1) }, v = (e, t) => { const n = []; if (e.forEach(e => { const t = String(e && e.time || "").slice(0, 10); t && !s.days.has(t) && (s.days.add(t), n.push(this._commChatDay(t))); const o = !(!s.focus || String(e && e.time || "") !== s.focus || s.focusContent && String(e && e.content || "") !== s.focusContent); n.push(this._commChatMsg(e, o)) }), "reset" === t) return c.textContent = "", l && c.appendChild(l), void n.forEach(e => c.appendChild(e)); if ("append" === t) return void n.forEach(e => c.appendChild(e)); const o = c.scrollHeight, a = c.scrollTop; for (let e = n.length - 1; e >= 0; e--)c.insertBefore(n[e], c.firstChild); c.scrollTop = a + (c.scrollHeight - o) }, w = t => { if (s.loading || s.doneBefore) return; s.loading = !0; const n = !s.seeded, o = !!s.byFirst; s.byFirst = !1; const a = !(!t || !t.fill); y(o ? "加载最早一页…" : "加载更早…", !0), this._commAnaReq(e, g(o ? "first" : "before", n)).then(e => { const t = e.rows || [], i = o ? t.slice() : t.slice().reverse(); v(i, n || o ? "reset" : "prepend"), s.before += t.length; const r = String((i[i.length - 1] || {}).time || ""); r && (n || r > s.lastTime) && (s.lastTime = r); const l = String((i[0] || {}).time || ""); l && (n || !s.earliest || l < s.earliest) && (s.earliest = l), n && (s.total = Number(e.total_count) || t.length), s.loading = !1, s.doneBefore = o || !t.length || n && !s.anchor && s.before >= s.total, s.atFirst = o, (n || o) && (s.seeded = !0), (n || a || o) && this._timers.setTimeout(() => { if (c) if (s.atFirst) c.scrollTop = 0; else { if (s.focus && !s.anchor) { const e = c.querySelector(".comm-chat-msg.focus"); return void (e && e.scrollIntoView ? e.scrollIntoView({ block: "center" }) : c.scrollTop = c.scrollHeight) } if (s.anchor) { const e = c.querySelector(`.comm-chat-day[title="${s.anchor}"]`); return void (e && e.scrollIntoView ? e.scrollIntoView({ block: "start" }) : c.scrollTop = 0) } c.scrollTop = c.scrollHeight } }, 0), d && !(s.byChannel || []).length && (d.textContent = `${s.channel || "全部渠道"} · 共 ${this._commFmtNum(s.total)} 条`), _(), !s.doneBefore && s.fillTries < 3 && c && c.scrollHeight <= c.clientHeight && (s.fillTries += 1, this._timers.setTimeout(() => w({ fill: !0 }), 300)) }).catch(e => { s.loading = !1, y(`加载失败：${e.message}`, !1) }) }, C = () => { s.loading || s.doneAfter || !s.lastTime || (s.loading = !0, y("加载更晚…", !0), this._commAnaReq(e, g("after")).then(e => { const t = e.rows || []; v(t, "append"), s.after += t.length; const n = t[t.length - 1]; n && String(n.time || "") > s.lastTime && (s.lastTime = String(n.time || "")), s.loading = !1, s.doneAfter = !t.length || t.length < 30, _() }).catch(e => { s.loading = !1, y(`加载失败：${e.message}`, !1) })) }, k = () => { u && u.classList.toggle("show", !!s.anchor) }, S = () => { if (!p) return; p.textContent = ""; const e = (s.byChannel || []).reduce((e, t) => e + Number(t.count || 0), 0), t = [{ key: "", label: "全部", count: s.byChannel ? e : null }].concat((s.byChannel || []).map(e => ({ key: String(e.key), label: String(e.key), count: e.count }))); s.channel && !t.some(e => e.key === s.channel) && t.push({ key: s.channel, label: s.channel, count: null }), t.forEach(e => { const t = document.createElement("button"); t.type = "button", t.className = "comm-chat-chip" + (e.key === s.channel ? " active" : ""), t.textContent = null === e.count || void 0 === e.count ? e.label : `${e.label} ${this._commFmtNum(e.count)}`, t.addEventListener("click", t => { t.stopPropagation(), s.channel !== e.key && (s.channel = e.key, S(), E()) }), p.appendChild(t) }) }, E = () => { s.before = 0, s.after = 0, s.total = 0, s.loading = !1, s.doneBefore = !1, s.doneAfter = !1, s.days = new Set, s.seeded = !1, s.fillTries = 0, s.atFirst = !1, c && (c.textContent = "", l && c.appendChild(l)), y("加载中…", !0), w() }; this.showPopup({ className: "comm-chat-popup", showOverlay: !0, showBackground: !0, popupPosition: "center", content: () => { const t = document.createElement("div"); t.className = "comm-chat"; const a = "function" == typeof this.getCurrentTheme && this.getCurrentTheme() || this._currentTheme || "light"; t.setAttribute("data-theme", a); const r = document.createElement("div"); r.className = "comm-chat-head", r.appendChild(this._commChatAvatar(String(n.partyName || "").trim() || o, !1)); const f = document.createElement("div"); f.className = "comm-chat-titlebox"; const g = document.createElement("div"); g.className = "comm-chat-title", g.textContent = i, f.appendChild(g), d = document.createElement("div"), d.className = "comm-chat-sub", d.textContent = "读取中…", f.appendChild(d), r.appendChild(f); const y = document.createElement("div"); y.className = "comm-chat-date", h = document.createElement("button"), h.type = "button", h.className = "comm-chat-pillbtn comm-chat-datebtn"; const x = () => { h && (h.textContent = s.anchor || "日期", h.classList.toggle("active", !!s.anchor), h.title = s.anchor ? `已跳到 ${s.anchor}（点击换一天）` : "选择日期，跳到那天的记录（不是筛选，前后仍可滑动）") }, _ = () => { s.anchor = "", s.focus = "", s.focusContent = "", x(), k(), E() }; x(); const v = e => { const t = String(e || "").trim(); t !== s.anchor && (s.anchor = t, x(), k(), E()) }; h.addEventListener("click", t => { t.stopPropagation(); const n = h.getBoundingClientRect && h.getBoundingClientRect() || null, o = s.anchor ? new Date(`${s.anchor}T00:00:00`) : new Date; this.showCalendarPopup("", o, v, n, this._commChatCalendarApi(e, s)) }), y.appendChild(h), u = document.createElement("button"), u.type = "button", u.className = "comm-chat-dateclear", u.textContent = "✕", u.title = "回到最新（取消跳转）", u.addEventListener("click", e => { e.stopPropagation(), (s.anchor || s.focus) && _() }), y.appendChild(u), r.appendChild(y); const S = document.createElement("button"); S.type = "button", S.className = "comm-chat-pillbtn comm-chat-emptybtn"; const T = () => { S.textContent = "过滤空内容", S.classList.toggle("active", !!s.empty), S.title = s.empty ? "正在过滤：只显示有正文的消息（点击显示全部，含正文为空的记录）" : "点击只看有正文的消息（过滤掉正文为空的记录）" }; S.addEventListener("click", t => { t.stopPropagation(), s.empty = !s.empty, e._commChatEmpty = s.empty, T(), b(), E() }), T(), r.appendChild(S); const $ = document.createElement("button"); $.type = "button", $.className = "comm-chat-pillbtn comm-chat-jumpbtn", $.textContent = "跳转", $.title = "跳到这段对话的第一条 / 最后一条"; let A = null; const D = () => { const e = A; if (A = null, e) try { e.close() } catch (e) { } }; return m = D, $.addEventListener("click", t => { t.stopPropagation(); const n = document.createElement("div"); n.className = "comm-chat-jumpmenu"; const o = (e, t, o, a) => { const i = document.createElement("button"); i.type = "button", i.className = "comm-chat-jumpmenu-item", i.textContent = e; const r = document.createElement("span"); r.textContent = t, i.appendChild(r), i.addEventListener("click", e => { e.stopPropagation(), D(), o() }), (a || n).appendChild(i) }; o("第一条", "跳到这段对话最早的一条", () => { s.anchor = "", s.focus = "", s.focusContent = "", s.byFirst = !0, x(), k(), E() }), o("最后一条", "回到最近的一条", _), this._commChatJumpDates(e, s, n, o, v), A = this._showBubble({ target: $, content: n, placement: "bottom", width: 168, maxWidth: "70vw", className: "comm-chat-jumpmenu-wrap", closeOnClickAway: !0, closeOnTargetClick: !1, onClose: () => { A = null } }) }), r.appendChild($), t.appendChild(r), p = document.createElement("div"), p.className = "comm-chat-chips", t.appendChild(p), c = document.createElement("div"), c.className = "comm-chat-body", l = document.createElement("div"), l.className = "comm-chat-more", l.textContent = "加载中…", c.appendChild(l), c.addEventListener("scroll", () => { s.seeded && (c.scrollTop <= 12 ? w() : c.scrollHeight - c.scrollTop - (c.clientHeight || 0) <= 12 && C()) }, { passive: !0 }), t.appendChild(c), t }, onClose: () => { s.done = !0, "function" == typeof m && m() } }), S(), k(), (() => { this._commAnaReq(e, { type: "chat", mode: "summary", ...f() }).then(e => { s.byChannel = (e.by_channel || []).filter(e => e && e.key && Number(e.count) > 0), S(), b() }).catch(() => { S() }) })(), w(), this._commChatPreheat(e, s) }, _commChatDay(e) { const t = document.createElement("div"); t.className = "comm-chat-day"; const n = String(e || ""), o = e => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, a = new Date; return n === o(a) ? t.textContent = "今天" : n === o(new Date(a.getTime() - 864e5)) ? t.textContent = "昨天" : t.textContent = n, t.title = n, t }, _commChatAvatar(e, t) { const n = document.createElement("span"); n.className = "comm-chat-avatar" + (t ? " me" : ""); const o = String(e || "").trim(), a = o.replace(/\D/g, ""), i = !!a && !/[\u4e00-\u9fa5a-zA-Z]/.test(o); return n.textContent = i ? a ? a.slice(-2) : "?" : o ? o.slice(0, 1) : "?", n.title = o, n }, _commChatChannelColor: e => ({ "微信": "#07c160", "短信": "#2196f3", "语音": "#ff9800", "流量": "#9c27b0", "论坛留言": "#607d8b" }[String(e || "")] || "#8a8a8a"), _commChatNextSecond(e) { const t = String(e || "").trim(); if (!t) return ""; const n = new Date(t.replace(" ", "T")); if (isNaN(n.getTime())) return t; n.setSeconds(n.getSeconds() + 1); const o = e => String(e).padStart(2, "0"); return `${n.getFullYear()}-${o(n.getMonth() + 1)}-${o(n.getDate())} ${o(n.getHours())}:${o(n.getMinutes())}:${o(n.getSeconds())}` }, _commChatPrevSecond(e) { const t = String(e || "").trim(); if (!t) return ""; const n = new Date(t.replace(" ", "T")); if (isNaN(n.getTime())) return t; n.setSeconds(n.getSeconds() - 1); const o = e => String(e).padStart(2, "0"); return `${n.getFullYear()}-${o(n.getMonth() + 1)}-${o(n.getDate())} ${o(n.getHours())}:${o(n.getMinutes())}:${o(n.getSeconds())}` }, _commChatMonthDays(e, t, n, o) { const a = `${n}-${String(o).padStart(2, "0")}`, i = `${a}|${t && t.channel || ""}|${t && t.empty ? "ne" : ""}`; if (t && t.dayCache && t.dayCache.has(i)) return t.dayCache.get(i); const r = { type: "dates", month: a }; t && t.peerName ? r.party_names = t.peerName : t && t.peerNum && (r.party_numbers = t.peerNum), t && t.channel && (r.channels = t.channel), t && t.empty && (r.empty_content = 0); const s = this._commAnaReq(e, r).then(e => (e.rows || []).map(e => ({ date: String(e && e.date || "").trim(), count: Number(e && e.count || 0) })).filter(e => e.date).sort((e, t) => e.date < t.date ? -1 : 1)).catch(() => []); return t && (t.dayCache || (t.dayCache = new Map), t.dayCache.size > 60 && t.dayCache.clear(), t.dayCache.set(i, s)), s }, _commChatMonthDates(e, t, n, o) { return this._commChatMonthDays(e, t, n, o).then(e => new Set(e.map(e => e.date))) }, _commChatCalendarApi(e, t) { const n = this._commAnaCfg(e); return { fetchDates: (n, o) => this._commChatMonthDates(e, t, n, o), fetchPeriods: (n, o) => this._commChatPeriods(e, t, n, o), periodsScope: `comm-chat|${n.url}|${n.key}|${t && t.peerName || ""}|${t && t.peerNum || ""}|${t && t.channel || ""}`, periodsComplete: !0 } }, _commChatPreheat(e, t) { return Promise.resolve().then(() => this._calendarPeriodsMeta(this._commChatCalendarApi(e, t))).then(n => { const o = n && !n.empty && n.set ? [...n.set].sort() : []; if (!o.length) return null; const a = o[o.length - 1], i = Number(a.slice(0, 4)), r = Number(a.slice(5, 7)); return i && r ? this._commChatMonthDays(e, t, i, r) : null }).catch(() => null) }, _commChatJumpDates(e, t, n, o, a) { const i = document.createElement("div"); i.className = "comm-chat-jumpsect comm-chat-jumpsect-wait", i.textContent = "读取有记录的日期…", n.appendChild(i); const r = []; return this._commChatMonthsMeta(e, t).then(n => { const o = n && n.months || []; if (!o.length) return void i.remove(); const a = n => { if (n >= o.length || n >= 3 || r.length >= 6) return Promise.resolve(); const i = o[o.length - 1 - n].value; return this._commChatMonthDays(e, t, Number(i.slice(0, 4)), Number(i.slice(5, 7))).then(e => (e.slice().reverse().forEach(e => { r.length < 6 && r.push(e) }), a(n + 1))) }; return a(0) }).then(() => { if (!r.length) return void i.remove(); i.className = "comm-chat-jumpsect", i.textContent = ""; const e = document.createElement("div"); e.className = "comm-chat-jumpsect-label", e.textContent = "有记录的日期", i.appendChild(e), r.forEach((e, t) => { o(e.date, (0 === t ? "最近一天 · " : "") + `${this._commFmtNum(e.count)} 条`, () => a(e.date), i) }) }).catch(() => { i.remove() }) }, _commChatPeriods(e, t, n, o) { return this._commChatMonthsMeta(e, t).then(e => e ? "month" !== n ? e.years : e.months.filter(e => 0 === e.value.indexOf(`${String(o || "")}-`)) : null) }, _commChatMonthsMeta(e, t) { const n = `${t && t.peerName || ""}|${t && t.peerNum || ""}|${t && t.channel || ""}`; if (t && t.periodsCache && t.periodsCache.has(n)) return t.periodsCache.get(n); const o = { type: "months", order: "asc", limit: 0 }; t && t.peerName ? o.party_names = t.peerName : t && t.peerNum && (o.party_numbers = t.peerNum), t && t.channel && (o.channels = t.channel); const a = this._commAnaReq(e, o).then(e => { const t = new Map((e && e.rows || []).map(e => [String(e && e.month || ""), Number(e && e.count || 0)])), n = (e && e.months || []).map(e => String(e || "")).filter(e => /^\d{4}-\d{2}$/.test(e)).map(e => ({ value: e, count: t.get(e) || 0 })); return { years: (e && e.years || []).map(e => ({ value: Number(e && e.year), count: Number(e && e.count) || 0 })).filter(e => e.value > 0), months: n } }).catch(() => null); return t && (t.periodsCache || (t.periodsCache = new Map), t.periodsCache.size > 12 && t.periodsCache.clear(), t.periodsCache.set(n, a)), a }, _commChatMsg(e, t) { const n = this._commAnaDir(e && e.msg_type), o = "out" === n, a = document.createElement("div"); a.className = "comm-chat-msg" + (o ? " out" : "in" === n ? " in" : "") + (t ? " focus" : ""), a.appendChild(this._commChatAvatar(o ? "我" : String(e && e.party_name || "").trim() || String(e && e.party_number || "").trim(), o)); const i = document.createElement("div"); i.className = "comm-chat-col"; const r = document.createElement("div"); r.className = "comm-chat-bubble"; const s = document.createElement("div"); s.className = "comm-chat-text"; const c = this._commContentOf(e); if (c && /^\.\/[^/]+\//.test(c)) { s.classList.add("comm-chat-file"); const e = c.split("/").pop(), t = document.createElement("ha-icon"); t.setAttribute("icon", /\.(png|jpe?g|gif|webp)$/i.test(e) ? "mdi:image-outline" : "mdi:file-document-outline"), s.appendChild(t); const n = document.createElement("span"); n.textContent = e, n.title = c, s.appendChild(n) } else if (c) s.textContent = c; else { s.classList.add("comm-chat-void"); const t = e && e.duration ? this._commFormatDuration(e.duration) : "", n = e && e.cost ? `${this._commFmtNum(e.cost)} 元` : ""; s.textContent = [String(e && e.msg_type || ""), t, n].filter(Boolean).join(" · ") || "（无正文）" } r.appendChild(s), i.appendChild(r); const l = document.createElement("div"); l.className = "comm-chat-meta"; const d = String(e && e.channel || "").trim(); if (d) { const e = document.createElement("span"); e.className = "comm-chat-chan", e.textContent = d, e.style && e.style.setProperty && e.style.setProperty("--comm-chan-color", this._commChatChannelColor(d)), l.appendChild(e) } const p = document.createElement("span"); return p.className = "comm-chat-time", p.textContent = String(e && e.time || "").slice(11, 16), l.appendChild(p), i.appendChild(l), a.appendChild(i), a }, _commAnaDrill(e, t) { if (null == t || "" === t) return; const n = this._commAnaState(e), o = "today" === n.view ? "year" : this._commAnaGranularity(n), a = String(t); if ("year" === o) this._commAnaGoto(e, { view: "all", scope: { kind: "year", key: a } }); else if ("month" === o) this._commAnaGoto(e, { scope: { kind: "month", key: a } }); else if ("day" === o) this._commAnaGoto(e, { scope: { kind: "day", key: a } }); else { const t = e.querySelector(".comm-ana-list"); t && t.scrollIntoView ? t.scrollIntoView({ behavior: "smooth", block: "start" }) : this._showToast("已是小时粒度，逐条记录在下方明细里", "success") } }, _commAnaOpenContact(e, t, n, o) { if (!this._commAnaCfg(e).ready || !n) return; const a = /^\d{5,}$/.test(n) ? { type: "contact", party_number: n } : { type: "contact", party_name: n }; this._commAnaReq(e, a).then(a => { const i = document.createElement("div"); i.className = "comm-ana-contact"; const r = a.total || {}; i.appendChild(this._commKVGrid([["总条数", `${this._commFmtNum(r.count || 0)} 条`], ["累计时长", r.duration ? this._commFormatDuration(r.duration) : ""], ["累计金额", r.cost ? `${this._commFmtNum(r.cost)} 元` : ""], ["活跃天数", r.active_days ? `${this._commFmtNum(r.active_days)} 天` : ""], ["首次", String(r.first_time || "").slice(0, 10)], ["末次", String(r.last_time || "").slice(0, 10)], ["距今", 0 === a.days_since_last ? "今天联系过" : `${this._commFmtNum(a.days_since_last)} 天`], ["平均间隔", a.avg_interval_days ? `${this._commFmtNum(a.avg_interval_days)} 天` : ""], ["跨度", a.span_days ? `${this._commFmtNum(a.span_days)} 天` : ""]])); const s = (a.by_channel || []).filter(e => e && e.count).map(e => `${e.key} ${this._commFmtNum(e.count)}`).join(" · "); if (s) { const e = document.createElement("div"); e.className = "comm-ana-contact-line", e.textContent = `渠道：${s}`, i.appendChild(e) } const c = (a.by_hour || []).filter(e => e && e.count).sort((e, t) => Number(e.key) - Number(t.key)); if (c.length) { const e = c.reduce((e, t) => t.count > e.count ? t : e, c[0]), t = document.createElement("div"); t.className = "comm-ana-contact-line", t.textContent = `最常联系时段：${String(e.key).padStart(2, "0")} 时（${this._commFmtNum(e.count)} 条）`, i.appendChild(t) } const l = o ? this._commPeerText(o, e) : this._commPhoneText(n, e); this._commMiniBubble(t, `${l || "联系人"} · 档案`, i, e) }).catch(e => this._showToast(`读取联系人档案失败：${e.message}`, "error")) }, _commRecordMonthKey(e, t) { let n = ""; (e || []).forEach(e => { const o = String(e && e[t || "datetime"] || ""); o > n && (n = o) }); const o = n.match(/^(\d{4})-(\d{2})/); return o ? `${o[1]}-${o[2]}` : "" }, _commDataSize(e) { const t = Number(e); return !isFinite(t) || t <= 0 ? "0 MB" : t >= 1024 ? `${this._commFmtNum(t / 1024)} GB` : `${this._commFmtNum(t)} MB` }, _commSmsDirection(e) { const t = String(e || ""); return /发送|发出|发信|主叫/.test(t) ? "out" : /接收|收到|来信|被叫/.test(t) ? "in" : "other" }, _commSmsView(e) { const t = Array.isArray(e && e["短信记录"]) ? e["短信记录"] : []; let n = 0, o = 0, a = 0; t.forEach(e => { const t = this._commSmsDirection(e && e.type); "out" === t ? n += 1 : "in" === t && (o += 1); const i = this._commNum(e && e.fee); null !== i && (a += i) }); const i = new Map, r = Array.isArray(e && e["按天汇总"]) ? e["按天汇总"] : []; r.length ? r.forEach(e => { const t = String(e && e.date || "").match(/^\d{4}-\d{2}-(\d{2})/); if (!t) return; const n = Number(t[1]), o = i.get(n) || { seconds: 0, count: 0 }; o.seconds += this._commNum(e.count) || 0, i.set(n, o) }) : t.forEach(e => { const t = String(e && e.datetime || "").match(/^\d{4}-\d{2}-(\d{2})/); if (!t) return; const n = Number(t[1]), o = i.get(n) || { seconds: 0, count: 0 }; o.seconds += 1, i.set(n, o) }); const s = this._commRecordMonthKey(t, "datetime") || this._commRecordMonthKey(r, "date"); return { items: t, count: t.length, sent: n, received: o, fee: a, monthKey: s, daily: this._commDailySeries(s, i, { value: e => e ? e.seconds : 0, countOf: () => 0, label: "短信条数", countLabel: "条", format: e => e ? `${this._commFmtNum(e)} 条` : "无短信" }) } }, _commTrafficView(e) { const t = Array.isArray(e && e["上网会话清单"]) ? e["上网会话清单"] : [], n = e && e["合计"] || {}; let o = this._commNum(n.volume_mb), a = this._commNum(n.duration_seconds), i = this._commNum(n.fee_yuan); if (null === o || null === a || null === i) { let e = 0, n = 0, r = 0; t.forEach(t => { e += this._commNum(t && t.volume_mb) || 0, n += this._commNum(t && t.duration_seconds) || 0, r += this._commNum(t && t.fee) || 0 }), null === o && (o = e), null === a && (a = n), null === i && (i = r) } const r = new Map, s = (e, t, n) => { const o = String(e || "").match(/^\d{4}-\d{2}-(\d{2})/); if (!o) return; const a = Number(o[1]), i = r.get(a) || { value: 0, count: 0 }; i.value += t || 0, i.count += n || 0, r.set(a, i) }, c = Array.isArray(e && e["按天汇总"]) ? e["按天汇总"] : []; c.length ? c.forEach(e => s(e && e.date, this._commNum(e && e.volume_mb), this._commNum(e && e.sessions) || 1)) : t.forEach(e => s(e && e.datetime, this._commNum(e && e.volume_mb), 1)); const l = this._commRecordMonthKey(t, "datetime") || this._commRecordMonthKey(c, "date"); return { items: t, volumeMb: o, seconds: a, fee: i, sessions: t.length, monthKey: l, daily: this._commDailySeries(l, r, { value: e => e ? e.value : 0, countOf: e => e ? e.count : 0, label: "上网流量", countLabel: "次上网", format: e => this._commDataSize(e) }) } }, _commTipLine(e) { const t = document.createElement("div"); return t.className = "comm-tip", t.textContent = e, t }, _commSmsSection(e, t) { const n = this._commRecordMonth(t), o = this._commRecordIsThisMonth(t), a = o ? "本月短信" : `${n} 短信`, i = this._commSection(a, "mdi:message-text-outline"); if (!e.count) return i.body.appendChild(this._commTipLine((o ? "本月" : `${n} `) + "没有短信记录。")), i; const r = document.createElement("div"); r.className = "comm-mini-grid", r.appendChild(this._commMini("总条数", `${e.count} 条`)), r.appendChild(this._commMini("发送", `${e.sent} 条`)), r.appendChild(this._commMini("接收", `${e.received} 条`)), r.appendChild(this._commMini("总费用", `${this._commFmtNum(e.fee)} 元`)), i.body.appendChild(r), e.daily && (i.body.appendChild(this._commSubTitle("每日短信条数")), i.body.appendChild(this._commDailyChart(e.daily, t))); const s = this._commPlaceBlock({ card: t, kind: "sms", items: e.items, scope: this._commPlaceScope(t), filter: t._commSmsFilter || null, dir: this._commDirFor("sms", t), unit: "条", allowScope: !0, allowDir: !0, label: "短信地点" }); s && (i.body.appendChild(s.title), i.body.appendChild(s.list)); const c = t._commSmsFilter || null, l = this._commFilterByDir(this._commFilterItemsByPlace(e.items, c), this._commDirFor("sms", t)), d = "map" === t._commDetailView, p = this._commSubTitle(c ? "短信明细" : `短信明细 · ${e.items.length} 条`); p.appendChild(this._commViewToggle(t)), i.body.appendChild(p); const h = this._commFilterBar(c, l.length, e.items.length, () => this._commTogglePlaceFilter(t, "sms", null)); return h && i.section.insertBefore(h, i.body), i.body.appendChild(d ? this._commMigrationChart(l.map(e => this._commGeoItem(e)), t, "location", c, { onToggle: e => this._commTogglePlaceFilter(t, "sms", e) }) : this._commSmsList(l, t)), i }, _commTrafficInsight(e) { const t = e && e.items || [], n = new Map, o = new Map, a = [], i = []; t.forEach(e => { const t = this._commNum(e.volume_mb) || 0, r = this._commNum(e.duration_seconds) || 0, s = String(e.datetime || ""), c = (s.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "", l = Number((s.match(/\s(\d{2}):/) || [])[1]); if (c && n.set(c, (n.get(c) || 0) + t), Number.isFinite(l)) { const e = o.get(l) || { seconds: 0, count: 0 }; e.seconds += r, e.count += 1, o.set(l, e) } a.push({ time: this._commShortTime(s), mb: t, seconds: r }); const d = this._commNum(e.fee); d && i.push({ time: this._commShortTime(s), mb: t, fee: d }) }); const r = Array.from(n.entries()).sort((e, t) => t[1] - e[1]); return { activeDays: r.length, maxDay: r.length ? { date: r[0][0], mb: r[0][1] } : null, dailyAvg: r.length ? (e.volumeMb || 0) / r.length : 0, topSessions: a.slice().sort((e, t) => t.mb - e.mb).slice(0, 5), hours: Array.from(o.entries()).map(([e, t]) => ({ hour: e, seconds: t.seconds, count: t.count })).sort((e, t) => e.hour - t.hour), topFee: i.sort((e, t) => t.fee - e.fee).slice(0, 5) } }, _commTrafficSection(e, t) { const n = this._commRecordMonth(t), o = this._commRecordIsThisMonth(t), a = this._commSection(o ? "本月上网" : `${n} 上网`, "mdi:web"); if (!e.items.length) return a.body.appendChild(this._commTipLine((o ? "本月" : `${n} `) + "没有上网记录。")), a; const i = document.createElement("div"); i.className = "comm-mini-grid"; const r = this._commTrafficInsight(e); i.appendChild(this._commMini("总流量", this._commDataSize(e.volumeMb), { title: "点击查看本月流量概况", onClick: n => this._commMiniBubble(n, "本月流量概况", [["有上网的天数", r.activeDays ? `${r.activeDays} 天` : ""], ["日均（按有流量的天）", r.activeDays ? this._commDataSize(r.dailyAvg) : ""], ["最大单日", r.maxDay ? `${this._commDataSize(r.maxDay.mb)}（${r.maxDay.date.slice(5)}）` : ""], ["单次最大", r.topSessions.length ? this._commDataSize(r.topSessions[0].mb) : ""], ["日均会话数", r.activeDays ? `${this._commFmtNum(e.sessions / r.activeDays)} 次` : ""]], t) })), i.appendChild(this._commMini("上网时长", this._commFormatDuration(e.seconds), { title: "点击查看 24 小时分布", onClick: e => this._commMiniBubble(e, "上网时段分布（按会话开始时间）", this._commHourChart(r.hours), t) })), i.appendChild(this._commMini("上网次数", `${e.sessions} 次`, { title: "点击查看单次流量 Top5", onClick: e => this._commMiniBubble(e, "单次流量 Top5", r.topSessions.map((e, t) => [`#${t + 1}  ${e.time}`.trim(), `${this._commDataSize(e.mb)} · ${this._commFormatDuration(e.seconds)}`]), t) })); const s = e.fee ? { title: "点击查看计费的上网会话", onClick: e => this._commMiniBubble(e, "计费的上网会话", r.topFee.map((e, t) => [`#${t + 1}  ${e.time}`.trim(), `${this._commDataSize(e.mb)} · ${this._commFmtNum(e.fee)} 元`]), t) } : {}; i.appendChild(this._commMini("总费用", `${this._commFmtNum(e.fee)} 元`, s)), a.body.appendChild(i), e.daily && (a.body.appendChild(this._commSubTitle("每日上网流量")), a.body.appendChild(this._commDailyChart(e.daily, t))); const c = this._commPlaceBlock({ card: t, kind: "traffic", items: e.items, scope: this._commPlaceScope(t), filter: t._commTrafficFilter || null, unit: "次", allowScope: !1, allowDir: !1, label: "上网地点" }); c && (a.body.appendChild(c.title), a.body.appendChild(c.list)); const l = t._commTrafficFilter || null, d = this._commFilterItemsByPlace(e.items, l), p = this._commAnaDayGroups(d).length, h = "map" === t._commDetailView, u = this._commSubTitle(l ? h ? "上网地点分布" : "上网明细" : h ? `上网地点分布 · ${d.length} 次上网 · ${p} 天` : `上网明细 · ${d.length} 条 · ${p} 天（按日折叠）`); u.appendChild(this._commViewToggle(t)), a.body.appendChild(u); const m = this._commFilterBar(l, d.length, e.items.length, () => this._commTogglePlaceFilter(t, "traffic", null)); return m && a.section.insertBefore(m, a.body), h ? (a.body.appendChild(this._commSubTitle("只标地点（上网记录没有对方归属地，因此没有流向线）")), a.body.appendChild(this._commMigrationChart(d.map(e => this._commGeoItem(e)), t, "location", l, { onToggle: e => this._commTogglePlaceFilter(t, "traffic", e) }))) : a.body.appendChild(this._commTrafficList(d, t)), a }, _commSmsList(e, t) { const n = document.createElement("div"); n.className = "comm-rec-list"; const o = this._commPlaceToneMap(e); return e.forEach(e => { const a = document.createElement("div"); a.className = "comm-rec-item"; const i = document.createElement("span"); i.className = "comm-rec-time", i.textContent = this._commShortTime(e && e.datetime), a.appendChild(i); const r = this._commSmsDirection(e && e.type), s = document.createElement("span"); s.className = "comm-rec-badge " + ("in" === r ? "in" : "out"), s.textContent = "in" === r ? "接收" : "out" === r ? "发送" : String(e && e.type || "短信"), a.appendChild(s); const c = document.createElement("span"); c.className = "comm-rec-main", c.textContent = this._commPhoneText(e && e.phone_number, t) || "未知号码", c.title = this._commPhoneText(e && e.phone_number, t) || "", a.appendChild(c); const l = this._commRowPlace(e, o); l && a.appendChild(l); const d = this._commNum(e && e.fee); if (d) { const e = document.createElement("span"); e.className = "comm-rec-fee", e.textContent = `${this._commFmtNum(d)} 元`, a.appendChild(e) } const p = this._commContentOf(e); p && a.appendChild(this._commContentTag(t, p, { time: String(e && e.datetime || ""), content: p, channel: String(e && (e.channel || e.channels) || "短信"), partyNumber: String(e && (e.party_number || e.phone_number) || ""), partyName: String(e && (e.party_name || e.name) || "").trim() })), n.appendChild(a) }), n }, _commTrafficItem(e, t) { const n = document.createElement("div"); n.className = "comm-rec-item"; const o = document.createElement("span"); o.className = "comm-rec-time", o.textContent = this._commShortTime(e && e.datetime), n.appendChild(o); const a = document.createElement("span"); a.className = "comm-rec-main", a.textContent = this._commDataSize(e && e.volume_mb), n.appendChild(a); const i = document.createElement("span"); i.className = "comm-rec-sub", i.textContent = this._commFormatDuration(e && e.duration_seconds), n.appendChild(i); const r = this._commRowPlace(e, t); r && n.appendChild(r); const s = String(e && e.business_type || "").trim(); if (s) { const e = document.createElement("span"); e.className = "comm-rec-tag", e.textContent = s, n.appendChild(e) } return n }, _commTrafficList(e, t) { const n = document.createElement("div"); n.className = "comm-rec-list"; const o = this._commPlaceToneMap(e); return this._commAnaDayGroups(e).forEach(e => { const a = this._commAnaDayRow(t, e, e => this._commTrafficItem(e, o)); n.appendChild(a.row), n.appendChild(a.box) }), n }, _commCallPlace(e, t) { const n = e || {}, o = String(n.location || "").trim(), a = String(n.number_location || "").trim(); return "number_location" === t ? a || o : o || a }, _commCallDirArrow(e) { const t = String(e || "").trim(); return /接听|被叫|呼入|来电|接收|收到|来信/.test(t) ? "←" : /呼叫|主叫|呼出|去电|发送|发出|发信/.test(t) ? "→" : "·" }, _commCallPlaceParts(e) { const t = this._commGeoItem(e), n = String(t.location || "").trim(), o = String(t.number_location || "").trim(); return n || o ? n && o ? { segments: [{ text: n, field: "location" }, { text: o, field: "number_location" }], arrow: this._commCallDirArrow(t.type) } : { segments: [{ text: n || o, field: n ? "location" : "number_location" }], arrow: "" } : { segments: [], arrow: "" } }, _commRowPlace(e, t) { const n = this._commCallPlaceParts(e); if (!n.segments.length) return null; const o = document.createElement("span"); o.className = "comm-rec-place"; const a = document.createElement("ha-icon"); return a.setAttribute("icon", "mdi:map-marker-outline"), o.appendChild(a), n.segments.forEach((e, a) => { if (a > 0 && n.arrow) { const e = document.createElement("span"); e.className = "comm-call-place-arrow", e.textContent = n.arrow, o.appendChild(e) } const i = t && t.has(e.text) ? t.get(e.text) : 0, r = document.createElement("span"); r.className = `comm-place-ink-${i}`, r.textContent = e.text, o.appendChild(r) }), o.title = `地点：${n.segments.map(e => e.text).join(n.arrow || " → ")}`, o }, _commPlaceScope: e => e && "number_location" === e._commPlaceScope ? "number_location" : "location", _commPlaceScopeLabel: e => "number_location" === e ? "对方地点" : "我的地点", _commPlaceStats(e, t) { const n = new Map; return (e || []).forEach(e => { const o = this._commGeoItem(e), a = String("number_location" === t ? o.number_location : o.location).trim(); if (!a) return; const i = n.get(a) || { name: a, count: 0, seconds: 0, fee: 0 }; i.count += 1, i.seconds += this._commDurationSeconds(o.duration), i.fee += this._commNum(o.fee) || 0, n.set(a, i) }), Array.from(n.values()).sort((e, t) => t.count - e.count || e.name.localeCompare(t.name, "zh")) }, _commPlaceBlock(e) { const t = e || {}, n = t.items || [], o = "number_location" === t.scope ? "number_location" : "location", a = t.unit || "次", i = "out" === t.dir || "in" === t.dir ? t.dir : "", r = this._commPlaceStats(this._commFilterByDir(n, i), o); if (!r.length && !t.allowDir) return null; const s = this._commPlaceToneMap(n), c = t.filter || null, l = this._commPlaceScopeLabel(o), d = this._commSubTitle(t.label || "地点"); if (t.allowScope && d.appendChild(this._commPlaceScopeToggle(t.kind)), t.allowDir && d.appendChild(this._commDirToggle(t.card, t.kind)), !r.length) return { title: d, list: document.createElement("div") }; const p = document.createElement("div"); return p.className = "comm-place-list", r.forEach(e => { const n = document.createElement("span"), i = s.has(e.name) ? s.get(e.name) : 0, r = !(!c || "place" !== c.type || c.scope !== o || (Array.isArray(c.values) ? -1 === c.values.indexOf(e.name) : c.value !== e.name)); n.className = "comm-place comm-place-tone-" + i + (r ? " active" : ""), n.textContent = `${e.name} · ${e.count} ${a}`, n.title = `点击筛选「${l} = ${e.name}」的记录`, n.addEventListener("click", n => { n.stopPropagation(), this._commTogglePlaceFilter(t.card, t.kind, { type: "place", scope: o, value: e.name }) }), p.appendChild(n) }), { title: d, list: p } }, _commPlaceScopeToggle(e) { const t = this._commPlaceScope(e), n = document.createElement("button"); n.type = "button", n.className = "comm-place-scope", n.dataset.scope = t; const o = document.createElement("ha-icon"); o.setAttribute("icon", "mdi:swap-horizontal"), n.appendChild(o); const a = document.createElement("span"); return a.textContent = this._commPlaceScopeLabel(t), n.appendChild(a), n.title = "number_location" === t ? "当前统计「对方地点（号码归属地）」，点击切换为「我的地点」" : "当前统计「我的地点（通话发生地）」，点击切换为「对方地点」", n.addEventListener("click", n => { n.stopPropagation(), e._commPlaceScope = "location" === t ? "number_location" : "location", e._commCallFilter = null, e._commSmsFilter = null, e._commTrafficFilter = null, this._commRefreshRecordsPanel(e) }), n }, _commCallStats(e, t, n, o) { const a = this._commNum(this._commProp(e, ["本月通话次数"])); let i = 0, r = 0, s = 0, c = 0, l = 0, d = 0; const p = [], h = new Map, u = new Map, m = new Map, f = this._commCallMonthKey(e, t); t.forEach(e => { const t = this._commDurationSeconds(e.duration); i += t; const a = this._commNum(e.fee); null !== a && (r += a); const g = this._commCallDirArrow(e.type); "←" === g ? (s += 1, l += t) : "→" === g && (c += 1, d += t), a && p.push({ number: String(e.phone_number || "未知号码"), time: this._commShortTime(e.call_time), fee: a }); const y = o && this._commDirOf(e) !== o ? "" : this._commCallPlace(e, n); if (y) { const e = h.get(y) || { count: 0, seconds: 0 }; e.count += 1, e.seconds += t, h.set(y, e) } const b = String(e.phone_number || "未知号码"), x = u.get(b) || { number: b, seconds: 0, count: 0, lastTime: "", time: "" }; x.seconds += t, x.count += 1; const _ = String(e.call_time || ""); _ > x.lastTime && (x.lastTime = _, x.time = this._commShortTime(_)), u.set(b, x); const v = _.match(/^(\d{4}-\d{2})-(\d{2})/); if (v && (!f || v[1] === f)) { const e = Number(v[2]), n = m.get(e) || { seconds: 0, count: 0 }; n.seconds += t, n.count += 1, m.set(e, n) } }); const g = Array.from(h.entries()).map(([e, t]) => ({ name: e, count: t.count, seconds: t.seconds })).sort((e, t) => t.count - e.count || t.seconds - e.seconds), y = Array.from(u.values()).filter(e => e.seconds > 0).sort((e, t) => t.seconds - e.seconds || t.count - e.count), b = p.sort((e, t) => t.fee - e.fee).slice(0, 3); return { count: null === a ? t.length : a, seconds: i, fee: r, answerCount: s, dialCount: c, answerSeconds: l, dialSeconds: d, topFee: b, places: g, top: y, daily: this._commDailySeries(f, m) } }, _commTodayKey() { const e = new Date; return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}` }, _commCallMonthKey(e, t) { const n = String(this._commProp(e, ["查询起始日期"]) || "").trim().match(/^(\d{4})-(\d{2})/); if (n) return `${n[1]}-${n[2]}`; let o = ""; (t || []).forEach(e => { const t = String(e && e.call_time || ""); t > o && (o = t) }); const a = o.match(/^(\d{4})-(\d{2})/); return a ? `${a[1]}-${a[2]}` : "" }, _commDailySeries(e, t, n = {}) { if (!e) return null; n = n || {}; const o = e.split("-").map(Number), a = o[0], i = o[1]; if (!a || !i) return null; const r = "function" == typeof n.value ? n.value : e => e ? e.seconds : 0, s = "function" == typeof n.countOf ? n.countOf : e => e ? e.count : 0, c = new Date(a, i, 0).getDate(), l = []; let d = 0, p = 0; for (let e = 1; e <= c; e++) { const n = t.get(e), o = r(n) || 0, a = s(n) || 0; o > d && (d = o), p += o, l.push({ day: e, value: o, seconds: o, count: a, percent: 0 }) } if (!p) return null; l.forEach(e => { e.percent = d ? e.value / d * 100 : 0 }); const h = new Date, u = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`; return { year: a, month: i, days: l, max: d, total: p, today: u === e ? h.getDate() : 0, label: "string" == typeof n.label && n.label ? n.label : "通话时长", countLabel: "string" == typeof n.countLabel && n.countLabel ? n.countLabel : "次", format: "function" == typeof n.format ? n.format : e => e ? this._commFormatDuration(e) : "无通话" } }, _commTrendData(e) { const t = (e || []).filter(Boolean); if (!t.length) return null; const n = t.reduce((e, t) => t.days.length > e.days.length ? t : e), o = e => { const t = new Map; return (e && e.days || []).forEach(e => t.set(e.day, e)), t }, a = o(e[0]), i = o(e[1]), r = o(e[2]), s = [], c = [], l = []; return n.days.forEach(e => { const t = a.get(e.day), n = i.get(e.day), o = r.get(e.day); s.push(t ? Math.round(t.value / 60 * 10) / 10 : 0), c.push(n ? n.value : 0), l.push(o ? Math.round(100 * o.value) / 100 : 0) }), { monthLabel: n.month, days: n.days.map(e => e.day), call: s, sms: c, traffic: l, hasCall: s.some(e => e > 0), hasSms: c.some(e => e > 0), hasFlow: l.some(e => e > 0) } }, _commTrendSection(e, t) { if (!e) return null; const n = this._commSection("每日趋势", "mdi:chart-areaspline"); n.body.appendChild(this._commSubTitle("通话时长（分）向上 · 短信（条）向下 · 上网流量（MB）折线")); const o = document.createElement("div"); return o.className = "comm-trend-canvas", n.body.appendChild(o), this._loadEchartsUnified().then(n => { if (!o.isConnected || !t.isConnected) return; const a = n.init(o); a.setOption(this._commTrendOption(e)); const i = new ResizeObserver(() => { !a.isDisposed() && o.isConnected ? a.resize() : i.disconnect() }); i.observe(o) }).catch(() => { o.remove(), n.body.appendChild(this._commTipLine("图表组件未加载，无法绘制趋势图（可检查 echarts.min.js）。")) }), n }, _commTrendOption(e) { const t = e.call.reduce((e, t) => Math.max(e, t), 0), n = e.sms.reduce((e, t) => Math.max(e, t), 0), o = e.traffic.reduce((e, t) => Math.max(e, t), 0), a = o > 1e3 ? "GB" : "MB", i = "GB" === a ? 1024 : 1, r = o / i, s = t > 0 ? 1.1 * t : 1, c = n > 0 ? 1.1 * n : 0, l = r > 0 ? 1.1 * r : 1, d = l * (c / s); return { backgroundColor: "transparent", animationDuration: 600, grid: { left: 4, right: 4, top: 44, bottom: 4, containLabel: !0 }, legend: { top: 0, itemWidth: 12, itemHeight: 8, itemGap: 10, textStyle: { fontSize: 11, color: "#607d8b" } }, tooltip: { trigger: "axis", confine: !0, backgroundColor: "rgba(255, 255, 255, 0.96)", borderColor: "rgba(0, 0, 0, 0.08)", textStyle: { color: "#2c3e50", fontSize: 12 }, formatter: t => { if (!t || !t.length) return ""; const n = [`<b>${e.monthLabel}月${t[0].axisValue}日</b>`]; return t.forEach(e => { const t = Math.abs(Number(e.value) || 0); let o; o = "flow" === e.seriesId ? this._commDataSize(t * i) : "call" === e.seriesId ? `${this._commFmtNum(t)} 分钟` : `${this._commFmtNum(t)} 条`, n.push(`${e.marker} ${e.seriesName}：${o}`) }), n.join("<br/>") } }, xAxis: { type: "category", data: e.days, axisTick: { show: !1 }, axisLine: { lineStyle: { color: "rgba(128, 128, 128, 0.35)" } }, axisLabel: { fontSize: 10, color: "#90a4ae", interval: t => 0 === t || (t + 1) % 5 == 0 || t === e.days.length - 1 } }, yAxis: [{ type: "value", name: "分钟 / 条", nameTextStyle: { fontSize: 10, color: "#b0bec5", padding: [0, 0, 0, 8] }, min: -c, max: s, axisLabel: { fontSize: 10, color: "#90a4ae", formatter: e => String(Math.abs(e)) }, axisLine: { show: !1 }, splitLine: { lineStyle: { color: "rgba(128, 128, 128, 0.12)" } } }, { type: "value", name: a, nameTextStyle: { fontSize: 10, color: "#ffb74d" }, min: -d, max: l, axisLabel: { fontSize: 10, color: "#ffb74d", formatter: e => e ? this._commFmtNum(e, "GB" === a ? 3 : 2) : "0" }, axisLine: { show: !1 }, splitLine: { show: !1 } }], series: [{ id: "call", name: "通话时长（分）", type: "bar", yAxisIndex: 0, barMaxWidth: 11, itemStyle: { color: "#2196f3", borderRadius: [2, 2, 0, 0] }, data: e.call }, { id: "sms", name: "短信（条，向下）", type: "bar", yAxisIndex: 0, barMaxWidth: 11, itemStyle: { color: "#4caf50", borderRadius: [0, 0, 2, 2] }, data: e.sms.map(e => -e) }, { id: "flow", name: `上网流量（${a}）`, type: "line", yAxisIndex: 1, smooth: !0, symbol: "circle", symbolSize: 4, lineStyle: { width: 1.6, color: "#ff9800" }, itemStyle: { color: "#ff9800" }, areaStyle: { color: "rgba(255, 152, 0, 0.12)" }, data: e.traffic.map(e => Math.round(e / i * 1e4) / 1e4) }] } }, _commDailyChart(e, t) { const n = document.createElement("div"); n.className = "comm-daily"; const o = document.createElement("div"); o.className = "comm-daily-bars", e.days.forEach(t => { const n = document.createElement("div"); n.className = "comm-daily-col" + (t.day === e.today ? " today" : ""), n.dataset.day = String(t.day), n.setAttribute("aria-label", this._commDailyTipText(e, t)); const a = document.createElement("div"); a.className = "comm-daily-bar", t.value && (a.style.height = `${Math.max(3, t.percent)}%`), n.appendChild(a), o.appendChild(n) }), n.appendChild(o); let a = t && t._commDailyHover || 0; o.addEventListener("pointerover", n => { const i = n.target && n.target.closest ? n.target.closest(".comm-daily-col") : null, r = i && o.contains(i) ? Number(i.dataset.day) : 0; if (r) return "touch" === n.pointerType && r === a && t && t._commDailyTip ? (a = 0, t._commDailyHover = 0, void this._commCloseDailyTip(t)) : void (r !== a && (a = r, t && (t._commDailyHover = r), this._commOpenDailyTip(t, i, e.days[r - 1], e))) }), n.addEventListener("pointerleave", e => { "touch" !== e.pointerType && (a = 0, t && (t._commDailyHover = 0), this._commCloseDailyTip(t)) }), a && window.requestAnimationFrame(() => { if (!t || !n.isConnected) return; const i = o.querySelector(`.comm-daily-col[data-day="${a}"]`); i && "function" == typeof n.matches && n.matches(":hover") && this._commOpenDailyTip(t, i, e.days[a - 1], e) }), this._commEnsureRecordsScrollClose(t); const i = document.createElement("div"); i.className = "comm-daily-axis"; const r = e.days.length; return e.days.forEach(e => { const t = document.createElement("span"); t.textContent = 1 === e.day || e.day % 5 == 0 || e.day === r ? String(e.day) : "", i.appendChild(t) }), n.appendChild(i), n }, _commDailyTipText(e, t) { const n = e.format(t.value); return `${e.month}月${t.day}日 · ${n}${t.count ? ` · ${t.count} ${e.countLabel}` : ""}` }, _commOpenDailyTip(e, t, n, o) { if (!e || !t || !n) return; this._commCloseDailyTip(e); const a = document.createElement("div"); a.className = "comm-daily-tip"; const i = document.createElement("div"); i.className = "comm-daily-tip-date", i.textContent = `${o.month}月${n.day}日${n.day === o.today ? "（今天）" : ""}`; const r = document.createElement("div"); if (r.className = "comm-daily-tip-value", r.textContent = o.format(n.value), a.appendChild(i), a.appendChild(r), n.count) { const e = document.createElement("div"); e.className = "comm-daily-tip-sub", e.textContent = `${n.count} ${o.countLabel}`, a.appendChild(e) } const { bubble: s, close: c } = this._showBubble({ target: t, content: a, placement: "top", width: 150, maxWidth: "70vw", className: "comm-daily-tip-wrap", closeOnClickAway: !0, closeOnTargetClick: !1, onClose: () => { e._commDailyTip && e._commDailyTip.bubble === s && (e._commDailyTip = null) } }); e._commDailyTip = { bubble: s, close: c } }, _commCloseTransientBubble(e, t) { if (!e || !e[t]) return; const n = e[t]; e[t] = null; try { n.close() } catch (e) { } }, _commCloseDailyTip(e) { this._commCloseTransientBubble(e, "_commDailyTip") }, _commDurationSeconds(e) { const t = String(null == e ? "" : e); if (!t) return 0; let n = 0; const o = t.match(/(\d+)\s*(?:小时|时)/), a = t.match(/(\d+)\s*分/), i = t.match(/(\d+)\s*秒/); if (o && (n += 3600 * Number(o[1])), a && (n += 60 * Number(a[1])), i && (n += Number(i[1])), 0 === n) { const e = this._commNum(t); null !== e && (n = e) } return n }, _commFormatDuration(e) { const t = Math.max(0, Math.round(Number(e) || 0)); if (!t) return "0 秒"; const n = Math.floor(t / 3600), o = Math.floor(t % 3600 / 60), a = t % 60; return n ? `${n} 小时 ${o} 分` : o ? `${o} 分 ${a} 秒` : `${a} 秒` }, _commMini(e, t, n = {}) { const o = document.createElement("div"), a = "function" == typeof n.onClick; o.className = "comm-mini" + (a ? " comm-mini-clickable" : ""); const i = document.createElement("div"); i.className = "comm-mini-value", i.textContent = t, o.appendChild(i); const r = document.createElement("div"); return r.className = "comm-mini-label", r.textContent = e, o.appendChild(r), a ? o.title = n.title || `点击查看「${e}」明细` : n.title && (o.title = n.title), a && o.addEventListener("click", e => { e.stopPropagation(), n.onClick(o) }), o }, _commMiniBubble(e, t, n, o, a) { const i = !!n && "object" == typeof n && !Array.isArray(n) && 1 === n.nodeType; if (!e || !n || !i && !n.length) return; const r = !(!o || !o._commMiniTip || o._commMiniTip.key !== t); if (this._commCloseTransientBubble(o, "_commMiniTip"), r) return; const s = document.createElement("div"); s.className = "comm-mini-tip"; const c = document.createElement("div"); c.className = "comm-mini-tip-title"; const l = document.createElement("span"); l.className = "comm-mini-tip-headtext", l.textContent = t, c.appendChild(l); let d = null; if ("records" === String(o && o._commActiveTab || "") && this._commRecordMonth(o) !== this._commThisMonth()) { const e = document.createElement("button"); e.type = "button", e.className = "comm-mini-tip-back", e.textContent = "本月", e.title = "回到本月（改回实体数据）", e.addEventListener("click", e => { e.stopPropagation(), o._commRecordMonth = "", this._commRefreshRecordsPanel(o), "function" == typeof d && d() }), c.appendChild(e) } s.appendChild(c), s.appendChild(i ? n : this._commKVGrid(n)); const { bubble: p, close: h } = this._showBubble({ target: e, content: s, placement: a || "auto", width: 320, maxWidth: "92vw", className: "comm-mini-tip-wrap", closeOnClickAway: !0, closeOnTargetClick: !1, onClose: () => { o && o._commMiniTip && o._commMiniTip.bubble === p && (o._commMiniTip = null) } }); return d = h, o && (o._commMiniTip = { bubble: p, close: h, key: t }), { bubble: p, close: h } }, _commHourChart(e) { const t = []; for (let e = 0; e < 24; e++)t.push({ hour: e, seconds: 0, count: 0 }); (e || []).forEach(e => { const n = Number(e && e.hour); n >= 0 && n < 24 && (t[n] = { hour: n, seconds: e.seconds || 0, count: e.count || 0 }) }); const n = document.createElement("div"); if (n.className = "comm-hour-chart", !t.some(e => e.seconds)) return n; const o = "http://www.w3.org/2000/svg", a = Math.max(...t.map(e => e.seconds)), i = e => Number(e).toFixed(2), r = e => 12 * (e + .5), s = e => 64 - e / a * 56, c = t.map(e => [r(e.hour), s(e.seconds)]), l = []; c.forEach((e, t) => { if (!t) return void l.push(`M${i(e[0])},${i(e[1])}`); const n = c[t - 1], o = c[t - 2] || n, a = c[t + 1] || e, r = n[0] + (e[0] - o[0]) / 6, s = n[1] + (e[1] - o[1]) / 6, d = e[0] - (a[0] - n[0]) / 6, p = e[1] - (a[1] - n[1]) / 6; l.push(`C${i(r)},${i(s)} ${i(d)},${i(p)} ${i(e[0])},${i(e[1])}`) }); const d = l.join(" "), p = `${d} L${i(c[23][0])},64 L${i(c[0][0])},64 Z`, h = document.createElementNS(o, "svg"); h.setAttribute("viewBox", "0 0 288 64"), h.setAttribute("preserveAspectRatio", "none"), h.setAttribute("class", "comm-hour-svg"); const u = document.createElementNS(o, "path"); u.setAttribute("d", p), u.setAttribute("class", "comm-hour-area"), h.appendChild(u); const m = document.createElementNS(o, "path"); m.setAttribute("d", d), m.setAttribute("class", "comm-hour-line"), h.appendChild(m); const f = t.reduce((e, t) => t.seconds > e.seconds ? t : e, t[0]); t.forEach(e => { if (!e.seconds) return; const t = document.createElementNS(o, "circle"); t.setAttribute("cx", i(r(e.hour))), t.setAttribute("cy", i(s(e.seconds))), t.setAttribute("r", e === f ? 2.6 : 1.5), t.setAttribute("class", e === f ? "comm-hour-dot comm-hour-dot-peak" : "comm-hour-dot"), h.appendChild(t) }), t.forEach(e => { const t = document.createElementNS(o, "rect"); t.setAttribute("x", i(r(e.hour) - 6)), t.setAttribute("y", "0"), t.setAttribute("width", i(12)), t.setAttribute("height", String(64)), t.setAttribute("fill", "transparent"); const n = document.createElementNS(o, "title"); n.textContent = `${String(e.hour).padStart(2, "0")} 时 · ` + (e.seconds ? this._commFormatDuration(e.seconds) : "无上网") + (e.count ? ` · ${e.count} 次会话` : ""), t.appendChild(n), h.appendChild(t) }), n.appendChild(h); const g = document.createElement("div"); g.className = "comm-hour-axis", [0, 6, 12, 18, 23].forEach(e => { const t = document.createElement("span"); t.className = "comm-hour-tick", t.textContent = String(e), t.style.left = `${i((e + .5) / 24 * 100)}%`, g.appendChild(t) }), n.appendChild(g); const y = t.filter(e => e.seconds > 0).length, b = document.createElement("div"); b.className = "comm-hour-foot"; const x = document.createElement("span"); x.className = "comm-hour-peak", x.textContent = `峰值 ${String(f.hour).padStart(2, "0")} 时 · ${this._commFormatDuration(f.seconds)}`, b.appendChild(x); const _ = document.createElement("span"); return _.className = "comm-hour-meta", _.textContent = `${y} / 24 个时段有会话`, b.appendChild(_), n.appendChild(b), n }, _commRankN(e) { const t = Number(e && e._commRankN); return [5, 10, 20, 0].indexOf(t) >= 0 ? t : 5 }, _commRankNToggle(e, t) { const n = this._commRankN(e), o = document.createElement("div"); o.className = "comm-record-tabs comm-rank-n"; const a = document.createElement("div"); return a.className = "comm-record-tabs-slot", [[5, "Top5"], [10, "Top10"], [20, "Top20"], [0, "全部"]].forEach(o => { const i = o[0], r = o[1], s = document.createElement("button"); s.type = "button", s.className = "comm-record-tab" + (i === n ? " active" : ""), s.textContent = r, s.title = i ? `只看前 ${i} 位` : "列出全部", s.addEventListener("click", o => { o.stopPropagation(), i !== n && (e._commRankN = i, "function" == typeof t ? t() : this._commRefreshRecordsPanel(e)) }), a.appendChild(s) }), o.appendChild(a), o }, _commSubTitle(e) { const t = document.createElement("div"); return t.className = "comm-sub-title", t.textContent = e, t }, _commRankList(e, t, n) { const o = document.createElement("div"); return o.className = "comm-rank-list", e.forEach((e, a) => { const i = document.createElement("div"); i.className = "comm-rank-item" + (e.number === n ? " active" : ""), i.dataset.number = e.number, i.title = `${e.number} 本月通话 ${e.count || 1} 次，累计 ${this._commFormatDuration(e.seconds)}（点击筛选）`; const r = document.createElement("span"); r.className = `comm-rank-no rank-${a + 1}`, r.textContent = String(a + 1); const s = document.createElement("span"); s.className = "comm-rank-number", s.textContent = this._commPhoneText(e.number, t), s.title = this._commPhoneText(e.number, t); const c = document.createElement("span"); c.className = "comm-rank-value", c.textContent = this._commFormatDuration(e.seconds); const l = document.createElement("span"); l.className = "comm-rank-count", l.textContent = `${e.count || 1} 次`; const d = document.createElement("span"); d.className = "comm-rank-time", d.textContent = e.time || "", i.appendChild(r), i.appendChild(s), i.appendChild(c), i.appendChild(l), i.appendChild(d), i.addEventListener("click", n => { n.stopPropagation(), this._commToggleCallFilter(t, { type: "number", value: e.number }) }), o.appendChild(i) }), o }, _commCallMatch(e, t) { if (!t || !t.value) return !0; if ("place" === t.type) { const n = this._commCallPlace(e, t.scope); return Array.isArray(t.values) ? -1 !== t.values.indexOf(n) : n === t.value } return String(e.phone_number || "") === t.value }, _commToggleCallFilter(e, t) { this._commTogglePlaceFilter(e, "call", t) }, _commTogglePlaceFilter(e, t, n) { if (!e) return; const o = "sms" === t ? "_commSmsFilter" : "traffic" === t ? "_commTrafficFilter" : "_commCallFilter", a = e[o] || null, i = e => e && Array.isArray(e.values) ? e.values.slice().sort().join("|") : String(e && e.value || ""), r = n && a && a.type === n.type && i(a) === i(n) && ("place" !== n.type || a.scope === n.scope); e[o] = r || !n ? null : n, this._commRefreshRecordsPanel(e) }, _commFilterItemsByPlace(e, t) { const n = e || []; if (!t || "place" !== t.type) return n; const o = Array.isArray(t.values) ? t.values : [t.value], a = new Set(o.filter(e => null != e && "" !== e).map(e => String(e).trim())); return a.size ? n.filter(e => { const n = this._commGeoItem(e), o = String("number_location" === t.scope ? n.number_location : n.location).trim(); return a.has(o) }) : n }, _commFilterText(e, t, n) { return `${e && "place" === e.type ? ("number_location" === e.scope ? "对方地点 " : "我的地点 ") + this._commFilterValueText(e) : ""} · ${t} / 共 ${n} 条` }, _commFilterValueText: e => e ? Array.isArray(e.values) ? 1 === e.values.length ? String(e.values[0]) : `${e.values.length} 个地点` : String(e.value || "") : "", _commFilterBar(e, t, n, o) { if (!e) return null; const a = document.createElement("div"); a.className = "comm-filter-bar"; const i = document.createElement("span"); i.className = "comm-filter-text", i.textContent = this._commFilterText(e, t, n), a.appendChild(i); const r = document.createElement("button"); return r.type = "button", r.className = "comm-filter-clear", r.textContent = "清除筛选", r.title = `当前筛选：${this._commFilterText(e, t, n)}`, r.addEventListener("click", e => { e.stopPropagation(), o() }), a.appendChild(r), a }, _commSortDefaultDir: e => "location" === e || "type" === e ? "asc" : "desc", _commToggleCallSort(e, t) { if (!e || !t) return; const n = e._commCallSort || null; n && n.key === t ? e._commCallSort = { key: t, dir: "asc" === n.dir ? "desc" : "asc" } : e._commCallSort = { key: t, dir: this._commSortDefaultDir(t) }, this._commRefreshRecordsPanel(e) }, _commSortCalls(e, t, n) { const o = (e || []).slice(); if (!t || !t.key) return o; const a = "asc" === t.dir ? 1 : -1, i = (e, t) => String(t.call_time || "").localeCompare(String(e.call_time || "")); if ("duration" === t.key) return o.sort((e, t) => a * (this._commDurationSeconds(e.duration) - this._commDurationSeconds(t.duration)) || i(e, t)), o; if ("location" === t.key) { const e = e => this._commCallPlace(e, n); return o.sort((t, n) => a * e(t).localeCompare(e(n), "zh") || i(t, n)), o } if ("type" === t.key) { const e = e => String(e.type || "").trim(); return o.sort((t, n) => a * e(t).localeCompare(e(n), "zh") || i(t, n)), o } return o.sort((e, t) => a * String(e.call_time || "").localeCompare(String(t.call_time || ""))), o }, _commSortBar(e, t) { const n = t && t.key ? t : { key: "time", dir: "desc" }, o = document.createElement("div"); o.className = "comm-sort-bar"; const a = document.createElement("span"); a.className = "comm-sort-label"; const i = document.createElement("ha-icon"); i.setAttribute("icon", "mdi:sort-variant"), a.appendChild(i); const r = document.createElement("span"); r.textContent = "排序", a.appendChild(r), o.appendChild(a); const s = document.createElement("div"); return s.className = "comm-sort-keys", [{ key: "time", label: "时间" }, { key: "duration", label: "时长" }, { key: "type", label: "类型" }, { key: "location", label: "地点" }].forEach(t => { const o = n.key === t.key, a = "asc" === n.dir ? "asc" : "desc", i = document.createElement("button"); i.type = "button", i.className = "comm-sort-key" + (o ? " active" : ""), i.dataset.key = t.key; const r = document.createElement("span"); if (r.textContent = t.label, i.appendChild(r), o) { const e = document.createElement("ha-icon"); e.setAttribute("icon", "asc" === a ? "mdi:arrow-up" : "mdi:arrow-down"), i.appendChild(e) } const c = e => "asc" === e ? "升序" : "降序"; i.title = o ? `当前按${t.label}${c(a)}，点击切换为${c("asc" === a ? "desc" : "asc")}` : `按${t.label}${c(this._commSortDefaultDir(t.key))}排序`, i.addEventListener("click", n => { n.stopPropagation(), this._commToggleCallSort(e, t.key) }), s.appendChild(i) }), o.appendChild(s), o }, _commViewToggle(e) { const t = "map" === e._commDetailView ? "map" : "list", n = document.createElement("div"); return n.className = "comm-view-toggle", [{ key: "list", label: "列表", icon: "mdi:format-list-bulleted" }, { key: "map", label: "地图", icon: "mdi:map-marker-path" }].forEach(o => { const a = document.createElement("button"); a.type = "button", a.className = "comm-view-key" + (t === o.key ? " active" : ""), a.dataset.view = o.key; const i = document.createElement("ha-icon"); i.setAttribute("icon", o.icon), a.appendChild(i); const r = document.createElement("span"); r.textContent = o.label, a.appendChild(r), a.title = "map" === o.key ? "在地图上查看通话流向（点地点可筛选明细）" : "按流水清单逐条查看（可排序、可筛选）", a.addEventListener("click", t => { t.stopPropagation(), a.classList.contains("active") || (e._commDetailView = o.key, this._commRefreshRecordsPanel(e)) }), n.appendChild(a) }), n }, _commDefaultMapView: () => ({ zoom: 1.45, center: [104.5, 35.5] }), _commMapFullscreenBtn(e, t, n, o) { const a = document.createElement("button"); a.type = "button", a.className = "comm-map-fs-btn"; const i = document.createElement("ha-icon"); i.setAttribute("icon", "mdi:fullscreen"), a.appendChild(i), a.title = "全屏查看地图"; const r = () => !!(e && e.classList && e.classList.contains("map-fullscreen")), s = () => { this._timers.setTimeout(() => { const e = t && (t._commChart || t._commAnaChart); if (!(!e || e.isDisposed && e.isDisposed())) try { e.resize() } catch (e) { } }, 60) }, c = o || e, l = t => { "Escape" === t.key && (e.isConnected ? p() : document.removeEventListener("keydown", l)) }, d = e => { i.setAttribute("icon", e ? "mdi:fullscreen-exit" : "mdi:fullscreen"), a.title = e ? "退出全屏（Esc）" : "全屏查看地图", (() => { const e = c._commFsKeyHandler; e && (document.removeEventListener("keydown", e), c._commFsKeyHandler = null) })(), e && (document.addEventListener("keydown", l), c._commFsKeyHandler = l) }, p = () => { r() && (e.classList.remove("map-fullscreen"), d(!1), "function" == typeof n && n(!1), s()) }; return a.addEventListener("click", t => { t.stopPropagation(), r() ? p() : (e.classList.add("map-fullscreen"), d(!0), "function" == typeof n && n(!0), s()) }), r() && d(!0), a }, _commMigrationChart(e, t, n, o, a) { const i = document.createElement("div"); i.className = "comm-map-wrap"; const r = a && a.onToggle || (e => this._commToggleCallFilter(t, e)), s = this._commGeoGraph(e); if (!s.cities.length) { const e = document.createElement("div"); return e.className = "comm-tip", e.textContent = "当前流水里没有坐标数据（location_coordinate / number_location_coordinate），无法绘制地图。", i.appendChild(e), i } const c = document.createElement("div"); c.className = "comm-map-canvas", c.dataset.rmPassiveExempt = "1", i.appendChild(c), t && !0 === t._commMapFs && i.classList.add("map-fullscreen"), i.appendChild(this._commMapFullscreenBtn(i, c, e => { t && (t._commMapFs = e) }, t)); const l = document.createElement("div"); l.className = "comm-map-legend"; const d = []; return s.flows.length ? (d.push("橙线 = 呼叫（我的地点→对方地点）· 紫线 = 接听（对方地点→我的地点）· 线越粗 = 该流向通话时长越长"), d.push("地图可拖动 / 双指或滚轮缩放、双击复位 · 点圆点筛该地点、点省份筛该省、点线看流向详情 · 点的大小 = 该地点通话次数")) : d.push("当前筛选下全是同城通话，没有跨城市流向，仅显示地点分布"), s.missing && d.push(`另有 ${s.missing} 条记录缺坐标，未在图上显示`), l.textContent = d.join(" · "), i.appendChild(l), this._loadEchartsUnified().then(e => this._commLoadChinaMap(e).then(() => e)).then(a => { if (!c.isConnected || !t.isConnected) return; const i = a.init(c, null, this._commMapInitOpts()); c._commChart = i, c._commReleasePause = this._commMapAutoPause(i, c); const l = new Map(s.flows.map(e => [`${e.dir}|${e.from}→${e.to}`, e])); i.setOption(this._commMigrationOption(s, this._commPlaceToneMap(e), n, o, t._commMapView)); let d = 0; i.on("georoam", () => { const e = Date.now(); if (e - d < 200) return; if (d = e, i.isDisposed()) return; const n = i.getOption().geo, o = Array.isArray(n) ? n[0] : n; o && (t._commMapView = { zoom: o.zoom, center: o.center }) }), i.on("dblclick", () => { t._commMapView = null, i.setOption({ geo: this._commDefaultMapView() }) }), i.on("click", e => { if (!e) return; const o = e.data || {}; if ("geo" === e.componentType) { const o = this._commCitiesInProvince(s, e.name), a = o.filter(e => e.mine), i = o.filter(e => e.other); let r = n; !a.length && i.length ? r = "number_location" : !i.length && a.length && (r = "location"); const c = ("number_location" === r ? i : a).map(e => e.name); return void (c.length && this._commToggleCallFilter(t, { type: "place", scope: r, values: c })) } if ("通话地点" === e.seriesName) { const t = String(o.name || e.name || ""); if (!t) return; const a = s.cities.find(e => e.name === t); let i = n; return a && (!a.mine && a.other ? i = "number_location" : a.mine && !a.other && (i = "location")), void r({ type: "place", scope: i, value: t }) } const a = l.get(`${o.dir}|${o.from}→${o.to}`), i = e.event && (e.event.event || e.event) || {}; a && this._commShowFlowBubble(t, c, a, { x: i.clientX, y: i.clientY }, r) }); const p = new ResizeObserver(() => { !i.isDisposed() && c.isConnected ? i.resize() : p.disconnect() }); p.observe(c) }).catch(e => { c.remove(); const t = document.createElement("div"); t.className = "comm-tip", t.textContent = `地图绘制失败：${e && e.message || e}（可切回「列表」查看，或确认 /local/pobaby_package/js/ 下有 china.geo.json 或 china.json）`, i.appendChild(t) }), i }, _commMapPerf(e) { const t = (e && e.flows || []).length, n = (e && e.cities || []).length; return { flowN: t, cityN: n, flowEffect: t <= 150, rippleAlways: n <= 40 } }, _commMapInitOpts: () => ({ renderer: "canvas", devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2), useDirtyRect: !0 }), _commMapAutoPause(e, t) { const n = e && "function" == typeof e.getZr ? e.getZr() : null, o = n && n.animation; if (!o || "function" != typeof o.pause || "function" != typeof o.resume) return () => { }; let a = "boolean" != typeof document.hidden || !document.hidden, i = !0, r = !1, s = null; const c = () => { if (!r && t.isConnected) try { a && i ? o.resume() : o.pause() } catch (e) { } }, l = () => { if (!r && (r = !0, document.removeEventListener("visibilitychange", d), s)) { try { s.disconnect() } catch (e) { } s = null } }, d = () => { a = !document.hidden, c() }; return document.addEventListener("visibilitychange", d), "function" == typeof IntersectionObserver && (s = new IntersectionObserver(e => { const n = e && e[0]; n && (i = !!n.isIntersecting, c(), t.isConnected || l()) }, { threshold: .01 }), s.observe(t)), c(), l }, _commMigrationOption(e, t, n, o, a, i) { const r = this._commPlacePalette(), s = this._commDefaultMapView(), c = a && a.zoom || s.zoom, l = a && a.center || s.center, d = o && "place" === o.type && o.scope === n ? new Set(Array.isArray(o.values) ? o.values : [o.value]) : null, p = e => !!d && d.has(e), h = e.cities.reduce((e, t) => Math.max(e, t.count), 1), u = e.flows.reduce((e, t) => Math.max(e, t.seconds || 0), 1), m = [{ dir: "out", name: "呼叫", color: "#fb8c00", hot: "#e65100" }, { dir: "in", name: "接听", color: "#7e57c2", hot: "#4527a0" }], f = this._commMapPerf(e), g = "boolean" == typeof i ? i : f.flowEffect, y = "boolean" == typeof i ? i : f.rippleAlways, b = t => ({ name: t.name, type: "lines", coordinateSystem: "geo", zlevel: 1, effect: { show: g, period: 5, trailLength: .2, symbol: "circle", symbolSize: 2.6, color: "#ffffff" }, lineStyle: { color: t.color, width: 1, opacity: .55, curveness: "in" === t.dir ? .22 : .18 }, data: e.flows.filter(e => e.dir === t.dir).map(e => { const n = !d || p(e.from) || p(e.to); return { coords: [e.fromCoord, e.toCoord], from: e.from, to: e.to, dir: e.dir, count: e.count, secondsText: this._commFormatDuration(e.seconds), lineStyle: { width: .8 + 2.2 * Math.sqrt((e.seconds || 0) / u), opacity: d ? n ? .92 : .1 : .55, color: n && d ? t.hot : t.color } } }) }); return { backgroundColor: "transparent", animationDuration: 700, tooltip: { trigger: "item", confine: !0, backgroundColor: "rgba(255, 255, 255, 0.96)", borderColor: "rgba(0, 0, 0, 0.08)", textStyle: { color: "#2c3e50", fontSize: 12 }, formatter: e => { const t = e.data || {}; return "lines" === e.seriesType ? `<b>${t.from} → ${t.to}</b><br/>${"in" === t.dir ? "接听" : "呼叫"} · 通话 ${t.count} 次 · 累计 ${t.secondsText}` : `<b>${e.name}</b><br/>通话 ${t.count} 次<br/>作为我的地点 ${t.mine} 次 · 作为对方地点 ${t.other} 次` } }, geo: { map: "china", roam: !0, scaleLimit: { min: .9, max: 8 }, zoom: c, center: l, silent: !1, emphasis: { disabled: !0, label: { show: !1 } }, select: { disabled: !0 }, itemStyle: { areaColor: "rgba(33, 150, 243, 0.05)", borderColor: "rgba(33, 150, 243, 0.30)", borderWidth: .6 } }, series: [b(m[0]), b(m[1]), { name: "通话地点", type: "effectScatter", coordinateSystem: "geo", zlevel: 2, showEffectOn: y ? "render" : "emphasis", rippleEffect: { brushType: "stroke", scale: 2.2, period: 4 }, symbolSize: e => 7 + Math.round(9 * Math.sqrt((e[2] || 1) / h)), data: e.cities.map((e, n) => { return { name: e.name, value: [e.coord[0], e.coord[1], e.count], count: e.count, mine: e.mine, other: e.other, itemStyle: { color: p(e.name) ? "#e65100" : (o = e.name, r[(t && t.has(o) ? t.get(o) : 0) % r.length]), shadowBlur: 6, shadowColor: "rgba(0, 0, 0, 0.18)" }, label: { show: n < 10 || p(e.name), color: "#37474f", fontSize: 10, position: "right", distance: 3, formatter: "{b}" } }; var o }) }] } }, _commShowFlowBubble(e, t, n, o) { if (!e || !t || !n) return; if (e._commFlowBubble) { try { e._commFlowBubble.close() } catch (e) { } e._commFlowBubble = null } const a = document.createElement("div"); a.className = "comm-flow-bubble"; const i = document.createElement("div"); i.className = "comm-flow-head"; const r = document.createElement("span"); r.className = "comm-flow-dir comm-flow-dir-" + ("in" === n.dir ? "in" : "out"), r.textContent = "in" === n.dir ? "接听" : "呼叫", i.appendChild(r); const s = document.createElement("span"); s.className = "comm-flow-title", s.textContent = `${n.from} → ${n.to}`, i.appendChild(s), a.appendChild(i); const c = document.createElement("div"); c.className = "comm-mini-grid comm-mini-grid-3", c.appendChild(this._commMini("通话次数", `${n.count} 次`)), c.appendChild(this._commMini("累计时长", this._commFormatDuration(n.seconds))), c.appendChild(this._commMini("平均时长", this._commFormatDuration(Math.round(n.seconds / Math.max(1, n.count))))), a.appendChild(c); const l = n.calls || []; if (l.length) { a.appendChild(this._commSubTitle(`这条线上的通话（最近 ${Math.min(l.length, 12)} 条）`)); const t = document.createElement("div"); if (t.className = "comm-flow-list", l.slice(0, 12).forEach(n => { const o = document.createElement("div"); o.className = "comm-flow-row"; const a = document.createElement("span"); a.className = "comm-flow-time", a.textContent = this._commShortTime(n.call_time), o.appendChild(a); const i = String(n.phone_number || "未知号码"), r = document.createElement("span"); r.className = "comm-flow-num", r.textContent = this._commPhoneText(i, e), r.title = this._commPhoneText(i, e), o.appendChild(r); const s = document.createElement("span"); s.className = "comm-flow-dur", s.textContent = String(n.duration || ""), o.appendChild(s), t.appendChild(o) }), a.appendChild(t), l.length > 12) { const e = document.createElement("div"); e.className = "comm-tip", e.textContent = `仅列出最近 12 条，共 ${l.length} 条`, a.appendChild(e) } } const d = "in" === n.dir ? n.to : n.from, p = document.createElement("div"); p.className = "comm-flow-actions"; const h = document.createElement("button"); h.type = "button", h.className = "comm-flow-filter", h.textContent = `筛选该流向（${d}）`, h.title = `按「我的地点 = ${d}」筛选下方明细`, h.addEventListener("click", t => { t.stopPropagation(); const n = e._commFlowBubble; if (e._commFlowBubble = null, n) try { n.close() } catch (e) { } ("function" == typeof onToggle ? onToggle : t => this._commToggleCallFilter(e, t))({ type: "place", scope: "location", value: d }) }), p.appendChild(h), a.appendChild(p); const u = o && Number.isFinite(o.x) && Number.isFinite(o.y) ? o : null; e._commFlowBubble = this._showBubble({ target: t, content: a, clickPoint: u, closeOnTargetClick: !1, placement: "bottom", width: 300, maxWidth: "86vw", maxHeight: "60vh", className: "comm-flow-bubble-wrap" }) }, _commScrollAncestors(e) { const t = []; let n = e, o = 0; for (; n && o++ < 12;)if (n.scrollTop && t.push({ el: n, top: n.scrollTop }), n.parentElement) n = n.parentElement; else { const e = n.getRootNode && n.getRootNode(); n = e && e.host ? e.host : null } return t }, _commRefreshRecordsPanel(e) { if (!e) return; const t = e.querySelector('.comm-panel[data-panel="records"]'); if (!t) return; const n = this._commScrollAncestors(t), o = window.scrollY || 0; if (e._commFlowBubble) { try { e._commFlowBubble.close() } catch (e) { } e._commFlowBubble = null } this._commDisposeRings(t); const a = e._commConfig || {}, i = this._commLoadAll(a), r = this._commBuildRecordsPanel(this._commActiveContext(e, a, i), e); t.replaceWith(r), n.forEach(({ el: e, top: n }) => { const o = e === t ? r : e; o && o.isConnected && o.scrollTop !== n && (o.scrollTop = n) }), o && Math.abs((window.scrollY || 0) - o) > 1 && window.scrollTo(0, o) }, _commCallView(e) { const t = this._commProp(e, ["通话流水清单", "通话明细"]); return { items: (Array.isArray(t) ? t.filter(e => e && "object" == typeof e) : []).slice().sort((e, t) => String(t.call_time || "").localeCompare(String(e.call_time || ""))) } }, _commPlacePalette: () => ["#1565c0", "#00695c", "#283593", "#2e7d32", "#6a1b9a", "#37474f", "#0277bd", "#827717"], _commCoord(e) { let t = null, n = null; if (Array.isArray(e) && e.length >= 2) t = Number(e[0]), n = Number(e[1]); else { const o = String(null == e ? "" : e).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/); if (!o) return null; t = Number(o[1]), n = Number(o[2]) } return Number.isFinite(t) && Number.isFinite(n) ? t < 1 || t > 180 || n < 1 || n > 90 ? null : [t, n] : null }, _commPointInRing(e, t, n) { let o = !1; for (let a = 0, i = n.length - 1; a < n.length; i = a++) { const r = n[a][0], s = n[a][1], c = n[i][0], l = n[i][1]; s > t != l > t && e < (c - r) * (t - s) / (l - s) + r && (o = !o) } return o }, _commPointInGeometry(e, t) { if (!e || !t) return !1; const [n, o] = e, a = "Polygon" === t.type ? [t.coordinates] : "MultiPolygon" === t.type ? t.coordinates : []; for (const e of a) if (e && e.length && this._commPointInRing(n, o, e[0])) return !0; return !1 }, _commCitiesInProvince(e, t) { const n = this.constructor._commChinaGeo; if (!n || !Array.isArray(n.features) || !t) return []; const o = n.features.find(e => e.properties && e.properties.name === t); return o && o.geometry ? (e && e.cities || []).filter(e => this._commPointInGeometry(e.coord, o.geometry)) : [] }, _commGeoItem(e) { const t = e || {}, n = (...e) => { for (const n of e) { const e = String(void 0 === t[n] || null === t[n] ? "" : t[n]).trim(); if (e) return e } return "" }, o = (...e) => { for (const n of e) if (t[n]) return t[n]; return "" }; return { ...t, location: n("location", "my_place", "place"), location_coordinate: o("location_coordinate", "my_coordinate"), number_location: n("number_location", "party_place", "other_place"), number_location_coordinate: o("number_location_coordinate", "party_coordinate", "other_coordinate"), type: n("type", "msg_type"), duration: void 0 !== t.duration && null !== t.duration ? t.duration : t.duration_seconds } }, _commGeoGraph(e) { const t = new Map, n = new Map; let o = 0; const a = (e, n, o) => { if (!e) return; let a = t.get(e); a || (a = { name: e, coord: null, count: 0, mine: 0, other: 0 }, t.set(e, a)), !a.coord && n && (a.coord = n), a[o] += 1 }; (e || []).forEach(e => { const t = e || {}, i = String(t.location || "").trim(), r = String(t.number_location || "").trim(), s = this._commCoord(t.location_coordinate), c = this._commCoord(t.number_location_coordinate); if ((i && !s || r && !c) && (o += 1), a(i, s, "mine"), a(r, c, "other"), !i || !r || i === r) return; const l = "←" === this._commCallDirArrow(t.type), d = { from: l ? r : i, to: l ? i : r, fromCoord: l ? c : s, toCoord: l ? s : c, dir: l ? "in" : "out" }; if (!d.fromCoord || !d.toCoord) return; const p = `${d.dir}|${d.from}→${d.to}`; let h = n.get(p); h || (h = { ...d, count: 0, seconds: 0, calls: [] }, n.set(p, h)), h.count += 1, h.seconds += this._commDurationSeconds(t.duration), h.calls.push(t) }); const i = Array.from(t.values()).filter(e => !!e.coord); i.forEach(e => { e.count = e.mine + e.other }), i.sort((e, t) => t.count - e.count || e.name.localeCompare(t.name, "zh")); const r = Array.from(n.values()).filter(e => !(e.fromCoord[0] === e.toCoord[0] && e.fromCoord[1] === e.toCoord[1])).sort((e, t) => t.count - e.count || t.seconds - e.seconds); return r.forEach(e => e.calls.sort((e, t) => String(t.call_time || "").localeCompare(String(e.call_time || "")))), { cities: i, flows: r, missing: o } }, _commLoadChinaMap(e) { const t = this.constructor; if (t._commChinaMapReady) return Promise.resolve(); if (t._commChinaMapPromise) return t._commChinaMapPromise; const n = ["/local/pobaby_package/js/china.json", "/local/pobaby_package/js/china.geo.json", "https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/china.json"]; return t._commChinaMapPromise = (async () => { let o = null; for (const a of n) try { const n = await fetch(a, { cache: "force-cache" }); if (!n.ok) throw new Error(`HTTP ${n.status}`); const o = JSON.parse((await n.text()).replace(/^\uFEFF/, "")); if (!o || !Array.isArray(o.features)) throw new Error("不是有效的 GeoJSON"); return e.registerMap("china", o), t._commChinaGeo = o, void (t._commChinaMapReady = !0) } catch (e) { o = e } throw t._commChinaMapPromise = null, o || new Error("中国地图数据加载失败") })(), t._commChinaMapPromise }, _commPlaceToneMap(e) { const t = [], n = e => { const n = String(e || "").trim(); n && -1 === t.indexOf(n) && t.push(n) }; (e || []).forEach(e => { const t = this._commGeoItem(e); n(t.location), n(t.number_location) }), t.sort((e, t) => e.localeCompare(t, "zh")); const o = new Map; return t.forEach((e, t) => o.set(e, t % 8)), o }, _commCallList(e, t, n) { const o = document.createElement("div"); o.className = "comm-call-list"; const a = this._commTodayKey(); return e.forEach(e => { const i = String(e.call_time || "").slice(0, 10) === a, r = document.createElement("div"); r.className = "comm-call-item" + (i ? " today" : ""); const s = document.createElement("div"); s.className = "comm-call-main"; const c = String(e.type || "").trim(), l = document.createElement("span"); l.className = "comm-call-type" + (/呼出|主叫|呼叫/.test(c) ? " out" : /接听|被叫/.test(c) ? " in" : ""), l.textContent = c || "通话", s.appendChild(l); const d = String(e.phone_number || "未知号码"), p = document.createElement("span"); p.className = "comm-call-number", p.textContent = this._commPhoneText(d, n), p.title = this._commPhoneText(d, n), s.appendChild(p); const h = document.createElement("span"); h.className = "comm-call-duration", h.textContent = String(e.duration || ""), s.appendChild(h), r.appendChild(s); const u = document.createElement("div"); u.className = "comm-call-meta"; let m = !1; const f = this._commShortTime(e.call_time); if (f) { const e = document.createElement("span"); e.className = "comm-call-meta-time", e.textContent = f, u.appendChild(e), m = !0 } const g = String(e.call_type || "").trim(); if (g) { const e = document.createElement("span"); e.className = `comm-call-chip comm-call-chip-type comm-call-chip-${this._commCallTypeTone(g)}`, e.textContent = g, e.title = `通话类型：${g}`, u.appendChild(e), m = !0 } const y = this._commCallPlaceParts(e); if (y.segments.length) { const e = document.createElement("span"); e.className = "comm-call-chip comm-call-chip-place"; const n = document.createElement("ha-icon"); n.setAttribute("icon", "mdi:map-marker-outline"), e.appendChild(n), y.segments.forEach((n, o) => { if (o > 0 && y.arrow) { const t = document.createElement("span"); t.className = "comm-call-place-arrow", t.textContent = y.arrow, e.appendChild(t) } const a = t && t.has(n.text) ? t.get(n.text) : 0, i = document.createElement("span"); i.className = `comm-place-ink-${a}`, i.textContent = n.text, e.appendChild(i) }), e.title = `地点：${y.segments.map(e => e.text).join(y.arrow || "")}`, u.appendChild(e), m = !0 } const b = String(e.fee || "").trim(); if (b) { const e = document.createElement("span"); e.className = "comm-call-meta-fee" + (/^0(\.0+)?\s*元?$/.test(b) ? "" : " charge"), e.textContent = `费用 ${b}`, u.appendChild(e), m = !0 } if (m && r.appendChild(u), i) { const e = document.createElement("span"); e.className = "comm-call-today", e.textContent = "今日", r.appendChild(e) } o.appendChild(r) }), o }, _commCallTypeTone(e) { const t = String(e || ""); return /漫游/.test(t) ? "roaming" : /国际|境外|港澳台/.test(t) ? "international" : /视频/.test(t) ? "video" : "domestic" }, _commShortTime(e) { const t = String(e || "").trim(); if (!t) return ""; const n = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return n ? `${n[2]}-${n[3]} ${n[4]}:${n[5]}` : t }, _commAccountView(e, t) { const n = e && e.nodes || {}, o = t && t.fields || {}, a = e => this._commFieldNode(n, e, o), i = (e, t) => this._commNum(this._commProp(e, t)), r = e => this._commNum(e && e.state), s = (...e) => { for (const t of e) if (null != t) return t; return null }, c = e => null == e ? "" : String(e), l = a("account_status"), d = a("balance"), p = a("charge"), h = a("flow_remain"), u = a("flow_used"), m = a("voice_remain"), f = a("voice_used"), g = a("integral") || a("member_level") || a("star_level"), y = a("real_name"), b = a("phone_number"), x = a("speed_service"), _ = a("location"), v = a("last_update"), w = a("sms_remain"), C = function (...e) { for (const t of e) if (null != t && "" !== t) return t; return null }(this._commProp(l, ["是否欠费"]), this._commProp(d, ["是否欠费"])), k = null !== C && String(C).includes("是"), S = c(this._commProp(l, ["家庭融合"])), E = []; d && (Object.keys(d).forEach(e => { const t = e.match(/^历史\s*(\d{1,2})\s*月出账$/); if (!t) return; const n = this._commNum(d[e]); null !== n && E.push({ month: Number(t[1]), value: n }) }), E.sort((e, t) => t.month - e.month)); const T = E.reduce((e, t) => Math.max(e, t.value), 0) || 1; E.forEach(e => { e.percent = Math.max(4, e.value / T * 100) }); const $ = { value: s(i(d, ["当前可用话费", "当前话费", "可用余额"]), i(l, ["当前话费"]), r(d)), general: i(d, ["包含通用余额", "通用余额"]), special: i(d, ["包含专用余额", "专用余额"]), monthUsed: s(i(d, ["本月已消费"]), r(p)), lastMonth: s(i(d, ["上月出账费用", "上月出账"]), i(p, ["上月出账费用", "上月出账"])), owedAmount: s(i(d, ["欠费金额"]), i(l, ["欠费金额"])), history: E }, A = s(i(h, ["本月剩余流量", "剩余流量"]), r(h)), D = s(i(h, ["本月已用流量", "已用流量"]), r(u)), N = i(h, ["套餐流量总额", "流量总额"]); let L = i(h, ["剩余流量占比"]); null === L && null !== A && N && (L = A / N * 100); const M = this._commUnitOf(h) || "GB", I = { remain: A, used: D, total: N, percent: null === L ? 0 : Math.max(0, Math.min(100, L)), unit: M, members: this._commMergeMembers(this._commMembersFromNode(h), this._commMembersFromNode(u)), packs: this._commMergePacks(this._commPacksFromNode(h), this._commPacksFromNode(u)), poolType: c(this._commProp(h, ["流量池类型"])) }, z = s(i(m, ["本月剩余时长", "剩余时长", "剩余分钟"]), r(m)), P = s(i(f, ["总已用分钟", "本月已用时长", "已用分钟"]), i(m, ["本月已用时长"]), r(f)), R = s(i(m, ["套餐通话总额", "通话总额"]), i(f, ["套餐通话总额", "通话总额"])); let F = i(m, ["本月剩余占比", "剩余占比"]); null === F && null !== z && R && (F = z / R * 100); const H = this._commUnitOf(m) || this._commUnitOf(f) || "分钟", O = { remain: z, used: P, total: R, percent: null === F ? 0 : Math.max(0, Math.min(100, F)), unit: H, members: this._commMergeMembers(this._commMembersFromNode(f), this._commMembersFromNode(m)), packs: this._commMergePacks(this._commPacksFromNode(m), this._commPacksFromNode(f)), scope: c(this._commProp(f, ["通话范围"])) }, q = { value: s(i(g, ["可用积分", "积分"]), i(a("member_level"), ["可用积分", "积分"]), this._commNum(this._commPropAny(n, "可用积分")), this._commNum(this._commPropAny(n, "积分")), r(g)), unit: this._commUnitOf(g) || this._commUnitOf(a("member_level")) || "分", system: c(this._commProp(g, ["积分体系"]) || this._commProp(a("member_level"), ["积分体系"]) || this._commPropAny(n, "积分体系")), privilege: c(this._commProp(g, ["兑换特权"]) || this._commProp(a("member_level"), ["兑换特权"]) || this._commPropAny(n, "兑换特权")) }, B = { name: c(y && y.state || this._commProp(y, ["机主姓名"])), realNameStatus: c(this._commProp(y, ["实名认证状态"])), netAge: c(this._commProp(y, ["入网网龄"])), star: c(this._commProp(y, ["用户星级"])), memberLevel: c(this._commProp(y, ["会员等级"])), credit: c(this._commProp(y, ["信用额度"])), network: c(this._commProp(y, ["所属网络"])), landline: c(this._commProp(y, ["名下固话号码"])) }, j = { role: c(this._commProp(b, ["卡槽角色"])), mainPlan: c(this._commProp(b, ["主套餐名称"]) || x && x.state), broadband: c(this._commProp(b, ["名下宽带"])), subs: c(this._commProp(b, ["名下副卡"])), province: c(this._commProp(b, ["归属省市"])) }, U = { fullName: c(x && x.state || this._commProp(x, ["套餐全称"])), fuseType: c(this._commProp(x, ["融合类型"])), network: c(this._commProp(x, ["网络制式"])), broadband: c(this._commProp(x, ["融合宽带"])), subs: c(this._commProp(x, ["融合副卡"])) }, W = { province: c(_ && _.state || this._commProp(_, ["所属省市"])), network: c(this._commProp(_, ["网络类型"])) }, Y = { time: c(v && v.state), interval: c(this._commProp(v, ["轮询间隔"])), credential: c(this._commProp(v, ["凭证状态"])) }, V = s(i(w, ["剩余短信"]), r(w)); return { entityId: e.entityId, carrier: e.carrier || c(this._commPropAny(n, "运营商")), phone: e.phone || "", statusText: c(l && l.state), owed: k, fused: S.includes("已生效"), balance: $, flow: I, voice: O, integral: q, identity: B, sim: j, pkg: U, location: W, update: Y, sms: V } }, _commEmpty(e) { const t = document.createElement("div"); t.className = "comm-empty"; const n = document.createElement("ha-icon"); n.setAttribute("icon", "mdi:information-outline"), t.appendChild(n); const o = document.createElement("div"); return o.textContent = e, t.appendChild(o), t }, _commSection(e, t) { const n = document.createElement("div"); n.className = "comm-section"; const o = document.createElement("div"); if (o.className = "comm-section-title", t) { const e = document.createElement("ha-icon"); e.setAttribute("icon", t), o.appendChild(e) } const a = document.createElement("span"); a.textContent = e, o.appendChild(a), n.appendChild(o); const i = document.createElement("div"); return i.className = "comm-section-body", n.appendChild(i), { section: n, body: i, head: o } }, _commKVGrid(e) { const t = document.createElement("div"); return t.className = "comm-kv-grid", (e || []).forEach(e => { if (!e) return; const n = e[0], o = e[1]; null != o && "" !== o && "object" != typeof o && t.appendChild(this._commKV(n, o)) }), t }, _commKV(e, t) { const n = document.createElement("div"); n.className = "comm-kv"; const o = document.createElement("div"); o.className = "comm-kv-label", o.textContent = e; const a = document.createElement("div"); return a.className = "comm-kv-value", a.textContent = String(t), n.appendChild(o), n.appendChild(a), n }, _commAuthConfig(e) { const t = e && e.config || {}, n = e && e.account && e.account.auth || {}, o = { button: n.button || t.button || "", code: n.code || t.code || "", date: n.date || t.date || "", update_region: n.update_region || t.update_region || "", daily_reset: n.daily_reset || t.daily_reset || "", auto_login: n.auto_login || t.auto_login || "", auto_region_update: n.auto_region_update || t.auto_region_update || "", auto_query: n.auto_query || t.auto_query || "", auto_query_time: n.auto_query_time || t.auto_query_time || "" }; return Object.keys(o).some(e => o[e]) ? o : null }, _commOpenInfoBubble(e, t, n, o) { if (!e || !t) return null; const a = "pkg" === o ? "_commPkgBubble" : "fee" === o ? "_commFeeBubble" : "_commSimBubble"; if (n[a]) { const e = n[a]; n[a] = null; try { e.close() } catch (e) { } } const i = document.createElement("div"); i.className = "comm-info-bubble"; const r = e => { i.textContent = ""; const t = this._commAccountView(e.data, e.config), a = "pkg" === o ? this._commBuildPkgSection(t) : "fee" === o ? this._commBuildFeeSection(t) : this._commBuildSimSection(t, n); i.appendChild(a) }; r(t); const { bubble: s, close: c } = this._showBubble({ target: e, content: i, placement: "bottom", width: 330, maxWidth: "92vw", maxHeight: "70vh", className: "comm-info-bubble-wrap", animation: "spring", closeOnClickAway: !0, onClose: () => { n[a] && n[a].bubble === s && (n[a] = null) } }); return n[a] = { bubble: s, close: c, render: r }, c }, _commBuildFeeSection(e) { const t = this._commSection("话费", "mdi:cash-multiple"); if (t.section.classList.add("comm-section-in-bubble"), t.body.appendChild(this._commKVGrid([["当前可用话费", this._commMoney(e.balance.value)], ["本月已消费", this._commMoney(e.balance.monthUsed)], ["包含通用余额", this._commMoney(e.balance.general)], ["包含专用余额", this._commMoney(e.balance.special)], ["上月出账", this._commMoney(e.balance.lastMonth)], ["欠费金额", this._commMoney(e.balance.owedAmount)]])), e.balance.history.length) { const n = document.createElement("div"); n.className = "comm-months", e.balance.history.forEach(e => n.appendChild(this._commMonthBar(e))), t.body.appendChild(n) } return t.section }, _commBuildSimSection(e, t) { const n = this._commSection("主卡信息", "mdi:account-badge"); return n.section.classList.add("comm-section-in-bubble"), n.body.appendChild(this._commKVGrid([["机主姓名", e.identity.name], ["用户星级", e.identity.star || e.identity.memberLevel], ["网龄", e.identity.netAge], ["信用额度", e.identity.credit], ["网络", e.identity.network], ["归属地", e.location.province], ["卡槽角色", e.sim.role], ["主套餐", e.sim.mainPlan], ["名下宽带", e.sim.broadband], ["名下副卡", e.sim.subs], ["名下固话", this._commPhoneText(e.identity.landline, t)], ["实名认证", e.identity.realNameStatus]])), n.section }, _commBuildPkgSection(e) { const t = this._commSection("套餐与权益", "mdi:package-variant-closed"); if (t.section.classList.add("comm-section-in-bubble"), t.body.appendChild(this._commKVGrid([["套餐全称", e.pkg.fullName], ["融合类型", e.pkg.fuseType], ["网络制式", e.pkg.network], ["融合宽带", e.pkg.broadband], ["融合副卡", e.pkg.subs], ["积分", null !== e.integral.value ? `${this._commFmtNum(e.integral.value)} ${e.integral.unit}` : ""], ["积分体系", e.integral.system], ["剩余短信", null !== e.sms ? `${this._commFmtNum(e.sms)} 条` : ""]])), e.integral.privilege) { const n = document.createElement("div"); n.className = "comm-tip", n.textContent = e.integral.privilege, t.body.appendChild(n) } return t.section }, _commOpenAuthBubble(e, t, n) { if (!e || !t) return null; if (n._commAuthBubble) { const e = n._commAuthBubble; n._commAuthBubble = null; try { e.close() } catch (e) { } } const o = document.createElement("div"); o.className = "comm-auth-bubble"; const a = e => { o.textContent = ""; const t = this._commAuthSection(e.config, n, e.account, e.data, { inBubble: !0 }); t && o.appendChild(t) }; a(t); const { bubble: i, close: r } = this._showBubble({ target: e, content: o, placement: "bottom", width: 330, maxWidth: "92vw", maxHeight: "70vh", className: "comm-auth-bubble-wrap", animation: "spring", closeOnClickAway: !0, onClose: () => { n._commAuthBubble && n._commAuthBubble.bubble === i && (n._commAuthBubble = null) } }); return n._commAuthBubble = { bubble: i, close: r, render: a }, r }, _commCallService(e, t, n, o) { const a = t || {}, i = { service: e, service_data: a, entity: n || a.entity_id || "" }; if ("function" == typeof this.handleCallServiceAction) return void this.handleCallServiceAction(i, o || null, this._commConfig || {}); const [r, s] = String(e || "").split("."); r && s && this.hass && this.hass.callService && this.hass.callService(r, s, a) }, _commEntityDomain(e) { const t = String(e || ""), n = t.indexOf("."); return n > 0 ? t.slice(0, n) : "" }, _commSettingControl(e, t, n, o = {}) { const a = this._commEntityDomain(e); return "button" === a || "input_button" === a ? this._commActionButton(e, t, n, { inRow: !0 }) : "time" === a || !a && "time" === o.type ? this._commTimeControl(e, t, n) : this._commSwitchControl(e, t, n) }, _commActionButton(e, t, n, o = {}) { const a = "input_button" === this._commEntityDomain(e) ? "input_button.press" : "button.press", i = document.createElement("button"); if (i.type = "button", i.className = "comm-set-action" + (o.inRow ? " comm-set-action-inline" : ""), o.icon) { const e = document.createElement("ha-icon"); e.setAttribute("icon", o.icon), i.appendChild(e) } const r = document.createElement("span"); r.textContent = t, i.appendChild(r); const s = this.hass && this.hass.states ? this.hass.states[e] : null; return i.disabled = !s, i.title = o.title || (s ? `${t}：点击立即执行` : `${t}：实体不存在（${e}）`), i.addEventListener("click", o => { o.stopPropagation(), i.disabled || (this._commCallService(a, { entity_id: e }, e, i), this._showToast(`已触发「${t}」`, "success"), this._commScheduleAuthRefresh(n)) }), i }, _commTimeControl(e, t, n) { const o = document.createElement("input"); o.className = "comm-set-time", o.setAttribute("type", "time"); const a = this.hass && this.hass.states ? this.hass.states[e] : null, i = String(a && a.state || "").match(/^(\d{1,2}):(\d{2})/); return o.value = i ? `${i[1].padStart(2, "0")}:${i[2]}` : "", o.disabled = !a, o.title = a ? `${t}：${o.value || "未设置"}` : `${t}：实体不存在（${e}）`, o.addEventListener("change", () => { /^\d{2}:\d{2}$/.test(o.value) && (this._commCallService("time.set_value", { entity_id: e, time: o.value }, e, o), this._showToast(`「${t}」已设为 ${o.value}`, "success"), this._commScheduleAuthRefresh(n)) }), o }, _commSwitchControl(e, t, n) { const o = this.hass && this.hass.states ? this.hass.states[e] : null, a = !!o && "on" === String(o.state), i = this._commEntityDomain(e) || "switch", r = document.createElement("button"); r.type = "button", r.className = "comm-switch" + (a ? " on" : ""), r.setAttribute("role", "switch"), r.setAttribute("aria-checked", a ? "true" : "false"), r.setAttribute("aria-label", t), r.disabled = !o, r.title = o ? `${t}：当前${a ? "已开启" : "已关闭"}（点击${a ? "关闭" : "开启"}）` : `${t}：实体不存在（${e}）`; const s = document.createElement("span"); return s.className = "comm-switch-knob", r.appendChild(s), r.addEventListener("click", o => { o.stopPropagation(), r.disabled || (this._commCallService(`${i}.${a ? "turn_off" : "turn_on"}`, { entity_id: e }, e, r), this._showToast(`${t}已${a ? "关闭" : "开启"}`, "success"), this._commScheduleAuthRefresh(n)) }), r }, _commAuthSection(e, t, n, o, a = {}) {
  const i = this._commAuthConfig({ config: e, account: n });
  if (!i) return null;
  const r = i.button, s = i.code, c = i.date;
  const l = document.createElement("div");
  l.className = "comm-auth" + (a.inBubble ? " comm-auth-in-bubble" : "");

  // 关键判断: 检查当前手机号是否存在 text.<手机号>_code 实体 (电信有二次验证码，联通无需验证码)
  const hasCodeEntity = Boolean(s && this.hass && this.hass.states && this.hass.states[s]);

  const d = document.createElement("div");
  d.className = "comm-auth-title";
  const p = document.createElement("ha-icon");
  p.setAttribute("icon", hasCodeEntity ? "mdi:shield-key-outline" : "mdi:file-document-refresh-outline");
  d.appendChild(p);

  const h = document.createElement("span");
  h.textContent = hasCodeEntity ? "详单认证" : "详单管理";
  d.appendChild(h);

  const u = a.inBubble ? null : this._commAuthStatus(r, o);
  if (u && u.text) {
    const e = document.createElement("span");
    e.className = "comm-auth-status" + ("danger" === u.tone ? " danger" : "ok" === u.tone ? " ok" : "");
    e.textContent = hasCodeEntity ? u.text : (u.text.includes("已认证") ? "就绪" : u.text);
    d.appendChild(e);
  }
  l.appendChild(d);

  const m = document.createElement("div");
  m.className = "comm-auth-body";
  const f = t._commAuthDraft || (t._commAuthDraft = {});
  const g = r && this.hass && this.hass.states ? this.hass.states[r] : null;
  const y = (g && g.attributes) || {};
  const b = String(y["验证码状态"] || "").includes("已填写");

  if (r) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "comm-auth-action" + ((hasCodeEntity && b) ? " ready" : "");
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", hasCodeEntity ? (b ? "mdi:shield-check-outline" : "mdi:message-alert-outline") : "mdi:refresh");
    btn.appendChild(icon);

    const txt = document.createElement("span");
    if (hasCodeEntity) {
      txt.textContent = b ? "提交认证并拉取流水" : "获取验证码 / 刷新流水";
    } else {
      txt.textContent = "刷新详单流水";
    }
    btn.appendChild(txt);

    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      this._commCallService("button.press", { entity_id: r }, r, btn);
      this._showToast(hasCodeEntity ? (b ? "已提交认证" : "已触发二次认证") : "已触发「刷新详单流水」", "success");
      this._commScheduleAuthRefresh(t);
    });
    m.appendChild(btn);

    const cap = document.createElement("div");
    cap.className = "comm-auth-action-cap";
    if (hasCodeEntity) {
      if (!b) cap.textContent = "按下后下发短信验证码，180 秒内填入下方会自动提交";
    } else {
      cap.textContent = "点击立即拉取本月通话、短信与上网详单流水";
    }
    if (cap.textContent) m.appendChild(cap);
  }

  const x = document.createElement("div");
  x.className = "comm-auth-fields";

  // 仅在存在短信验证码实体 (电信) 时渲染验证码输入框与写入按钮
  if (hasCodeEntity) {
    const field = document.createElement("div");
    field.className = "comm-auth-field";
    const lbl = document.createElement("div");
    lbl.className = "comm-auth-field-label";
    lbl.textContent = "短信验证码";
    const ctrl = document.createElement("div");
    ctrl.className = "comm-auth-control";
    const inp = document.createElement("input");
    inp.className = "comm-auth-input comm-auth-code-input";
    inp.setAttribute("type", "text");
    inp.setAttribute("inputmode", "numeric");
    inp.setAttribute("autocomplete", "one-time-code");
    inp.placeholder = "输入后点写入";
    inp.value = f[s] || "";

    const submitCode = () => {
      const val = String(inp.value || "").trim();
      if (val) {
        this._commCallService("text.set_value", { entity_id: s, value: val }, s, inp);
        delete f[s];
        this._showToast("验证码已写入", "success");
        this._commScheduleAuthRefresh(t);
      } else {
        this._showToast("请先填写验证码", "warning");
      }
    };

    inp.addEventListener("input", () => { f[s] = inp.value; });
    inp.addEventListener("keydown", ev => { if ("Enter" === ev.key) { ev.preventDefault(); submitCode(); } });

    const writeBtn = document.createElement("button");
    writeBtn.type = "button";
    writeBtn.className = "comm-auth-op";
    writeBtn.textContent = "写入";
    writeBtn.addEventListener("click", ev => { ev.stopPropagation(); submitCode(); });

    ctrl.appendChild(inp);
    ctrl.appendChild(writeBtn);
    field.appendChild(lbl);
    field.appendChild(ctrl);
    x.appendChild(field);
  }

  // 查询起始日
  if (c) {
    const field = document.createElement("div");
    field.className = "comm-auth-field";
    const lbl = document.createElement("div");
    lbl.className = "comm-auth-field-label";
    lbl.textContent = "查询起始日";
    const ctrl = document.createElement("div");
    ctrl.className = "comm-auth-control";
    const inp = document.createElement("input");
    inp.className = "comm-auth-input comm-auth-date-input";
    inp.setAttribute("type", "date");
    const stateObj = this.hass && this.hass.states ? this.hass.states[c] : null;
    const curVal = stateObj && /^\d{4}-\d{2}-\d{2}$/.test(String(stateObj.state)) ? String(stateObj.state) : "";
    inp.value = f[c] || curVal;
    inp.addEventListener("input", () => { f[c] = inp.value; });
    inp.addEventListener("change", () => {
      const val = inp.value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        delete f[c];
        this._commCallService("date.set_value", { entity_id: c, date: val }, c, inp);
        this._showToast(`查询起始日期已更新：${val}`, "success");
        this._commScheduleAuthRefresh(t);
      }
    });
    ctrl.appendChild(inp);
    field.appendChild(lbl);
    field.appendChild(ctrl);
    x.appendChild(field);
  }

  if (x.childElementCount) m.appendChild(x);

  // 自动化设置: 只展示在 HA 中真实存在的实体 (联通下自动过滤掉不存在的 auto_login)
  const candidateSwitches = [
    { key: "auto_query", label: "自动获取通话记录" },
    { key: "auto_query_time", label: "自动获取通话记录时间", type: "time" },
    { key: "auto_login", label: "自动短信登录" },
    { key: "auto_region_update", label: "自动更新号码归属地库" },
    { key: "daily_reset", label: "每日重置查询起始日期" }
  ].filter(item => {
    const eid = i[item.key];
    return Boolean(eid && this.hass && this.hass.states && this.hass.states[eid]);
  });

  if (candidateSwitches.length || (i.update_region && this.hass && this.hass.states && this.hass.states[i.update_region])) {
    const setWrap = document.createElement("div");
    setWrap.className = "comm-set";
    const setTitle = document.createElement("div");
    setTitle.className = "comm-set-title";
    const setIcon = document.createElement("ha-icon");
    setIcon.setAttribute("icon", "mdi:tune-variant");
    setTitle.appendChild(setIcon);
    const setSpan = document.createElement("span");
    setSpan.textContent = "自动化设置";
    setTitle.appendChild(setSpan);
    setWrap.appendChild(setTitle);

    const setList = document.createElement("div");
    setList.className = "comm-set-list";
    candidateSwitches.forEach(item => {
      const eid = i[item.key];
      const row = document.createElement("div");
      row.className = "comm-set-row";
      const nameCol = document.createElement("div");
      nameCol.className = "comm-set-name";
      nameCol.textContent = item.label;
      row.appendChild(nameCol);
      row.appendChild(this._commSettingControl(eid, item.label, t, { type: item.type }));
      setList.appendChild(row);
    });
    setWrap.appendChild(setList);

    if (i.update_region && this.hass && this.hass.states && this.hass.states[i.update_region]) {
      const act = this._commActionButton(i.update_region, "更新号码归属地库", t, { icon: "mdi:database-sync-outline" });
      setWrap.appendChild(act);
    }
    m.appendChild(setWrap);
  }

  // 底部提示信息
  const tipWrap = document.createElement("div");
  tipWrap.className = "comm-auth-tip";
  const tipIcon = document.createElement("ha-icon");
  tipIcon.setAttribute("icon", "mdi:information-outline");
  tipWrap.appendChild(tipIcon);
  const tipText = document.createElement("span");
  if (hasCodeEntity) {
    tipText.textContent = "已配置「验证码自动填写」时无需手动输入：按下上方按钮后，短信一到即由集成自动提交认证。";
  } else {
    tipText.textContent = "联通详单无需短信验证码二次认证：点击上方按钮即可直接拉取最新详单流水；开启自动化设置后将每日定时自动同步。";
  }
  tipWrap.appendChild(tipText);
  m.appendChild(tipWrap);

  l.appendChild(m);
  return l;
}, _commCallsAttrs(e) { const t = /^button\.(.+)_button$/.exec(String(e || "")); if (!t) return {}; const n = this.hass && this.hass.states ? this.hass.states[`sensor.${t[1]}_calls`] : null; return n && n.attributes || {} }, _commAuthStatus(e, t) { const n = t && t.nodes ? this._commFieldNode(t.nodes, "call_record", null) : null, o = e && this.hass && this.hass.states ? this.hass.states[e] : null, a = o && o.attributes || {}, i = this._commCallsAttrs(e); let r = String(i["详单授权状态"] || ""); !r && n && (r = String(this._commProp(n, ["详单授权状态"]) || "")), r || (r = String(a["详单授权状态"] || "")); let s = i["授权剩余有效时长"]; null != s && "" !== s || (s = n ? this._commProp(n, ["授权剩余有效时长"]) : void 0), null != s && "" !== s || (s = a["授权剩余有效时长"]); const c = this._commNum(s); return null !== c || r ? /登录.*失效|重新登录/.test(r) ? { text: "登录已失效", tone: "danger", remain: c, raw: r } : /未认证|需二次认证/.test(r) ? { text: "未认证", tone: "neutral", remain: c, raw: r } : /过期|失效|无效/.test(r) || null !== c && c <= 0 ? { text: "已过期", tone: "danger", remain: c, raw: r } : null !== c ? { text: `剩余 ${this._commFmtNum(c)} 分钟`, tone: "ok", remain: c, raw: r } : { text: "有效", tone: "ok", remain: null, raw: r } : { text: "", tone: "neutral", remain: null, raw: "" } }, _commScheduleAuthRefresh(e) { e && this._timers.setTimeout(() => { e.isConnected && this.updateCommCard(e, e._commConfig || {}) }, 3e3) }, _commShortPlanName(e) { const t = String(e || "").trim(); return t ? t.replace(/套餐.*$/, "").trim() || t : "" }, _commMaskPhone(e) { const t = String(e || "").trim(); if (!t) return ""; if (!/^[\d\s\-+]+$/.test(t)) return t; const n = t.replace(/\s/g, ""); return n.length <= 4 ? t : n.length <= 7 ? `${n[0]}${"*".repeat(n.length - 3)}${n.slice(-2)}` : `${n.slice(0, 3)}${"*".repeat(Math.max(1, n.length - 7))}${n.slice(-4)}` }, _commPhoneText(e, t) { const n = String(e || ""); return n ? t && !1 === t._commPhoneMasked ? n : this._commMaskPhone(n) : "" }, _commNameText(e, t) { const n = String(e || "").trim(); if (!n) return ""; if (t && !1 === t._commPhoneMasked) return n; const o = [...n]; return o.length <= 1 ? "*" : 2 === o.length ? `${o[0]}*` : `${o.slice(0, o.length - 2).join("")}**` }, _commPeerText(e, t) { const n = String(null == e ? "" : e).trim(); return n ? /^[\d\s\-+]+$/.test(n) ? this._commPhoneText(n, t) : this._commNameText(n, t) : "" }, _commCarrierClass(e) { const t = String(e || "").toLowerCase(); return t.includes("联通") || t.includes("网通") || t.includes("联合网络通信") || t.includes("unicom") ? "unicom" : t.includes("移动") || t.includes("mobile") ? "mobile" : "" }, _commHero(e, t, n) { const o = t || {}, a = document.createElement("div"), i = this._commCarrierClass(e.carrier); a.className = "comm-hero" + (i ? ` ${i}` : ""); const r = document.createElement("div"); r.className = "comm-hero-main"; const s = document.createElement("div"); s.className = "comm-hero-carrier", s.textContent = e.carrier || "通讯账户", r.appendChild(s); const c = e.phone || "", l = document.createElement("div"); l.className = "comm-hero-phone"; const d = document.createElement("span"); d.className = "comm-hero-phone-text", l.appendChild(d); const p = !1 !== o._commPhoneMasked; if (c) { const e = document.createElement("ha-icon"); e.className = "comm-hero-phone-eye", e.setAttribute("icon", p ? "mdi:eye-off-outline" : "mdi:eye-outline"), l.appendChild(e), l.addEventListener("click", e => { e.stopPropagation(), o._commPhoneMasked = !p; const t = o._commConfig || {}; this._commRebuildPanels(o, t, this._commLoadAll(t)) }) } (() => { d.textContent = c ? p ? this._commMaskPhone(c) : c : "—", l.classList.toggle("revealed", !p && !!c), l.title = c ? p ? "点击显示完整号码（整卡生效）" : "点击隐藏号码中间位（整卡生效）" : "" })(), r.appendChild(l); const h = document.createElement("div"); h.className = "comm-hero-tags"; const u = (e, t, n = {}) => { if (!e) return; const o = document.createElement("span"); if (o.className = "comm-tag" + (n.cls ? " " + n.cls : "") + (n.onClick ? " comm-tag-action" : ""), n.title && (o.title = n.title), t) { const e = document.createElement("ha-icon"); e.setAttribute("icon", t), o.appendChild(e) } const a = document.createElement("span"); if (a.className = "comm-tag-text", a.textContent = e, o.appendChild(a), n.onClick) { const e = document.createElement("ha-icon"); e.setAttribute("icon", "mdi:chevron-down"), o.appendChild(e), o.addEventListener("click", e => { e.stopPropagation(), n.onClick(o) }) } h.appendChild(o) }; u(e.statusText, e.owed ? "mdi:alert-circle-outline" : "mdi:check-circle-outline", { cls: e.owed ? "danger" : "ok", title: "点击查看话费明细", onClick: e => this._commOpenInfoBubble(e, n, o, "fee") }), u("主卡", "mdi:account-badge", { title: "点击查看主卡信息" + (e.sim.role ? `（${e.sim.role}）` : ""), onClick: e => this._commOpenInfoBubble(e, n, o, "sim") }), u(this._commShortPlanName(e.pkg.fullName) || "套餐与权益", "mdi:package-variant-closed", { title: "点击查看套餐与权益" + (e.pkg.fullName ? `（${e.pkg.fullName}）` : ""), onClick: e => this._commOpenInfoBubble(e, n, o, "pkg") }); const m = this._commAuthConfig(n); if (m) { const e = this._commAuthStatus(m.button, n && n.data); u(m && m.code && this.hass && this.hass.states && this.hass.states[m.code] ? (e.text || "详单认证") : "详单管理", (m && m.code && this.hass && this.hass.states && this.hass.states[m.code]) ? "mdi:shield-key-outline" : "mdi:file-document-refresh-outline", { cls: ["danger" === e.tone ? "danger" : "ok" === e.tone ? "ok" : "", "comm-tag-auth"].filter(Boolean).join(" "), title: "详单认证：验证码 / 起始日期 / 二次认证" + (e.raw ? `（${e.raw}）` : ""), onClick: e => this._commOpenAuthBubble(e, n, o) }) } a.appendChild(r); const f = document.createElement("div"); return f.className = "comm-hero-metrics", f.appendChild(this._commMetric("话费余额", e.balance.value, "元", { cls: e.owed ? "comm-metric-danger" : "comm-metric-balance" })), f.appendChild(this._commMetric("剩余流量", e.flow.remain, e.flow.unit || "GB", { cls: "comm-metric-flow" })), f.appendChild(this._commMetric("积分", e.integral.value, e.integral.unit || "分", { cls: "comm-metric-points" })), a.appendChild(f), h.childNodes.length && a.appendChild(h), a }, _commMetric(e, t, n, o = {}) { const a = document.createElement("div"); a.className = "comm-metric" + (o.cls ? " " + o.cls : ""); const i = document.createElement("div"); i.className = "comm-metric-value"; const r = !(null == t || "" === t); if (i.textContent = r ? this._commFmtNum(t) : "—", r && n) { const e = document.createElement("span"); e.className = "comm-metric-unit", e.textContent = n, i.appendChild(e) } a.appendChild(i); const s = document.createElement("div"); return s.className = "comm-metric-label", s.textContent = e, a.appendChild(s), a }, _commDuoRing(e) {
  const t = document.createElement('div');
  t.className = 'comm-duo';
  const n = e.unit || '';
  const allM = Array.isArray(e.members) ? e.members : [];
  const o = allM.filter(item => (Number(item.value) || 0) > 0);
  const a = o.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const i = document.createElement('div');
  if (i.className = 'comm-duo-main', allM.length || o.length) {
    const r = this._commMemberPalette;
    const s = null === e.used || void 0 === e.used ? a : Number(e.used);
    const c = null === e.remain || void 0 === e.remain ? null : Number(e.remain);
    const l = null === e.total || void 0 === e.total ? null : Number(e.total);
    const d = null === e.percent || void 0 === e.percent ? null : Number(e.percent);
    const p = null !== c && c > 0;
    const h = (p && l) ? l : (a || (c || 1));
    const legendList = allM.map((item, idx) => {
      const val = Number(item.value) || 0;
      return {
        name: item.name,
        value: val,
        color: val > 0 ? r[idx % r.length] : 'var(--secondary-text-color, #999)',
        percent: h > 0 ? (val / h * 100) : 0
      };
    });
    if (p) {
      legendList.push({
        name: '剩余',
        value: c,
        color: this._commRemainColor,
        percent: h > 0 ? (c / h * 100) : 0
      });
    }
    const ringSegments = legendList.filter(item => (Number(item.value) || 0) > 0);
    t.appendChild(this._commRing({
      mode: 'share',
      segments: ringSegments.length ? ringSegments : [{ name: '剩余', value: 1, color: this._commRemainColor, percent: 100 }],
      center: this._commRingNum(null === c ? s : c),
      centerUnit: n,
      caption: null === d ? (null === c ? '已用' : '剩余') : `剩余 ${Math.round(d)}%`,
      percentText: ''
    }));
    if (null !== l) {
      i.appendChild(this._commStatLine('已用 / 总量', `${this._commFmtNum(s)} / ${this._commFmtNum(l)} ${n}`.trim()));
    }
    i.appendChild(this._commLegend(legendList, n));
  } else if (t.appendChild(this._commRing({
    mode: 'progress',
    percent: e.percent,
    center: this._commRingNum(e.remain),
    centerUnit: n,
    caption: e.caption || '',
    percentText: `${this._commFmtNum(e.percent, 1)}%`,
    color: e.color
  })), null !== e.used && void 0 !== e.used) {
    const totalStr = this._commFmtNum(e.total) || '—';
    i.appendChild(this._commStatLine('已用 / 总量', `${this._commFmtNum(e.used)} / ${totalStr} ${n}`.trim()));
  }
  if (e.packs && e.packs.length) {
    i.appendChild(this._commPacks(e.packs));
  }
  t.appendChild(i);
  return t;
}, _commStatLine(e, t) { const n = document.createElement("div"); n.className = "comm-stat-line"; const o = document.createElement("span"); o.className = "comm-stat-label", o.textContent = e; const a = document.createElement("span"); return a.className = "comm-stat-value", a.textContent = t, n.appendChild(o), n.appendChild(a), n }, _commLegend(e, t) { const n = document.createElement("div"); return n.className = "comm-legend", e.forEach(e => { const o = document.createElement("div"); o.className = "comm-legend-item"; const a = document.createElement("span"); a.className = "comm-legend-dot", a.style.background = e.color; const i = document.createElement("span"); i.className = "comm-legend-name", i.textContent = e.name; const r = document.createElement("span"); r.className = "comm-legend-value", r.textContent = `${this._commFmtNum(e.value)}${t ? " " + t : ""}`; const s = document.createElement("span"); s.className = "comm-legend-percent", s.textContent = `${Math.round(e.percent)}%`, o.appendChild(a), o.appendChild(i), o.appendChild(r), o.appendChild(s), n.appendChild(o) }), n }, _commPacks(e) { const t = document.createElement("div"); return t.className = "comm-packs", e.forEach(e => { const n = document.createElement("div"); n.className = "comm-pack"; const o = document.createElement("div"); o.className = "comm-pack-head"; const a = document.createElement("span"); a.className = "comm-pack-label", a.textContent = e.label; const i = document.createElement("span"); i.className = "comm-pack-text", i.textContent = e.text, o.appendChild(a), o.appendChild(i); const r = document.createElement("div"); r.className = "comm-pack-track"; const s = document.createElement("div"); s.className = "comm-pack-fill", s.style.width = `${Math.max(2, Math.min(100, e.percent || 0))}%`, r.appendChild(s), n.appendChild(o), n.appendChild(r), t.appendChild(n) }), t }, _commMonthBar(e) { const t = document.createElement("div"); t.className = "comm-month"; const n = document.createElement("div"); n.className = "comm-month-label", n.textContent = `${e.month}月`; const o = document.createElement("div"); o.className = "comm-month-track"; const a = document.createElement("div"); a.className = "comm-month-fill", a.style.width = `${e.percent}%`, o.appendChild(a); const i = document.createElement("div"); i.className = "comm-month-value"; const r = this._commNum(e.value); return i.textContent = `${null === r ? "—" : r.toFixed(1)} 元`, t.appendChild(n), t.appendChild(o), t.appendChild(i), t }, _commFooter(e) { const t = []; if (e.update.time && t.push(`数据更新 ${e.update.time}`), e.update.interval && t.push(e.update.interval), e.update.credential && t.push(`凭证 ${e.update.credential}`), !t.length) return null; const n = document.createElement("div"); return n.className = "comm-footer", t.forEach((e, t) => { if (t) { const e = document.createElement("span"); e.className = "comm-footer-sep", e.textContent = "·", n.appendChild(e) } const o = document.createElement("span"); o.textContent = e, n.appendChild(o) }), n }, _commRing(e) { const t = document.createElement("div"); t.className = "comm-ring"; const n = document.createElement("div"); n.className = "comm-ring-canvas", n._commRingCfg = e; const o = document.createElement("div"); o.className = "comm-ring-center"; const a = document.createElement("div"); if (a.className = "comm-ring-value", a.textContent = e.center || "—", o.appendChild(a), e.centerUnit) { const t = document.createElement("div"); t.className = "comm-ring-unit", t.textContent = e.centerUnit, o.appendChild(t) } if (e.caption) { const t = document.createElement("div"); t.className = "comm-ring-caption", t.textContent = e.percentText ? `${e.caption} ${e.percentText}` : e.caption, o.appendChild(t) } return t.appendChild(n), t.appendChild(o), t }, _commRingOption(e) { const t = e || {}; if ("share" === t.mode && Array.isArray(t.segments) && t.segments.length) { const e = t.segments, n = t.centerUnit || ""; return { animation: !1, tooltip: this._commIsCoarsePointer() ? { show: !1 } : { trigger: "item", appendToBody: !0, formatter: t => { const o = e[t.dataIndex]; if (!o) return ""; const a = `${this._commFmtNum(o.value)}${n ? " " + n : ""}`; return `${t.marker} ${this._escapeHtml(o.name)}: ${a} (${Math.round(o.percent)}%)` }, backgroundColor: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(0, 0, 0, 0.1)", borderWidth: 1, textStyle: { color: "#333", fontSize: 11 }, padding: [6, 10] }, series: [{ type: "pie", radius: ["52%", "88%"], center: ["50%", "50%"], startAngle: 90, label: { show: !1 }, labelLine: { show: !1 }, emphasis: { scale: !1 }, data: e.map(e => ({ name: e.name, value: Math.max(1e-4, Number(e.value) || 0), itemStyle: { color: e.color } })) }] } } const n = Math.max(0, Math.min(100, Number(t.percent) || 0)), o = t.color || "#2196f3"; return { animation: !1, series: [{ type: "pie", radius: ["76%", "94%"], center: ["50%", "50%"], silent: !0, startAngle: 90, label: { show: !1 }, labelLine: { show: !1 }, data: [{ value: Math.max(.01, n), itemStyle: { color: o, borderRadius: 6 } }, { value: Math.max(.01, 100 - n), itemStyle: { color: "rgba(128,128,128,0.18)" } }] }] } }, _commIsCoarsePointer() { return void 0 === this._commCoarsePointer && (this._commCoarsePointer = !(!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches)), this._commCoarsePointer }, _commShowSegmentBubble(e, t, n) { const o = document.createElement("div"); o.className = "comm-ring-tip"; const a = document.createElement("span"); a.className = "comm-ring-tip-dot", a.style.background = t.color; const i = document.createElement("span"); i.textContent = `${t.name}: ${this._commFmtNum(t.value)}${n ? " " + n : ""} (${Math.round(t.percent)}%)`, o.appendChild(a), o.appendChild(i); const r = e && e.closest ? e.closest(".comm-card") : null, s = String(t && t.name || ""), c = !(!r || !r._commRingTip || r._commRingTip.key !== s); if (r && this._commCloseTransientBubble(r, "_commRingTip"), c) return null; const { bubble: l, close: d } = this._showBubble({ target: e, content: o, placement: "bottom", width: 240, maxWidth: "86vw", className: "comm-ring-tip-wrap", animation: "spring", closeOnClickAway: !0, closeOnTargetClick: !1, onClose: () => { r && r._commRingTip && r._commRingTip.bubble === l && (r._commRingTip = null) } }); return r && (r._commRingTip = { bubble: l, close: d, key: s }), { bubble: l, close: d } }, _commMountRings(e) { if (!e || "function" != typeof this._loadEchartsUnified) return; const t = e.querySelectorAll(".comm-ring-canvas"); t.length && this._loadEchartsUnified().then(e => { t.forEach(t => { const n = t._commRingCfg; if (!t.isConnected || !n) return; let o = t._echartsInstance; if (o && !o.isDisposed()) o.setOption(this._commRingOption(n), !0); else { o = e.init(t, null, { renderer: "canvas", useDirtyRect: !0 }), t._echartsInstance = o, o.setOption(this._commRingOption(n)); const a = new ResizeObserver(() => { t._echartsInstance && !t._echartsInstance.isDisposed() && t._echartsInstance.resize() }); a.observe(t), t._commRingRO = a } !t._commRingClickBound && "share" === n.mode && this._commIsCoarsePointer() && (t._commRingClickBound = !0, o.on("click", e => { const o = t._commRingCfg || n, a = o.segments ? o.segments[e.dataIndex] : null; a && this._commShowSegmentBubble(t, a, o.centerUnit || "") })) }) }).catch(e => { console.warn("[comm] ECharts 加载失败，环形图已退化为数值文本:", e) }) }, _commDisposeRings(e) { e && (e.querySelectorAll(".comm-ring-canvas").forEach(e => { if (e._commRingRO) { try { e._commRingRO.disconnect() } catch (e) { } e._commRingRO = null } const t = e._echartsInstance; t && "function" == typeof t.dispose && !t.isDisposed() && t.dispose(), e._echartsInstance = null }), e.querySelectorAll(".comm-map-canvas, .comm-trend-canvas").forEach(e => { const t = e._echartsInstance; t && "function" == typeof t.dispose && !t.isDisposed() && t.dispose(), e._echartsInstance = null })) }, _startCommRefresh(e, t) { e && (e._commRefreshTimer && (this._unregisterLowFreqTask(e, e._commRefreshTimer), e._commRefreshTimer = null), e._commRefreshTimer = this._registerLowFreqTask(e, () => { e.isConnected ? this.updateCommCard(e, e._commConfig || t) : this._commTeardown(e) }, 6e4)) }, _commTeardown(e) { if (e) { if (["_commAuthBubble", "_commSimBubble", "_commPkgBubble", "_commFeeBubble", "_commDailyTip", "_commRingTip", "_commFlowBubble", "_commMiniTip"].forEach(t => { const n = e[t]; if (n) { e[t] = null; try { n.close() } catch (e) { } } }), e._commRefreshTimer && (this._unregisterLowFreqTask(e, e._commRefreshTimer), e._commRefreshTimer = null), e._commSwipeTimer && (this._timers.clearTimeout(e._commSwipeTimer), e._commSwipeTimer = null), this._lowFreqObserver) try { this._lowFreqObserver.unobserve(e) } catch (e) { } this._lowFreqVisible && this._lowFreqVisible.delete(e), this._commDisposeRings(e) } } };

// PeriodPickerMixin (日月选择器)
const fo = { _periodPicker(e) { const t = e || {}, n = "md" === t.mode ? "md" : "ym", o = String(t.cur || ""), a = "function" == typeof t.onPick ? t.onPick : () => { }, i = "function" == typeof t.close ? t.close : null, r = e => { "md" === n ? (i && i(), e !== o && a(e)) : (a(e), i && i()) }, s = document.createElement("div"); s.className = "rm-pick"; const c = document.createElement("div"); c.className = "rm-pick-left"; const l = document.createElement("div"); l.className = "rm-pick-right" + ("md" === n ? " cols-7" : ""), s.appendChild(c), s.appendChild(l); const d = document.createElement("div"); return d.className = "rm-pick-empty", s.appendChild(d), "md" === n ? this._periodPickMd({ cur: o, today: String(t.today || ""), left: c, right: l, finish: r }) : this._periodPickYm({ cur: o, today: String(t.today || ""), loadMeta: t.loadMeta, left: c, right: l, finish: r, emptyTip: d, waitMeta: !0 === t.waitMeta }), s }, _periodPickYm({ cur: e, today: t, loadMeta: n, left: o, right: a, finish: i, emptyTip: r, waitMeta: s }) { const c = /^\d{4}-\d{2}$/.test(t) ? t : "", l = Number(c.slice(0, 4)) || (new Date).getFullYear(); let d = Number(String(e).slice(0, 4)) || l, p = null, h = !1; const u = [], m = e => { r && (e ? (r.textContent = e, r.style.display = "block") : r.style.display = "none") }, f = () => { a.textContent = ""; for (let t = 1; t <= 12; t++) { const n = `${d}-${String(t).padStart(2, "0")}`, o = !!c && n > c, r = !p || !p.knownYears || p.knownYears.has(String(d)), s = !!p && (!!p.empty || r && !p.set.has(n) && n !== e), l = o || s, h = document.createElement("button"); h.type = "button", h.className = "rm-pick-cell" + (l ? " off" : "") + (n === e ? " cur" : ""), h.textContent = `${t} 月`, h.title = o ? `${n} 还没到` : s ? `${n} 没有数据` : `跳到 ${n}`, l ? h.disabled = !0 : h.addEventListener("click", e => { e.stopPropagation(), i(n) }), a.appendChild(h) } }, g = () => { if (!p && s && !h) return u.length = 0, o.textContent = "", a.textContent = "", o.style.display = "none", a.style.display = "none", void m("加载中…"); if (p && p.empty) return u.length = 0, o.textContent = "", a.textContent = "", o.style.display = "none", a.style.display = "none", void m("暂无历史数据"); o.style.display = "", a.style.display = "", m(""); const e = (() => { if (p && p.empty) return [d || l]; if (!p) return Array.from({ length: 20 }, (e, t) => l - t); if (Array.isArray(p.yearList) && p.yearList.length) { const e = p.yearList.map(Number).filter(e => e > 0); if (e.length) return e } const e = Number(String(p.last).slice(0, 4)) || l, t = Number(String(p.first).slice(0, 4)) || e, n = []; for (let o = Math.max(e, l); o >= t; o--)n.push(o); return n.length ? n : [e] })(); e.indexOf(d) < 0 && (d = e[0]); const t = o.scrollTop; u.length = 0, o.textContent = "", e.forEach(t => { const n = document.createElement("button"); n.type = "button", n.className = "rm-pick-cell" + (t === d ? " sel" : ""), n.textContent = String(t), n.title = `看 ${t} 年的某个月`, n.addEventListener("click", n => { n.stopPropagation(), t !== d && (d = t, u.forEach((n, o) => n.classList.toggle("sel", e[o] === t)), f()) }), o.appendChild(n), u.push(n) }), o.scrollTop = t, f() }; g(), "function" == typeof n && Promise.resolve().then(() => n()).then(e => { h = !0, e && e.set && (p = e), g() }).catch(() => { h = !0, g() }) }, _periodPickMd({ cur: e, today: t, left: n, right: o, finish: a }) { const i = e => /^\d{2}-\d{2}$/.test(String(e)) ? String(e) : "", r = new Date, s = `${String(r.getMonth() + 1).padStart(2, "0")}-${String(r.getDate()).padStart(2, "0")}`, c = i(e) || i(t) || s; let l = Number(c.slice(0, 2)) || 1; const d = () => { o.textContent = ""; const e = new Date(2e3, l, 0).getDate(); for (let t = 1; t <= e; t++) { const e = `${String(l).padStart(2, "0")}-${String(t).padStart(2, "0")}`, n = document.createElement("button"); n.type = "button", n.className = "rm-pick-cell" + (e === c ? " cur" : ""), n.textContent = String(t), n.title = `看历年 ${e}`, n.addEventListener("click", t => { t.stopPropagation(), a(e) }), o.appendChild(n) } }, p = []; for (let e = 1; e <= 12; e++) { const t = document.createElement("button"); t.type = "button", t.className = "rm-pick-cell" + (e === l ? " sel" : ""), t.textContent = `${e} 月`, t.title = `看 ${e} 月的哪一天`, t.addEventListener("click", t => { t.stopPropagation(), e !== l && (l = e, p.forEach((t, n) => t.classList.toggle("sel", n + 1 === e)), d()) }), n.appendChild(t), p.push(t) } d() } };

const CARD_TAG = "pocket-carrier-card";
const CARD_VERSION = "5.11.8";
const CARD_CSS =
  ".room-card{width:var(--room-card-width,300px);max-width:100%;height:var(--room-card-height,200px);border-radius:var(--room-card-border-radius,16px);background:var(--room-card-bg,#fffc);-webkit-backdrop-filter:var(--room-card-backdrop-filter,blur(12px));backdrop-filter:var(--room-card-backdrop-filter,blur(12px));box-shadow:var(--room-card-shadow,0 1px 3px #0000001a);box-sizing:border-box;isolation:isolate;z-index:1;justify-content:space-between;align-items:flex-start;padding:12px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif;transition:all .3s;display:flex;position:relative;overflow:hidden}.room-card:hover{box-shadow:var(--room-card-hover-shadow,0 12px 40px #00000026)}.room-card.head-mode{flex-direction:column;justify-content:center;align-items:center;padding:8px;display:flex}.room-card.head-mode.head-multi-page{justify-content:flex-start;padding:5px 8px}.room-card.normal-multi-page{flex-direction:column;justify-content:stretch;padding:0;display:flex}.room-card.normal-multi-page .head-scroll-wrapper{flex-direction:column;flex:1;min-height:0;display:flex;overflow:hidden}.room-card.normal-multi-page .head-page{height:100%;min-height:0;overflow:hidden}.room-card.normal-multi-page .head-page-dots{bottom:3px}.room-card.normal-multi-page .head-scroll-track{flex:1;min-height:0;overflow-y:hidden}.room-card.no-animation,.room-card.no-animation :not(.notice-scroll-wrapper):not(#heartbeat-dot),.page-hidden,.page-hidden *{transition:none!important;animation:none!important}.room-card.head-mode:not(.head-multi-page) #heartbeat-dot{z-index:10;margin-left:0;position:absolute;top:8px;right:8px}.room-card.head-mode.head-multi-page .head-page[data-page=\"0\"]{position:relative}.room-card.head-mode.head-multi-page #heartbeat-dot{z-index:10;margin-left:0;position:absolute;top:0;right:0}.comm-card{background:var(--room-popup-bg,#fffffff5);max-height:88vh;color:var(--room-primary-text,#2c3e50);flex-direction:column;font-size:13px;display:flex;overflow:hidden}.standalone-card-container .comm-card{background:var(--room-card-bg,#fffc);border-radius:var(--room-card-border-radius,16px);max-height:none}.comm-header{flex-direction:column;flex:none;align-items:stretch;padding:5px 10px 0;display:flex}.comm-title-wrap{justify-content:center;align-items:center;gap:8px;min-width:0;display:flex}.comm-title{text-align:center;font-size:15px;font-weight:600}.comm-accounts{--comm-acc-count:1;--comm-acc-index:0;scrollbar-width:none;border-bottom:1px solid #2196f32e;align-items:stretch;width:calc(100% + 28px);margin:0 -14px;padding-bottom:6px;display:flex;position:relative;overflow-x:auto}.comm-accounts::-webkit-scrollbar{display:none}.comm-account-tab{cursor:pointer;opacity:.5;z-index:2;background:0 0;border:none;flex-direction:column;flex:1 1 0;justify-content:center;align-items:center;gap:1px;min-width:40px;padding:0;transition:opacity .3s;display:flex}.comm-account-tab:hover{opacity:.8}.comm-account-tab.active{opacity:1}.comm-account-balance{color:var(--room-primary-text,#2c3e50);white-space:nowrap;font-size:14px;font-weight:700;transition:color .3s}.comm-account-name{color:var(--room-secondary-text,#7f8c8d);text-overflow:ellipsis;white-space:nowrap;max-width:100%;font-size:10px;font-weight:500;transition:color .3s;overflow:hidden}.comm-account-tab.active .comm-account-balance,.comm-account-tab.active .comm-account-name{color:#1565c0}.comm-account-tab.offline .comm-account-balance{color:var(--room-secondary-text,#7f8c8d)}.comm-account-tab.owed .comm-account-balance{color:#e53935}.comm-account-slider{pointer-events:none;z-index:1;height:3px;width:calc(100% / var(--comm-acc-count));bottom:0;left:calc(var(--comm-acc-index) * 100% / var(--comm-acc-count));background:linear-gradient(#2196f300,#2196f3);border-radius:3px 3px 0 0;transition:left .3s cubic-bezier(.4,0,.2,1);position:absolute;box-shadow:0 -4px 12px #2196f373}.comm-account-balance,.comm-rank-number,.comm-call-number{font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\" 1;letter-spacing:.3px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,PingFang SC,Microsoft YaHei,sans-serif}.comm-dots{flex:none;justify-content:center;align-items:center;gap:6px;padding:6px 0 8px;display:flex}.comm-dot{cursor:pointer;background:#80808059;border:none;border-radius:999px;width:6px;height:6px;padding:0;transition:width .2s,background .2s}.comm-dot:hover{background:#2196f399}.comm-dot.active{background:#2196f3;width:16px}.comm-dot.active:hover{background:#1976d2}.comm-panels{touch-action:pan-y;-webkit-user-select:none;user-select:none;flex:0 auto;grid-template-rows:minmax(0,1fr);min-height:0;display:grid;position:relative;overflow:hidden}.comm-panel{visibility:hidden;pointer-events:none;touch-action:pan-y;grid-area:1/1;overflow-x:hidden;overflow-y:auto}.comm-panel.active{visibility:visible;pointer-events:auto}.comm-panel[data-panel=records],.comm-panel[data-panel=analysis]{position:absolute;top:0;bottom:0;left:0;right:0}.comm-panels.comm-swiping .comm-panel{visibility:visible;will-change:transform;transition:transform .32s cubic-bezier(.32,.72,0,1)}.comm-body{flex-direction:column;gap:10px;padding:12px 10px 10px;display:flex}.comm-auth-bubble,.comm-info-bubble{color:var(--room-primary-text,#2c3e50);padding:12px}.comm-auth{border:1px solid var(--room-popup-border,#00000014);background:var(--room-popup-card-bg,#fff9);border-radius:12px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}.comm-auth-in-bubble{background:0 0;border:none;padding:0}.comm-auth-title{color:var(--room-primary-text,#2c3e50);border-bottom:1px solid var(--room-popup-border,#00000012);align-items:center;gap:6px;padding-bottom:7px;font-size:12.5px;font-weight:600;display:flex}.comm-auth-title:before{content:\"\";background:#2196f3;border-radius:2px;flex:none;width:3px;height:12px}.comm-auth-title ha-icon{--mdc-icon-size:15px;color:#2196f3}.comm-auth-status{color:var(--room-secondary-text,#666);background:#0000000d;border-radius:999px;margin-left:auto;padding:1px 8px;font-size:11px;font-weight:500}.comm-auth-status.ok{color:#2e7d32;background:#4caf5024}.comm-auth-status.danger{color:#c62828;background:#f4433624}.comm-auth-body{flex-direction:column;gap:10px;display:flex}.comm-auth-action{box-sizing:border-box;cursor:pointer;color:#fff;background:linear-gradient(135deg,#42a5f5,#1e88e5);border:none;border-radius:10px;justify-content:center;align-items:center;gap:6px;width:100%;padding:10px 12px;font-size:13px;font-weight:600;transition:filter .15s;display:flex;box-shadow:0 2px 8px #2196f347}.comm-auth-action:hover{filter:brightness(1.06)}.comm-auth-action:active{filter:brightness(.94)}.comm-auth-action ha-icon{--mdc-icon-size:17px}.comm-auth-action.ready{background:linear-gradient(135deg,#66bb6a,#43a047);box-shadow:0 2px 8px #43a04747}.comm-auth-action-cap{text-align:center;color:var(--room-secondary-text,#8a8a8a);margin-top:-4px;font-size:10.5px;line-height:1.5}.comm-auth-fields{background:#80808014;border-radius:10px;flex-direction:column;gap:8px;padding:10px;display:flex}.comm-set{flex-direction:column;gap:6px;display:flex}.comm-set-title{color:#8a97a3;align-items:center;gap:4px;font-size:11px;display:flex}.comm-set-title ha-icon{--mdc-icon-size:13px}.comm-set-list{background:#80808014;border-radius:10px;flex-direction:column;display:flex;overflow:hidden}.comm-set-row{color:#2c3e50;align-items:center;gap:8px;padding:7px 10px;font-size:12.5px;display:flex}.comm-set-row+.comm-set-row{border-top:1px solid #8080801f}.comm-set-name{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-set-time{color:#2c3e50;background:#fff;border:1px solid #80808047;border-radius:7px;outline:none;flex:none;padding:3px 6px;font-family:inherit;font-size:12px}.comm-set-time:focus{border-color:#2196f3}.comm-set-time:disabled{opacity:.45}.comm-switch{cursor:pointer;background:#80808059;border:none;border-radius:999px;flex:none;width:36px;height:20px;padding:0;transition:background .18s;position:relative}.comm-switch.on{background:#2196f3}.comm-switch:disabled{opacity:.45;cursor:not-allowed}.comm-switch-knob{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .18s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}.comm-switch.on .comm-switch-knob{transform:translate(16px)}.comm-set-action{color:#1565c0;cursor:pointer;background:#2196f314;border:1px solid #2196f359;border-radius:10px;justify-content:center;align-items:center;gap:5px;width:100%;padding:7px 10px;font-size:12.5px;font-weight:600;transition:background .15s;display:flex}.comm-set-action:hover{background:#2196f329}.comm-set-action ha-icon{--mdc-icon-size:15px}.comm-set-action-inline{border-radius:999px;flex:none;width:auto;padding:3px 9px;font-size:12px;font-weight:500}.comm-set-action:disabled{opacity:.45;cursor:not-allowed;color:var(--room-secondary-text,#7f8c8d);background:#8080801a;border-color:#80808047}.comm-auth-field{grid-template-columns:68px minmax(0,1fr);align-items:center;gap:8px;display:grid}.comm-auth-field-label{color:var(--room-secondary-text,#7f8c8d);font-size:11.5px;line-height:1.3}.comm-auth-control{align-items:center;gap:6px;min-width:0;display:flex}.comm-auth-input{border:1px solid var(--room-popup-border,#00000024);background:var(--room-popup-bg,#fff);min-width:0;color:var(--room-primary-text,#2c3e50);box-sizing:border-box;border-radius:8px;outline:none;flex:1;padding:6px 9px;font-family:inherit;font-size:12.5px}.comm-auth-input:focus{border-color:#2196f3;box-shadow:0 0 0 2px #2196f326}.comm-auth-input::placeholder{color:#00000059}.comm-auth-op{cursor:pointer;color:#fff;background:#2196f3;border:none;border-radius:8px;flex:none;padding:6px 12px;font-size:12px;font-weight:600;transition:background .15s}.comm-auth-op:hover{background:#1976d2}.comm-auth-hints{flex-direction:column;gap:4px;display:flex}.comm-auth-hint{color:var(--room-secondary-text,#8a8a8a);word-break:break-word;padding-left:11px;font-size:10.5px;line-height:1.5;position:relative}.comm-auth-hint:before{content:\"\";opacity:.55;background:currentColor;border-radius:50%;width:3px;height:3px;position:absolute;top:6px;left:2px}.comm-auth-note{align-items:flex-start;gap:5px;display:flex}.comm-auth-note ha-icon{--mdc-icon-size:13px;flex:none;margin-top:1px}.comm-hero{--comm-hero-rgb:33, 150, 243;--comm-hero-ribbon-a:#42a5f5;--comm-hero-ribbon-b:#1976d2;--comm-hero-bg-a:#2196f31f;--comm-hero-bg-b:#2196f308;border:1px solid rgba(var(--comm-hero-rgb), .18);background:linear-gradient(135deg, var(--comm-hero-bg-a), var(--comm-hero-bg-b));border-radius:12px;flex-direction:column;gap:4px;padding:12px 14px;display:flex;position:relative;overflow:hidden}.comm-hero.unicom{--comm-hero-rgb:229, 57, 53;--comm-hero-ribbon-a:#ef5350;--comm-hero-ribbon-b:#c62828;--comm-hero-bg-a:#e539352e;--comm-hero-bg-b:#e5393505}.comm-hero.mobile{--comm-hero-rgb:67, 160, 71;--comm-hero-ribbon-a:#66bb6a;--comm-hero-ribbon-b:#2e7d32;--comm-hero-bg-a:#43a0472e;--comm-hero-bg-b:#43a04705}.comm-hero-carrier{color:#fff;background:linear-gradient(135deg, var(--comm-hero-ribbon-a), var(--comm-hero-ribbon-b));white-space:nowrap;text-overflow:ellipsis;border-bottom-left-radius:10px;max-width:62%;padding:3px 10px 3px 12px;font-size:11px;font-weight:600;line-height:1.6;position:absolute;top:0;right:0;overflow:hidden}.comm-hero-main{min-width:0;padding-right:86px}.comm-hero-phone{letter-spacing:.5px;word-break:break-all;cursor:pointer;-webkit-user-select:none;user-select:none;align-items:center;gap:6px;margin-top:2px;font-size:19px;font-weight:700;display:inline-flex}.comm-hero-phone-eye{--mdc-icon-size:14px;opacity:.55;flex:none}.comm-hero-phone:hover .comm-hero-phone-eye{opacity:.9}.comm-hero-phone.revealed .comm-hero-phone-text{color:#2196f3}.comm-hero-tags{flex-wrap:wrap;justify-content:space-evenly;gap:2px;display:flex}.comm-tag{color:var(--room-secondary-text,#666);white-space:nowrap;background:#0000000d;border-radius:999px;align-items:center;gap:3px;padding:2px 8px;font-size:11px;line-height:1.5;display:inline-flex}.comm-tag ha-icon{--mdc-icon-size:12px;opacity:.75;flex:none}.comm-tag.ok{color:#2e7d32;background:#4caf5024}.comm-tag.danger{color:#c62828;background:#f4433624}.comm-tag-action{cursor:pointer;background:var(--room-popup-card-bg,#ffffffeb);color:var(--room-primary-text,#2c3e50);border:1px solid #2196f359;font-weight:600}.comm-tag-action:hover{border-color:#2196f3}.comm-tag-action ha-icon{opacity:.9;color:#2196f3}.comm-tag-action.ok,.comm-tag-action.ok ha-icon{color:#2e7d32}.comm-tag-action.danger,.comm-tag-action.danger ha-icon{color:#c62828}.comm-hero-metrics{border-top:1px solid rgba(var(--comm-hero-rgb), .16);grid-template-columns:repeat(3,minmax(0,1fr));place-items:center;gap:8px;padding-top:10px;display:grid}.comm-metric{min-width:0}.comm-metric-value{white-space:nowrap;text-overflow:ellipsis;color:var(--room-primary-text,#2c3e50);font-size:19px;font-weight:700;line-height:1.15;overflow:hidden}.comm-metric-unit{color:var(--room-secondary-text,#7f8c8d);margin-left:2px;font-size:11px;font-weight:400}.comm-metric-label{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;text-overflow:ellipsis;font-size:11px;overflow:hidden}.comm-metric-balance .comm-metric-value{color:#2196f3}.comm-metric-flow .comm-metric-value{color:#00897b}.comm-metric-points .comm-metric-value{color:#ff9800}.comm-metric-danger .comm-metric-value{color:#e53935}.comm-section{border:1px solid var(--room-popup-border,#00000014);background:var(--room-popup-card-bg,#fff9);border-radius:12px;padding:10px 12px}.comm-section-title{border-bottom:1px solid var(--room-popup-border,#00000012);align-items:center;gap:6px;margin-bottom:8px;padding-bottom:7px;font-size:12.5px;font-weight:600;display:flex}.comm-section-title:before{content:\"\";background:#2196f3;border-radius:2px;flex:none;width:3px;height:12px}.comm-section-title ha-icon{--mdc-icon-size:15px;color:#2196f3}.comm-section-body{flex-direction:column;gap:8px;display:flex}.comm-section-in-bubble{background:0 0;border:none;padding:0}.comm-kv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;display:grid}.comm-kv{justify-content:space-between;align-items:baseline;gap:8px;min-width:0;font-size:12px;display:flex}.comm-kv-label{color:var(--room-secondary-text,#7f8c8d);flex:none}.comm-kv-value{text-align:right;word-break:break-all;min-width:0;font-weight:600}.comm-duo{align-items:center;gap:12px;display:flex}.comm-duo-main{flex-direction:column;flex:1;gap:7px;min-width:0;display:flex}.comm-ring{flex:none;width:152px;height:152px;position:relative}.comm-ring-canvas{position:absolute;top:0;bottom:0;left:0;right:0}.comm-ring-center{text-align:center;pointer-events:none;flex-direction:column;justify-content:center;align-items:center;line-height:1.05;display:flex;position:absolute;top:0;bottom:0;left:0;right:0}.comm-ring-value{font-size:17px;font-weight:700;line-height:1.02}.comm-ring-unit{color:var(--room-secondary-text,#7f8c8d);font-size:10px;line-height:1.05}.comm-ring-caption{color:var(--room-secondary-text,#7f8c8d);margin-top:0;font-size:10px;line-height:1.05}.comm-ring-tip{color:var(--room-primary-text,#2c3e50);white-space:nowrap;align-items:center;gap:6px;padding:9px 12px;font-size:12px;display:flex}.comm-ring-tip-dot{border-radius:50%;flex:none;width:8px;height:8px}.comm-stat-line{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;display:flex}.comm-stat-label{color:var(--room-secondary-text,#7f8c8d)}.comm-stat-value{font-weight:600}.comm-legend{flex-direction:column;gap:4px;display:flex}.comm-legend-item{grid-template-columns:8px minmax(0,1fr) auto auto;align-items:center;gap:6px;font-size:11.5px;display:grid}.comm-legend-dot{border-radius:50%;flex:none;width:8px;height:8px}.comm-legend-name{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.comm-legend-value{text-align:right;font-weight:600}.comm-legend-percent{text-align:right;min-width:36px;color:var(--room-secondary-text,#8a8a8a)}.comm-packs{flex-direction:column;gap:5px;display:flex}.comm-pack-head{justify-content:space-between;align-items:baseline;gap:8px;font-size:11px;display:flex}.comm-pack-label{color:var(--room-secondary-text,#7f8c8d);flex:none}.comm-pack-text{text-align:right;word-break:break-all;color:var(--room-primary-text,#2c3e50)}.comm-pack-track{background:#80808029;border-radius:999px;height:4px;margin-top:3px;overflow:hidden}.comm-pack-fill{background:#64b5f6;border-radius:999px;height:100%}.comm-months{flex-direction:column;gap:4px;margin-top:8px;display:flex}.comm-month{grid-template-columns:34px 1fr 74px;align-items:center;gap:8px;font-size:11.5px;display:grid}.comm-month-label{color:var(--room-secondary-text,#7f8c8d)}.comm-month-track{background:#80808029;border-radius:999px;height:6px;overflow:hidden}.comm-month-fill{background:linear-gradient(90deg,#42a5f5,#1e88e5);border-radius:999px;height:100%}.comm-month-value{text-align:right;font-variant-numeric:tabular-nums}.comm-mini-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;display:grid}.comm-mini{text-align:center;background:#8080800f;border-radius:8px;min-width:0;padding:6px 4px}.comm-mini-value{color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:700;overflow:hidden}.comm-mini-label{color:var(--room-secondary-text,#7f8c8d);margin-top:1px;font-size:11px}.comm-ov-sections{flex-direction:column;gap:10px;display:flex}.comm-ov{flex-direction:column;gap:9px;margin-top:2px;display:flex}.comm-ov-card{background:#8080800e;border:1px solid #80808014;border-radius:10px;padding:9px 10px 8px}.comm-ov-ghead{flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px;display:flex}.comm-ov-icon{--mdc-icon-size:16px;color:var(--room-secondary-text,#7f8c8d);flex:none}.comm-ov-glabel{color:var(--room-primary-text,#2c3e50);font-size:13px;font-weight:600}.comm-ov-gtotal{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;margin-left:auto;font-size:10.5px}.comm-ov-row{align-items:center;gap:5px;padding:4px 0;font-size:12px;display:flex}.comm-ov-row+.comm-ov-row,.comm-ov-item+.comm-ov-item>.comm-ov-row{border-top:1px solid #80808012}.comm-ana-ov-link{cursor:pointer;border-radius:6px}.comm-ana-ov-link:hover{background:#80808014;box-shadow:0 0 0 4px #80808014}.comm-ov-rank{text-align:center;width:16px;height:16px;color:var(--room-secondary-text,#7f8c8d);background:#80808029;border-radius:50%;flex:none;font-size:10px;font-weight:700;line-height:16px}.comm-ov-rank-1{color:#1e88e5;background:#2196f32e}.comm-ov-who{flex:auto;align-items:center;gap:6px;min-width:0;display:flex}.comm-ov-row-years>.comm-ov-who{flex:0 auto;min-width:min-content}.comm-ana-ov-rowyears{flex-wrap:wrap;flex:auto;align-items:center;gap:1px;display:flex}.comm-ov-name{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--room-primary-text,#2c3e50);flex:0 auto;font-size:12.5px;font-weight:500;overflow:hidden}.comm-ov-place{color:var(--room-secondary-text,#6f7b8a);white-space:nowrap;background:#8080801f;border-radius:6px;flex:none;padding:0 5px;font-size:10px;font-style:normal;line-height:15px}.comm-ov-bar{background:#80808024;border-radius:999px;flex:none;width:64px;height:6px;overflow:hidden}.comm-ov-fill{background:linear-gradient(90deg,#7ecbff,#1e88e5);border-radius:999px;min-width:2px;height:100%;display:block}.comm-ov-val{text-align:right;min-width:104px;color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none;font-size:11px}.comm-ov-tip{color:var(--room-secondary-text,#7f8c8d);padding:1px 0;font-size:11.5px}.comm-ov-muted{background:#80808009}.comm-ana-ov-msgs{border-top:1px dashed #80808038;flex-direction:column;gap:3px;margin-top:6px;padding-top:6px;display:flex}.comm-ov-item>.comm-ana-ov-msgs{border-top:0;margin:0 0 2px 24px;padding-top:2px}.comm-ana-ov-msg>.comm-content-tag{margin-left:auto}.comm-ana-ov-rowyears .comm-ov-year,.comm-ov-who .comm-ov-year{flex:none}.comm-ana-ov-more{font:inherit;color:var(--room-secondary-text,#7f8c8d);cursor:pointer;text-align:left;background:0 0;border:0;align-self:flex-start;padding:1px 0;font-size:10.5px}.comm-ana-ov-more:hover{text-decoration:underline}.comm-ana-ov-leftover{margin-top:6px}.comm-ana-ov-leftover-label{color:var(--room-secondary-text,#7f8c8d);font-size:10.5px}.comm-ana-ov-msg{align-items:center;gap:6px;min-width:0;font-size:11.5px;display:flex}.comm-ana-ov-who{text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:110px;color:var(--room-primary-text,#2c3e50);flex:0 auto;overflow:hidden}.comm-ana-ov-at{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none}.comm-ana-ov-years{flex-wrap:wrap;align-items:center;gap:4px;margin:2px 0 7px;display:flex}.comm-ana-ov-year{color:var(--room-secondary-text,#6f7b8a);font-variant-numeric:tabular-nums;white-space:nowrap;background:#8080801a;border-radius:6px;padding:0 5px;font-size:10px;line-height:16px}.comm-ana-ov-year b{color:var(--room-primary-text,#2c3e50);margin-right:3px;font-weight:600}.comm-ana-ov-year-more{background:0 0}.comm-ana-ov-go{text-align:left;cursor:pointer;width:100%;font:inherit;color:#2196f3;background:#2196f30f;border:1px dashed #2196f373;border-radius:6px;margin-top:2px;padding:4px 8px;font-size:11.5px}.comm-ana-ov-go:hover{background:#2196f31f}.comm-ov-note{color:var(--room-secondary-text,#9aa0a6);margin-left:auto;font-size:10.5px;font-weight:400}.comm-sub-title{white-space:nowrap;color:var(--room-secondary-text,#7f8c8d);border-bottom:1px dashed #80808061;align-items:center;gap:6px;margin-top:2px;padding-bottom:3px;font-size:11px;display:flex}.comm-daily{flex-direction:column;gap:3px;display:flex}.comm-daily-bars{border-bottom:1px solid #8080802e;align-items:flex-end;gap:2px;height:54px;display:flex}.comm-daily-col{cursor:default;flex:1;align-items:flex-end;min-width:0;height:100%;display:flex}.comm-daily-bar{background:linear-gradient(#64b5f6,#2196f3);border-radius:3px 3px 0 0;width:100%;transition:filter .15s}.comm-daily-col:hover .comm-daily-bar{filter:brightness(1.15)}.comm-daily-col.today .comm-daily-bar{background:linear-gradient(#ffb74d,#fb8c00)}.comm-daily-axis{color:var(--room-secondary-text,#8a8a8a);gap:2px;font-size:9px;line-height:1;display:flex}.comm-daily-axis span{text-align:center;flex:1;min-width:0;overflow:hidden}.comm-daily-tip{flex-direction:column;gap:1px;padding:10px;display:flex}.comm-daily-tip-date{color:var(--room-secondary-text,#7f8c8d);font-size:11px}.comm-daily-tip-value{color:var(--room-primary-text,#2c3e50);font-size:15px;font-weight:700}.comm-daily-tip-sub{color:var(--room-secondary-text,#7f8c8d);font-size:11px}.comm-rank-list{flex-direction:column;gap:4px;display:flex}.comm-rank-item{cursor:pointer;border-radius:6px;align-items:center;gap:8px;margin:0 -4px;padding:2px 4px;font-size:12px;transition:background .15s;display:flex}.comm-rank-item:hover{background:#80808014}.comm-rank-item.active{background:#2196f324}.comm-rank-no{text-align:center;width:16px;height:16px;color:var(--room-secondary-text,#7f8c8d);background:#80808029;border-radius:50%;flex:none;font-size:10.5px;line-height:16px}.comm-rank-no.rank-1{color:#b8860b;background:#ffc10738}.comm-rank-no.rank-2{color:#607d8b;background:#90a4ae47}.comm-rank-no.rank-3{color:#a1662f;background:#bf897042}.comm-rank-number{min-width:0;color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12.5px;overflow:hidden}.comm-rank-value{color:var(--room-primary-text,#2c3e50);flex:none;font-weight:600}.comm-rank-count{color:#455a64;background:#607d8b29;border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-rank-time{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11px}.comm-place-scope{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border:1px solid #0000;border-radius:999px;align-items:center;gap:3px;margin-left:auto;padding:0 7px;font-size:10.5px;line-height:1.7;transition:background .15s,color .15s;display:inline-flex}.comm-place-scope ha-icon{--mdc-icon-size:12px}.comm-place-scope:hover{background:#80808033}.comm-place-scope[data-scope=number_location]{color:#1565c0;background:#2196f329}.comm-place-list{flex-wrap:wrap;gap:5px;display:flex}.comm-place{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border-radius:999px;padding:0 8px;font-size:11px;line-height:1.6;transition:background .15s,color .15s}.comm-place:hover{filter:brightness(.94)}.comm-place.active{font-weight:600;box-shadow:inset 0 0 0 1px}.comm-filter-clear{color:#2196f3;cursor:pointer;background:0 0;border:none;margin-left:4px;padding:0 2px;font-size:11px;font-weight:500}.comm-filter-clear:hover{text-decoration:underline}.comm-filter-bar{color:#1565c0;background:#2196f317;border-radius:8px;align-items:center;gap:8px;margin-top:6px;padding:3px 8px;font-size:11.5px;display:flex}.comm-filter-text{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-filter-bar .comm-filter-clear{margin-left:auto}.comm-view-toggle{background:#8080801f;border-radius:999px;flex:none;align-items:center;gap:2px;margin-left:auto;padding:1px;display:inline-flex}.comm-view-key{color:var(--room-secondary-text,#666);cursor:pointer;background:0 0;border:none;border-radius:999px;align-items:center;gap:3px;padding:1px 8px;font-size:11px;line-height:1.6;transition:background .15s,color .15s;display:inline-flex}.comm-view-key ha-icon{--mdc-icon-size:13px}.comm-view-key:hover{color:var(--room-primary-text,#2c3e50)}.comm-view-key.active{color:#1565c0;background:var(--room-popup-card-bg,#fff);font-weight:600;box-shadow:0 1px 2px #0000001f}.comm-dir-toggle{background:#8080801f;border-radius:999px;flex:none;align-items:center;gap:2px;margin-left:auto;padding:1px;display:inline-flex}.comm-dir-key{color:var(--room-secondary-text,#666);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:999px;padding:1px 7px;font-size:10.5px;line-height:1.6;transition:background .15s,color .15s}.comm-dir-key:hover{color:var(--room-primary-text,#2c3e50)}.comm-dir-key.active{color:#1565c0;background:var(--room-popup-card-bg,#fff);font-weight:600;box-shadow:0 1px 2px #0000001f}.comm-place-scope+.comm-dir-toggle{margin-left:4px}.comm-map-wrap{flex-direction:column;gap:6px;display:flex;position:relative}.comm-map-canvas{aspect-ratio:1.8;touch-action:none;width:100%;min-height:340px;max-height:480px}.comm-map-legend{color:var(--room-secondary-text,#7f8c8d);font-size:10.5px;line-height:1.5}.comm-ana-map .comm-sub-title .comm-map-fs-btn{width:20px;height:20px;box-shadow:none;color:var(--room-secondary-text,#7f8c8d);background:0 0;border-radius:6px;flex:none;position:static}.comm-ana-map .comm-sub-title .comm-map-fs-btn:hover{color:#2196f3;background:#2196f31f}.comm-ana-map .comm-sub-title .comm-map-fs-btn ha-icon{--mdc-icon-size:15px}.comm-ana-anim-toggle{font:inherit;color:var(--room-secondary-text,#7f8c8d);cursor:pointer;background:0 0;border:1px solid #80808059;border-radius:999px;flex:none;align-items:center;gap:4px;margin-left:auto;padding:1px 8px;font-size:10.5px;line-height:1.7;transition:background .15s,color .15s,border-color .15s;display:inline-flex}.comm-ana-anim-toggle:hover{color:#2196f3;background:#2196f31f}.comm-ana-anim-toggle.active{color:#1565c0;background:#2196f324;border-color:#2196f38c;font-weight:600}.comm-ana-anim-dot{opacity:.4;background:currentColor;border-radius:50%;flex:none;width:6px;height:6px}.comm-ana-anim-toggle.active .comm-ana-anim-dot{opacity:1}.comm-flow-bubble-wrap .bubble-content-scrollable{padding:10px}.comm-flow-bubble{flex-direction:column;gap:8px;display:flex}.comm-flow-head{align-items:center;gap:6px;display:flex}.comm-flow-dir{border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-flow-dir-out{color:#e65100;background:#fb8c002e}.comm-flow-dir-in{color:#4527a0;background:#7e57c22e}.comm-flow-title{color:var(--room-primary-text,#2c3e50);font-size:13px;font-weight:600}.comm-mini-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.comm-flow-list{flex-direction:column;gap:3px;max-height:168px;display:flex;overflow-y:auto}.comm-flow-row{color:var(--room-secondary-text,#666);background:#80808012;border-radius:6px;flex:none;align-items:center;gap:8px;padding:3px 6px;font-size:11.5px;display:flex}.comm-flow-time,.comm-flow-dur{font-variant-numeric:tabular-nums;flex:none}.comm-flow-num{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-flow-actions{display:flex}.comm-flow-filter{color:#1565c0;cursor:pointer;background:#2196f31a;border:1px solid #2196f359;border-radius:8px;width:100%;padding:6px 10px;font-size:12px;font-weight:600;transition:background .15s}.comm-flow-filter:hover{background:#2196f32e}.comm-map-canvas{min-height:300px}.comm-sort-bar{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;display:flex}.comm-sort-label{color:var(--room-secondary-text,#7f8c8d);align-items:center;gap:4px;font-size:11.5px;display:inline-flex}.comm-sort-label ha-icon{--mdc-icon-size:14px}.comm-sort-keys{flex-wrap:wrap;align-items:center;gap:5px;display:flex}.comm-sort-key{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border:1px solid #0000;border-radius:999px;align-items:center;gap:1px;padding:2px 9px;font-size:11.5px;line-height:1.6;transition:background .15s,color .15s,border-color .15s;display:inline-flex}.comm-sort-key ha-icon{--mdc-icon-size:12px}.comm-sort-key:hover{background:#80808033}.comm-sort-key.active{color:#1565c0;background:#2196f32e;border-color:#2196f359;font-weight:600}.comm-call-list{flex-direction:column;gap:6px;display:flex}.comm-call-item{background:#8080800f;border-radius:8px;padding:6px 8px;position:relative}.comm-call-today{color:#2e7d32;pointer-events:none;background:#4caf5029;border-radius:999px;padding:0 6px;font-size:10px;line-height:1.6;position:absolute;bottom:6px;right:8px}.comm-call-item.today .comm-call-meta{padding-right:42px}.comm-call-main{align-items:center;gap:8px;font-size:12px;display:flex}.comm-call-type{color:#455a64;background:#607d8b29;border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-call-type.out{color:#1565c0;background:#2196f329}.comm-call-type.in{color:#2e7d32;background:#4caf5029}.comm-call-number{min-width:0;color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12.5px;overflow:hidden}.comm-call-duration{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11.5px}.comm-call-meta{color:var(--room-secondary-text,#7f8c8d);flex-wrap:wrap;align-items:center;gap:3px 6px;margin-top:3px;font-size:11px;display:flex}.comm-call-meta-time{flex:none}.comm-call-chip{white-space:nowrap;border-radius:999px;flex:none;align-items:center;gap:2px;padding:0 7px;font-size:10.5px;line-height:1.7;display:inline-flex}.comm-call-chip ha-icon{--mdc-icon-size:11px}.comm-call-chip-domestic{color:#455a64;background:#607d8b29}.comm-call-chip-roaming{color:#c66900;background:#ff98002e}.comm-call-chip-international{color:#7b1fa2;background:#9c27b029}.comm-call-chip-video{color:#00695c;background:#00897b29}.comm-place-tone-0{color:#1565c0;background:#2196f329}.comm-place-tone-1{color:#00695c;background:#00897b29}.comm-place-tone-2{color:#283593;background:#3f51b529}.comm-place-tone-3{color:#2e7d32;background:#4caf5029}.comm-place-tone-4{color:#6a1b9a;background:#9c27b029}.comm-place-tone-5{color:#37474f;background:#607d8b33}.comm-place-tone-6{color:#0277bd;background:#0277bd29}.comm-place-tone-7{color:#827717;background:#afb42b33}.comm-call-chip-place{color:var(--room-secondary-text,#7f8c8d);background:#8080801a}.comm-call-place-arrow{color:var(--room-secondary-text,#8a8a8a);padding:0 1px}.comm-place-ink-0{color:#1565c0}.comm-place-ink-1{color:#00695c}.comm-place-ink-2{color:#283593}.comm-place-ink-3{color:#2e7d32}.comm-place-ink-4{color:#6a1b9a}.comm-place-ink-5{color:#37474f}.comm-place-ink-6{color:#0277bd}.comm-place-ink-7{color:#827717}.comm-rec-list{background:#8080800f;border-radius:10px;flex-direction:column;display:flex;overflow:hidden}.comm-rec-item{color:var(--room-primary-text,#2c3e50);align-items:center;gap:8px;padding:6px 10px;font-size:12px;display:flex}.comm-rec-item+.comm-rec-item{border-top:1px solid #8080801a}.comm-rec-time{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none;font-size:11px}.comm-rec-badge{color:#1565c0;background:#2196f324;border-radius:999px;flex:none;padding:0 6px;font-size:10.5px;line-height:1.6}.comm-rec-badge.in{color:#2e7d32;background:#4caf5029}.comm-rec-main{text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;flex:1;min-width:0;overflow:hidden}.comm-rec-sub{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11px}.comm-rec-fee{color:#ef6c00;flex:none;font-size:11px}.comm-rec-tag{color:var(--room-secondary-text,#7f8c8d);background:#8080801f;border-radius:999px;flex:none;padding:0 6px;font-size:10px}.comm-rec-place{max-width:45%;color:var(--room-secondary-text,#7f8c8d);background:#8080801a;border-radius:999px;flex:none;align-items:center;gap:2px;padding:0 6px;font-size:10.5px;display:inline-flex;overflow:hidden}.comm-rec-place ha-icon{--mdc-icon-size:12px;flex:none}.comm-rec-place>span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.comm-mini-clickable{cursor:pointer;border-radius:8px;transition:background .15s}.comm-mini-clickable:hover{background:#2196f314}.comm-mini-tip{color:var(--room-primary-text,#2c3e50);flex-direction:column;gap:8px;padding:10px;display:flex}.comm-mini-tip-title{color:var(--room-primary-text,#2c3e50);align-items:center;gap:6px;font-size:12.5px;font-weight:600;display:flex}.comm-mini-tip-headtext{flex:1;min-width:0}.comm-mini-tip-back{font:inherit;color:#1565c0;cursor:pointer;background:0 0;border:1px solid #2196f366;border-radius:999px;flex:none;margin-left:auto;padding:0 6px;font-size:10px;font-weight:500;line-height:1.6;transition:background .15s}.comm-mini-tip-back:hover{background:#2196f31f}.comm-mini-tip .comm-kv-grid{grid-template-columns:1fr;gap:6px 0}.comm-mini-tip .comm-kv{font-size:12.5px}.comm-mini-tip .comm-kv-label{color:var(--room-primary-text,#2c3e50);opacity:.72}.comm-mini-tip .comm-kv-value{color:var(--room-primary-text,#2c3e50)}.comm-hour-chart{flex-direction:column;gap:4px;display:flex}.comm-hour-svg{width:100%;height:64px;display:block}.comm-hour-area{fill:#2196f329}.comm-hour-line{fill:none;stroke:#2196f3;stroke-width:1.8px;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.comm-hour-dot{fill:#2196f3}.comm-hour-dot-peak{fill:#ff9800;stroke:#fff;stroke-width:1.2px}.comm-hour-axis{height:12px;position:relative}.comm-hour-tick{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;font-size:9.5px;line-height:12px;position:absolute;transform:translate(-50%)}.comm-hour-foot{flex-wrap:wrap;justify-content:space-between;gap:2px 8px;font-size:11px;line-height:1.4;display:flex}.comm-hour-peak{color:var(--room-primary-text,#2c3e50);font-weight:600}.comm-hour-meta{color:var(--room-secondary-text,#7f8c8d)}.comm-ana{flex-direction:column;gap:10px;display:flex}.comm-ana-busy>:not(.comm-ana-head){opacity:.45;transition:opacity .15s}.comm-ana-head{flex-direction:column;gap:8px;display:flex}.comm-ana-crumbs{flex-wrap:wrap;align-items:center;gap:2px;display:flex}.comm-ana-crumb{color:#2196f3;cursor:pointer;white-space:nowrap;background:0 0;border:none;padding:1px 2px;font-size:11.5px;font-weight:500}.comm-ana-crumb.current{color:var(--room-primary-text,#2c3e50);cursor:default;font-weight:600}.comm-ana-crumb-sep{color:var(--room-secondary-text,#9aa4ad);font-size:11px}.comm-ana-swap{color:#1976d2;cursor:pointer;white-space:nowrap;background:#2196f314;border:1px solid #2196f359;border-radius:999px;flex:none;margin-left:auto;padding:2px 9px;font-size:10.5px;font-weight:600}.comm-ana-swap:hover{background:#2196f329}.comm-ana-peer{color:#1976d2;cursor:pointer;white-space:nowrap;background:#2196f314;border:1px solid #2196f359;border-radius:999px;flex:none;align-items:center;gap:4px;max-width:46%;margin-left:6px;padding:2px 9px;font-size:10.5px;font-weight:600;display:inline-flex}.comm-ana-peer:hover{background:#2196f329}.comm-ana-peer.active{background:#2196f329;border-color:#2196f38c}.comm-ana-peer-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.comm-ana-peer-clear{opacity:.7;flex:none;font-size:9.5px}.comm-ana-peer-clear:hover{opacity:1}.comm-ana-md{font-variant-numeric:tabular-nums;justify-content:center;min-width:46px}.comm-ana-today{justify-content:center;min-width:38px}.comm-rank-n{flex:none;margin-left:auto}.comm-rank-n .comm-record-tabs-slot{width:160px;padding:1px}.comm-rank-n .comm-record-tab{flex:1 1 0;gap:0;padding:1px 0;font-size:9.5px}.comm-peer-pick{background:var(--room-card-bg,#fff);width:min(420px,92vw);color:var(--room-primary-text,#2c3e50);border-radius:14px;flex-direction:column;gap:10px;padding:14px;display:flex;box-shadow:0 12px 32px #0000002e}.comm-peer-tip{color:var(--room-secondary-text,#7f8c8d);font-size:11.5px}.comm-peer-row{gap:8px;display:flex}.comm-peer-input{box-sizing:border-box;min-width:0;color:var(--room-primary-text,#2c3e50);background:#80808014;border:1px solid #8080804d;border-radius:8px;flex:auto;padding:7px 10px;font-size:13px}.comm-peer-input:focus{border-color:#2196f3;outline:none}.comm-peer-go{color:#fff;cursor:pointer;background:#2196f3;border:none;border-radius:8px;flex:none;padding:7px 14px;font-size:12.5px;font-weight:600}.comm-peer-go:hover{background:#1976d2}.comm-peer-msg{color:#e57373;min-height:14px;font-size:11.5px}.comm-peer-list{max-height:44vh;color:var(--room-secondary-text,#7f8c8d);flex-direction:column;gap:2px;font-size:12px;display:flex;overflow-y:auto}.comm-peer-item{color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:6px 8px;font-size:12.5px;display:flex}.comm-peer-item:hover{background:#8080801a}.comm-peer-name{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--room-primary-text,#2c3e50);flex:auto;overflow:hidden}.comm-peer-count{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11px}.comm-ana-chart{width:100%}.comm-ana-canvas{width:100%;height:190px}.comm-ana .comm-mini-grid{margin:2px 0}.comm-ana-rank{flex-direction:column;gap:6px;display:flex}.comm-ana-rank-box{flex-direction:column;gap:2px;display:flex}.comm-ana-rank-item{width:100%;color:var(--room-primary-text,#2c3e50);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:7px;padding:5px 6px;font-size:12px;transition:background .15s;display:flex}.comm-ana-rank-item:hover{background:#2196f314}.comm-ana-rank-no{text-align:center;width:16px;height:16px;color:var(--room-secondary-text,#7f8c8d);background:#0000000f;border-radius:50%;flex:none;font-size:10px;font-weight:700;line-height:16px}.comm-ana-rank-item:first-child .comm-ana-rank-no{color:#6d4c00;background:#ffd54f}.comm-ana-rank-item:nth-child(2) .comm-ana-rank-no{color:#37474f;background:#cfd8dc}.comm-ana-rank-item:nth-child(3) .comm-ana-rank-no{color:#4e2c0a;background:#d7a06a}.comm-ana-rank-name{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;font-weight:500;overflow:hidden}.comm-ana-rank-val{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:10.5px}.comm-ana-rank-info{color:var(--room-secondary-text,#7f8c8d);opacity:.5;cursor:pointer;flex:none;align-items:center;margin-left:2px;transition:opacity .15s,color .15s;display:inline-flex}.comm-ana-rank-info:hover{opacity:1;color:#2196f3}.comm-ana-rank-info ha-icon{--mdc-icon-size:15px}.comm-ana-rank-by{color:#1565c0;cursor:pointer;background:0 0;border:1px solid #2196f366;border-radius:999px;flex:none;margin-left:auto;padding:1px 7px;font-size:10px;line-height:1.6;transition:background .15s}.comm-ana-rank-by:hover{background:#2196f31f}.comm-ana-list{flex-direction:column;gap:6px;display:flex}.comm-ana-rows{flex-direction:column;display:flex}.comm-ana-row{border-bottom:1px dashed #0000000f;align-items:center;gap:7px;padding:4px 2px;font-size:11.5px;display:flex}.comm-ana-rows>.comm-ana-row:last-child{border-bottom:none}.comm-ana-year{align-items:center;gap:6px;margin:7px 0 2px;display:flex}.comm-ana-year:before{content:\"\";background:#2196f3;border-radius:2px;flex:none;width:3px;height:10px}.comm-ana-year-label{letter-spacing:.2px;color:#1976d2;flex:none;font-size:10.5px;font-weight:700}.comm-ana-year-sum{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none;font-size:10px}.comm-ana-dayrow{width:100%;font:inherit;text-align:left;cursor:pointer;background:#80808012;border:0;border-radius:6px;align-items:center;gap:6px;margin:2px 0;padding:3px 6px;transition:background .15s;display:flex}.comm-ana-dayrow:hover{background:#2196f31a}.comm-ana-dayrow-caret{--mdc-icon-size:15px;color:var(--room-secondary-text,#7f8c8d);flex:none;transition:transform .15s}.comm-ana-dayrow.open .comm-ana-dayrow-caret{transform:rotate(90deg)}.comm-ana-dayrow-day{color:var(--room-primary-text,#333);flex:none;font-size:11px;font-weight:600}.comm-ana-dayrow-val{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:10px}.comm-ana-dayrows{border-left:2px solid #2196f340;margin:0 0 4px 9px;padding-left:5px;display:none}.comm-ana-dayrows.open{display:block}.comm-ana-year:after{content:\"\";background:#2196f333;flex:1;height:1px}.comm-ana-rows>.comm-ana-year:first-child{margin-top:0}.comm-ana-list .comm-sub-title{flex-wrap:wrap;row-gap:4px}.comm-ana-years{flex-wrap:wrap;justify-content:flex-end;gap:4px;margin-left:auto;display:flex}.comm-ana-year-chip{color:#1976d2;font-variant-numeric:tabular-nums;cursor:pointer;background:#2196f314;border:1px solid #2196f359;border-radius:999px;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-ana-year-chip:hover{background:#2196f32e}.comm-ana-year-chip.active{color:#fff;background:#2196f3;border-color:#2196f3;font-weight:600}.comm-ana-map{flex-direction:column;gap:6px;display:flex;position:relative}.comm-ana-map .comm-map-canvas{width:100%;height:260px}.comm-map-fs-btn{z-index:3;width:28px;height:28px;color:var(--room-secondary-text,#5f6b7a);cursor:pointer;background:#ffffffdb;border:none;border-radius:8px;justify-content:center;align-items:center;transition:background .15s,color .15s;display:inline-flex;position:absolute;top:6px;right:6px;box-shadow:0 1px 4px #00000024}.comm-map-fs-btn:hover{color:#2196f3;background:#fff}.comm-map-fs-btn ha-icon{--mdc-icon-size:17px}.map-fullscreen .comm-map-canvas{flex:1;min-height:0;aspect-ratio:auto!important;height:auto!important;max-height:none!important}.map-fullscreen .comm-map-legend{flex:none}.comm-ana-row-time{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none}.comm-ana-row-tag{color:#1565c0;background:#2196f324;border-radius:999px;flex:none;padding:0 6px;font-size:10px;line-height:1.6}.comm-ana-row-tag.in{color:#2e7d32;background:#4caf5029}.comm-ana-row-tag.mid{color:var(--room-secondary-text,#7f8c8d);background:#80808024}.comm-ana-row-peer{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;overflow:hidden}.comm-ana-row-val{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none}.comm-ana-sum-table{grid-template-columns:var(--comm-sum-cols,1fr auto auto auto auto);align-items:center;gap:0 12px;margin-top:2px;display:grid}.comm-ana-sum-head,.comm-ana-sum-tr,.comm-ana-sum-total{display:contents}.comm-ana-sum-head>*{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;border-bottom:1px solid #80808038;padding-bottom:3px;font-size:10.5px}.comm-ana-sum-tr>*,.comm-ana-sum-total>*{font-variant-numeric:tabular-nums;white-space:nowrap;text-overflow:ellipsis;flex-direction:column;align-items:flex-end;gap:1px;padding:4px 0;font-size:12px;line-height:1.3;display:flex;overflow:hidden}.comm-ana-sum-sub{opacity:.72;font-size:10px}.comm-ana-sum-tr>:first-child,.comm-ana-sum-total>:first-child{align-items:flex-start}.comm-ana-sum-head>:not(:first-child){text-align:right}.comm-ana-sum-tr>.up,.comm-ana-sum-total>.up{color:#4a90e2}.comm-ana-sum-tr>.down,.comm-ana-sum-total>.down{color:#12b886}.comm-ana-sum-tr>.total,.comm-ana-sum-total>.total{color:var(--room-primary-text,#2c3e50);font-weight:600}.comm-ana-sum-tr.drill{cursor:pointer}.comm-ana-sum-tr.drill:hover>*{background:#2196f31a}.comm-ana-sum-total>*{border-top:1px solid #8080804d;padding-top:6px;font-weight:600}.comm-content-tag{color:#1565c0;cursor:pointer;white-space:nowrap;text-overflow:ellipsis;vertical-align:middle;background:0 0;border:1px solid #2196f380;border-radius:999px;flex:none;max-width:110px;padding:0 6px;font-size:10px;line-height:1.55;overflow:hidden}.comm-content-tag:hover{background:#2196f31f}.comm-chat{color:#191919;background:#ededed;border-radius:12px;flex-direction:column;width:min(600px,94vw);height:min(660px,84vh);display:flex;overflow:hidden;box-shadow:0 12px 32px #0000002e}.comm-chat[data-theme=dark]{color:#e0e0e0;background:#111}.comm-chat-head{background:#f7f7f7;border-bottom:1px solid #0000000f;flex:none;align-items:center;gap:10px;padding:9px 12px;display:flex}.comm-chat[data-theme=dark] .comm-chat-head{background:#1f1f1f;border-bottom-color:#ffffff14}.comm-chat-titlebox{flex:auto;min-width:0}.comm-chat-title{text-overflow:ellipsis;white-space:nowrap;font-size:14.5px;font-weight:600;overflow:hidden}.comm-chat-sub{color:#8a8a8a;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;font-size:10.5px;overflow:hidden}.comm-chat-date{flex:none;align-items:center;gap:3px;display:flex}.comm-chat-pillbtn{color:#666;white-space:nowrap;cursor:pointer;background:0 0;border:1px solid #0000001f;border-radius:999px;flex:none;padding:3px 10px;font-family:inherit;font-size:11.5px;line-height:1.6}.comm-chat-pillbtn:hover{background:#0000000a}.comm-chat-pillbtn.active{color:#07c160;background:#07c1601a;border-color:#07c160;font-weight:600}.comm-chat[data-theme=dark] .comm-chat-pillbtn{color:#aaa;border-color:#ffffff29}.comm-chat[data-theme=dark] .comm-chat-pillbtn.active{color:#3eb575;background:#3eb57529;border-color:#3eb575}.comm-chat-jumpmenu{color:var(--room-primary-text,#1a1a1a);flex-direction:column;gap:2px;display:flex}.comm-chat-jumpmenu-item{color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;flex-direction:column;gap:1px;padding:7px 9px;font-family:inherit;font-size:12.5px;line-height:1.35;display:flex}.comm-chat-jumpmenu-item:hover{background:#8080801f}.comm-chat-jumpmenu-item span{color:var(--room-secondary-text,#7f8c8d);font-size:10.5px}.comm-chat-jumpsect{border-top:1px solid #80808038;flex-direction:column;gap:2px;margin-top:4px;padding-top:5px;display:flex}.comm-chat-jumpsect-label{letter-spacing:.02em;color:var(--room-secondary-text,#7f8c8d);padding:0 9px 2px;font-size:10.5px}.comm-chat-jumpsect-wait{color:var(--room-secondary-text,#7f8c8d);padding:4px 9px;font-size:10.5px}.comm-chat-dateclear{width:18px;height:18px;color:inherit;cursor:pointer;background:#8080802e;border:none;border-radius:50%;margin-left:3px;font-size:9px;line-height:1;display:none}.comm-chat-dateclear.show{display:block}.comm-chat-dateclear:hover{background:#8080804d}.comm-chat-chips{scrollbar-width:none;background:#f7f7f7;border-bottom:1px solid #0000000f;flex:none;gap:6px;padding:7px 12px;display:flex;overflow-x:auto}.comm-chat-chips::-webkit-scrollbar{display:none}.comm-chat[data-theme=dark] .comm-chat-chips{background:#1f1f1f;border-bottom-color:#ffffff14}.comm-chat-chip{color:#666;white-space:nowrap;cursor:pointer;background:0 0;border:1px solid #0000001a;border-radius:999px;flex:none;padding:3px 6px;font-size:11px;line-height:1.6}.comm-chat-chip:hover{background:#0000000a}.comm-chat-chip.active{color:#07c160;background:#07c1601a;border-color:#07c160;font-weight:600}.comm-chat[data-theme=dark] .comm-chat-chip{color:#aaa;border-color:#ffffff24}.comm-chat[data-theme=dark] .comm-chat-chip.active{color:#3eb575;background:#3eb57529;border-color:#3eb575}.comm-chat-body{overscroll-behavior:contain;flex-direction:column;flex:auto;gap:10px;min-height:0;padding:12px;display:flex;overflow-y:auto}.comm-chat-more{color:#8a8a8a;border-radius:4px;align-self:center;padding:2px 10px;font-size:10.5px}.comm-chat-more.busy{opacity:.7}.comm-chat-day{color:#fff;background:#00000029;border-radius:4px;align-self:center;padding:2px 8px;font-size:10.5px}.comm-chat[data-theme=dark] .comm-chat-day{color:#ddd;background:#ffffff24}.comm-chat-msg{align-items:flex-start;gap:8px;display:flex}.comm-chat-msg.out{flex-direction:row-reverse}.comm-chat-avatar{color:#fff;background:#7d8ea3;border-radius:6px;flex:none;justify-content:center;align-items:center;width:34px;height:34px;font-size:12px;font-weight:600;display:flex;overflow:hidden}.comm-chat-avatar.me{background:#07c160}.comm-chat-col{flex-direction:column;align-items:flex-start;gap:3px;min-width:0;max-width:76%;display:flex}.comm-chat-msg.out .comm-chat-col{align-items:flex-end}.comm-chat-bubble{color:#191919;word-break:break-word;background:#fff;border-radius:2px 6px 6px;padding:8px 11px;font-size:13px;line-height:1.55}.comm-chat-msg.out .comm-chat-bubble{color:#191919;background:#95ec69;border-top-left-radius:6px;border-top-right-radius:2px}.comm-chat[data-theme=dark] .comm-chat-bubble{color:#e0e0e0;background:#2c2c2c}.comm-chat[data-theme=dark] .comm-chat-msg.out .comm-chat-bubble{color:#fff;background:#3eb575}.comm-chat-text{white-space:pre-wrap;word-break:break-word}.comm-chat-void{opacity:.7;font-style:italic}.comm-chat-file{word-break:break-all;align-items:center;gap:6px;display:flex}.comm-chat-file ha-icon{--mdc-icon-size:16px;flex:none}.comm-chat-msg.focus .comm-chat-bubble{outline-offset:1px;outline:2px solid #ff9f09;box-shadow:0 0 0 4px #ff9f0929}.comm-chat[data-theme=dark] .comm-chat-msg.focus .comm-chat-bubble{outline-color:#ffb74d;box-shadow:0 0 0 4px #ffb74d2e}.comm-chat-msg.focus .comm-chat-meta{color:#e65100;font-weight:600}.comm-chat[data-theme=dark] .comm-chat-msg.focus .comm-chat-meta{color:#ffb74d}.comm-chat-meta{color:#9a9a9a;align-items:center;gap:6px;padding:0 2px;font-size:9.5px;display:flex}.comm-chat-chan{border:1px solid var(--comm-chan-color,#8a8a8a);color:var(--comm-chan-color,#8a8a8a);white-space:nowrap;border-radius:999px;padding:0 5px;line-height:1.5}.comm-chat-time{font-variant-numeric:tabular-nums}.comm-ana-contact{flex-direction:column;gap:6px;max-height:52vh;display:flex;overflow-y:auto}.comm-ana-contact-line{color:var(--room-secondary-text,#7f8c8d);font-size:11px;line-height:1.5}.comm-record-top{z-index:3;background:var(--room-popup-card-bg,#fff);border-radius:10px;align-items:center;gap:8px;display:flex;position:sticky;top:0}.comm-record-top:empty{display:none}.comm-record-tabs{border-radius:10px;flex:auto;min-width:0}.comm-record-tabs:empty{display:none}.comm-record-month{background:#8080801a;border-radius:999px;flex:none;align-items:center;gap:1px;padding:1px 3px;display:inline-flex}.comm-month-nav{color:var(--room-secondary-text,#7f8c8d);cursor:pointer;background:0 0;border:none;border-radius:50%;align-items:center;padding:0 2px;transition:background .15s,color .15s;display:inline-flex}.comm-month-nav:hover:not(:disabled){color:#2196f3;background:#2196f326}.comm-month-nav:disabled{opacity:.3;cursor:default}.comm-month-nav ha-icon{--mdc-icon-size:16px}.comm-record-month .comm-month-label{font:inherit;font-variant-numeric:tabular-nums;color:var(--room-secondary-text,#7f8c8d);cursor:pointer;background:0 0;border:none;border-radius:6px;align-items:center;padding:1px 4px;font-size:10.5px;font-weight:600;transition:background .15s,color .15s;display:inline-flex}.comm-record-month .comm-month-label:hover{color:#2196f3;background:#2196f31f}.comm-record-month .comm-month-label.now{color:#2196f3}.rm-pick{gap:8px;display:flex}.rm-pick-left{border-right:1px solid #8080802e;flex-direction:column;flex:none;gap:2px;width:58px;max-height:168px;padding-right:3px;display:flex;overflow-y:auto}.rm-pick-right{flex:1;grid-template-columns:repeat(3,1fr);align-content:start;gap:4px;display:grid}.rm-pick-right.cols-7{grid-template-columns:repeat(7,1fr);gap:3px}.rm-pick-empty{text-align:center;opacity:.6;color:var(--room-primary-text,#333);flex:1;padding:10px 4px;font-size:12px;display:none}.rm-pick-cell{font:inherit;font-variant-numeric:tabular-nums;color:var(--room-primary-text,#333);cursor:pointer;background:0 0;border:none;font-size:11px}.rm-pick-left .rm-pick-cell{text-align:center;border-radius:6px;flex:none;padding:3px 6px}.rm-pick-right .rm-pick-cell{background:#80808014;border-radius:6px;padding:4px 2px}.rm-pick-right.cols-7 .rm-pick-cell{padding:3px 0;font-size:10px}.rm-pick-right .rm-pick-cell:hover:not(:disabled){background:#2196f32e}.rm-pick-cell.sel{color:#fff;background:#2196f3;font-weight:600}.rm-pick-cell.cur{color:#1565c0;outline:1.5px solid #2196f3;font-weight:600}.rm-pick-cell.off{opacity:.32;cursor:default}.rm-pick-left,.comm-flow-list,.comm-peer-list,.comm-ana-contact{touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.comm-month-back{color:#1565c0;cursor:pointer;background:0 0;border:1px solid #2196f366;border-radius:999px;flex:none;margin-left:2px;padding:0 6px;font-size:10px;line-height:1.6}.comm-month-back:hover{background:#2196f31f}.comm-record-tabs-slot{background:#8080801f;border-radius:10px;align-items:stretch;gap:2px;padding:2px;display:flex}.comm-record-tab{color:var(--room-secondary-text,#666);cursor:pointer;background:0 0;border:none;border-radius:8px;flex:1 1 0;justify-content:center;align-items:center;gap:4px;padding:5px 8px;font-size:12.5px;transition:background .15s,color .15s;display:inline-flex}.comm-record-tab ha-icon{--mdc-icon-size:15px}.comm-record-tab:hover{color:var(--room-primary-text,#2c3e50)}.comm-record-tab.active{color:#1565c0;background:var(--room-popup-card-bg,#fff);font-weight:600;box-shadow:0 1px 2px #0000001f}.comm-trend-canvas{touch-action:pan-y;width:100%;height:260px}.comm-trend-canvas{height:220px}.comm-call-meta-fee{flex:none}.comm-call-meta-fee.charge{color:#e65100;font-weight:600}.comm-tip{color:var(--room-secondary-text,#7f8c8d);background:#2196f30f;border-left:2px solid #2196f366;border-radius:4px;padding:5px 8px;font-size:11px;line-height:1.5}.comm-empty{color:var(--room-secondary-text,#7f8c8d);justify-content:center;align-items:center;gap:8px;padding:40px 20px;font-size:12.5px;display:flex}.comm-empty ha-icon{--mdc-icon-size:18px;flex:none}.comm-footer{color:var(--room-secondary-text,#8a8a8a);flex-wrap:wrap;align-items:center;gap:5px;padding-top:2px;font-size:11px;display:flex}.comm-footer-sep{opacity:.6}.comm-kv-grid{grid-template-columns:1fr}.comm-duo{gap:10px}.comm-ring{width:120px;height:120px}.comm-ring-value{font-size:17px}.comm-ring-caption{font-size:9.5px}.comm-mini-grid{gap:5px}.comm-ov-bar{width:40px}.comm-ov-val{min-width:84px}.comm-mini{padding:5px 2px}.comm-mini-value{font-size:12.5px}.comm-legend-percent{min-width:30px}.comm-month{grid-template-columns:30px 1fr 64px}.comm-hero-metrics{gap:6px}.comm-metric-value{font-size:17px}";

class PocketCarrierCard extends HTMLElement {
  // 以下静态字段由沿用的 mixin 代码通过 this.constructor 读写
  static _staticStyleSheet = null;
  static _globalEchartsPromise = null;
  static _globalEchartsLoaded = !1;
  static _echartsPassivePatched = !1;
  static _globalForceLockScroll = !1;
  static _globalPopupLockCount = 0;
  static _globalSavedScrollY = 0;
  static _globalSavedScrollX = 0;

  constructor() {
    (super(),
      this.attachShadow({ mode: "open" }),
      (this._hass = null),
      (this.config = {}),
      (this._cardConfig = null),
      (this.cardStyle = {
        width: "100%",
        height: "165px",
        borderRadius: "16px",
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
      }),
      (this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)),
      (this._isPageVisible = !0),
      (this._timers = new Et()),
      (this._zIndexManager = new At(this)),
      this._initScrollLockProperties(),
      this._initThemeProperties());
  }

  // 兼容 room-elves-card 的写法: type/standalone_type 之外的字段原样交给 comm
  setConfig(config) {
    if (!config || "object" != typeof config) throw new Error("卡片配置无效");
    const { type, standalone_type, ...rest } = config;
    ((this.config = { ...config }),
      (this._cardConfig = { entity: config.entity, type: "comm", name: config.name, ...rest }),
      (this._themeConfig = config.theme || config.theme_config || null),
      this._currentTheme || (this._currentTheme = "light"),
      this._hass && this.isConnected && this.render());
  }

  set hass(hass) {
    const first = !this._hass;
    ((this._hass = hass),
      first
        ? (this._themeConfig && !this._lastThemeName && this._updateTheme(),
          this._cardConfig && this.isConnected && this.render())
        : this._themeConfig && this._updateThemeFromEntity());
  }

  get hass() {
    return this._hass;
  }

  static async getConfigElement() {
    return document.createElement("pocket-carrier-card-editor");
  }

  static getConfigElement() {
    return document.createElement("pocket-carrier-card-editor");
  }

  static getStubConfig(hass, entities, entitiesFallback) {
    return {
      type: "custom:" + CARD_TAG,
      name: "我的通讯",
      tel_1: "",
      tel_1_name: "我的",
      initial_tab: "account",
    };
  }

  getCardSize() {
    return 3;
  }

  connectedCallback() {
    (this._timers || (this._timers = new Et()),
      this._zIndexManager || (this._zIndexManager = new At(this)),
      this._hass && this._cardConfig && this.render());
    const preload = () => this._preloadEcharts();
    ("function" == typeof requestIdleCallback
      ? requestIdleCallback(preload, { timeout: 3e3 })
      : this._timers.setTimeout(preload, 1200),
      this._setupVisibilityListener(),
      this._initTheme());
  }

  disconnectedCallback() {
    const C = this.constructor;
    (this._teardownCards(),
      this._zIndexManager && (this._zIndexManager.dispose(), (this._zIndexManager = null)),
      this._scrollLocked && !C._globalForceLockScroll && this._unlockBodyScroll(),
      this._timers.clearAll(),
      (this._durationTicker = null),
      this._durationTickTargets && (this._durationTickTargets.length = 0),
      this._disposeLowFreq(),
      this._removeVisibilityListener(),
      this._toggleThemeListener(!1));
  }

  render() {
    if (!this.shadowRoot || !this._cardConfig) return;
    this._teardownCards();
    const C = this.constructor;
    if (!C._staticStyleSheet)
      try {
        const sheet = new CSSStyleSheet();
        (sheet.replaceSync(CARD_CSS), (C._staticStyleSheet = sheet));
      } catch (err) {
        console.warn(`[${CARD_TAG}] 静态样式表加载失败，改用 <style> 注入:`, err);
      }
    this.shadowRoot.innerHTML = '<div id="standalone-root" style="width:100%;height:100%;"></div>';
    if (C._staticStyleSheet) this.shadowRoot.adoptedStyleSheets = [C._staticStyleSheet];
    else {
      const style = document.createElement("style");
      ((style.textContent = CARD_CSS), this.shadowRoot.prepend(style));
    }
    const root = this.shadowRoot.getElementById("standalone-root");
    (root.appendChild(this._renderStandaloneContent()), this._applyDynamicCssVariables(), this._applyColorScheme(root));
  }

  // DOM 结构与 room-elves-card 独立模式一致，comm 的样式依赖 .standalone-card-container 这一层
  _renderStandaloneContent() {
    const box = document.createElement("div");
    ((box.className = "standalone-card-container"),
      (box.style.cssText =
        "width: 100%; height: auto; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box;"));
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width: 100%; height: 100%; min-height: 50px;";
    try {
      const card = this._createCommElement(this._cardConfig);
      card && wrapper.appendChild(card);
    } catch (err) {
      (console.error(`[${CARD_TAG}] 创建卡片失败:`, err),
        (wrapper.innerHTML = `<div style="padding: 20px; text-align: center; color: #e74c3c;"><p><strong>创建卡片失败</strong></p><p style="font-size: 14px; margin: 10px 0;">${this._escapeHtml(err && err.message)}</p></div>`));
    }
    return (box.appendChild(wrapper), box);
  }

  // 对应 room-elves-card 的 createUniversalCard("comm", ...)
  _createCommElement(config) {
    const cfg = this.normalizeCardConfig("comm", config),
      options = { isPersonMain: !1, showHistory: !1, updateInterval: config.update_interval ?? 0 },
      el = this.createCommCard(cfg, options);
    return (
      el &&
      ((el.dataset.cardType = "comm"),
        (el.dataset.entityId = cfg.entity || ""),
        (el.dataset.updateInterval = options.updateInterval),
        (el._cardConfig = cfg),
        (el._cardOptions = options),
        cfg.height && (el.style.height = cfg.height),
        cfg.width && ((el.style.width = cfg.width), (el.style.minWidth = cfg.width), (el.style.maxWidth = cfg.width))),
      el
    );
  }

  // 关闭气泡、注销低频刷新、释放 ECharts 实例
  _teardownCards() {
    this.shadowRoot &&
      (this.shadowRoot.querySelectorAll(".comm-card").forEach((el) => this._commTeardown(el)),
        this.shadowRoot.querySelectorAll("*").forEach((el) => {
          const chart = el._echartsInstance;
          (chart && "function" == typeof chart.dispose && !chart.isDisposed() && chart.dispose(),
            (el._echartsInstance = null));
        }));
  }

  _applyColorScheme(root) {
    const scheme = se[this._currentTheme] || se.light;
    Object.keys(scheme).forEach((name) => root.style.setProperty(name, scheme[name]));
  }

  // 主题切换 (theme: time/phone/实体) 时直接重设配色变量，不必整卡重绘
  _applyThemeInternal(theme) {
    this._currentTheme = theme;
    const root = this.shadowRoot && this.shadowRoot.getElementById("standalone-root");
    root && this._applyColorScheme(root);
  }

  // 页面隐藏时低频任务暂停 (_tickDurations 读取 _isPageVisible)
  _setupVisibilityListener() {
    this._visibilityChangeHandler ||
      ((this._visibilityChangeHandler = () => {
        this._isPageVisible = !document.hidden;
      }),
        document.addEventListener("visibilitychange", this._visibilityChangeHandler),
        (this._isPageVisible = !document.hidden));
  }

  _removeVisibilityListener() {
    this._visibilityChangeHandler &&
      (document.removeEventListener("visibilitychange", this._visibilityChangeHandler),
        (this._visibilityChangeHandler = null));
  }

  // comm 的按钮/开关/时间设置都走这里: 等价于 room-elves-card 对普通 domain.service 的处理
  handleCallServiceAction(action) {
    if (!action || !action.service) return void console.warn("call-service 动作缺少 service 配置");
    const service = action.service,
      data = action.service_data || {},
      parts = service.split(".");
    if (2 !== parts.length) return void console.error(`无效的服务名称: ${service}，应为 domain.service 格式`);
    this.hass
      ? this.hass.callService(parts[0], parts[1], data).catch((err) => {
        console.error(`调用服务 ${service} 失败:`, err);
      })
      : console.error("无法调用服务: hass 对象未初始化");
  }
}

for (const mixin of [
  bt, // EChartsMixin
  Kt, // ScrollLockMixin
  ie, // StylesMixin
  le, // ThemeMixin
  be, // BubblePopupMixin
  xe, // PopupShowMixin
  _e, // TimerSetupMixin
  Te, // HtmlUtilsMixin
  Be, // ConfigMixin
  ja, // CommCardMixin
  fo, // PeriodPickerMixin
])
  Object.assign(PocketCarrierCard.prototype, mixin);

// 同一页面里脚本可能被加载两次 (如资源版本号变化)，已注册过就跳过，避免 define 抛错
customElements.get(CARD_TAG) || customElements.define(CARD_TAG, PocketCarrierCard);
window.customCards = window.customCards || [];
window.customCards.some((c) => c && (c.type === CARD_TAG || c.type === 'custom:' + CARD_TAG)) ||
  window.customCards.push({
    type: CARD_TAG,
    name: "掌上运营商",
    description: "话费、流量、语音余量与通话/短信/上网详单的通讯面板",
    preview: !1,
  });
console.info(
  `%c ${CARD_TAG} %c v${CARD_VERSION} `,
  "background: #2196F3; color: white; padding: 2px 4px; font-weight: bold;",
  "background: white; color: #2196F3; padding: 2px 4px; font-weight: bold;",
);


/**
 * PocketCarrierCardEditor —— 掌上运营商通讯卡片的可视化配置编辑器
 */
class PocketCarrierCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._expandedAdv = {}; // 记录展开状态
  }

  setConfig(config) {
    this._config = { ...config };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  get _title() {
    return this._config.name || '';
  }

  get _initialTab() {
    return this._config.initial_tab || 'account';
  }

  get _analysisEnabled() {
    const val = this._config.analysis;
    return val === true || val === 'true' || val === 1;
  }

  _discoveredPhones() {
    if (!this._hass || !this._hass.states) return [];
    const phones = new Map();
    for (const [eid, stateObj] of Object.entries(this._hass.states)) {
      const m = eid.match(/^sensor\.(\d{11})_overview$/);
      if (m) {
        const p = m[1];
        const friendlyName = (stateObj.attributes && stateObj.attributes.friendly_name) || '';
        const carrier = (stateObj.attributes && (stateObj.attributes['运营商'] || stateObj.attributes.carrier)) || '';
        const label = p + ' (' + (carrier || '运营商') + (friendlyName ? ' · ' + friendlyName : '') + ')';
        phones.set(p, { phone: p, label: label, carrier: carrier });
      }
    }
    return Array.from(phones.values());
  }

  _getAllEntities(domain) {
    if (!this._hass || !this._hass.states) return [];
    return Object.keys(this._hass.states).filter(eid => !domain || eid.startsWith(domain + '.'));
  }

  _getTelList() {
    const list = [];
    for (let i = 1; i <= 10; i++) {
      const key = 'tel_' + i;
      const nameKey = 'tel_' + i + '_name';
      if (this._config[key] !== undefined) {
        list.push({
          index: i,
          phone: String(this._config[key] || ''),
          name: String(this._config[nameKey] || ''),
          entity: String(this._config['tel_' + i + '_entity'] || ''),
          button: String(this._config['tel_' + i + '_button'] || ''),
          date: String(this._config['tel_' + i + '_date'] || ''),
          calls: String(this._config['tel_' + i + '_calls'] || ''),
          code: String(this._config['tel_' + i + '_code'] || ''),
          update_region: String(this._config['tel_' + i + '_update_region'] || '')
        });
      }
    }
    if (list.length === 0) {
      list.push({
        index: 1,
        phone: String(this._config.tel_1 || ''),
        name: String(this._config.tel_1_name || '我的'),
        entity: String(this._config.tel_1_entity || ''),
        button: String(this._config.tel_1_button || ''),
        date: String(this._config.tel_1_date || ''),
        calls: String(this._config.tel_1_calls || ''),
        code: String(this._config.tel_1_code || ''),
        update_region: String(this._config.tel_1_update_region || '')
      });
    }
    return list;
  }

  _telChanged(index, field, value) {
    const newConfig = { ...this._config };
    let key = '';
    if (field === 'phone') key = 'tel_' + index;
    else if (field === 'name') key = 'tel_' + index + '_name';
    else key = 'tel_' + index + '_' + field;

    const trimmed = String(value || '').trim();
    if (!trimmed) {
      delete newConfig[key];
    } else {
      newConfig[key] = trimmed;
    }
    this._config = newConfig;
    this._fireConfigChanged();
  }

  _addTel(prefillPhone) {
    const list = this._getTelList();
    const nextIndex = list.length > 0 ? Math.max(...list.map((t) => t.index)) + 1 : 1;
    const newConfig = { ...this._config };
    newConfig['tel_' + nextIndex] = prefillPhone || '';
    newConfig['tel_' + nextIndex + '_name'] = '卡片 ' + nextIndex;
    this._config = newConfig;
    this._fireConfigChanged();
    this.render();
  }

  _removeTel(index) {
    const newConfig = { ...this._config };
    const prefix = 'tel_' + index;
    Object.keys(newConfig).forEach(k => {
      if (k === prefix || k.startsWith(prefix + '_')) {
        delete newConfig[k];
      }
    });
    this._config = newConfig;
    this._fireConfigChanged();
    this.render();
  }

  _toggleAdv(index) {
    this._expandedAdv[index] = !this._expandedAdv[index];
    this.render();
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  render() {
    if (!this.shadowRoot) return;
    const discovered = this._discoveredPhones();
    const telList = this._getTelList();

    const discoveredOptions = discovered
      .map((d) => '<option value="' + d.phone + '">' + d.label + '</option>')
      .join('');

    // 所有 sensor, button, date 候选列表供 datalist 提示
    const sensorOptions = this._getAllEntities('sensor').map(e => '<option value="' + e + '"></option>').join('');
    const buttonOptions = this._getAllEntities('button').map(e => '<option value="' + e + '"></option>').join('');
    const dateOptions = this._getAllEntities('date').map(e => '<option value="' + e + '"></option>').join('');
    const textOptions = this._getAllEntities('text').map(e => '<option value="' + e + '"></option>').join('');

    const quickFillHtml = discovered.length > 0 ? (
      '<div class="quick-fill-box">' +
      '<span class="quick-fill-label">💡 快捷添加已扫描账号:</span>' +
      discovered.map(d => '<button type="button" class="btn-quick-fill" data-phone="' + d.phone + '">+ ' + d.phone + ' (' + (d.carrier || '账号') + ')</button>').join('') +
      '</div>'
    ) : '';

    const telRowsHtml = telList
      .map((t) => {
        const isAdvOpen = !!this._expandedAdv[t.index];
        const defaultOverview = t.phone ? ('sensor.' + t.phone + '_overview') : '';
        const defaultButton = t.phone ? ('button.' + t.phone + '_button') : '';
        const defaultDate = t.phone ? ('date.' + t.phone + '_date') : '';
        const defaultCalls = t.phone ? ('sensor.' + t.phone + '_calls') : '';

        return (
          '<div class="tel-card-item">' +
          '<div class="tel-card-header">' +
          '<span class="tel-card-badge">卡槽 ' + t.index + '</span>' +
          (telList.length > 1 ? ('<button type="button" class="btn-del" data-idx="' + t.index + '" title="删除此手机卡槽">✕ 删除</button>') : '') +
          '</div>' +
          '<div class="tel-fields">' +
          '<div class="field-col phone-col">' +
          '<label class="sub-label">手机号码 (tel_' + t.index + ')</label>' +
          '<input type="text" class="form-input" list="discovered-phones" placeholder="例如: 156xxxxxxxx" value="' + t.phone + '" data-idx="' + t.index + '" data-field="phone" />' +
          '</div>' +
          '<div class="field-col name-col">' +
          '<label class="sub-label">备注名称 (tel_' + t.index + '_name)</label>' +
          '<input type="text" class="form-input" placeholder="例如: 我的主卡 / 家庭副卡" value="' + t.name + '" data-idx="' + t.index + '" data-field="name" />' +
          '</div>' +
          '</div>' +
          '<div class="adv-toggle-bar">' +
          '<button type="button" class="btn-adv-toggle" data-idx="' + t.index + '">' +
          (isAdvOpen ? '▾ 收起高级实体映射' : '▸ 展开高级实体映射 (自定义指定 button/date/calls 等)') +
          '</button>' +
          '</div>' +
          (isAdvOpen ? (
            '<div class="adv-fields-box">' +
            '<div class="adv-tip">💡 提示：留空时系统将按号码自动推导标准实体；如您重命名了实体 ID 或接入自定义传感器，可在此手动指定：</div>' +
            '<div class="adv-grid">' +
            '<div class="adv-item">' +
            '<label class="adv-label">数据概览实体 (overview)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-sensors" placeholder="' + (defaultOverview || 'sensor.xxx_overview') + '" value="' + t.entity + '" data-idx="' + t.index + '" data-field="entity" />' +
            '</div>' +
            '<div class="adv-item">' +
            '<label class="adv-label">刷新/认证按钮 (button)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-buttons" placeholder="' + (defaultButton || 'button.xxx_button') + '" value="' + t.button + '" data-idx="' + t.index + '" data-field="button" />' +
            '</div>' +
            '<div class="adv-item">' +
            '<label class="adv-label">查询起始日期 (date)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-dates" placeholder="' + (defaultDate || 'date.xxx_date') + '" value="' + t.date + '" data-idx="' + t.index + '" data-field="date" />' +
            '</div>' +
            '<div class="adv-item">' +
            '<label class="adv-label">通话记录流水 (calls)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-sensors" placeholder="' + (defaultCalls || 'sensor.xxx_calls') + '" value="' + t.calls + '" data-idx="' + t.index + '" data-field="calls" />' +
            '</div>' +
            '<div class="adv-item">' +
            '<label class="adv-label">短信验证码实体 (code · 仅电信)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-texts" placeholder="text.xxx_code (选填)" value="' + t.code + '" data-idx="' + t.index + '" data-field="code" />' +
            '</div>' +
            '<div class="adv-item">' +
            '<label class="adv-label">归属地更新按钮 (update_region)</label>' +
            '<input type="text" class="form-input adv-input" list="dl-buttons" placeholder="button.xxx_update_region (选填)" value="' + t.update_region + '" data-idx="' + t.index + '" data-field="update_region" />' +
            '</div>' +
            '</div>' +
            '</div>'
          ) : '') +
          '</div>'
        );
      })
      .join('');

    this.shadowRoot.innerHTML =
      '<style>' +
      ':host { display: block; font-family: inherit; font-size: 14px; color: var(--primary-text-color, #212121); padding: 8px 0; }' +
      '.editor-container { display: flex; flex-direction: column; gap: 16px; }' +
      '.form-group { display: flex; flex-direction: column; gap: 6px; }' +
      '.form-label { font-weight: 600; font-size: 13px; color: var(--primary-text-color, #212121); display: flex; align-items: center; justify-content: space-between; }' +
      '.sub-label { font-size: 12px; color: var(--secondary-text-color, #727272); font-weight: 500; }' +
      '.form-input, select.form-input { padding: 9px 12px; border-radius: 8px; border: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #ffffff); color: var(--primary-text-color, #212121); font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s; width: 100%; }' +
      '.form-input:focus { border-color: var(--primary-color, #2196f3); }' +
      '.quick-fill-box { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; background: #eff6ff; border: 1px dashed #93c5fd; border-radius: 8px; }' +
      '.quick-fill-label { font-size: 12px; color: #1e40af; font-weight: 500; }' +
      '.btn-quick-fill { background: #ffffff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; }' +
      '.btn-quick-fill:hover { background: #dbeafe; border-color: #60a5fa; }' +
      '.tel-card-box { border: 1px solid var(--divider-color, #e5e7eb); border-radius: 10px; padding: 12px; background: var(--secondary-background-color, #f9fafb); display: flex; flex-direction: column; gap: 12px; }' +
      '.tel-card-item { border: 1px solid var(--divider-color, #e5e7eb); border-radius: 8px; padding: 12px; background: var(--card-background-color, #ffffff); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }' +
      '.tel-card-header { display: flex; align-items: center; justify-content: space-between; }' +
      '.tel-card-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #e0f2fe; color: #0369a1; }' +
      '.tel-fields { display: flex; gap: 10px; }' +
      '.field-col { display: flex; flex-direction: column; gap: 4px; }' +
      '.phone-col { flex: 1.3; }' +
      '.name-col { flex: 1; }' +
      '.adv-toggle-bar { display: flex; }' +
      '.btn-adv-toggle { background: transparent; border: none; color: var(--primary-color, #2196f3); font-size: 12px; font-weight: 500; cursor: pointer; padding: 2px 0; text-align: left; }' +
      '.btn-adv-toggle:hover { text-decoration: underline; }' +
      '.adv-fields-box { background: var(--secondary-background-color, #f8fafc); border: 1px dashed var(--divider-color, #cbd5e1); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }' +
      '.adv-tip { font-size: 11px; color: var(--secondary-text-color, #64748b); line-height: 1.4; }' +
      '.adv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }' +
      '.adv-item { display: flex; flex-direction: column; gap: 3px; }' +
      '.adv-label { font-size: 11px; color: var(--secondary-text-color, #64748b); }' +
      '.adv-input { font-size: 12px; padding: 6px 8px; border-radius: 6px; }' +
      '.btn-del { background: transparent; border: 1px solid #fecaca; color: #ef4444; font-size: 12px; cursor: pointer; padding: 3px 8px; border-radius: 6px; }' +
      '.btn-del:hover { background: #fee2e2; }' +
      '.btn-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--primary-color, #2196f3); color: #ffffff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }' +
      '.btn-add:hover { opacity: 0.9; }' +
      '.switch-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--divider-color, #e5e7eb); border-radius: 8px; background: var(--card-background-color, #ffffff); }' +
      '.switch-info { display: flex; flex-direction: column; gap: 2px; }' +
      '.switch-title { font-size: 13px; font-weight: 500; color: var(--primary-text-color, #212121); }' +
      '.switch-desc { font-size: 12px; color: var(--secondary-text-color, #6b7280); }' +
      '.helper-text { font-size: 12px; color: var(--secondary-text-color, #9ca3af); margin-top: 2px; }' +
      '</style>' +
      '<datalist id="discovered-phones">' + discoveredOptions + '</datalist>' +
      '<datalist id="dl-sensors">' + sensorOptions + '</datalist>' +
      '<datalist id="dl-buttons">' + buttonOptions + '</datalist>' +
      '<datalist id="dl-dates">' + dateOptions + '</datalist>' +
      '<datalist id="dl-texts">' + textOptions + '</datalist>' +
      '<div class="editor-container">' +
      '<div class="form-group">' +
      '<label class="form-label">卡片标题 (name)</label>' +
      '<input type="text" class="form-input" value="' + this._title + '" placeholder="例如: 我的通讯 / 家庭话费" data-target="name" />' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label">默认打开面板 (initial_tab)</label>' +
      '<select class="form-input" data-target="initial_tab">' +
      '<option value="account"' + (this._initialTab === 'account' ? ' selected' : '') + '>📱 账户总览 (话费与流量余量)</option>' +
      '<option value="records"' + (this._initialTab === 'records' ? ' selected' : '') + '>📋 通讯记录 (通话/短信/上网明细)</option>' +
      '<option value="analysis"' + (this._initialTab === 'analysis' ? ' selected' : '') + '>📊 统计分析 (需开启下方分析面板)</option>' +
      '</select>' +
      '</div>' +
      '<div class="switch-row">' +
      '<div class="switch-info">' +
      '<span class="switch-title">开启数据分析看板 (analysis)</span>' +
      '<span class="switch-desc">启用后可在卡片底部左右滑动进入深度通话与流量趋势看板</span>' +
      '</div>' +
      '<input type="checkbox" id="chk-analysis"' + (this._analysisEnabled ? ' checked' : '') + ' style="width: 18px; height: 18px; cursor: pointer;" />' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label"><span>手机卡号与运营商账号列表</span>' +
      (discovered.length > 0 ? ('<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #dbeafe; color: #1e40af; font-weight: normal;">已扫描到 ' + discovered.length + ' 个账号</span>') : '') +
      '</label>' +
      quickFillHtml +
      '<div class="tel-card-box">' +
      telRowsHtml +
      '<button type="button" class="btn-add" id="btn-add-tel"><span>+ 添加更多手机号</span></button>' +
      '</div>' +
      '<div class="helper-text">💡 提示：在每个卡槽中点击「展开高级实体映射」，可为该手机号自定义指定特定的 sensor / button / date 等实体；若留空则自动按标准规则绑定。</div>' +
      '</div>' +
      '</div>';

    // 绑定事件
    const titleInput = this.shadowRoot.querySelector('input[data-target="name"]');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const newCfg = { ...this._config };
        if (val) newCfg.name = val;
        else delete newCfg.name;
        this._config = newCfg;
        this._fireConfigChanged();
      });
    }

    const tabSelect = this.shadowRoot.querySelector('select[data-target="initial_tab"]');
    if (tabSelect) {
      tabSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const newCfg = { ...this._config, initial_tab: val };
        this._config = newCfg;
        this._fireConfigChanged();
      });
    }

    const chkAnalysis = this.shadowRoot.querySelector('#chk-analysis');
    if (chkAnalysis) {
      chkAnalysis.addEventListener('change', (e) => {
        const newCfg = { ...this._config };
        if (e.target.checked) newCfg.analysis = true;
        else delete newCfg.analysis;
        this._config = newCfg;
        this._fireConfigChanged();
      });
    }

    this.shadowRoot.querySelectorAll('.btn-quick-fill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const phone = e.currentTarget.dataset.phone;
        // 如果第一个卡槽是空的，填入第一个卡槽，否则追加新卡槽
        const list = this._getTelList();
        if (list.length === 1 && !list[0].phone) {
          this._telChanged(1, 'phone', phone);
          this.render();
        } else {
          this._addTel(phone);
        }
      });
    });

    const addBtn = this.shadowRoot.querySelector('#btn-add-tel');
    if (addBtn) {
      addBtn.addEventListener('click', () => this._addTel());
    }

    this.shadowRoot.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        this._removeTel(idx);
      });
    });

    this.shadowRoot.querySelectorAll('.btn-adv-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        this._toggleAdv(idx);
      });
    });

    this.shadowRoot.querySelectorAll('.tel-card-item input[data-field]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        const field = e.target.dataset.field;
        this._telChanged(idx, field, e.target.value);
      });
    });
  }
}

customElements.define('pocket-carrier-card-editor', PocketCarrierCardEditor);
