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
      } catch (t) {}
      const i = e.call(t, a, n, o);
      try {
        a._echartsInstance = i;
        const t = i.dispose;
        "function" == typeof t &&
          (i.dispose = function () {
            try {
              a._echartsInstance === i && (a._echartsInstance = null);
            } catch (t) {}
            return t.apply(this, arguments);
          });
      } catch (t) {}
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
    } catch (t) {}
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
    } catch (t) {}
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
        } catch (t) {}
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
    } catch (t) {}
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
    const t = this,
      e = this.constructor;
    if (e._globalForceLockScroll) {
      t._scrollLocked ||
        ((t._savedScrollY = window.scrollY || window.pageYOffset || 0),
        (t._savedScrollX = window.scrollX || window.pageXOffset || 0));
      const a = document.body,
        n = document.documentElement;
      return (
        (a.style.overscrollBehavior = "contain"),
        (n.style.overscrollBehavior = "contain"),
        (a.style.overflow = "hidden"),
        (a.style.position = "fixed"),
        (a.style.top = `-${t._savedScrollY}px`),
        (a.style.left = `-${t._savedScrollX}px`),
        (a.style.width = "100%"),
        (a.style.height = "auto"),
        (n.style.overflow = "hidden"),
        (t._popupScrollElements = []),
        t._timers.setTimeout(() => {
          t._scrollLocked &&
            t.shadowRoot &&
            [
              ".popup-content",
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
              ".generic-arrow-bubble",
              ".timeline-content",
            ].forEach((e) => {
              t.shadowRoot.querySelectorAll(e).forEach((e) => {
                if (!e || t._popupScrollElements.some((t) => t.el === e)) return;
                e.style.overscrollBehavior = "contain";
                const a = new MutationObserver(() => {
                  e.__scrollGuardPending ||
                    ((e.__scrollGuardPending = !0),
                    t._timers.setTimeout(() => {
                      ((e.__scrollGuardPending = !1),
                        e.isConnected &&
                          e.querySelectorAll("*").forEach((t) => {
                            const e = window.getComputedStyle(t);
                            ("auto" !== e.overflowY &&
                              "scroll" !== e.overflowY &&
                              "auto" !== e.overflow &&
                              "scroll" !== e.overflow) ||
                              "contain" === t.style.overscrollBehavior ||
                              (t.style.overscrollBehavior = "contain");
                          }));
                    }, 0));
                });
                (a.observe(e, { childList: !0, subtree: !0 }), t._popupScrollElements.push({ el: e, observer: a }));
              });
            });
        }, 100),
        t._timers.setTimeout(() => {
          if (!t._scrollLocked || !t.shadowRoot) return;
          const e = t.shadowRoot.querySelectorAll(".popup-overlay");
          e.length > 0 &&
            ((t._overlayTouchMoveHandler = (t) => {
              t.preventDefault();
            }),
            e.forEach((e) => {
              e.addEventListener("touchmove", t._overlayTouchMoveHandler, { passive: !1 });
            }));
        }, 0),
        (t._scrollLocked = !0),
        void (
          t._bodyStyleObserver ||
          ((t._bodyStyleObserver = new MutationObserver((a) => {
            a.forEach((a) => {
              if ("style" === a.attributeName) {
                const a = document.body.style.overflow,
                  n = document.body.style.position;
                ("hidden" === a && "fixed" === n) ||
                  t._timers.setTimeout(() => {
                    e._globalForceLockScroll && !t._scrollLocked && t._lockBodyScroll();
                  }, 0);
              }
            });
          })),
          t._bodyStyleObserver.observe(document.body, { attributes: !0, attributeFilter: ["style"] }))
        )
      );
    }
    if (
      !t._scrollLocked &&
      ((t._scrollLocked = !0),
      e._globalPopupLockCount++,
      (t._popupScrollElements = []),
      t._timers.setTimeout(() => {
        t._scrollLocked &&
          t.shadowRoot &&
          [
            ".popup-content",
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
            ".generic-arrow-bubble",
            ".timeline-content",
            ".uc-hour-date-pop-content",
            ".uc-habit-content",
          ].forEach((e) => {
            t.shadowRoot.querySelectorAll(e).forEach((e) => {
              if (!e || t._popupScrollElements.some((t) => t.el === e)) return;
              e.style.overscrollBehavior = "contain";
              const a = new MutationObserver(() => {
                e.querySelectorAll("*").forEach((t) => {
                  const e = window.getComputedStyle(t);
                  ("auto" !== e.overflowY &&
                    "scroll" !== e.overflowY &&
                    "auto" !== e.overflow &&
                    "scroll" !== e.overflow) ||
                    "contain" === t.style.overscrollBehavior ||
                    (t.style.overscrollBehavior = "contain");
                });
              });
              (a.observe(e, { childList: !0, subtree: !0 }), t._popupScrollElements.push({ el: e, observer: a }));
            });
          });
      }, 100),
      t._timers.setTimeout(() => {
        if (!t._scrollLocked || !t.shadowRoot) return;
        const e = t.shadowRoot.querySelectorAll(".popup-overlay");
        e.length > 0 &&
          ((t._overlayTouchMoveHandler = (t) => {
            t.preventDefault();
          }),
          e.forEach((e) => {
            e.addEventListener("touchmove", t._overlayTouchMoveHandler, { passive: !1 });
          }));
      }, 0),
      1 === e._globalPopupLockCount)
    ) {
      ((e._globalSavedScrollY = window.scrollY || window.pageYOffset || 0),
        (e._globalSavedScrollX = window.scrollX || window.pageXOffset || 0));
      const t = document.body,
        a = document.documentElement;
      ((t.style.overscrollBehavior = "contain"),
        (a.style.overscrollBehavior = "contain"),
        (t.style.overflow = "hidden"),
        (t.style.position = "fixed"),
        (t.style.top = `-${e._globalSavedScrollY}px`),
        (t.style.left = `-${e._globalSavedScrollX}px`),
        (t.style.width = "100%"),
        (t.style.height = "auto"),
        (a.style.overflow = "hidden"));
    }
  },
  _unlockBodyScroll() {
    const t = this,
      e = this.constructor;
    if (!e._globalForceLockScroll && t._scrollLocked) {
      if (
        ((t._scrollLocked = !1),
        (e._globalPopupLockCount = Math.max(0, e._globalPopupLockCount - 1)),
        t._popupScrollElements &&
          (t._popupScrollElements.forEach((t) => {
            (t.el && t.el.style && (t.el.style.overscrollBehavior = ""), t.observer && t.observer.disconnect());
          }),
          (t._popupScrollElements = null)),
        t._overlayTouchMoveHandler &&
          (t.shadowRoot &&
            t.shadowRoot.querySelectorAll(".popup-overlay").forEach((e) => {
              e.removeEventListener("touchmove", t._overlayTouchMoveHandler);
            }),
          (t._overlayTouchMoveHandler = null)),
        0 === e._globalPopupLockCount)
      ) {
        const t = document.body,
          a = document.documentElement;
        ((t.style.overscrollBehavior = ""),
          (a.style.overscrollBehavior = ""),
          (t.style.overflow = ""),
          (t.style.position = ""),
          (t.style.top = ""),
          (t.style.left = ""),
          (t.style.width = ""),
          (t.style.height = ""),
          (a.style.overflow = ""),
          window.scrollTo(e._globalSavedScrollX || 0, e._globalSavedScrollY || 0));
      }
      ((t._savedScrollY = 0), (t._savedScrollX = 0));
    }
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
      } catch (t) {}
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
            } catch (t) {}
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
        } catch (t) {}
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
      } catch (t) {}
      try {
        this._timers.clearTimeout(this._lowFreqIdleHandle);
      } catch (t) {}
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

const Ba = [
  "详单授权状态",
  "授权剩余有效时长",
  "自动提交等待中",
  "最近下发验证码时间",
  "验证码填写时间",
  "验证码状态",
  "最近执行时间",
  "最近执行结果",
];

// CommCardMixin
const ja = {
  _commFieldAliases: {
    account_status: ["账户状态", "帐号状态", "账号状态"],
    balance: ["话费余额", "可用余额", "余额"],
    charge: ["本月消费", "本月出账", "本月费用"],
    fee_deposit: ["本月存入话费", "存入话费"],
    fee_rollover: ["上月结转话费", "结转话费"],
    flow_remain: ["剩余通用流量", "剩余流量"],
    flow_used: ["已用流量", "流量已用", "通用流量已用"],
    flow_directional: ["定向流量"],
    voice_remain: ["共享通话剩余", "剩余通话", "剩余语音"],
    voice_used: ["共享通话已用", "已用通话", "已用语音"],
    sms_remain: ["剩余短信", "短信剩余"],
    integral: ["电信积分", "会员积分", "积分", "会员等级"],
    star_level: ["用户星级", "星级"],
    member_level: ["会员等级"],
    real_name: ["机主姓名", "机主"],
    phone_number: ["手机号码", "手机号"],
    cust_name: ["单位户号", "户名"],
    speed_service: ["套餐服务", "套餐"],
    broadband: ["宽带速率"],
    broadband_count: ["名下宽带"],
    location: ["号码归属地", "归属地"],
    last_update: ["数据最近更新", "最近更新", "刷新时间"],
    call_record: ["通话记录", "通话详单"],
    sms_record: ["短信记录"],
    traffic_record: ["上网记录"],
  },
  _commMemberPalette: ["#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#00b4d8", "#e91e63", "#795548", "#607d8b"],
  _commRemainColor: "rgba(128, 128, 128, 0.28)",
  createCommCard(t, e = {}) {
    const a = t || {},
      n = this._commBuildRoot(a);
    return ((n._commOptions = e), this._startCommRefresh(n, a), n);
  },
  updateCommCard(t, e) {
    if (!t || "comm" !== t.dataset.cardType) return;
    const a = e || t._commConfig || {};
    t._commConfig = a;
    const n = this._commLoadAll(a);
    (n.signature && n.signature === t._commSignature) ||
      ((t._commSignature = n.signature),
      n.dataSignature && n.dataSignature === t._commDataSignature
        ? this._commRefreshAuthSurfaces(t, a, n)
        : ((t._commDataSignature = n.dataSignature), this._commRebuildPanels(t, a, n)));
  },
  _commRefreshAuthSurfaces(t, e, a) {
    if (!t) return;
    const n = this._commActiveContext(t, e, a),
      o = this._commAuthConfig(n),
      i = t.querySelector(".comm-tag-auth");
    if (i && o) {
      const isUnicom = /联通|unicom/i.test((n && n.data && n.data.carrier) || "");
      const t = this._commAuthStatus(o.button, n.data),
        e = i.querySelector(".comm-tag-text");
      if (isUnicom) {
        e && (e.textContent = "详单设置");
        i.classList.add("ok");
        i.classList.remove("danger");
        i.title = "详单与自动化设置";
      } else {
        (e && t.text && (e.textContent = t.text),
          i.classList.toggle("ok", "ok" === t.tone),
          i.classList.toggle("danger", "danger" === t.tone),
          (i.title = "详单认证：验证码 / 起始日期 / 二次认证" + (t.raw ? `（${t.raw}）` : "")));
      }
    }
    ["_commAuthBubble", "_commSimBubble", "_commPkgBubble", "_commFeeBubble"].forEach((e) => {
      const a = t[e];
      a && (a.bubble && a.bubble.isConnected ? a.render(n) : (t[e] = null));
    });
  },
  _commTelEntities(t) {
    const e = String(t || "");
    return {
      overview: `sensor.${e}_overview`,
      button: `button.${e}_button`,
      code: `text.${e}_code`,
      date: `date.${e}_date`,
      update_region: `button.${e}_update_region`,
      daily_reset: `switch.${e}_daily_reset`,
      auto_login: `switch.${e}_auto_login`,
      auto_region_update: `switch.${e}_auto_region_update`,
      auto_query: `switch.${e}_auto_query`,
      auto_query_time: `time.${e}_auto_query_time`,
    };
  },
  _commExpandTelConfig(t) {
    const e = t || {};
    return Object.keys(e)
      .filter((t) => /^tel(_\d+)?$/i.test(t))
      .sort((t, e) => Number((t.match(/\d+/) || [0])[0]) - Number((e.match(/\d+/) || [0])[0]))
      .map((t) => {
        const a = String(void 0 === e[t] || null === e[t] ? "" : e[t]).replace(/\D/g, "");
        if (!a) return null;
        const n = this._commTelEntities(a),
          o = Object.keys(e).find((e) => e.toLowerCase() === `${t}_name`.toLowerCase()),
          i = o ? String(e[o] || "").trim() : "";
        return {
          entity: n.overview,
          name: i || null,
          button: n.button,
          code: n.code,
          date: n.date,
          update_region: n.update_region,
          daily_reset: n.daily_reset,
          auto_login: n.auto_login,
          auto_region_update: n.auto_region_update,
          auto_query: n.auto_query,
          auto_query_time: n.auto_query_time,
        };
      })
      .filter(Boolean);
  },
  _commLoadAll(t) {
    const e = t || {},
      a = [],
      n = (t) => {
        let e = null,
          n = null,
          o = null;
        ("string" == typeof t
          ? (e = t)
          : t &&
            "object" == typeof t &&
            ((e = t.entity || t.entity_id || null),
            (n = t.name || null),
            (o = {
              button: t.button || "",
              code: t.code || "",
              date: t.date || "",
              update_region: t.update_region || "",
              daily_reset: t.daily_reset || "",
              auto_login: t.auto_login || "",
              auto_region_update: t.auto_region_update || "",
              auto_query: t.auto_query || "",
              auto_query_time: t.auto_query_time || "",
            })),
          e && (a.some((t) => t.entityId === e) || a.push({ entityId: e, name: n, auth: o })));
      };
    (n(e.entity), Array.isArray(e.entities) && e.entities.forEach(n), this._commExpandTelConfig(e).forEach(n));
    const o = new Map();
    a.forEach((t) => o.set(t.entityId, this._commParseOverview(t.entityId)));
    const i = a.map((t) => {
        const a = o.get(t.entityId) || {},
          n = a.phone || "",
          i = n.length >= 4 ? n.slice(-4) : "",
          r = this._commAccountView(a, e) || {};
        return {
          entityId: t.entityId,
          name: t.name || "",
          carrier: a.carrier || "",
          phone: n,
          ok: !!a.ok,
          balance: r.balance ? r.balance.value : null,
          owed: !!r.owed,
          label: t.name || a.carrier || "号码",
          tail: i ? `****${i}` : "",
          auth: t.auth || null,
        };
      }),
      r = [],
      s = (t) => {
        t &&
          [
            "button",
            "code",
            "date",
            "update_region",
            "daily_reset",
            "auto_login",
            "auto_region_update",
            "auto_query",
            "auto_query_time",
          ].forEach((e) => {
            const a = t[e];
            a && -1 === r.indexOf(a) && r.push(a);
          });
      };
    (s(e), a.forEach((t) => s(t.auth)));
    const c = a.map((t) => `${t.entityId}#${this._commDataFingerprint(o.get(t.entityId))}`).join("|"),
      l = `${c}||${r
        .map((t) => {
          const e = this.hass && this.hass.states ? this.hass.states[t] : null;
          return `${t}@${e ? e.last_updated || e.last_changed || "" : "none"}`;
        })
        .join("|")}`;
    return { accounts: i, dataMap: o, signature: l, dataSignature: c };
  },
  _commDataFingerprint(t) {
    if (!t || !t.ok) return "none";
    const e = [String(t.phone || ""), String(t.carrier || "")],
      a = t.nodes || {};
    return (
      Object.keys(a).forEach((t) => {
        const n = a[t] || {};
        (e.push(`<${t}>`),
          Object.keys(n).forEach((t) => {
            if (-1 !== Ba.indexOf(t)) return;
            const a = n[t];
            if (Array.isArray(a)) {
              const n = a[0] && a[0].call_time ? a[0].call_time : "",
                o = a.length && a[a.length - 1] && a[a.length - 1].call_time ? a[a.length - 1].call_time : "";
              e.push(`${t}=[${a.length}]${n}~${o}`);
            } else e.push(`${t}=${String(a)}`);
          }));
      }),
      e.join(";")
    );
  },
  _commParseOverview(t) {
    const e = this.hass && this.hass.states ? this.hass.states[t] : null;
    if (!e)
      return {
        entityId: t,
        ok: !1,
        reason: `实体不存在或未加载：${t}`,
        nodes: {},
        carrier: "",
        phone: "",
        lastUpdated: "",
      };
    const a = e.attributes || {},
      n = {};
    if (
      (Object.keys(a).forEach((t) => {
        const e = a[t];
        e && "object" == typeof e && !Array.isArray(e) && e.entity_id && (n[t] = e);
      }),
      !Object.keys(n).length)
    )
      return {
        entityId: t,
        ok: !1,
        reason: `该实体不是「数据总览」实体（未发现节点属性）：${t}`,
        nodes: {},
        carrier: "",
        phone: "",
        lastUpdated: "",
      };
    const o = this._commFieldNode(n, "phone_number", null),
      i = this._commPropAny(n, "运营商") || "",
      r = o && o.state ? String(o.state) : this._commPropAny(n, "手机号码") || "";
    return {
      entityId: t,
      ok: !0,
      reason: "",
      nodes: n,
      carrier: i,
      phone: /^\d{6,}$/.test(r) ? r : "",
      lastUpdated: e.last_updated || e.last_changed || "",
    };
  },
  _commFieldNode(t, e, a) {
    if (!t) return null;
    const n = [],
      o = a && a[e];
    o && n.push(String(o));
    const i = this._commFieldAliases[e];
    if ((i && n.push(...i), !n.length)) return null;
    const r = Object.keys(t).map((e) => ({ name: e, base: this._commStripSeq(e), node: t[e] }));
    for (const t of n) {
      const e = r.find((e) => e.base === t);
      if (e) return e.node;
    }
    const s = [...n].sort((t, e) => e.length - t.length);
    for (const t of s) {
      const e = r.find((e) => e.base.includes(t));
      if (e) return e.node;
    }
    return null;
  },
  _commStripSeq: (t) =>
    String(t || "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim(),
  _commProp(t, e) {
    if (!t || !e || !e.length) return;
    for (const a of e) if (void 0 !== t[a] && null !== t[a] && "" !== t[a]) return t[a];
    const a = Object.keys(t);
    for (const n of a)
      if ("entity_id" !== n && "icon" !== n && "unit" !== n && "单位" !== n && e.some((t) => n.includes(t))) {
        const e = t[n];
        if (null != e && "" !== e) return e;
      }
  },
  _commPropAny(t, e) {
    const a = Object.values(t || {});
    for (const t of a) {
      if (!t || "object" != typeof t) continue;
      const a = t[e];
      if (null != a && "" !== a) return a;
    }
    return "";
  },
  _commNum(t) {
    if (null == t) return null;
    if ("number" == typeof t) return isFinite(t) ? t : null;
    const e = String(t)
      .replace(/,/g, "")
      .match(/-?\d+(\.\d+)?/);
    return e ? parseFloat(e[0]) : null;
  },
  _commFmtNum(t, e = 2) {
    if (null == t || "" === t || !isFinite(Number(t))) return "";
    const a = Number(t),
      n = Math.abs(a);
    return String(n > 0 && n < 0.01 ? a : Number(a.toFixed(e)));
  },
  _commRingNum(t) {
    const e = this._commNum(t);
    if (null === e) return "";
    const a = Math.round(e);
    return 0 === a && e > 0 ? "<1" : String(a);
  },
  _commMoney(t) {
    const e = this._commFmtNum(t);
    return "" === e ? "" : `${e} 元`;
  },
  _commUnitOf: (t) => (t ? String(t["单位"] || t.unit || t.unit_of_measurement || "").trim() : ""),
  _commParsePack(t) {
    const e = String(t || "");
    if (!e) return null;
    const a = (t) => {
        const a = e.match(new RegExp(t + "\\s*([\\d.]+)\\s*([A-Za-z\\u4e00-\\u9fa5]{1,4})?"));
        return a ? { value: parseFloat(a[1]), unit: a[2] || "" } : null;
      },
      n = a("剩余"),
      o = a("已用"),
      i = a("共");
    return n || o || i
      ? {
          remain: n ? n.value : null,
          used: o ? o.value : null,
          total: i ? i.value : null,
          unit: (i && i.unit) || (n && n.unit) || (o && o.unit) || "",
        }
      : null;
  },
  _commMembersFromNode(t) {
    if (!t) return [];
    const e = [];
    return (
      Object.keys(t).forEach((a) => {
        const n = a.match(/^(本机|主卡|副卡)\s*\((.+?)\)$/);
        if (!n) return;
        const o = this._commNum(t[a]);
        null !== o && e.push({ name: `${n[1]} ${n[2]}`, value: o });
      }),
      e
    );
  },
  _commPacksFromNode(t) {
    if (!t) return [];
    const e = [];
    return (
      Object.keys(t).forEach((a) => {
        if (!/^(流量包|语音包)\s*\d+$/.test(a)) return;
        const n = this._commParsePack(t[a]);
        if (!n) return;
        const o = n.unit || "";
        e.push({
          label: a,
          text: `剩余 ${this._commFmtNum(n.remain) || "—"} ${o} / 共 ${this._commFmtNum(n.total) || "—"} ${o}`,
          percent: n.total ? ((n.used || 0) / n.total) * 100 : 0,
        });
      }),
      e
    );
  },
  _commBuildRoot(t) {
    const e = t || {},
      a = document.createElement("div");
    ((a.className = "comm-card"),
      (a.dataset.cardType = "comm"),
      (a._commConfig = e),
      (a._commActiveTab = "records" === e.initial_tab ? "records" : "account"),
      (a._commPhoneRevealed = !1),
      (a._commPhoneMasked = !0),
      (a._commAuthDraft = {}),
      (a._commCallFilter = null),
      (a._commCallSort = null),
      (a._commPlaceScope = "location"),
      (a._commDetailView = "list"),
      (a._commRecordTab = "call"),
      (a._commMapView = null),
      (a._commDailyHover = 0),
      (a._durationCardRef = this));
    const n = this._commLoadAll(e);
    ((a._commSignature = n.signature),
      (a._commDataSignature = n.dataSignature),
      (a._commActiveEntity = this._commPickActive(a, n.accounts)),
      a.appendChild(this._commBuildHeader(e, n.accounts, a)));
    const o = document.createElement("div");
    return (
      (o.className = "comm-panels"),
      a.appendChild(o),
      this._commFillPanels(o, a, e, n),
      a.appendChild(this._commBuildDots(a._commActiveTab)),
      this._commBindSwipe(o, a),
      this._commMountRings(a),
      a
    );
  },
  _commPickActive(t, e) {
    const a = t && t._commActiveEntity;
    return a && e.some((t) => t.entityId === a) ? a : e.length ? e[0].entityId : null;
  },
  _commBuildHeader(t, e, a) {
    const n = document.createElement("div");
    n.className = "comm-header";
    const o = String((t && t.name) || "").trim();
    if (o) {
      const t = document.createElement("div");
      t.className = "comm-title-wrap";
      const e = document.createElement("div");
      ((e.className = "comm-title"), (e.textContent = o), t.appendChild(e), n.appendChild(t));
    }
    return (
      (e.length > 1 || e.some((t) => t && t.name)) &&
        n.appendChild(this._commBuildAccountTabs(e, a._commActiveEntity, a)),
      n
    );
  },
  _commBuildAccountTabs(t, e, a) {
    const n = document.createElement("div");
    n.className = "comm-accounts";
    const o = Math.max(
      0,
      t.findIndex((t) => t.entityId === e),
    );
    (n.style.setProperty("--comm-acc-count", String(t.length)),
      n.style.setProperty("--comm-acc-index", String(o)),
      t.forEach((t) => {
        const o = document.createElement("button");
        ((o.type = "button"),
          (o.className = "comm-account-tab" + (t.entityId === e ? " active" : "")),
          t.ok || o.classList.add("offline"),
          (o.dataset.entity = t.entityId));
        const i = document.createElement("span");
        ((i.className = "comm-account-balance"),
          (i.textContent = null === t.balance || void 0 === t.balance ? "—" : `¥${Number(t.balance).toFixed(2)}`),
          o.appendChild(i));
        const r = document.createElement("span");
        ((r.className = "comm-account-name"),
          (r.textContent = t.name || t.carrier || t.tail || ""),
          o.appendChild(r),
          t.owed && o.classList.add("owed"),
          (o.title = [t.name, t.carrier, this._commPhoneText(t.phone, a)].filter(Boolean).join(" · ")),
          o.addEventListener("click", (t) => {
            (t.stopPropagation(), this._switchCommAccount(o));
          }),
          n.appendChild(o));
      }));
    const i = document.createElement("span");
    return ((i.className = "comm-account-slider"), n.appendChild(i), n);
  },
  _commApplyTab(t, e) {
    t &&
      e &&
      ((t._commActiveTab = e),
      t.querySelectorAll(".comm-panel").forEach((t) => {
        t.classList.toggle("active", t.dataset.panel === e);
      }),
      t.querySelectorAll(".comm-dot").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === e);
      }));
  },
  _commLayoutPages(t, e, a, n) {
    if (!t) return;
    const o = this._commTabOrder(),
      i = Math.max(0, o.indexOf(e)),
      r = t.querySelector(".comm-panels");
    (r && r.classList.add("comm-swiping"),
      t.querySelectorAll(".comm-panel").forEach((t) => {
        const e = o.indexOf(t.dataset.panel);
        e < 0 ||
          (n ? t.style.removeProperty("transition") : (t.style.transition = "none"),
          (t.style.transform = `translateX(calc(${100 * (e - i)}% + ${a || 0}px))`));
      }),
      n &&
        (t._commSwipeTimer && this._timers.clearTimeout(t._commSwipeTimer),
        (t._commSwipeTimer = this._timers.setTimeout(() => {
          ((t._commSwipeTimer = null),
            t.isConnected &&
              (this._commApplyTab(t, e),
              t.querySelectorAll(".comm-panel").forEach((t) => {
                (t.style.removeProperty("transform"), t.style.removeProperty("transition"));
              }),
              r && r.classList.remove("comm-swiping")));
        }, 340))));
  },
  _commSwitchTo(t, e) {
    if (!t || !e) return;
    t._commSwipeTimer && (this._timers.clearTimeout(t._commSwipeTimer), (t._commSwipeTimer = null));
    const a = t.querySelector(".comm-panels");
    a && a.classList.contains("comm-swiping")
      ? this._commLayoutPages(t, e, 0, !0)
      : (this._commLayoutPages(t, t._commActiveTab, 0, !1),
        window.requestAnimationFrame(() => {
          t.isConnected && this._commLayoutPages(t, e, 0, !0);
        }));
  },
  _commSwipeOffset(t, e) {
    const a = this._commTabOrder(),
      n = Math.max(0, a.indexOf(t._commActiveTab));
    return (0 === n && e > 0) || (n === a.length - 1 && e < 0) ? 0.35 * e : e;
  },
  _commTabOrder: () => ["account", "records"],
  _commBuildDots(t) {
    const e = document.createElement("div");
    return (
      (e.className = "comm-dots"),
      [
        { key: "account", label: "账户" },
        { key: "records", label: "通讯记录" },
      ].forEach((a) => {
        const n = document.createElement("button");
        ((n.type = "button"),
          (n.className = "comm-dot" + (t === a.key ? " active" : "")),
          (n.dataset.tab = a.key),
          (n.title = a.label),
          n.setAttribute("aria-label", a.label),
          e.appendChild(n));
      }),
      e.addEventListener("click", (t) => {
        const a = t.target.closest(".comm-dot"),
          n = e.closest(".comm-card");
        if (!a || !n) return;
        t.stopPropagation();
        const o = this._commTabOrder(),
          i = o.indexOf(n._commActiveTab),
          r = o.indexOf(a.dataset.tab);
        r < 0 || r === i || this._commSwitchTo(n, o[r]);
      }),
      e
    );
  },
  _commBindSwipe(t, e) {
    if (!t) return;
    let a = 0,
      n = 0,
      o = 0,
      i = 1,
      r = !1,
      s = null,
      c = 0,
      l = 0,
      d = 0,
      p = !1,
      h = null;
    const u = () => {
      ((() => {
        if (p && null !== h && t.hasPointerCapture && t.hasPointerCapture(h))
          try {
            t.releasePointerCapture(h);
          } catch (t) {}
        p = !1;
      })(),
        (r = !1),
        (s = null),
        (d = 0));
    };
    (t.addEventListener("pointerdown", (p) => {
      ("mouse" === p.pointerType && 0 !== p.button) ||
        p.target.closest("input, textarea, button, a") ||
        p.target.closest(".comm-map-canvas") ||
        (e._commSwipeTimer &&
          (this._timers.clearTimeout(e._commSwipeTimer),
          (e._commSwipeTimer = null),
          this._commApplyTab(e, e._commActiveTab),
          e.querySelectorAll(".comm-panel").forEach((t) => {
            (t.style.removeProperty("transform"), t.style.removeProperty("transition"));
          }),
          t.classList.remove("comm-swiping")),
        (a = p.clientX),
        (n = p.clientY),
        (c = p.clientX),
        (l = p.timeStamp || Date.now()),
        (o = 0),
        (d = 0),
        (s = null),
        (r = !0),
        (h = p.pointerId),
        (i = t.clientWidth || 1));
    }),
      t.addEventListener("pointermove", (i) => {
        if (!r) return;
        const m = i.clientX - a,
          f = i.clientY - n;
        if (!s) {
          if (Math.abs(m) < 6 && Math.abs(f) < 6) return;
          if (((s = Math.abs(m) > 1.2 * Math.abs(f) ? "x" : "y"), "x" !== s)) return void u();
          if (null !== h && !p)
            try {
              (t.setPointerCapture(h), (p = !0));
            } catch (t) {}
        }
        if ("x" !== s) return;
        const g = i.timeStamp || Date.now(),
          y = g - l;
        (y > 0 && ((d = (i.clientX - c) / y), (c = i.clientX), (l = g)),
          (o = m),
          this._commLayoutPages(e, e._commActiveTab, this._commSwipeOffset(e, o), !1));
      }),
      t.addEventListener("pointerup", () => {
        if (!r) return;
        const t = "x" === s,
          a = o,
          n = d;
        if ((u(), !t)) return;
        const c = this._commTabOrder(),
          l = Math.max(0, c.indexOf(e._commActiveTab)),
          p = 0.28 * i;
        let h = l;
        (a <= -p || (n <= -0.35 && a < -12)
          ? (h = Math.min(l + 1, c.length - 1))
          : (a >= p || (n >= 0.35 && a > 12)) && (h = Math.max(l - 1, 0)),
          this._commSwitchTo(e, c[h]));
      }),
      t.addEventListener("pointercancel", () => {
        if (!r) return;
        const t = "x" === s;
        (u(), t && this._commSwitchTo(e, e._commActiveTab));
      }));
  },
  _switchCommAccount(t) {
    if (!t) return;
    const e = t.closest(".comm-card");
    if (!e) return;
    const a = t.dataset.entity;
    if (!a || a === e._commActiveEntity) return;
    ((e._commActiveEntity = a),
      (e._commPhoneRevealed = !1),
      (e._commAuthDraft = {}),
      (e._commCallFilter = null),
      (e._commCallSort = null),
      (e._commDailyHover = 0));
    const n = e._commConfig || {};
    this._commRebuildPanels(e, n, this._commLoadAll(n));
  },
  _commFillPanels(t, e, a, n) {
    t.textContent = "";
    const o = this._commActiveContext(e, a, n);
    (t.appendChild(this._commBuildAccountPanel(o, e)), t.appendChild(this._commBuildRecordsPanel(o, e)));
  },
  _commEmptyConfigReason(t) {
    const e = Object.keys(t || {}),
      a = e.filter((t) => /tel/i.test(t));
    let n =
      "未解析出任何号码：请在卡片配置里写电话号码（如 tel_1: 13363902961），或沿用旧的 entity / entities（如 sensor.xxx_shu_ju_zong_lan）。";
    return (
      a.length
        ? (n += ` 收到的疑似号码键：${a.join("、")} —— 键名需形如 tel_1 / tel_2（小写 tel + 下划线 + 序号；只配一个号码也可直接写 tel）。`)
        : e.length && (n += ` 当前收到的配置键：${e.join("、")}。`),
      n
    );
  },
  _commActiveContext(t, e, a) {
    const n = t._commActiveEntity,
      o = (n && a.dataMap.get(n)) || { ok: !1, reason: this._commEmptyConfigReason(e), nodes: {} };
    return { config: e || {}, account: a.accounts.find((t) => t.entityId === n) || null, data: o };
  },
  _commRebuildPanels(t, e, a) {
    const n = t.querySelector(".comm-panels");
    if (!n) return;
    (this._commCloseDailyTip(t),
      this._commCloseTransientBubble(t, "_commRingTip"),
      this._commCloseTransientBubble(t, "_commMiniTip"),
      this._commDisposeRings(n),
      (t._commActiveEntity = this._commPickActive(t, a.accounts)),
      this._commFillPanels(n, t, e, a));
    const o = t.querySelector(".comm-header");
    (o && o.replaceWith(this._commBuildHeader(e, a.accounts, t)), this._commMountRings(t));
    const i = this._commActiveContext(t, e, a);
    ["_commAuthBubble", "_commSimBubble", "_commPkgBubble", "_commFeeBubble"].forEach((e) => {
      const a = t[e];
      a && (a.bubble && a.bubble.isConnected ? a.render(i) : (t[e] = null));
    });
  },
  _commBuildAccountPanel(t, e) {
    const a = t.data,
      n = t.config,
      o = document.createElement("div");
    if (
      ((o.className = "comm-panel" + ("account" === e._commActiveTab ? " active" : "")),
      (o.dataset.panel = "account"),
      !a || !a.ok)
    )
      return (o.appendChild(this._commEmpty((a && a.reason) || "暂无数据")), o);
    const i = this._commAccountView(a, n),
      r = document.createElement("div");
    ((r.className = "comm-body"), r.appendChild(this._commHero(i, e, t)));
    if (i.limitPrompt) {
      r.appendChild(this._commLimitBanner(i.limitPrompt));
    }
    const s = this._commSection("流量", "mdi:cloud-download-outline");
    (s.body.appendChild(
      this._commDuoRing({
        percent: i.flow.percent,
        remain: i.flow.remain,
        used: i.flow.used,
        total: i.flow.total,
        unit: i.flow.unit,
        caption: "剩余占比",
        color: "#2196f3",
        members: i.flow.members,
        packs: i.flow.packs,
      }),
    ),
      r.appendChild(s.section));
    const c = this._commSection("通话", "mdi:phone-outgoing-outline");
    (c.body.appendChild(
      this._commDuoRing({
        percent: i.voice.percent,
        remain: i.voice.remain,
        used: i.voice.used,
        total: i.voice.total,
        unit: i.voice.unit,
        caption: "剩余占比",
        color: "#4caf50",
        members: i.voice.members,
        packs: i.voice.packs,
      }),
    ),
      r.appendChild(c.section));
    const l = this._commFooter(i);
    return (l && r.appendChild(l), o.appendChild(r), o);
  },
  _commRecordTab(t) {
    const e = t && t._commRecordTab;
    return "traffic" === e || "sms" === e ? e : "call";
  },
  _commRecordTabs(t, e, a) {
    const n = document.createElement("div");
    n.className = "comm-record-tabs";
    const o = [
      { key: "call", label: "通话", icon: "mdi:phone-log" },
      { key: "traffic", label: "流量", icon: "mdi:web" },
      { key: "sms", label: "短信", icon: "mdi:message-text-outline" },
    ].filter((t) => a && a[t.key]);
    if (o.length < 2) return n;
    const i = document.createElement("div");
    return (
      (i.className = "comm-record-tabs-slot"),
      o.forEach((a) => {
        const n = document.createElement("button");
        ((n.type = "button"),
          (n.className = "comm-record-tab" + (a.key === e ? " active" : "")),
          (n.dataset.tab = a.key));
        const o = document.createElement("ha-icon");
        (o.setAttribute("icon", a.icon), n.appendChild(o));
        const r = document.createElement("span");
        ((r.textContent = a.label),
          n.appendChild(r),
          (n.title = `只显示${a.label}相关内容`),
          n.addEventListener("click", (e) => {
            (e.stopPropagation(),
              n.classList.contains("active") || ((t._commRecordTab = a.key), this._commRefreshRecordsPanel(t)));
          }),
          i.appendChild(n));
      }),
      n.appendChild(i),
      n
    );
  },
  _commBuildRecordsPanel(t, e) {
    const a = t.data,
      n = t.config,
      o = document.createElement("div");
    if (
      ((o.className = "comm-panel" + ("records" === e._commActiveTab ? " active" : "")),
      (o.dataset.panel = "records"),
      !a || !a.ok)
    )
      return (o.appendChild(this._commEmpty((a && a.reason) || "暂无数据")), o);
    const i = this._commFieldNode(a.nodes, "call_record", (n && n.fields) || {});
    if (!i)
      return (o.appendChild(this._commEmpty("未找到「通话记录」节点（可用配置 fields.call_record 指定节点名）")), o);
    const r = document.createElement("div");
    r.className = "comm-body";
    const s = this._commCallView(i),
      c = this._commPlaceScope(e),
      l = this._commCallStats(i, s.items, c),
      d = this._commSection("本月通话", "mdi:phone-log");
    d.head.appendChild(this._commPhoneToggle(e));
    const p = document.createElement("div");
    ((p.className = "comm-mini-grid"),
      p.appendChild(
        this._commMini("总次数", `${this._commFmtNum(l.count)} 次`, {
          title: "点击查看接听 / 呼叫次数",
          onClick: (t) => {
            const a = l.count - l.answerCount - l.dialCount;
            this._commMiniBubble(
              t,
              "通话次数构成",
              [
                ["接听", `${l.answerCount} 次`],
                ["呼叫", `${l.dialCount} 次`],
                ["其它（未接等）", a > 0 ? `${a} 次` : ""],
              ],
              e,
            );
          },
        }),
      ),
      p.appendChild(
        this._commMini("总时长", this._commFormatDuration(l.seconds), {
          title: "点击查看接听 / 呼叫时长",
          onClick: (t) => {
            const a = l.seconds - l.answerSeconds - l.dialSeconds;
            this._commMiniBubble(
              t,
              "通话时长构成",
              [
                ["接听累计", this._commFormatDuration(l.answerSeconds)],
                ["呼叫累计", this._commFormatDuration(l.dialSeconds)],
                ["其它（未接等）", a > 0 ? this._commFormatDuration(a) : ""],
              ],
              e,
            );
          },
        }),
      ));
    const h = l.fee
      ? {
          title: "点击查看费用最高的三通",
          onClick: (t) =>
            this._commMiniBubble(
              t,
              "费用最高的三通",
              l.topFee.map((t, a) => [
                `#${a + 1}  ${t.time || ""}`.trim(),
                `${this._commPhoneText(t.number, e)} · ${this._commFmtNum(t.fee)} 元`,
              ]),
              e,
            ),
        }
      : {};
    p.appendChild(this._commMini("总费用", `${this._commFmtNum(l.fee)} 元`, h));
    const u = l.places.length
      ? {
          title: "点击查看各地点的时长与次数",
          onClick: (t) =>
            this._commMiniBubble(
              t,
              `${this._commPlaceScopeLabel(c)} · 时长与次数`,
              l.places.map((t) => [t.name, `${this._commFormatDuration(t.seconds)} · ${t.count} 次`]),
              e,
            ),
        }
      : {};
    (p.appendChild(this._commMini("通话地点", l.places.length ? `${l.places.length} 个` : "—", u)),
      d.body.appendChild(p),
      l.daily &&
        (d.body.appendChild(this._commSubTitle("每日通话时长")), d.body.appendChild(this._commDailyChart(l.daily, e))));
    const m = e._commCallFilter || null,
      f = this._commPlaceToneMap(s.items);
    if (
      (l.top.length &&
        (d.body.appendChild(this._commSubTitle("通话时长 Top3")),
        d.body.appendChild(this._commRankList(l.top, e, m && "number" === m.type ? m.value : ""))),
      l.places.length)
    ) {
      const t = this._commSubTitle("通话地点");
      (t.appendChild(this._commPlaceScopeToggle(e)), d.body.appendChild(t));
      const a = document.createElement("div");
      ((a.className = "comm-place-list"),
        l.places.forEach((t) => {
          const n = document.createElement("span"),
            o = f.has(t.name) ? f.get(t.name) : 0,
            i = !(
              !m ||
              "place" !== m.type ||
              m.scope !== c ||
              (Array.isArray(m.values) ? -1 === m.values.indexOf(t.name) : m.value !== t.name)
            );
          ((n.className = "comm-place comm-place-tone-" + o + (i ? " active" : "")),
            (n.textContent = `${t.name} · ${t.count} 次`),
            (n.title = `点击筛选「${this._commPlaceScopeLabel(c)} = ${t.name}」的通话记录`),
            n.addEventListener("click", (a) => {
              (a.stopPropagation(), this._commToggleCallFilter(e, { type: "place", scope: c, value: t.name }));
            }),
            a.appendChild(n));
        }),
        d.body.appendChild(a));
    }
    const g = (n && n.fields) || {},
      y = this._commFieldNode(a.nodes, "sms_record", g),
      b = this._commFieldNode(a.nodes, "traffic_record", g),
      x = y ? this._commSmsView(y) : null,
      v = b ? this._commTrafficView(b) : null,
      _ = m ? s.items.filter((t) => this._commCallMatch(t, m)) : s.items,
      w = m
        ? "place" === m.type
          ? Array.isArray(m.values)
            ? `${this._commPlaceScopeLabel(m.scope)} ${m.values.length > 2 ? `${m.values.length} 处` : m.values.join("、")}`
            : `${this._commPlaceScopeLabel(m.scope)} ${m.value}`
          : m.value
        : "",
      C = m
        ? "place" === m.type
          ? `${this._commPlaceScopeLabel(m.scope)}：${Array.isArray(m.values) ? m.values.join("、") : m.value}`
          : `号码：${m.value}`
        : "",
      k = "map" === e._commDetailView ? "map" : "list",
      S = m ? "通话明细" : _.length ? `通话明细 · ${_.length} 条` : "通话明细",
      E = this._commSection(S, "map" === k ? "mdi:map-marker-path" : "mdi:format-list-bulleted");
    if ((E.head.appendChild(this._commViewToggle(e)), m)) {
      const t = document.createElement("div");
      t.className = "comm-filter-bar";
      const a = document.createElement("span");
      ((a.className = "comm-filter-text"),
        (a.textContent = `${w} · ${_.length} / 共 ${s.items.length} 条`),
        t.appendChild(a));
      const n = document.createElement("button");
      ((n.type = "button"),
        (n.className = "comm-filter-clear"),
        (n.textContent = "清除筛选"),
        (n.title = `当前筛选 ${C}`),
        n.addEventListener("click", (t) => {
          (t.stopPropagation(), this._commToggleCallFilter(e, null));
        }),
        t.appendChild(n),
        E.section.insertBefore(t, E.body));
    }
    if (_.length)
      if ("map" === k) E.body.appendChild(this._commMigrationChart(_, e, c, m));
      else {
        const t = e._commCallSort || null;
        (E.body.appendChild(this._commSortBar(e, t)),
          E.body.appendChild(this._commCallList(this._commSortCalls(_, t, c), f, e)));
      }
    else {
      const t = document.createElement("div");
      ((t.className = "comm-tip"),
        (t.textContent = m
          ? "当前筛选条件下没有通话记录。"
          : "暂无通话流水。详单授权失效时集成只保留本地缓存，重新认证后可拉取最新明细。"),
        E.body.appendChild(t));
    }
    const T = x ? this._commSmsSection(x, e).section : null,
      $ = v ? this._commTrafficSection(v, e).section : null,
      A = { call: !0, traffic: !!$, sms: !!T };
    let D = this._commRecordTab(e);
    return (
      A[D] || (D = "call"),
      r.appendChild(this._commRecordTabs(e, D, A)),
      "traffic" === D
        ? r.appendChild($)
        : "sms" === D
          ? r.appendChild(T)
          : (r.appendChild(d.section), r.appendChild(E.section)),
      o.appendChild(r),
      o
    );
  },
  _commRecordMonthKey(t, e) {
    let a = "";
    (t || []).forEach((t) => {
      const n = String((t && t[e || "datetime"]) || "");
      n > a && (a = n);
    });
    const n = a.match(/^(\d{4})-(\d{2})/);
    return n ? `${n[1]}-${n[2]}` : "";
  },
  _commDataSize(t) {
    const e = Number(t);
    return !isFinite(e) || e <= 0
      ? "0 MB"
      : e >= 1024
        ? `${this._commFmtNum(e / 1024)} GB`
        : `${this._commFmtNum(e)} MB`;
  },
  _commSmsDirection(t) {
    const e = String(t || "");
    return /发送|发出|发信|主叫/.test(e) ? "out" : /接收|收到|来信|被叫/.test(e) ? "in" : "other";
  },
  _commSmsView(t) {
    const e = Array.isArray(t && t["短信记录"]) ? t["短信记录"] : [];
    let a = 0,
      n = 0,
      o = 0;
    e.forEach((t) => {
      const e = this._commSmsDirection(t && t.type);
      "out" === e ? (a += 1) : "in" === e && (n += 1);
      const i = this._commNum(t && t.fee);
      null !== i && (o += i);
    });
    const i = new Map(),
      r = Array.isArray(t && t["按天汇总"]) ? t["按天汇总"] : [];
    r.length
      ? r.forEach((t) => {
          const e = String((t && t.date) || "").match(/^\d{4}-\d{2}-(\d{2})/);
          if (!e) return;
          const a = Number(e[1]),
            n = i.get(a) || { seconds: 0, count: 0 };
          ((n.seconds += this._commNum(t.count) || 0), i.set(a, n));
        })
      : e.forEach((t) => {
          const e = String((t && t.datetime) || "").match(/^\d{4}-\d{2}-(\d{2})/);
          if (!e) return;
          const a = Number(e[1]),
            n = i.get(a) || { seconds: 0, count: 0 };
          ((n.seconds += 1), i.set(a, n));
        });
    const s = this._commRecordMonthKey(e, "datetime") || this._commRecordMonthKey(r, "date");
    return {
      items: e,
      count: e.length,
      sent: a,
      received: n,
      fee: o,
      monthKey: s,
      daily: this._commDailySeries(s, i, {
        value: (t) => (t ? t.seconds : 0),
        countOf: () => 0,
        label: "短信条数",
        countLabel: "条",
        format: (t) => (t ? `${this._commFmtNum(t)} 条` : "无短信"),
      }),
    };
  },
  _commTrafficView(t) {
    const e = Array.isArray(t && t["上网会话清单"]) ? t["上网会话清单"] : [],
      a = (t && t["合计"]) || {};
    let n = this._commNum(a.volume_mb),
      o = this._commNum(a.duration_seconds),
      i = this._commNum(a.fee_yuan);
    if (null === n || null === o || null === i) {
      let t = 0,
        a = 0,
        r = 0;
      (e.forEach((e) => {
        ((t += this._commNum(e && e.volume_mb) || 0),
          (a += this._commNum(e && e.duration_seconds) || 0),
          (r += this._commNum(e && e.fee) || 0));
      }),
        null === n && (n = t),
        null === o && (o = a),
        null === i && (i = r));
    }
    const r = new Map(),
      s = (t, e, a) => {
        const n = String(t || "").match(/^\d{4}-\d{2}-(\d{2})/);
        if (!n) return;
        const o = Number(n[1]),
          i = r.get(o) || { value: 0, count: 0 };
        ((i.value += e || 0), (i.count += a || 0), r.set(o, i));
      },
      c = Array.isArray(t && t["按天汇总"]) ? t["按天汇总"] : [];
    c.length
      ? c.forEach((t) => s(t && t.date, this._commNum(t && t.volume_mb), this._commNum(t && t.sessions) || 1))
      : e.forEach((t) => s(t && t.datetime, this._commNum(t && t.volume_mb), 1));
    const l = this._commRecordMonthKey(e, "datetime") || this._commRecordMonthKey(c, "date");
    return {
      items: e,
      volumeMb: n,
      seconds: o,
      fee: i,
      sessions: e.length,
      monthKey: l,
      daily: this._commDailySeries(l, r, {
        value: (t) => (t ? t.value : 0),
        countOf: (t) => (t ? t.count : 0),
        label: "上网流量",
        countLabel: "次上网",
        format: (t) => this._commDataSize(t),
      }),
    };
  },
  _commTipLine(t) {
    const e = document.createElement("div");
    return ((e.className = "comm-tip"), (e.textContent = t), e);
  },
  _commSmsSection(t, e) {
    const a = this._commSection("本月短信", "mdi:message-text-outline");
    if (!t.count) return (a.body.appendChild(this._commTipLine("本月没有短信记录。")), a);
    const n = document.createElement("div");
    return (
      (n.className = "comm-mini-grid"),
      n.appendChild(this._commMini("总条数", `${t.count} 条`)),
      n.appendChild(this._commMini("发送", `${t.sent} 条`)),
      n.appendChild(this._commMini("接收", `${t.received} 条`)),
      n.appendChild(this._commMini("总费用", `${this._commFmtNum(t.fee)} 元`)),
      a.body.appendChild(n),
      t.daily &&
        (a.body.appendChild(this._commSubTitle("每日短信条数")), a.body.appendChild(this._commDailyChart(t.daily, e))),
      a.body.appendChild(this._commSubTitle(`短信明细 · ${t.items.length} 条`)),
      a.body.appendChild(this._commSmsList(t.items, e)),
      a
    );
  },
  _commTrafficInsight(t) {
    const e = (t && t.items) || [],
      a = new Map(),
      n = new Map(),
      o = [],
      i = [];
    e.forEach((t) => {
      const e = this._commNum(t.volume_mb) || 0,
        r = this._commNum(t.duration_seconds) || 0,
        s = String(t.datetime || ""),
        c = (s.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "",
        l = Number((s.match(/\s(\d{2}):/) || [])[1]);
      if ((c && a.set(c, (a.get(c) || 0) + e), Number.isFinite(l))) {
        const t = n.get(l) || { seconds: 0, count: 0 };
        ((t.seconds += r), (t.count += 1), n.set(l, t));
      }
      o.push({ time: this._commShortTime(s), mb: e, seconds: r });
      const d = this._commNum(t.fee);
      d && i.push({ time: this._commShortTime(s), mb: e, fee: d });
    });
    const r = Array.from(a.entries()).sort((t, e) => e[1] - t[1]);
    return {
      activeDays: r.length,
      maxDay: r.length ? { date: r[0][0], mb: r[0][1] } : null,
      dailyAvg: r.length ? (t.volumeMb || 0) / r.length : 0,
      topSessions: o
        .slice()
        .sort((t, e) => e.mb - t.mb)
        .slice(0, 5),
      hours: Array.from(n.entries())
        .map(([t, e]) => ({ hour: t, seconds: e.seconds, count: e.count }))
        .sort((t, e) => t.hour - e.hour),
      topFee: i.sort((t, e) => e.fee - t.fee).slice(0, 5),
    };
  },
  _commTrafficSection(t, e) {
    const a = this._commSection("本月上网", "mdi:web");
    if (!t.items.length) return (a.body.appendChild(this._commTipLine("本月没有上网记录。")), a);
    const n = document.createElement("div");
    n.className = "comm-mini-grid";
    const o = this._commTrafficInsight(t);
    (n.appendChild(
      this._commMini("总流量", this._commDataSize(t.volumeMb), {
        title: "点击查看本月流量概况",
        onClick: (a) =>
          this._commMiniBubble(
            a,
            "本月流量概况",
            [
              ["有上网的天数", o.activeDays ? `${o.activeDays} 天` : ""],
              ["日均（按有流量的天）", o.activeDays ? this._commDataSize(o.dailyAvg) : ""],
              ["最大单日", o.maxDay ? `${this._commDataSize(o.maxDay.mb)}（${o.maxDay.date.slice(5)}）` : ""],
              ["单次最大", o.topSessions.length ? this._commDataSize(o.topSessions[0].mb) : ""],
              ["日均会话数", o.activeDays ? `${this._commFmtNum(t.sessions / o.activeDays)} 次` : ""],
            ],
            e,
          ),
      }),
    ),
      n.appendChild(
        this._commMini("上网时长", this._commFormatDuration(t.seconds), {
          title: "点击查看 24 小时分布",
          onClick: (t) => this._commMiniBubble(t, "上网时段分布（按会话开始时间）", this._commHourChart(o.hours), e),
        }),
      ),
      n.appendChild(
        this._commMini("上网次数", `${t.sessions} 次`, {
          title: "点击查看单次流量 Top5",
          onClick: (t) =>
            this._commMiniBubble(
              t,
              "单次流量 Top5",
              o.topSessions.map((t, e) => [
                `#${e + 1}  ${t.time}`.trim(),
                `${this._commDataSize(t.mb)} · ${this._commFormatDuration(t.seconds)}`,
              ]),
              e,
            ),
        }),
      ));
    const i = t.fee
      ? {
          title: "点击查看计费的上网会话",
          onClick: (t) =>
            this._commMiniBubble(
              t,
              "计费的上网会话",
              o.topFee.map((t, e) => [
                `#${e + 1}  ${t.time}`.trim(),
                `${this._commDataSize(t.mb)} · ${this._commFmtNum(t.fee)} 元`,
              ]),
              e,
            ),
        }
      : {};
    return (
      n.appendChild(this._commMini("总费用", `${this._commFmtNum(t.fee)} 元`, i)),
      a.body.appendChild(n),
      t.daily &&
        (a.body.appendChild(this._commSubTitle("每日上网流量")), a.body.appendChild(this._commDailyChart(t.daily, e))),
      a.body.appendChild(this._commSubTitle(`上网明细 · ${t.items.length} 条`)),
      a.body.appendChild(this._commTrafficList(t.items)),
      a
    );
  },
  _commSmsList(t, e) {
    const a = document.createElement("div");
    return (
      (a.className = "comm-rec-list"),
      t.forEach((t) => {
        const n = document.createElement("div");
        n.className = "comm-rec-item";
        const o = document.createElement("span");
        ((o.className = "comm-rec-time"), (o.textContent = this._commShortTime(t && t.datetime)), n.appendChild(o));
        const i = this._commSmsDirection(t && t.type),
          r = document.createElement("span");
        ((r.className = "comm-rec-badge " + ("in" === i ? "in" : "out")),
          (r.textContent = "in" === i ? "接收" : "out" === i ? "发送" : String((t && t.type) || "短信")),
          n.appendChild(r));
        const s = document.createElement("span");
        ((s.className = "comm-rec-main"),
          (s.textContent = this._commPhoneText(t && t.phone_number, e) || "未知号码"),
          (s.title = String((t && t.phone_number) || "")),
          n.appendChild(s));
        const c = this._commNum(t && t.fee);
        if (c) {
          const t = document.createElement("span");
          ((t.className = "comm-rec-fee"), (t.textContent = `${this._commFmtNum(c)} 元`), n.appendChild(t));
        }
        a.appendChild(n);
      }),
      a
    );
  },
  _commTrafficList(t) {
    const e = document.createElement("div");
    return (
      (e.className = "comm-rec-list"),
      t.forEach((t) => {
        const a = document.createElement("div");
        a.className = "comm-rec-item";
        const n = document.createElement("span");
        ((n.className = "comm-rec-time"), (n.textContent = this._commShortTime(t && t.datetime)), a.appendChild(n));
        const o = document.createElement("span");
        ((o.className = "comm-rec-main"), (o.textContent = this._commDataSize(t && t.volume_mb)), a.appendChild(o));
        const i = document.createElement("span");
        ((i.className = "comm-rec-sub"),
          (i.textContent = this._commFormatDuration(t && t.duration_seconds)),
          a.appendChild(i));
        const r = String((t && t.business_type) || "").trim();
        if (r) {
          const t = document.createElement("span");
          ((t.className = "comm-rec-tag"), (t.textContent = r), a.appendChild(t));
        }
        e.appendChild(a);
      }),
      e
    );
  },
  _commCallPlace(t, e) {
    const a = t || {},
      n = String(a.location || "").trim(),
      o = String(a.number_location || "").trim();
    let r = "number_location" === e ? o || n : n || o;
    if (r) {
      r =
        r
          .replace(
            /^(黑龙江|吉林|辽宁|河北|河南|山东|江苏|浙江|安徽|福建|江西|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|西藏|宁夏|新疆)/,
            "",
          )
          .trim() || r;
    }
    return r;
  },
  _commCallDirArrow(t) {
    const e = String(t || "").trim();
    return /接听|被叫|呼入|来电/.test(e) ? "←" : /呼叫|主叫|呼出|去电/.test(e) ? "→" : "·";
  },
  _commCallPlaceParts(t) {
    const e = t || {},
      a = String(e.location || "").trim(),
      n = String(e.number_location || "").trim();
    return a || n
      ? a && n
        ? {
            segments: [
              { text: a, field: "location" },
              { text: n, field: "number_location" },
            ],
            arrow: this._commCallDirArrow(e.type),
          }
        : { segments: [{ text: a || n, field: a ? "location" : "number_location" }], arrow: "" }
      : { segments: [], arrow: "" };
  },
  _commPlaceScope: (t) => (t && "number_location" === t._commPlaceScope ? "number_location" : "location"),
  _commPlaceScopeLabel: (t) => ("number_location" === t ? "对方地点" : "我的地点"),
  _commPlaceScopeToggle(t) {
    const e = this._commPlaceScope(t),
      a = document.createElement("button");
    ((a.type = "button"), (a.className = "comm-place-scope"), (a.dataset.scope = e));
    const n = document.createElement("ha-icon");
    (n.setAttribute("icon", "mdi:swap-horizontal"), a.appendChild(n));
    const o = document.createElement("span");
    return (
      (o.textContent = this._commPlaceScopeLabel(e)),
      a.appendChild(o),
      (a.title =
        "number_location" === e
          ? "当前统计「对方地点（号码归属地）」，点击切换为「我的地点」"
          : "当前统计「我的地点（通话发生地）」，点击切换为「对方地点」"),
      a.addEventListener("click", (a) => {
        (a.stopPropagation(),
          (t._commPlaceScope = "location" === e ? "number_location" : "location"),
          (t._commCallFilter = null),
          this._commRefreshRecordsPanel(t));
      }),
      a
    );
  },
  _commCallStats(t, e, a) {
    const n = this._commNum(this._commProp(t, ["本月通话次数"]));
    let o = 0,
      i = 0,
      r = 0,
      s = 0,
      c = 0,
      l = 0;
    const d = [],
      p = new Map(),
      h = new Map(),
      u = new Map(),
      m = this._commCallMonthKey(t, e);
    e.forEach((t) => {
      const e = this._commDurationSeconds(t.duration);
      o += e;
      const n = this._commNum(t.fee);
      null !== n && (i += n);
      const f = this._commCallDirArrow(t.type);
      ("←" === f ? ((r += 1), (c += e)) : "→" === f && ((s += 1), (l += e)),
        n && d.push({ number: String(t.phone_number || "未知号码"), time: this._commShortTime(t.call_time), fee: n }));
      const g = this._commCallPlace(t, a);
      if (g) {
        const t = p.get(g) || { count: 0, seconds: 0 };
        ((t.count += 1), (t.seconds += e), p.set(g, t));
      }
      const y = String(t.phone_number || "未知号码"),
        b = h.get(y) || { number: y, seconds: 0, count: 0, lastTime: "", time: "" };
      ((b.seconds += e), (b.count += 1));
      const x = String(t.call_time || "");
      (x > b.lastTime && ((b.lastTime = x), (b.time = this._commShortTime(x))), h.set(y, b));
      const v = x.match(/^(\d{4}-\d{2})-(\d{2})/);
      if (v && (!m || v[1] === m)) {
        const t = Number(v[2]),
          a = u.get(t) || { seconds: 0, count: 0 };
        ((a.seconds += e), (a.count += 1), u.set(t, a));
      }
    });
    const f = Array.from(p.entries())
        .map(([t, e]) => ({ name: t, count: e.count, seconds: e.seconds }))
        .sort((t, e) => e.count - t.count || e.seconds - t.seconds),
      g = Array.from(h.values())
        .filter((t) => t.seconds > 0)
        .sort((t, e) => e.seconds - t.seconds || e.count - t.count)
        .slice(0, 3),
      y = d.sort((t, e) => e.fee - t.fee).slice(0, 3);
    return {
      count: null === n ? e.length : n,
      seconds: o,
      fee: i,
      answerCount: r,
      dialCount: s,
      answerSeconds: c,
      dialSeconds: l,
      topFee: y,
      places: f,
      top: g,
      daily: this._commDailySeries(m, u),
    };
  },
  _commTodayKey() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  },
  _commCallMonthKey(t, e) {
    const a = String(this._commProp(t, ["查询起始日期"]) || "")
      .trim()
      .match(/^(\d{4})-(\d{2})/);
    if (a) return `${a[1]}-${a[2]}`;
    let n = "";
    (e || []).forEach((t) => {
      const e = String((t && t.call_time) || "");
      e > n && (n = e);
    });
    const o = n.match(/^(\d{4})-(\d{2})/);
    return o ? `${o[1]}-${o[2]}` : "";
  },
  _commDailySeries(t, e, a = {}) {
    if (!t) return null;
    a = a || {};
    const n = t.split("-").map(Number),
      o = n[0],
      i = n[1];
    if (!o || !i) return null;
    const r = "function" == typeof a.value ? a.value : (t) => (t ? t.seconds : 0),
      s = "function" == typeof a.countOf ? a.countOf : (t) => (t ? t.count : 0),
      c = new Date(o, i, 0).getDate(),
      l = [];
    let d = 0,
      p = 0;
    for (let t = 1; t <= c; t++) {
      const a = e.get(t),
        n = r(a) || 0,
        o = s(a) || 0;
      (n > d && (d = n), (p += n), l.push({ day: t, value: n, seconds: n, count: o, percent: 0 }));
    }
    if (!p) return null;
    l.forEach((t) => {
      t.percent = d ? (t.value / d) * 100 : 0;
    });
    const h = new Date(),
      u = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
    return {
      year: o,
      month: i,
      days: l,
      max: d,
      total: p,
      today: u === t ? h.getDate() : 0,
      label: "string" == typeof a.label && a.label ? a.label : "通话时长",
      countLabel: "string" == typeof a.countLabel && a.countLabel ? a.countLabel : "次",
      format: "function" == typeof a.format ? a.format : (t) => (t ? this._commFormatDuration(t) : "无通话"),
    };
  },
  _commTrendData(t) {
    const e = (t || []).filter(Boolean);
    if (!e.length) return null;
    const a = e.reduce((t, e) => (e.days.length > t.days.length ? e : t)),
      n = (t) => {
        const e = new Map();
        return (((t && t.days) || []).forEach((t) => e.set(t.day, t)), e);
      },
      o = n(t[0]),
      i = n(t[1]),
      r = n(t[2]),
      s = [],
      c = [],
      l = [];
    return (
      a.days.forEach((t) => {
        const e = o.get(t.day),
          a = i.get(t.day),
          n = r.get(t.day);
        (s.push(e ? Math.round((e.value / 60) * 10) / 10 : 0),
          c.push(a ? a.value : 0),
          l.push(n ? Math.round(100 * n.value) / 100 : 0));
      }),
      {
        monthLabel: a.month,
        days: a.days.map((t) => t.day),
        call: s,
        sms: c,
        traffic: l,
        hasCall: s.some((t) => t > 0),
        hasSms: c.some((t) => t > 0),
        hasFlow: l.some((t) => t > 0),
      }
    );
  },
  _commTrendSection(t, e) {
    if (!t) return null;
    const a = this._commSection("每日趋势", "mdi:chart-areaspline");
    a.body.appendChild(this._commSubTitle("通话时长（分）向上 · 短信（条）向下 · 上网流量（MB）折线"));
    const n = document.createElement("div");
    return (
      (n.className = "comm-trend-canvas"),
      a.body.appendChild(n),
      this._loadEchartsUnified()
        .then((a) => {
          if (!n.isConnected || !e.isConnected) return;
          const o = a.init(n);
          o.setOption(this._commTrendOption(t));
          const i = new ResizeObserver(() => {
            !o.isDisposed() && n.isConnected ? o.resize() : i.disconnect();
          });
          i.observe(n);
        })
        .catch(() => {
          (n.remove(),
            a.body.appendChild(this._commTipLine("图表组件未加载，无法绘制趋势图（可检查 echarts.min.js）。")));
        }),
      a
    );
  },
  _commTrendOption(t) {
    const e = t.call.reduce((t, e) => Math.max(t, e), 0),
      a = t.sms.reduce((t, e) => Math.max(t, e), 0),
      n = t.traffic.reduce((t, e) => Math.max(t, e), 0),
      o = n > 1e3 ? "GB" : "MB",
      i = "GB" === o ? 1024 : 1,
      r = n / i,
      s = e > 0 ? 1.1 * e : 1,
      c = a > 0 ? 1.1 * a : 0,
      l = r > 0 ? 1.1 * r : 1,
      d = l * (c / s);
    return {
      backgroundColor: "transparent",
      animationDuration: 600,
      grid: { left: 4, right: 4, top: 44, bottom: 4, containLabel: !0 },
      legend: { top: 0, itemWidth: 12, itemHeight: 8, itemGap: 10, textStyle: { fontSize: 11, color: "#607d8b" } },
      tooltip: {
        trigger: "axis",
        confine: !0,
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        borderColor: "rgba(0, 0, 0, 0.08)",
        textStyle: { color: "#2c3e50", fontSize: 12 },
        formatter: (e) => {
          if (!e || !e.length) return "";
          const a = [`<b>${t.monthLabel}月${e[0].axisValue}日</b>`];
          return (
            e.forEach((t) => {
              const e = Math.abs(Number(t.value) || 0);
              let n;
              ((n =
                "flow" === t.seriesId
                  ? this._commDataSize(e * i)
                  : "call" === t.seriesId
                    ? `${this._commFmtNum(e)} 分钟`
                    : `${this._commFmtNum(e)} 条`),
                a.push(`${t.marker} ${t.seriesName}：${n}`));
            }),
            a.join("<br/>")
          );
        },
      },
      xAxis: {
        type: "category",
        data: t.days,
        axisTick: { show: !1 },
        axisLine: { lineStyle: { color: "rgba(128, 128, 128, 0.35)" } },
        axisLabel: {
          fontSize: 10,
          color: "#90a4ae",
          interval: (e) => 0 === e || (e + 1) % 5 == 0 || e === t.days.length - 1,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "分钟 / 条",
          nameTextStyle: { fontSize: 10, color: "#b0bec5", padding: [0, 0, 0, 8] },
          min: -c,
          max: s,
          axisLabel: { fontSize: 10, color: "#90a4ae", formatter: (t) => String(Math.abs(t)) },
          axisLine: { show: !1 },
          splitLine: { lineStyle: { color: "rgba(128, 128, 128, 0.12)" } },
        },
        {
          type: "value",
          name: o,
          nameTextStyle: { fontSize: 10, color: "#ffb74d" },
          min: -d,
          max: l,
          axisLabel: {
            fontSize: 10,
            color: "#ffb74d",
            formatter: (t) => (t ? this._commFmtNum(t, "GB" === o ? 3 : 2) : "0"),
          },
          axisLine: { show: !1 },
          splitLine: { show: !1 },
        },
      ],
      series: [
        {
          id: "call",
          name: "通话时长（分）",
          type: "bar",
          yAxisIndex: 0,
          barMaxWidth: 11,
          itemStyle: { color: "#2196f3", borderRadius: [2, 2, 0, 0] },
          data: t.call,
        },
        {
          id: "sms",
          name: "短信（条，向下）",
          type: "bar",
          yAxisIndex: 0,
          barMaxWidth: 11,
          itemStyle: { color: "#4caf50", borderRadius: [0, 0, 2, 2] },
          data: t.sms.map((t) => -t),
        },
        {
          id: "flow",
          name: `上网流量（${o}）`,
          type: "line",
          yAxisIndex: 1,
          smooth: !0,
          symbol: "circle",
          symbolSize: 4,
          lineStyle: { width: 1.6, color: "#ff9800" },
          itemStyle: { color: "#ff9800" },
          areaStyle: { color: "rgba(255, 152, 0, 0.12)" },
          data: t.traffic.map((t) => Math.round((t / i) * 1e4) / 1e4),
        },
      ],
    };
  },
  _commDailyChart(t, e) {
    const a = document.createElement("div");
    a.className = "comm-daily";
    const n = document.createElement("div");
    ((n.className = "comm-daily-bars"),
      t.days.forEach((e) => {
        const a = document.createElement("div");
        ((a.className = "comm-daily-col" + (e.day === t.today ? " today" : "")),
          (a.dataset.day = String(e.day)),
          a.setAttribute("aria-label", this._commDailyTipText(t, e)));
        const o = document.createElement("div");
        ((o.className = "comm-daily-bar"),
          e.value && (o.style.height = `${Math.max(3, e.percent)}%`),
          a.appendChild(o),
          n.appendChild(a));
      }),
      a.appendChild(n));
    let o = (e && e._commDailyHover) || 0;
    (n.addEventListener("pointerover", (a) => {
      const i = a.target && a.target.closest ? a.target.closest(".comm-daily-col") : null,
        r = i && n.contains(i) ? Number(i.dataset.day) : 0;
      if (r)
        return "touch" === a.pointerType && r === o && e && e._commDailyTip
          ? ((o = 0), (e._commDailyHover = 0), void this._commCloseDailyTip(e))
          : void (r !== o && ((o = r), e && (e._commDailyHover = r), this._commOpenDailyTip(e, i, t.days[r - 1], t)));
    }),
      a.addEventListener("pointerleave", (t) => {
        "touch" !== t.pointerType && ((o = 0), e && (e._commDailyHover = 0), this._commCloseDailyTip(e));
      }),
      o &&
        window.requestAnimationFrame(() => {
          if (!e || !a.isConnected) return;
          const i = n.querySelector(`.comm-daily-col[data-day="${o}"]`);
          i && "function" == typeof a.matches && a.matches(":hover") && this._commOpenDailyTip(e, i, t.days[o - 1], t);
        }));
    const i = e && e.querySelector ? e.querySelector('.comm-panel[data-panel="records"]') : null;
    if (i) {
      let t = i.scrollTop;
      i.addEventListener(
        "scroll",
        () => {
          i.scrollTop !== t && ((t = i.scrollTop), this._commCloseDailyTip(e));
        },
        { passive: !0 },
      );
    }
    const r = document.createElement("div");
    r.className = "comm-daily-axis";
    const s = t.days.length;
    return (
      t.days.forEach((t) => {
        const e = document.createElement("span");
        ((e.textContent = 1 === t.day || t.day % 5 == 0 || t.day === s ? String(t.day) : ""), r.appendChild(e));
      }),
      a.appendChild(r),
      a
    );
  },
  _commDailyTipText(t, e) {
    const a = t.format(e.value);
    return `${t.month}月${e.day}日 · ${a}${e.count ? ` · ${e.count} ${t.countLabel}` : ""}`;
  },
  _commOpenDailyTip(t, e, a, n) {
    if (!t || !e || !a) return;
    this._commCloseDailyTip(t);
    const o = document.createElement("div");
    o.className = "comm-daily-tip";
    const i = document.createElement("div");
    ((i.className = "comm-daily-tip-date"),
      (i.textContent = `${n.month}月${a.day}日${a.day === n.today ? "（今天）" : ""}`));
    const r = document.createElement("div");
    if (
      ((r.className = "comm-daily-tip-value"),
      (r.textContent = n.format(a.value)),
      o.appendChild(i),
      o.appendChild(r),
      a.count)
    ) {
      const t = document.createElement("div");
      ((t.className = "comm-daily-tip-sub"), (t.textContent = `${a.count} ${n.countLabel}`), o.appendChild(t));
    }
    const { bubble: s, close: c } = this._showBubble({
      target: e,
      content: o,
      placement: "top",
      width: 150,
      maxWidth: "70vw",
      className: "comm-daily-tip-wrap",
      closeOnClickAway: !0,
      closeOnTargetClick: !1,
      onClose: () => {
        t._commDailyTip && t._commDailyTip.bubble === s && (t._commDailyTip = null);
      },
    });
    t._commDailyTip = { bubble: s, close: c };
  },
  _commCloseTransientBubble(t, e) {
    if (!t || !t[e]) return;
    const a = t[e];
    t[e] = null;
    try {
      a.close();
    } catch (t) {}
  },
  _commCloseDailyTip(t) {
    this._commCloseTransientBubble(t, "_commDailyTip");
  },
  _commDurationSeconds(t) {
    const e = String(null == t ? "" : t);
    if (!e) return 0;
    let a = 0;
    const n = e.match(/(\d+)\s*(?:小时|时)/),
      o = e.match(/(\d+)\s*分/),
      i = e.match(/(\d+)\s*秒/);
    if ((n && (a += 3600 * Number(n[1])), o && (a += 60 * Number(o[1])), i && (a += Number(i[1])), 0 === a)) {
      const t = this._commNum(e);
      null !== t && (a = t);
    }
    return a;
  },
  _commFormatDuration(t) {
    const e = Math.max(0, Math.round(Number(t) || 0));
    if (!e) return "0 秒";
    const a = Math.floor(e / 3600),
      n = Math.floor((e % 3600) / 60),
      o = e % 60;
    return a ? `${a} 小时 ${n} 分` : n ? `${n} 分 ${o} 秒` : `${o} 秒`;
  },
  _commMini(t, e, a = {}) {
    const n = document.createElement("div"),
      o = "function" == typeof a.onClick;
    n.className = "comm-mini" + (o ? " comm-mini-clickable" : "");
    const i = document.createElement("div");
    ((i.className = "comm-mini-value"), (i.textContent = e), n.appendChild(i));
    const r = document.createElement("div");
    return (
      (r.className = "comm-mini-label"),
      (r.textContent = t),
      n.appendChild(r),
      o &&
        ((n.title = a.title || `点击查看「${t}」明细`),
        n.addEventListener("click", (t) => {
          (t.stopPropagation(), a.onClick(n));
        })),
      n
    );
  },
  _commMiniBubble(t, e, a, n) {
    const o = !!a && "object" == typeof a && !Array.isArray(a) && 1 === a.nodeType;
    if (!t || !a || (!o && !a.length)) return;
    const i = !(!n || !n._commMiniTip || n._commMiniTip.key !== e);
    if ((this._commCloseTransientBubble(n, "_commMiniTip"), i)) return;
    const r = document.createElement("div");
    r.className = "comm-mini-tip";
    const s = document.createElement("div");
    ((s.className = "comm-mini-tip-title"),
      (s.textContent = e),
      r.appendChild(s),
      r.appendChild(o ? a : this._commKVGrid(a)));
    const { bubble: c, close: l } = this._showBubble({
      target: t,
      content: r,
      placement: "top",
      width: 320,
      maxWidth: "92vw",
      className: "comm-mini-tip-wrap",
      closeOnClickAway: !0,
      closeOnTargetClick: !1,
      onClose: () => {
        n && n._commMiniTip && n._commMiniTip.bubble === c && (n._commMiniTip = null);
      },
    });
    n && (n._commMiniTip = { bubble: c, close: l, key: e });
  },
  _commHourChart(t) {
    const e = [];
    for (let t = 0; t < 24; t++) e.push({ hour: t, seconds: 0, count: 0 });
    (t || []).forEach((t) => {
      const a = Number(t && t.hour);
      a >= 0 && a < 24 && (e[a] = { hour: a, seconds: t.seconds || 0, count: t.count || 0 });
    });
    const a = document.createElement("div");
    if (((a.className = "comm-hour-chart"), !e.some((t) => t.seconds))) return a;
    const n = "http://www.w3.org/2000/svg",
      o = Math.max(...e.map((t) => t.seconds)),
      i = (t) => Number(t).toFixed(2),
      r = (t) => 12 * (t + 0.5),
      s = (t) => 64 - (t / o) * 56,
      c = e.map((t) => [r(t.hour), s(t.seconds)]),
      l = [];
    c.forEach((t, e) => {
      if (!e) return void l.push(`M${i(t[0])},${i(t[1])}`);
      const a = c[e - 1],
        n = c[e - 2] || a,
        o = c[e + 1] || t,
        r = a[0] + (t[0] - n[0]) / 6,
        s = a[1] + (t[1] - n[1]) / 6,
        d = t[0] - (o[0] - a[0]) / 6,
        p = t[1] - (o[1] - a[1]) / 6;
      l.push(`C${i(r)},${i(s)} ${i(d)},${i(p)} ${i(t[0])},${i(t[1])}`);
    });
    const d = l.join(" "),
      p = `${d} L${i(c[23][0])},64 L${i(c[0][0])},64 Z`,
      h = document.createElementNS(n, "svg");
    (h.setAttribute("viewBox", "0 0 288 64"),
      h.setAttribute("preserveAspectRatio", "none"),
      h.setAttribute("class", "comm-hour-svg"));
    const u = document.createElementNS(n, "path");
    (u.setAttribute("d", p), u.setAttribute("class", "comm-hour-area"), h.appendChild(u));
    const m = document.createElementNS(n, "path");
    (m.setAttribute("d", d), m.setAttribute("class", "comm-hour-line"), h.appendChild(m));
    const f = e.reduce((t, e) => (e.seconds > t.seconds ? e : t), e[0]);
    (e.forEach((t) => {
      if (!t.seconds) return;
      const e = document.createElementNS(n, "circle");
      (e.setAttribute("cx", i(r(t.hour))),
        e.setAttribute("cy", i(s(t.seconds))),
        e.setAttribute("r", t === f ? 2.6 : 1.5),
        e.setAttribute("class", t === f ? "comm-hour-dot comm-hour-dot-peak" : "comm-hour-dot"),
        h.appendChild(e));
    }),
      e.forEach((t) => {
        const e = document.createElementNS(n, "rect");
        (e.setAttribute("x", i(r(t.hour) - 6)),
          e.setAttribute("y", "0"),
          e.setAttribute("width", i(12)),
          e.setAttribute("height", String(64)),
          e.setAttribute("fill", "transparent"));
        const a = document.createElementNS(n, "title");
        ((a.textContent =
          `${String(t.hour).padStart(2, "0")} 时 · ` +
          (t.seconds ? this._commFormatDuration(t.seconds) : "无上网") +
          (t.count ? ` · ${t.count} 次会话` : "")),
          e.appendChild(a),
          h.appendChild(e));
      }),
      a.appendChild(h));
    const g = document.createElement("div");
    ((g.className = "comm-hour-axis"),
      [0, 6, 12, 18, 23].forEach((t) => {
        const e = document.createElement("span");
        ((e.className = "comm-hour-tick"),
          (e.textContent = String(t)),
          (e.style.left = `${i(((t + 0.5) / 24) * 100)}%`),
          g.appendChild(e));
      }),
      a.appendChild(g));
    const y = e.filter((t) => t.seconds > 0).length,
      b = document.createElement("div");
    b.className = "comm-hour-foot";
    const x = document.createElement("span");
    ((x.className = "comm-hour-peak"),
      (x.textContent = `峰值 ${String(f.hour).padStart(2, "0")} 时 · ${this._commFormatDuration(f.seconds)}`),
      b.appendChild(x));
    const v = document.createElement("span");
    return (
      (v.className = "comm-hour-meta"),
      (v.textContent = `${y} / 24 个时段有会话`),
      b.appendChild(v),
      a.appendChild(b),
      a
    );
  },
  _commSubTitle(t) {
    const e = document.createElement("div");
    return ((e.className = "comm-sub-title"), (e.textContent = t), e);
  },
  _commRankList(t, e, a) {
    const n = document.createElement("div");
    return (
      (n.className = "comm-rank-list"),
      t.forEach((t, o) => {
        const i = document.createElement("div");
        ((i.className = "comm-rank-item" + (t.number === a ? " active" : "")),
          (i.dataset.number = t.number),
          (i.title = `${t.number} 本月通话 ${t.count || 1} 次，累计 ${this._commFormatDuration(t.seconds)}（点击筛选）`));
        const r = document.createElement("span");
        ((r.className = `comm-rank-no rank-${o + 1}`), (r.textContent = String(o + 1)));
        const s = document.createElement("span");
        ((s.className = "comm-rank-number"), (s.textContent = this._commPhoneText(t.number, e)), (s.title = t.number));
        const c = document.createElement("span");
        ((c.className = "comm-rank-value"), (c.textContent = this._commFormatDuration(t.seconds)));
        const l = document.createElement("span");
        ((l.className = "comm-rank-count"), (l.textContent = `${t.count || 1} 次`));
        const d = document.createElement("span");
        ((d.className = "comm-rank-time"),
          (d.textContent = t.time || ""),
          i.appendChild(r),
          i.appendChild(s),
          i.appendChild(c),
          i.appendChild(l),
          i.appendChild(d),
          i.addEventListener("click", (a) => {
            (a.stopPropagation(), this._commToggleCallFilter(e, { type: "number", value: t.number }));
          }),
          n.appendChild(i));
      }),
      n
    );
  },
  _commCallMatch(t, e) {
    if (!e || !e.value) return !0;
    if ("place" === e.type) {
      const a = this._commCallPlace(t, e.scope);
      return Array.isArray(e.values) ? -1 !== e.values.indexOf(a) : a === e.value;
    }
    return String(t.phone_number || "") === e.value;
  },
  _commToggleCallFilter(t, e) {
    if (!t) return;
    const a = t._commCallFilter,
      n = (t) => (Array.isArray(t.values) ? t.values.slice().sort().join("|") : String(t.value || "")),
      o = e && a && a.type === e.type && n(a) === n(e) && ("place" !== e.type || a.scope === e.scope);
    ((t._commCallFilter = o || !e ? null : e), this._commRefreshRecordsPanel(t));
  },
  _commSortDefaultDir: (t) => ("location" === t || "type" === t ? "asc" : "desc"),
  _commToggleCallSort(t, e) {
    if (!t || !e) return;
    const a = t._commCallSort || null;
    (a && a.key === e
      ? (t._commCallSort = { key: e, dir: "asc" === a.dir ? "desc" : "asc" })
      : (t._commCallSort = { key: e, dir: this._commSortDefaultDir(e) }),
      this._commRefreshRecordsPanel(t));
  },
  _commSortCalls(t, e, a) {
    const n = (t || []).slice();
    if (!e || !e.key) return n;
    const o = "asc" === e.dir ? 1 : -1,
      i = (t, e) => String(e.call_time || "").localeCompare(String(t.call_time || ""));
    if ("duration" === e.key)
      return (
        n.sort(
          (t, e) => o * (this._commDurationSeconds(t.duration) - this._commDurationSeconds(e.duration)) || i(t, e),
        ),
        n
      );
    if ("location" === e.key) {
      const t = (t) => this._commCallPlace(t, a);
      return (n.sort((e, a) => o * t(e).localeCompare(t(a), "zh") || i(e, a)), n);
    }
    if ("type" === e.key) {
      const t = (t) => String(t.type || "").trim();
      return (n.sort((e, a) => o * t(e).localeCompare(t(a), "zh") || i(e, a)), n);
    }
    return (n.sort((t, e) => o * String(t.call_time || "").localeCompare(String(e.call_time || ""))), n);
  },
  _commSortBar(t, e) {
    const a = e && e.key ? e : { key: "time", dir: "desc" },
      n = document.createElement("div");
    n.className = "comm-sort-bar";
    const o = document.createElement("span");
    o.className = "comm-sort-label";
    const i = document.createElement("ha-icon");
    (i.setAttribute("icon", "mdi:sort-variant"), o.appendChild(i));
    const r = document.createElement("span");
    ((r.textContent = "排序"), o.appendChild(r), n.appendChild(o));
    const s = document.createElement("div");
    return (
      (s.className = "comm-sort-keys"),
      [
        { key: "time", label: "时间" },
        { key: "duration", label: "时长" },
        { key: "type", label: "类型" },
        { key: "location", label: "地点" },
      ].forEach((e) => {
        const n = a.key === e.key,
          o = "asc" === a.dir ? "asc" : "desc",
          i = document.createElement("button");
        ((i.type = "button"), (i.className = "comm-sort-key" + (n ? " active" : "")), (i.dataset.key = e.key));
        const r = document.createElement("span");
        if (((r.textContent = e.label), i.appendChild(r), n)) {
          const t = document.createElement("ha-icon");
          (t.setAttribute("icon", "asc" === o ? "mdi:arrow-up" : "mdi:arrow-down"), i.appendChild(t));
        }
        const c = (t) => ("asc" === t ? "升序" : "降序");
        ((i.title = n
          ? `当前按${e.label}${c(o)}，点击切换为${c("asc" === o ? "desc" : "asc")}`
          : `按${e.label}${c(this._commSortDefaultDir(e.key))}排序`),
          i.addEventListener("click", (a) => {
            (a.stopPropagation(), this._commToggleCallSort(t, e.key));
          }),
          s.appendChild(i));
      }),
      n.appendChild(s),
      n
    );
  },
  _commViewToggle(t) {
    const e = "map" === t._commDetailView ? "map" : "list",
      a = document.createElement("div");
    return (
      (a.className = "comm-view-toggle"),
      [
        { key: "list", label: "列表", icon: "mdi:format-list-bulleted" },
        { key: "map", label: "地图", icon: "mdi:map-marker-path" },
      ].forEach((n) => {
        const o = document.createElement("button");
        ((o.type = "button"),
          (o.className = "comm-view-key" + (e === n.key ? " active" : "")),
          (o.dataset.view = n.key));
        const i = document.createElement("ha-icon");
        (i.setAttribute("icon", n.icon), o.appendChild(i));
        const r = document.createElement("span");
        ((r.textContent = n.label),
          o.appendChild(r),
          (o.title =
            "map" === n.key ? "在地图上查看通话流向（点地点可筛选明细）" : "按流水清单逐条查看（可排序、可筛选）"),
          o.addEventListener("click", (e) => {
            (e.stopPropagation(),
              o.classList.contains("active") || ((t._commDetailView = n.key), this._commRefreshRecordsPanel(t)));
          }),
          a.appendChild(o));
      }),
      a
    );
  },
  _commDefaultMapView: () => ({ zoom: 1.45, center: [104.5, 35.5] }),
  _commMigrationChart(t, e, a, n) {
    const o = document.createElement("div");
    o.className = "comm-map-wrap";
    const i = this._commGeoGraph(t);
    if (!i.cities.length) {
      const t = document.createElement("div");
      return (
        (t.className = "comm-tip"),
        (t.textContent = "当前流水里没有坐标数据（location_coordinate / number_location_coordinate），无法绘制地图。"),
        o.appendChild(t),
        o
      );
    }
    const r = document.createElement("div");
    ((r.className = "comm-map-canvas"), (r.dataset.rmPassiveExempt = "1"), o.appendChild(r));
    const s = document.createElement("div");
    s.className = "comm-map-legend";
    const c = [];
    return (
      i.flows.length
        ? (c.push("橙线 = 呼叫（我的地点→对方地点）· 紫线 = 接听（对方地点→我的地点）· 线越粗 = 该流向通话时长越长"),
          c.push(
            "地图可拖动 / 双指或滚轮缩放、双击复位 · 点圆点筛该地点、点省份筛该省、点线看流向详情 · 点的大小 = 该地点通话次数",
          ))
        : c.push("当前筛选下全是同城通话，没有跨城市流向，仅显示地点分布"),
      i.missing && c.push(`另有 ${i.missing} 条记录缺坐标，未在图上显示`),
      (s.textContent = c.join(" · ")),
      o.appendChild(s),
      this._loadEchartsUnified()
        .then((t) => this._commLoadChinaMap(t).then(() => t))
        .then((o) => {
          if (!r.isConnected || !e.isConnected) return;
          const s = o.init(r),
            c = new Map(i.flows.map((t) => [`${t.dir}|${t.from}→${t.to}`, t]));
          (s.setOption(this._commMigrationOption(i, this._commPlaceToneMap(t), a, n, e._commMapView)),
            s.on("georoam", () => {
              const t = s.getOption().geo,
                a = Array.isArray(t) ? t[0] : t;
              a && (e._commMapView = { zoom: a.zoom, center: a.center });
            }),
            s.on("dblclick", () => {
              ((e._commMapView = null), s.setOption({ geo: this._commDefaultMapView() }));
            }),
            s.on("click", (t) => {
              if (!t) return;
              const n = t.data || {};
              if ("geo" === t.componentType) {
                const n = this._commCitiesInProvince(i, t.name),
                  o = n.filter((t) => t.mine),
                  r = n.filter((t) => t.other);
                let s = a;
                !o.length && r.length ? (s = "number_location") : !r.length && o.length && (s = "location");
                const c = ("number_location" === s ? r : o).map((t) => t.name);
                return void (c.length && this._commToggleCallFilter(e, { type: "place", scope: s, values: c }));
              }
              if ("通话地点" === t.seriesName) {
                const o = String(n.name || t.name || "");
                if (!o) return;
                const r = i.cities.find((t) => t.name === o);
                let s = a;
                return (
                  r && (!r.mine && r.other ? (s = "number_location") : r.mine && !r.other && (s = "location")),
                  void this._commToggleCallFilter(e, { type: "place", scope: s, value: o })
                );
              }
              const o = c.get(`${n.dir}|${n.from}→${n.to}`),
                s = (t.event && (t.event.event || t.event)) || {};
              o && this._commShowFlowBubble(e, r, o, { x: s.clientX, y: s.clientY });
            }));
          const l = new ResizeObserver(() => {
            !s.isDisposed() && r.isConnected ? s.resize() : l.disconnect();
          });
          l.observe(r);
        })
        .catch((t) => {
          r.remove();
          const e = document.createElement("div");
          ((e.className = "comm-tip"),
            (e.textContent = `地图绘制失败：${(t && t.message) || t}（可切回「列表」查看，或确认 /local/pobaby_package/js/ 下有 china.geo.json 或 china.json）`),
            o.appendChild(e));
        }),
      o
    );
  },
  _commMigrationOption(t, e, a, n, o) {
    const i = this._commPlacePalette(),
      r = this._commDefaultMapView(),
      s = (o && o.zoom) || r.zoom,
      c = (o && o.center) || r.center,
      l = n && "place" === n.type && n.scope === a ? new Set(Array.isArray(n.values) ? n.values : [n.value]) : null,
      d = (t) => !!l && l.has(t),
      p = t.cities.reduce((t, e) => Math.max(t, e.count), 1),
      h = t.flows.reduce((t, e) => Math.max(t, e.seconds || 0), 1),
      u = [
        { dir: "out", name: "呼叫", color: "#fb8c00", hot: "#e65100" },
        { dir: "in", name: "接听", color: "#7e57c2", hot: "#4527a0" },
      ],
      m = (e) => ({
        name: e.name,
        type: "lines",
        coordinateSystem: "geo",
        zlevel: 1,
        effect: { show: !0, period: 5, trailLength: 0.2, symbol: "circle", symbolSize: 2.6, color: "#ffffff" },
        lineStyle: { color: e.color, width: 1, opacity: 0.55, curveness: "in" === e.dir ? 0.22 : 0.18 },
        data: t.flows
          .filter((t) => t.dir === e.dir)
          .map((t) => {
            const a = !l || d(t.from) || d(t.to);
            return {
              coords: [t.fromCoord, t.toCoord],
              from: t.from,
              to: t.to,
              dir: t.dir,
              count: t.count,
              secondsText: this._commFormatDuration(t.seconds),
              lineStyle: {
                width: 0.8 + 2.2 * Math.sqrt((t.seconds || 0) / h),
                opacity: l ? (a ? 0.92 : 0.1) : 0.55,
                color: a && l ? e.hot : e.color,
              },
            };
          }),
      });
    return {
      backgroundColor: "transparent",
      animationDuration: 700,
      tooltip: {
        trigger: "item",
        confine: !0,
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        borderColor: "rgba(0, 0, 0, 0.08)",
        textStyle: { color: "#2c3e50", fontSize: 12 },
        formatter: (t) => {
          const e = t.data || {};
          return "lines" === t.seriesType
            ? `<b>${e.from} → ${e.to}</b><br/>${"in" === e.dir ? "接听" : "呼叫"} · 通话 ${e.count} 次 · 累计 ${e.secondsText}`
            : `<b>${t.name}</b><br/>通话 ${e.count} 次<br/>作为我的地点 ${e.mine} 次 · 作为对方地点 ${e.other} 次`;
        },
      },
      geo: {
        map: "china",
        roam: !0,
        scaleLimit: { min: 0.9, max: 8 },
        zoom: s,
        center: c,
        silent: !1,
        emphasis: { disabled: !0, label: { show: !1 } },
        select: { disabled: !0 },
        itemStyle: {
          areaColor: "rgba(33, 150, 243, 0.05)",
          borderColor: "rgba(33, 150, 243, 0.30)",
          borderWidth: 0.6,
        },
      },
      series: [
        m(u[0]),
        m(u[1]),
        {
          name: "通话地点",
          type: "effectScatter",
          coordinateSystem: "geo",
          zlevel: 2,
          rippleEffect: { brushType: "stroke", scale: 2.2, period: 4 },
          symbolSize: (t) => 7 + Math.round(9 * Math.sqrt((t[2] || 1) / p)),
          data: t.cities.map((t, a) => {
            return {
              name: t.name,
              value: [t.coord[0], t.coord[1], t.count],
              count: t.count,
              mine: t.mine,
              other: t.other,
              itemStyle: {
                color: d(t.name) ? "#e65100" : ((n = t.name), i[(e && e.has(n) ? e.get(n) : 0) % i.length]),
                shadowBlur: 6,
                shadowColor: "rgba(0, 0, 0, 0.18)",
              },
              label: {
                show: a < 10 || d(t.name),
                color: "#37474f",
                fontSize: 10,
                position: "right",
                distance: 3,
                formatter: "{b}",
              },
            };
            var n;
          }),
        },
      ],
    };
  },
  _commShowFlowBubble(t, e, a, n) {
    if (!t || !e || !a) return;
    if (t._commFlowBubble) {
      try {
        t._commFlowBubble.close();
      } catch (t) {}
      t._commFlowBubble = null;
    }
    const o = document.createElement("div");
    o.className = "comm-flow-bubble";
    const i = document.createElement("div");
    i.className = "comm-flow-head";
    const r = document.createElement("span");
    ((r.className = "comm-flow-dir comm-flow-dir-" + ("in" === a.dir ? "in" : "out")),
      (r.textContent = "in" === a.dir ? "接听" : "呼叫"),
      i.appendChild(r));
    const s = document.createElement("span");
    ((s.className = "comm-flow-title"), (s.textContent = `${a.from} → ${a.to}`), i.appendChild(s), o.appendChild(i));
    const c = document.createElement("div");
    ((c.className = "comm-mini-grid comm-mini-grid-3"),
      c.appendChild(this._commMini("通话次数", `${a.count} 次`)),
      c.appendChild(this._commMini("累计时长", this._commFormatDuration(a.seconds))),
      c.appendChild(this._commMini("平均时长", this._commFormatDuration(Math.round(a.seconds / Math.max(1, a.count))))),
      o.appendChild(c));
    const l = a.calls || [];
    if (l.length) {
      o.appendChild(this._commSubTitle(`这条线上的通话（最近 ${Math.min(l.length, 12)} 条）`));
      const e = document.createElement("div");
      if (
        ((e.className = "comm-flow-list"),
        l.slice(0, 12).forEach((a) => {
          const n = document.createElement("div");
          n.className = "comm-flow-row";
          const o = document.createElement("span");
          ((o.className = "comm-flow-time"), (o.textContent = this._commShortTime(a.call_time)), n.appendChild(o));
          const i = String(a.phone_number || "未知号码"),
            r = document.createElement("span");
          ((r.className = "comm-flow-num"),
            (r.textContent = this._commPhoneText(i, t)),
            (r.title = i),
            n.appendChild(r));
          const s = document.createElement("span");
          ((s.className = "comm-flow-dur"),
            (s.textContent = String(a.duration || "")),
            n.appendChild(s),
            e.appendChild(n));
        }),
        o.appendChild(e),
        l.length > 12)
      ) {
        const t = document.createElement("div");
        ((t.className = "comm-tip"), (t.textContent = `仅列出最近 12 条，共 ${l.length} 条`), o.appendChild(t));
      }
    }
    const d = "in" === a.dir ? a.to : a.from,
      p = document.createElement("div");
    p.className = "comm-flow-actions";
    const h = document.createElement("button");
    ((h.type = "button"),
      (h.className = "comm-flow-filter"),
      (h.textContent = `筛选该流向（${d}）`),
      (h.title = `按「我的地点 = ${d}」筛选下方明细`),
      h.addEventListener("click", (e) => {
        e.stopPropagation();
        const a = t._commFlowBubble;
        if (((t._commFlowBubble = null), a))
          try {
            a.close();
          } catch (t) {}
        this._commToggleCallFilter(t, { type: "place", scope: "location", value: d });
      }),
      p.appendChild(h),
      o.appendChild(p));
    const u = n && Number.isFinite(n.x) && Number.isFinite(n.y) ? n : null;
    t._commFlowBubble = this._showBubble({
      target: e,
      content: o,
      clickPoint: u,
      closeOnTargetClick: !1,
      placement: "bottom",
      width: 300,
      maxWidth: "86vw",
      maxHeight: "60vh",
      className: "comm-flow-bubble-wrap",
    });
  },
  _commScrollAncestors(t) {
    const e = [];
    let a = t,
      n = 0;
    for (; a && n++ < 12;)
      if ((a.scrollTop && e.push({ el: a, top: a.scrollTop }), a.parentElement)) a = a.parentElement;
      else {
        const t = a.getRootNode && a.getRootNode();
        a = t && t.host ? t.host : null;
      }
    return e;
  },
  _commRefreshRecordsPanel(t) {
    if (!t) return;
    const e = t.querySelector('.comm-panel[data-panel="records"]');
    if (!e) return;
    const a = this._commScrollAncestors(e),
      n = window.scrollY || 0;
    if (t._commFlowBubble) {
      try {
        t._commFlowBubble.close();
      } catch (t) {}
      t._commFlowBubble = null;
    }
    this._commDisposeRings(e);
    const o = t._commConfig || {},
      i = this._commLoadAll(o),
      r = this._commBuildRecordsPanel(this._commActiveContext(t, o, i), t);
    (e.replaceWith(r),
      a.forEach(({ el: t, top: a }) => {
        const n = t === e ? r : t;
        n && n.isConnected && n.scrollTop !== a && (n.scrollTop = a);
      }),
      n && Math.abs((window.scrollY || 0) - n) > 1 && window.scrollTo(0, n));
  },
  _commCallView(t) {
    const e = this._commProp(t, ["通话流水清单", "通话明细"]);
    return {
      items: (Array.isArray(e) ? e.filter((t) => t && "object" == typeof t) : [])
        .slice()
        .sort((t, e) => String(e.call_time || "").localeCompare(String(t.call_time || ""))),
    };
  },
  _commPlacePalette: () => ["#1565c0", "#00695c", "#283593", "#2e7d32", "#6a1b9a", "#37474f", "#0277bd", "#827717"],
  _commCoord(t) {
    let e = null,
      a = null;
    if (Array.isArray(t) && t.length >= 2) ((e = Number(t[0])), (a = Number(t[1])));
    else {
      const n = String(null == t ? "" : t)
        .trim()
        .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
      if (!n) return null;
      ((e = Number(n[1])), (a = Number(n[2])));
    }
    return Number.isFinite(e) && Number.isFinite(a) ? (e < 1 || e > 180 || a < 1 || a > 90 ? null : [e, a]) : null;
  },
  _commPointInRing(t, e, a) {
    let n = !1;
    for (let o = 0, i = a.length - 1; o < a.length; i = o++) {
      const r = a[o][0],
        s = a[o][1],
        c = a[i][0],
        l = a[i][1];
      s > e != l > e && t < ((c - r) * (e - s)) / (l - s) + r && (n = !n);
    }
    return n;
  },
  _commPointInGeometry(t, e) {
    if (!t || !e) return !1;
    const [a, n] = t,
      o = "Polygon" === e.type ? [e.coordinates] : "MultiPolygon" === e.type ? e.coordinates : [];
    for (const t of o) if (t && t.length && this._commPointInRing(a, n, t[0])) return !0;
    return !1;
  },
  _commCitiesInProvince(t, e) {
    const a = this.constructor._commChinaGeo;
    if (!a || !Array.isArray(a.features) || !e) return [];
    const n = a.features.find((t) => t.properties && t.properties.name === e);
    return n && n.geometry ? ((t && t.cities) || []).filter((t) => this._commPointInGeometry(t.coord, n.geometry)) : [];
  },
  _commGeoGraph(t) {
    const e = new Map(),
      a = new Map();
    let n = 0;
    const o = (t, a, n) => {
      if (!t) return;
      let o = e.get(t);
      (o || ((o = { name: t, coord: null, count: 0, mine: 0, other: 0 }), e.set(t, o)),
        !o.coord && a && (o.coord = a),
        (o[n] += 1));
    };
    (t || []).forEach((t) => {
      const e = t || {},
        i = String(e.location || "").trim(),
        r = String(e.number_location || "").trim(),
        s = this._commCoord(e.location_coordinate),
        c = this._commCoord(e.number_location_coordinate);
      if ((((i && !s) || (r && !c)) && (n += 1), o(i, s, "mine"), o(r, c, "other"), !i || !r || i === r)) return;
      const l = "←" === this._commCallDirArrow(e.type),
        d = { from: l ? r : i, to: l ? i : r, fromCoord: l ? c : s, toCoord: l ? s : c, dir: l ? "in" : "out" };
      if (!d.fromCoord || !d.toCoord) return;
      const p = `${d.dir}|${d.from}→${d.to}`;
      let h = a.get(p);
      (h || ((h = { ...d, count: 0, seconds: 0, calls: [] }), a.set(p, h)),
        (h.count += 1),
        (h.seconds += this._commDurationSeconds(e.duration)),
        h.calls.push(e));
    });
    const i = Array.from(e.values()).filter((t) => !!t.coord);
    (i.forEach((t) => {
      t.count = t.mine + t.other;
    }),
      i.sort((t, e) => e.count - t.count || t.name.localeCompare(e.name, "zh")));
    const r = Array.from(a.values())
      .filter((t) => !(t.fromCoord[0] === t.toCoord[0] && t.fromCoord[1] === t.toCoord[1]))
      .sort((t, e) => e.count - t.count || e.seconds - t.seconds);
    return (
      r.forEach((t) => t.calls.sort((t, e) => String(e.call_time || "").localeCompare(String(t.call_time || "")))),
      { cities: i, flows: r, missing: n }
    );
  },
  _commLoadChinaMap(t) {
    const e = this.constructor;
    if (e._commChinaMapReady) return Promise.resolve();
    if (e._commChinaMapPromise) return e._commChinaMapPromise;
    const a = [
      "/local/pobaby_package/js/china.json",
      "/local/pobaby_package/js/china.geo.json",
      "https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/china.json",
    ];
    return (
      (e._commChinaMapPromise = (async () => {
        let n = null;
        for (const o of a)
          try {
            const a = await fetch(o, { cache: "force-cache" });
            if (!a.ok) throw new Error(`HTTP ${a.status}`);
            const n = JSON.parse((await a.text()).replace(/^\uFEFF/, ""));
            if (!n || !Array.isArray(n.features)) throw new Error("不是有效的 GeoJSON");
            return (t.registerMap("china", n), (e._commChinaGeo = n), void (e._commChinaMapReady = !0));
          } catch (t) {
            n = t;
          }
        throw ((e._commChinaMapPromise = null), n || new Error("中国地图数据加载失败"));
      })()),
      e._commChinaMapPromise
    );
  },
  _commPlaceToneMap(t) {
    const e = [],
      a = (t) => {
        const a = String(t || "").trim();
        a && -1 === e.indexOf(a) && e.push(a);
      };
    ((t || []).forEach((t) => {
      const e = t || {};
      (a(e.location), a(e.number_location));
    }),
      e.sort((t, e) => t.localeCompare(e, "zh")));
    const n = new Map();
    return (e.forEach((t, e) => n.set(t, e % 8)), n);
  },
  _commCallList(t, e, a) {
    const n = document.createElement("div");
    n.className = "comm-call-list";
    const o = this._commTodayKey();
    return (
      t.forEach((t) => {
        const i = String(t.call_time || "").slice(0, 10) === o,
          r = document.createElement("div");
        r.className = "comm-call-item" + (i ? " today" : "");
        const s = document.createElement("div");
        s.className = "comm-call-main";
        const c = String(t.type || "").trim(),
          l = document.createElement("span");
        ((l.className = "comm-call-type" + (/呼出|主叫|呼叫/.test(c) ? " out" : /接听|被叫/.test(c) ? " in" : "")),
          (l.textContent = c || "通话"),
          s.appendChild(l));
        const d = String(t.phone_number || "未知号码"),
          p = document.createElement("span");
        ((p.className = "comm-call-number"),
          (p.textContent = this._commPhoneText(d, a)),
          (p.title = d),
          s.appendChild(p));
        const h = document.createElement("span");
        ((h.className = "comm-call-duration"),
          (h.textContent = String(t.duration || "")),
          s.appendChild(h),
          r.appendChild(s));
        const u = document.createElement("div");
        u.className = "comm-call-meta";
        let m = !1;
        const f = this._commShortTime(t.call_time);
        if (f) {
          const t = document.createElement("span");
          ((t.className = "comm-call-meta-time"), (t.textContent = f), u.appendChild(t), (m = !0));
        }
        const g = String(t.call_type || "").trim();
        if (g) {
          const t = document.createElement("span");
          ((t.className = `comm-call-chip comm-call-chip-type comm-call-chip-${this._commCallTypeTone(g)}`),
            (t.textContent = g),
            (t.title = `通话类型：${g}`),
            u.appendChild(t),
            (m = !0));
        }
        const y = this._commCallPlaceParts(t);
        if (y.segments.length) {
          const t = document.createElement("span");
          t.className = "comm-call-chip comm-call-chip-place";
          const a = document.createElement("ha-icon");
          (a.setAttribute("icon", "mdi:map-marker-outline"),
            t.appendChild(a),
            y.segments.forEach((a, n) => {
              if (n > 0 && y.arrow) {
                const e = document.createElement("span");
                ((e.className = "comm-call-place-arrow"), (e.textContent = y.arrow), t.appendChild(e));
              }
              const o = e && e.has(a.text) ? e.get(a.text) : 0,
                i = document.createElement("span");
              ((i.className = `comm-place-ink-${o}`), (i.textContent = a.text), t.appendChild(i));
            }),
            (t.title = `地点：${y.segments.map((t) => t.text).join(y.arrow || "")}`),
            u.appendChild(t),
            (m = !0));
        }
        const b = String(t.fee || "").trim();
        if (b) {
          const t = document.createElement("span");
          ((t.className = "comm-call-meta-fee" + (/^0(\.0+)?\s*元?$/.test(b) ? "" : " charge")),
            (t.textContent = `费用 ${b}`),
            u.appendChild(t),
            (m = !0));
        }
        if ((m && r.appendChild(u), i)) {
          const t = document.createElement("span");
          ((t.className = "comm-call-today"), (t.textContent = "今日"), r.appendChild(t));
        }
        n.appendChild(r);
      }),
      n
    );
  },
  _commCallTypeTone(t) {
    const e = String(t || "");
    return /漫游/.test(e)
      ? "roaming"
      : /国际|境外|港澳台/.test(e)
        ? "international"
        : /视频/.test(e)
          ? "video"
          : "domestic";
  },
  _commShortTime(t) {
    const e = String(t || "").trim();
    if (!e) return "";
    const a = e.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return a ? `${a[2]}-${a[3]} ${a[4]}:${a[5]}` : e;
  },
  _commAccountView(t, e) {
    const a = (t && t.nodes) || {},
      n = (e && e.fields) || {},
      o = (t) => this._commFieldNode(a, t, n),
      i = (t, e) => this._commNum(this._commProp(t, e)),
      r = (t) => this._commNum(t && t.state),
      s = (...t) => {
        for (const e of t) if (null != e) return e;
        return null;
      },
      c = (t) => (null == t ? "" : String(t)),
      l = o("account_status"),
      d = o("balance"),
      p = o("charge"),
      h = o("flow_remain"),
      u = o("flow_used"),
      m = o("voice_remain"),
      f = o("voice_used"),
      k_lvl = o("member_level"),
      g = o("integral") || k_lvl,
      y = o("real_name"),
      b = o("phone_number"),
      x = o("speed_service"),
      v = o("location"),
      _ = o("last_update"),
      w = o("sms_remain"),
      C = (function (...t) {
        for (const e of t) if (null != e && "" !== e) return e;
        return null;
      })(this._commProp(l, ["是否欠费"]), this._commProp(d, ["是否欠费"])),
      k = null !== C && String(C).includes("是"),
      S = c(this._commProp(l, ["家庭融合"])),
      E = [];
    d &&
      (Object.keys(d).forEach((t) => {
        const e = t.match(/^历史\s*(\d{1,2})\s*月出账$/);
        if (!e) return;
        const a = this._commNum(d[t]);
        null !== a && E.push({ month: Number(e[1]), value: a });
      }),
      E.sort((t, e) => e.month - t.month));
    const T = E.reduce((t, e) => Math.max(t, e.value), 0) || 1;
    E.forEach((t) => {
      t.percent = Math.max(4, (t.value / T) * 100);
    });
    const $ = {
        value: s(i(d, ["当前可用话费", "当前话费", "可用余额"]), i(l, ["当前话费"]), r(d)),
        general: i(d, ["包含通用余额", "通用余额"]),
        special: i(d, ["包含专用余额", "专用余额"]),
        monthUsed: s(i(d, ["本月已消费"]), r(p)),
        lastMonth: s(i(d, ["上月出账费用", "上月出账"]), i(p, ["上月出账费用", "上月出账"])),
        owedAmount: s(i(d, ["欠费金额"]), i(l, ["欠费金额"])),
        history: E,
      },
      A = s(i(h, ["本月剩余流量", "剩余流量"]), r(h)),
      D = s(i(h, ["本月已用流量", "已用流量"]), r(u)),
      L = i(h, ["套餐流量总额", "流量总额"]);
    let N = i(h, ["剩余流量占比"]);
    null === N && null !== A && L && (N = (A / L) * 100);
    const M = this._commUnitOf(h) || "GB",
      I = {
        remain: A,
        used: D,
        total: L,
        percent: null === N ? 0 : Math.max(0, Math.min(100, N)),
        unit: M,
        members: this._commMembersFromNode(h),
        packs: this._commPacksFromNode(h),
        poolType: c(this._commProp(h, ["流量池类型"])),
      },
      z = s(i(m, ["本月剩余时长", "剩余时长", "剩余分钟"]), r(m)),
      P = s(i(f, ["总已用分钟", "本月已用时长", "已用分钟"]), i(m, ["本月已用时长"]), r(f)),
      R = s(i(m, ["套餐通话总额", "通话总额"]), i(f, ["套餐通话总额", "通话总额"]));
    let H = i(m, ["本月剩余占比", "剩余占比"]);
    null === H && null !== z && R && (H = (z / R) * 100);
    const F = this._commUnitOf(m) || this._commUnitOf(f) || "分钟",
      q = {
        remain: z,
        used: P,
        total: R,
        percent: null === H ? 0 : Math.max(0, Math.min(100, H)),
        unit: F,
        members: this._commMembersFromNode(f),
        packs: this._commPacksFromNode(m),
        scope: c(this._commProp(f, ["通话范围"])),
      },
      O = {
        value: s(i(g, ["可用积分", "积分"]), i(k_lvl, ["可用积分", "积分"]), r(g)),
        unit: this._commUnitOf(g) || this._commUnitOf(k_lvl) || "分",
        system: c(this._commProp(g, ["积分体系"]) || this._commProp(k_lvl, ["积分体系"])),
        privilege: c(this._commProp(g, ["兑换特权"]) || this._commProp(k_lvl, ["兑换特权"])),
      },
      B = {
        name: c((y && y.state) || this._commProp(y, ["机主姓名"])),
        realNameStatus: c(this._commProp(y, ["实名认证状态"])),
        netAge: c(this._commProp(y, ["入网网龄"])),
        star: c(this._commProp(k_lvl, ["用户星级"]) || this._commProp(y, ["用户星级"])),
        memberLevel: c(
          (k_lvl && k_lvl.state) || this._commProp(k_lvl, ["会员等级"]) || this._commProp(y, ["会员等级"]),
        ),
        credit: c(this._commProp(k_lvl, ["信用额度"]) || this._commProp(y, ["信用额度"])),
        network: c(this._commProp(y, ["所属网络"])),
        landline: c(this._commProp(y, ["名下固话号码"])),
      },
      j = {
        role: c(this._commProp(b, ["卡槽角色"])),
        mainPlan: c(this._commProp(b, ["主套餐名称"]) || (x && x.state)),
        broadband: c(this._commProp(b, ["名下宽带"])),
        subs: c(this._commProp(b, ["名下副卡"])),
        province: c(this._commProp(b, ["归属省市"])),
      },
      U = {
        fullName: c((x && x.state) || this._commProp(x, ["套餐全称"])),
        fuseType: c(this._commProp(x, ["融合类型"])),
        network: c(this._commProp(x, ["网络制式"])),
        broadband: c(this._commProp(x, ["融合宽带"])),
        subs: c(this._commProp(x, ["融合副卡"])),
      },
      W = {
        province: c((v && v.state) || this._commProp(v, ["所属省市"])),
        network: c(this._commProp(v, ["网络类型"])),
      },
      Y = {
        time: c(_ && _.state),
        interval: c(this._commProp(_, ["轮询间隔"])),
        credential: c(this._commProp(_, ["凭证状态"])),
      },
      V = s(i(w, ["剩余短信"]), r(w));
    return {
      entityId: t.entityId,
      carrier: t.carrier || c(this._commPropAny(a, "运营商")),
      phone: t.phone || "",
      statusText: c(l && l.state),
      owed: k,
      fused: S.includes("已生效"),
      balance: $,
      flow: I,
      voice: q,
      integral: O,
      identity: B,
      sim: j,
      pkg: U,
      location: W,
      update: Y,
      sms: V,
      limitPrompt:
        c(this._commProp(l, ["出账状态", "出账期提示"])) ||
        c(this._commProp(d, ["出账状态", "出账期提示"])) ||
        c(this._commPropAny(a, ["出账状态", "出账期提示", "limit_period_prompt"])),
    };
  },
  _commEmpty(t) {
    const e = document.createElement("div");
    e.className = "comm-empty";
    const a = document.createElement("ha-icon");
    (a.setAttribute("icon", "mdi:information-outline"), e.appendChild(a));
    const n = document.createElement("div");
    return ((n.textContent = t), e.appendChild(n), e);
  },
  _commSection(t, e) {
    const a = document.createElement("div");
    a.className = "comm-section";
    const n = document.createElement("div");
    if (((n.className = "comm-section-title"), e)) {
      const t = document.createElement("ha-icon");
      (t.setAttribute("icon", e), n.appendChild(t));
    }
    const o = document.createElement("span");
    ((o.textContent = t), n.appendChild(o), a.appendChild(n));
    const i = document.createElement("div");
    return ((i.className = "comm-section-body"), a.appendChild(i), { section: a, body: i, head: n });
  },
  _commKVGrid(t) {
    const e = document.createElement("div");
    return (
      (e.className = "comm-kv-grid"),
      (t || []).forEach((t) => {
        if (!t) return;
        const a = t[0],
          n = t[1];
        null != n && "" !== n && "object" != typeof n && e.appendChild(this._commKV(a, n));
      }),
      e
    );
  },
  _commKV(t, e) {
    const a = document.createElement("div");
    a.className = "comm-kv";
    const n = document.createElement("div");
    ((n.className = "comm-kv-label"), (n.textContent = t));
    const o = document.createElement("div");
    return ((o.className = "comm-kv-value"), (o.textContent = String(e)), a.appendChild(n), a.appendChild(o), a);
  },
  _commAuthConfig(t) {
    const e = (t && t.config) || {},
      a = (t && t.account && t.account.auth) || {},
      n = {
        button: a.button || e.button || "",
        code: a.code || e.code || "",
        date: a.date || e.date || "",
        update_region: a.update_region || e.update_region || "",
        daily_reset: a.daily_reset || e.daily_reset || "",
        auto_login: a.auto_login || e.auto_login || "",
        auto_region_update: a.auto_region_update || e.auto_region_update || "",
        auto_query: a.auto_query || e.auto_query || "",
        auto_query_time: a.auto_query_time || e.auto_query_time || "",
      };
    return Object.keys(n).some((k) => n[k]) ? n : null;
  },
  _commOpenInfoBubble(t, e, a, n) {
    if (!t || !e) return null;
    const o = "pkg" === n ? "_commPkgBubble" : "fee" === n ? "_commFeeBubble" : "_commSimBubble";
    if (a[o]) {
      const t = a[o];
      a[o] = null;
      try {
        t.close();
      } catch (t) {}
    }
    const i = document.createElement("div");
    i.className = "comm-info-bubble";
    const r = (t) => {
      i.textContent = "";
      const e = this._commAccountView(t.data, t.config),
        o =
          "pkg" === n
            ? this._commBuildPkgSection(e)
            : "fee" === n
              ? this._commBuildFeeSection(e)
              : this._commBuildSimSection(e, a);
      i.appendChild(o);
    };
    r(e);
    const { bubble: s, close: c } = this._showBubble({
      target: t,
      content: i,
      placement: "bottom",
      width: 330,
      maxWidth: "92vw",
      maxHeight: "70vh",
      className: "comm-info-bubble-wrap",
      animation: "spring",
      closeOnClickAway: !0,
      onClose: () => {
        a[o] && a[o].bubble === s && (a[o] = null);
      },
    });
    return ((a[o] = { bubble: s, close: c, render: r }), c);
  },
  _commBuildFeeSection(t) {
    const e = this._commSection("话费", "mdi:cash-multiple");
    if (
      (e.section.classList.add("comm-section-in-bubble"),
      e.body.appendChild(
        this._commKVGrid([
          ["当前可用话费", this._commMoney(t.balance.value)],
          ["本月已消费", this._commMoney(t.balance.monthUsed)],
          ["包含通用余额", this._commMoney(t.balance.general)],
          ["包含专用余额", this._commMoney(t.balance.special)],
          ["上月出账", this._commMoney(t.balance.lastMonth)],
          ["欠费金额", this._commMoney(t.balance.owedAmount)],
        ]),
      ),
      t.balance.history.length)
    ) {
      const a = document.createElement("div");
      ((a.className = "comm-months"),
        t.balance.history.forEach((t) => a.appendChild(this._commMonthBar(t))),
        e.body.appendChild(a));
    }
    return e.section;
  },
  _commBuildSimSection(t, e) {
    const a = this._commSection("主卡信息", "mdi:account-badge");
    return (
      a.section.classList.add("comm-section-in-bubble"),
      a.body.appendChild(
        this._commKVGrid([
          ["机主姓名", t.identity.name],
          ["用户星级", t.identity.star || t.identity.memberLevel],
          ["网龄", t.identity.netAge],
          ["信用额度", t.identity.credit],
          ["网络", t.identity.network],
          ["归属地", t.location.province],
          ["卡槽角色", t.sim.role],
          ["主套餐", t.sim.mainPlan],
          ["名下宽带", t.sim.broadband],
          ["名下副卡", t.sim.subs],
          ["名下固话", this._commPhoneText(t.identity.landline, e)],
          ["实名认证", t.identity.realNameStatus],
        ]),
      ),
      a.section
    );
  },
  _commBuildPkgSection(t) {
    const e = this._commSection("套餐与权益", "mdi:package-variant-closed");
    if (
      (e.section.classList.add("comm-section-in-bubble"),
      e.body.appendChild(
        this._commKVGrid([
          ["套餐全称", t.pkg.fullName],
          ["融合类型", t.pkg.fuseType],
          ["网络制式", t.pkg.network],
          ["融合宽带", t.pkg.broadband],
          ["融合副卡", t.pkg.subs],
          ["积分", null !== t.integral.value ? `${this._commFmtNum(t.integral.value)} ${t.integral.unit}` : ""],
          ["积分体系", t.integral.system],
          ["剩余短信", null !== t.sms ? `${this._commFmtNum(t.sms)} 条` : ""],
        ]),
      ),
      t.integral.privilege)
    ) {
      const a = document.createElement("div");
      ((a.className = "comm-tip"), (a.textContent = t.integral.privilege), e.body.appendChild(a));
    }
    return e.section;
  },
  _commOpenAuthBubble(t, e, a) {
    if (!t || !e) return null;
    if (a._commAuthBubble) {
      const t = a._commAuthBubble;
      a._commAuthBubble = null;
      try {
        t.close();
      } catch (t) {}
    }
    const n = document.createElement("div");
    n.className = "comm-auth-bubble";
    const o = (t) => {
      n.textContent = "";
      const e = this._commAuthSection(t.config, a, t.account, t.data, { inBubble: !0 });
      e && n.appendChild(e);
    };
    o(e);
    const { bubble: i, close: r } = this._showBubble({
      target: t,
      content: n,
      placement: "bottom",
      width: 330,
      maxWidth: "92vw",
      maxHeight: "70vh",
      className: "comm-auth-bubble-wrap",
      animation: "spring",
      closeOnClickAway: !0,
      onClose: () => {
        a._commAuthBubble && a._commAuthBubble.bubble === i && (a._commAuthBubble = null);
      },
    });
    return ((a._commAuthBubble = { bubble: i, close: r, render: o }), r);
  },
  _commCallService(t, e, a, n) {
    const o = e || {},
      i = { service: t, service_data: o, entity: a || o.entity_id || "" };
    if ("function" == typeof this.handleCallServiceAction)
      return void this.handleCallServiceAction(i, n || null, this._commConfig || {});
    const [r, s] = String(t || "").split(".");
    r && s && this.hass && this.hass.callService && this.hass.callService(r, s, o);
  },
  _commEntityDomain(t) {
    const e = String(t || ""),
      a = e.indexOf(".");
    return a > 0 ? e.slice(0, a) : "";
  },
  _commSettingControl(t, e, a, n = {}) {
    const o = this._commEntityDomain(t);
    return "button" === o || "input_button" === o
      ? this._commActionButton(t, e, a, { inRow: !0 })
      : "time" === o || (!o && "time" === n.type)
        ? this._commTimeControl(t, e, a)
        : this._commSwitchControl(t, e, a);
  },
  _commActionButton(t, e, a, n = {}) {
    const o = "input_button" === this._commEntityDomain(t) ? "input_button.press" : "button.press",
      i = document.createElement("button");
    if (((i.type = "button"), (i.className = "comm-set-action" + (n.inRow ? " comm-set-action-inline" : "")), n.icon)) {
      const t = document.createElement("ha-icon");
      (t.setAttribute("icon", n.icon), i.appendChild(t));
    }
    const r = document.createElement("span");
    ((r.textContent = e), i.appendChild(r));
    const s = this.hass && this.hass.states ? this.hass.states[t] : null;
    return (
      (i.disabled = !s),
      (i.title = n.title || (s ? `${e}：点击立即执行` : `${e}：实体不存在（${t}）`)),
      i.addEventListener("click", (n) => {
        (n.stopPropagation(),
          i.disabled ||
            (this._commCallService(o, { entity_id: t }, t, i),
            this._showToast(`已触发「${e}」`, "success"),
            this._commScheduleAuthRefresh(a)));
      }),
      i
    );
  },
  _commTimeControl(t, e, a) {
    const n = document.createElement("input");
    ((n.className = "comm-set-time"), n.setAttribute("type", "time"));
    const o = this.hass && this.hass.states ? this.hass.states[t] : null,
      i = String((o && o.state) || "").match(/^(\d{1,2}):(\d{2})/);
    return (
      (n.value = i ? `${i[1].padStart(2, "0")}:${i[2]}` : ""),
      (n.disabled = !o),
      (n.title = o ? `${e}：${n.value || "未设置"}` : `${e}：实体不存在（${t}）`),
      n.addEventListener("change", () => {
        /^\d{2}:\d{2}$/.test(n.value) &&
          (this._commCallService("time.set_value", { entity_id: t, time: n.value }, t, n),
          this._showToast(`「${e}」已设为 ${n.value}`, "success"),
          this._commScheduleAuthRefresh(a));
      }),
      n
    );
  },
  _commSwitchControl(t, e, a) {
    const n = this.hass && this.hass.states ? this.hass.states[t] : null,
      o = !!n && "on" === String(n.state),
      i = this._commEntityDomain(t) || "switch",
      r = document.createElement("button");
    ((r.type = "button"),
      (r.className = "comm-switch" + (o ? " on" : "")),
      r.setAttribute("role", "switch"),
      r.setAttribute("aria-checked", o ? "true" : "false"),
      r.setAttribute("aria-label", e),
      (r.disabled = !n),
      (r.title = n
        ? `${e}：当前${o ? "已开启" : "已关闭"}（点击${o ? "关闭" : "开启"}）`
        : `${e}：实体不存在（${t}）`));
    const s = document.createElement("span");
    return (
      (s.className = "comm-switch-knob"),
      r.appendChild(s),
      r.addEventListener("click", (n) => {
        (n.stopPropagation(),
          r.disabled ||
            (this._commCallService(`${i}.${o ? "turn_off" : "turn_on"}`, { entity_id: t }, t, r),
            this._showToast(`${e}已${o ? "关闭" : "开启"}`, "success"),
            this._commScheduleAuthRefresh(a)));
      }),
      r
    );
  },
  _commAuthSection(t, e, a, n, o = {}) {
    const i = this._commAuthConfig({ config: t, account: a, data: n });
    if (!i) return null;
    const isUnicom = /联通|unicom/i.test((n && n.carrier) || (a && a.carrier) || "");
    const r = i.button,
      s = i.code,
      c = i.date,
      l = document.createElement("div");
    l.className = "comm-auth" + (o.inBubble ? " comm-auth-in-bubble" : "");
    const d = document.createElement("div");
    d.className = "comm-auth-title";
    const p = document.createElement("ha-icon");
    (p.setAttribute("icon", isUnicom ? "mdi:cog-outline" : "mdi:shield-key-outline"), d.appendChild(p));
    const h = document.createElement("span");
    ((h.textContent = isUnicom ? "详单与自动化设置" : "详单认证"), d.appendChild(h));
    const u = o.inBubble || isUnicom ? null : this._commAuthStatus(r, n);
    if (u && u.text) {
      const t = document.createElement("span");
      ((t.className = "comm-auth-status" + ("danger" === u.tone ? " danger" : "ok" === u.tone ? " ok" : "")),
        (t.textContent = u.text),
        d.appendChild(t));
    }
    l.appendChild(d);
    const m = document.createElement("div");
    m.className = "comm-auth-body";
    const f = e._commAuthDraft || (e._commAuthDraft = {}),
      g = r && this.hass && this.hass.states ? this.hass.states[r] : null,
      y = (g && g.attributes) || {},
      b = String(y["验证码状态"] || "").includes("已填写");
    if (r && !isUnicom) {
      const t = document.createElement("button");
      ((t.type = "button"), (t.className = "comm-auth-action" + (b ? " ready" : "")));
      const a = document.createElement("ha-icon");
      (a.setAttribute("icon", b ? "mdi:shield-check-outline" : "mdi:message-alert-outline"), t.appendChild(a));
      const n = document.createElement("span");
      if (
        ((n.textContent = b ? "提交认证并拉取流水" : "获取验证码 / 刷新流水"),
        t.appendChild(n),
        t.addEventListener("click", (a) => {
          (a.stopPropagation(),
            this._commCallService("button.press", { entity_id: r }, r, t),
            this._showToast(b ? "已提交认证" : "已触发二次认证", "success"),
            this._commScheduleAuthRefresh(e));
        }),
        m.appendChild(t),
        !b)
      ) {
        const t = document.createElement("div");
        ((t.className = "comm-auth-action-cap"),
          (t.textContent = "按下后下发短信验证码，180 秒内填入下方会自动提交"),
          m.appendChild(t));
      }
    } else if (isUnicom) {
      const t = document.createElement("button");
      ((t.type = "button"), (t.className = "comm-auth-action ready"));
      const btnIcon = document.createElement("ha-icon");
      (btnIcon.setAttribute("icon", "mdi:refresh"), t.appendChild(btnIcon));
      const btnSpan = document.createElement("span");
      ((btnSpan.textContent = "刷新详单流水"), t.appendChild(btnSpan));
      t.addEventListener("click", (ev) => {
        (ev.stopPropagation(),
          this._commCallService("button.press", { entity_id: r }, r, t),
          this._showToast("已请求刷新详单流水", "success"),
          this._commScheduleAuthRefresh(e));
      });
      m.appendChild(t);
    }
    const x = document.createElement("div");
    if (((x.className = "comm-auth-fields"), s && !isUnicom)) {
      const t = document.createElement("div");
      t.className = "comm-auth-field";
      const a = document.createElement("div");
      ((a.className = "comm-auth-field-label"), (a.textContent = "短信验证码"));
      const n = document.createElement("div");
      n.className = "comm-auth-control";
      const o = document.createElement("input");
      ((o.className = "comm-auth-input comm-auth-code-input"),
        o.setAttribute("type", "text"),
        o.setAttribute("inputmode", "numeric"),
        o.setAttribute("autocomplete", "one-time-code"),
        (o.placeholder = "输入后点写入"),
        (o.value = f[s] || ""));
      const i = () => {
        const t = String(o.value || "").trim();
        t
          ? (this._commCallService("text.set_value", { entity_id: s, value: t }, s, o),
            delete f[s],
            this._showToast("验证码已写入", "success"),
            this._commScheduleAuthRefresh(e))
          : this._showToast("请先填写验证码", "warning");
      };
      (o.addEventListener("input", () => {
        f[s] = o.value;
      }),
        o.addEventListener("keydown", (t) => {
          "Enter" === t.key && (t.preventDefault(), i());
        }));
      const r = document.createElement("button");
      ((r.type = "button"),
        (r.className = "comm-auth-op"),
        (r.textContent = "写入"),
        r.addEventListener("click", (t) => {
          (t.stopPropagation(), i());
        }),
        n.appendChild(o),
        n.appendChild(r),
        t.appendChild(a),
        t.appendChild(n),
        x.appendChild(t));
    }
    if (c) {
      const t = document.createElement("div");
      t.className = "comm-auth-field";
      const a = document.createElement("div");
      ((a.className = "comm-auth-field-label"), (a.textContent = "查询起始日"));
      const n = document.createElement("div");
      n.className = "comm-auth-control";
      const o = document.createElement("input");
      ((o.className = "comm-auth-input comm-auth-date-input"), o.setAttribute("type", "date"));
      const i = this.hass && this.hass.states ? this.hass.states[c] : null,
        r = i && /^\d{4}-\d{2}-\d{2}$/.test(String(i.state)) ? String(i.state) : "";
      ((o.value = f[c] || r),
        o.addEventListener("input", () => {
          f[c] = o.value;
        }),
        o.addEventListener("change", () => {
          const t = o.value;
          /^\d{4}-\d{2}-\d{2}$/.test(t) &&
            (delete f[c],
            this._commCallService("date.set_value", { entity_id: c, date: t }, c, o),
            this._showToast(`查询起始日期已更新：${t}`, "success"),
            this._commScheduleAuthRefresh(e));
        }),
        n.appendChild(o),
        t.appendChild(a),
        t.appendChild(n),
        x.appendChild(t));
    }
    x.childElementCount && m.appendChild(x);
    const v = [
      { key: "auto_query", label: "自动获取通话记录" },
      { key: "auto_query_time", label: "自动获取通话记录时间", type: "time" },
      { key: "auto_login", label: "自动短信登录" },
      { key: "auto_region_update", label: "自动更新号码归属地库" },
      { key: "daily_reset", label: "每日重置查询起始日期" },
    ].filter((t) => i[t.key] && (!isUnicom || t.key !== "auto_login"));
    if (v.length || i.update_region) {
      const t = document.createElement("div");
      t.className = "comm-set";
      const a = document.createElement("div");
      a.className = "comm-set-title";
      const n = document.createElement("ha-icon");
      (n.setAttribute("icon", "mdi:tune-variant"), a.appendChild(n));
      const o = document.createElement("span");
      ((o.textContent = "自动化设置"), a.appendChild(o), t.appendChild(a));
      const r = document.createElement("div");
      ((r.className = "comm-set-list"),
        v.forEach((t) => {
          const a = i[t.key],
            n = document.createElement("div");
          n.className = "comm-set-row";
          const o = document.createElement("div");
          ((o.className = "comm-set-name"),
            (o.textContent = t.label),
            n.appendChild(o),
            n.appendChild(this._commSettingControl(a, t.label, e, { type: t.type })),
            r.appendChild(n));
        }),
        t.appendChild(r),
        i.update_region &&
          t.appendChild(
            this._commActionButton(i.update_region, "更新号码归属地库", e, {
              icon: "mdi:map-marker-sync-outline",
              title: "立即按详单重新解析各号码的归属地",
            }),
          ),
        m.appendChild(t));
    }
    if (s && !isUnicom) {
      const t = document.createElement("div");
      t.className = "comm-tip comm-auth-note";
      const e = document.createElement("ha-icon");
      (e.setAttribute("icon", "mdi:information-outline"), t.appendChild(e));
      const a = document.createElement("span");
      ((a.textContent = "已配置「验证码自动填写」时无需手动输入：按下上方按钮后，短信一到即由集成自动提交认证。"),
        t.appendChild(a),
        m.appendChild(t));
    }
    const _ = [],
      w = (t) => {
        const e = String(null == t ? "" : t).trim();
        e && -1 === _.indexOf(e) && _.push(e);
      },
      C = r && this.hass && this.hass.states ? this.hass.states[r] : null,
      k = (C && C.attributes) || {},
      S = s && this.hass && this.hass.states ? this.hass.states[s] : null,
      E = (S && S.attributes) || {},
      T = this._commAuthStatus(r, n);
    if (!isUnicom) {
      (T.raw
        ? w(T.raw)
        : null !== T.remain && w(T.remain > 0 ? `授权剩余 ${this._commFmtNum(T.remain)} 分钟` : "授权已过期"),
        w(k["自动提交等待中"]),
        w(E["自动提交等待中"]));
      const $ = String(k["最近执行结果"] || "");
      /失败|错误|未填写|缺少|无效|作废/.test($) && w($);
      r && !s && w("未配置验证码实体：按下按钮只能刷新流水，无法提交验证码");
    }
    if (_.length) {
      const t = document.createElement("div");
      ((t.className = "comm-auth-hints"),
        _.forEach((e) => {
          const a = document.createElement("div");
          ((a.className = "comm-auth-hint"), (a.textContent = e), t.appendChild(a));
        }),
        m.appendChild(t));
    }
    return (l.appendChild(m), l);
  },
  _commAuthStatus(t, e) {
    const a = e && e.nodes ? this._commFieldNode(e.nodes, "call_record", null) : null,
      n = t && this.hass && this.hass.states ? this.hass.states[t] : null,
      o = (n && n.attributes) || {};
    let i = a ? String(this._commProp(a, ["详单授权状态"]) || "") : "";
    i || (i = String(o["详单授权状态"] || ""));
    let r = a ? this._commProp(a, ["授权剩余有效时长"]) : void 0;
    (null != r && "" !== r) || (r = o["授权剩余有效时长"]);
    const s = this._commNum(r);
    return null !== s || i
      ? (null !== s && s <= 0) || /过期|失效|未认证|无效/.test(i)
        ? { text: "已过期", tone: "danger", remain: s, raw: i }
        : null !== s
          ? { text: `剩余 ${this._commFmtNum(s)} 分钟`, tone: "ok", remain: s, raw: i }
          : { text: "有效", tone: "ok", remain: null, raw: i }
      : { text: "", tone: "neutral", remain: null, raw: "" };
  },
  _commScheduleAuthRefresh(t) {
    t &&
      this._timers.setTimeout(() => {
        t.isConnected && this.updateCommCard(t, t._commConfig || {});
      }, 3e3);
  },
  _commShortPlanName(t) {
    const e = String(t || "").trim();
    return e ? e.replace(/套餐.*$/, "").trim() || e : "";
  },
  _commMaskPhone(t) {
    const e = String(t || "").trim();
    if (!e) return "";
    if (!/^[\d\s\-+]+$/.test(e)) return e;
    const a = e.replace(/\s/g, "");
    return a.length <= 4
      ? e
      : a.length <= 7
        ? `${a[0]}${"*".repeat(a.length - 3)}${a.slice(-2)}`
        : `${a.slice(0, 3)}${"*".repeat(Math.max(1, a.length - 7))}${a.slice(-4)}`;
  },
  _commPhoneText(t, e) {
    const a = String(t || "");
    return a ? (e && !1 === e._commPhoneMasked ? a : this._commMaskPhone(a)) : "";
  },
  _commPhoneToggle(t) {
    const e = !1 !== t._commPhoneMasked,
      a = document.createElement("button");
    ((a.type = "button"), (a.className = "comm-phone-toggle" + (e ? " active" : "")));
    const n = document.createElement("ha-icon");
    (n.setAttribute("icon", e ? "mdi:eye-off-outline" : "mdi:eye-outline"), a.appendChild(n));
    const o = document.createElement("span");
    return (
      (o.textContent = e ? "号码已隐藏" : "号码已显示"),
      a.appendChild(o),
      (a.title = e ? "点击显示完整号码（影响本页所有号码）" : "点击隐藏号码中间位（影响本页所有号码）"),
      a.addEventListener("click", (a) => {
        (a.stopPropagation(), (t._commPhoneMasked = !e), (t._commPhoneRevealed = !1));
        const n = t._commConfig || {};
        this._commRebuildPanels(t, n, this._commLoadAll(n));
      }),
      a
    );
  },
  _commCarrierClass(t) {
    const e = String(t || "").toLowerCase();
    return e.includes("联通") || e.includes("网通") || e.includes("联合网络通信") || e.includes("unicom")
      ? "unicom"
      : e.includes("移动") || e.includes("mobile")
        ? "mobile"
        : "";
  },
  _commLimitBanner(t) {
    const e = document.createElement("div");
    e.className = "comm-limit-banner";
    e.style.cssText =
      "background:linear-gradient(90deg, #fff3e0, #ffe0b2);color:#e65100;border:1px solid #ffcc80;border-radius:10px;padding:8px 12px;margin:4px 10px 8px;font-size:12px;display:flex;align-items:center;gap:8px;font-weight:500;box-shadow:0 1px 3px rgba(230,81,0,0.08);line-height:1.4;";
    const a = document.createElement("ha-icon");
    a.setAttribute("icon", "mdi:clock-alert-outline");
    a.style.cssText = "--mdc-icon-size:18px;color:#f57c00;flex:none;";
    e.appendChild(a);
    const n = document.createElement("span");
    n.textContent = t;
    e.appendChild(n);
    return e;
  },
  _commHero(t, e, a) {
    const n = e || {},
      o = document.createElement("div"),
      i = this._commCarrierClass(t.carrier);
    o.className = "comm-hero" + (i ? ` ${i}` : "");
    const r = document.createElement("div");
    r.className = "comm-hero-main";
    const s = document.createElement("div");
    ((s.className = "comm-hero-carrier"), (s.textContent = t.carrier || "通讯账户"), r.appendChild(s));
    const c = t.phone || "",
      l = document.createElement("div");
    l.className = "comm-hero-phone";
    const d = document.createElement("span");
    ((d.className = "comm-hero-phone-text"), l.appendChild(d));
    const p = !1 !== n._commPhoneMasked,
      h = () => {
        const t = !p || !!n._commPhoneRevealed;
        ((d.textContent = c ? (t ? c : this._commMaskPhone(c)) : "—"),
          l.classList.toggle("revealed", t && !!c),
          (l.title = c
            ? p
              ? n._commPhoneRevealed
                ? "点击隐藏号码"
                : "点击显示完整号码"
              : "已在「本月通话」标题栏统一切换为显示完整号码"
            : ""));
      };
    let u = null;
    (c &&
      p &&
      ((u = document.createElement("ha-icon")),
      (u.className = "comm-hero-phone-eye"),
      l.appendChild(u),
      l.addEventListener("click", (t) => {
        (t.stopPropagation(), (n._commPhoneRevealed = !n._commPhoneRevealed), h());
      })),
      u && u.setAttribute("icon", n._commPhoneRevealed ? "mdi:eye-off-outline" : "mdi:eye-outline"),
      h(),
      r.appendChild(l));
    const m = document.createElement("div");
    m.className = "comm-hero-tags";
    const f = (t, e, a = {}) => {
      if (!t) return;
      const n = document.createElement("span");
      if (
        ((n.className = "comm-tag" + (a.cls ? " " + a.cls : "") + (a.onClick ? " comm-tag-action" : "")),
        a.title && (n.title = a.title),
        e)
      ) {
        const t = document.createElement("ha-icon");
        (t.setAttribute("icon", e), n.appendChild(t));
      }
      const o = document.createElement("span");
      if (((o.className = "comm-tag-text"), (o.textContent = t), n.appendChild(o), a.onClick)) {
        const t = document.createElement("ha-icon");
        (t.setAttribute("icon", "mdi:chevron-down"),
          n.appendChild(t),
          n.addEventListener("click", (t) => {
            (t.stopPropagation(), a.onClick(n));
          }));
      }
      m.appendChild(n);
    };
    (f(t.statusText, t.owed ? "mdi:alert-circle-outline" : "mdi:check-circle-outline", {
      cls: t.owed ? "danger" : "ok",
      title: "点击查看话费明细",
      onClick: (t) => this._commOpenInfoBubble(t, a, n, "fee"),
    }),
      f("主卡", "mdi:account-badge", {
        title: "点击查看主卡信息" + (t.sim.role ? `（${t.sim.role}）` : ""),
        onClick: (t) => this._commOpenInfoBubble(t, a, n, "sim"),
      }),
      f(this._commShortPlanName(t.pkg.fullName) || "套餐与权益", "mdi:package-variant-closed", {
        title: "点击查看套餐与权益" + (t.pkg.fullName ? `（${t.pkg.fullName}）` : ""),
        onClick: (t) => this._commOpenInfoBubble(t, a, n, "pkg"),
      }));
    const g = this._commAuthConfig(a);
    if (g) {
      const isUnicom = /联通|unicom/i.test((a && a.data && a.data.carrier) || (t && t.carrier) || "");
      const status = this._commAuthStatus(g.button, a && a.data);
      const tagText = isUnicom ? "详单设置" : status.text || "详单认证";
      const tagIcon = isUnicom ? "mdi:cog-outline" : "mdi:shield-key-outline";
      const tagTitle = isUnicom
        ? "详单与自动化设置"
        : "详单认证：验证码 / 起始日期 / 二次认证" + (status.raw ? `（${status.raw}）` : "");
      f(tagText, tagIcon, {
        cls: [isUnicom ? "ok" : "danger" === status.tone ? "danger" : "ok" === status.tone ? "ok" : "", "comm-tag-auth"]
          .filter(Boolean)
          .join(" "),
        title: tagTitle,
        onClick: (t) => this._commOpenAuthBubble(t, a, n),
      });
    }
    o.appendChild(r);
    const y = document.createElement("div");
    return (
      (y.className = "comm-hero-metrics"),
      y.appendChild(
        this._commMetric("话费余额", t.balance.value, "元", {
          cls: t.owed ? "comm-metric-danger" : "comm-metric-balance",
        }),
      ),
      y.appendChild(this._commMetric("剩余流量", t.flow.remain, t.flow.unit || "GB", { cls: "comm-metric-flow" })),
      y.appendChild(this._commMetric("积分", t.integral.value, t.integral.unit || "分", { cls: "comm-metric-points" })),
      o.appendChild(y),
      m.childNodes.length && o.appendChild(m),
      o
    );
  },
  _commMetric(t, e, a, n = {}) {
    const o = document.createElement("div");
    o.className = "comm-metric" + (n.cls ? " " + n.cls : "");
    const i = document.createElement("div");
    i.className = "comm-metric-value";
    const r = !(null == e || "" === e);
    if (((i.textContent = r ? this._commFmtNum(e) : "—"), r && a)) {
      const t = document.createElement("span");
      ((t.className = "comm-metric-unit"), (t.textContent = a), i.appendChild(t));
    }
    o.appendChild(i);
    const s = document.createElement("div");
    return ((s.className = "comm-metric-label"), (s.textContent = t), o.appendChild(s), o);
  },
  _commDuoRing(t) {
    const e = document.createElement("div");
    e.className = "comm-duo";
    const a = t.unit || "",
      n = (t.members || []).filter((t) => (Number(t.value) || 0) > 0),
      o = n.reduce((t, e) => t + (Number(e.value) || 0), 0),
      i = document.createElement("div");
    if (((i.className = "comm-duo-main"), n.length)) {
      const r = this._commMemberPalette,
        s = null === t.used || void 0 === t.used ? o : Number(t.used),
        c = null === t.remain || void 0 === t.remain ? null : Number(t.remain),
        l = null === t.total || void 0 === t.total ? null : Number(t.total),
        d = null === t.percent || void 0 === t.percent ? null : Number(t.percent),
        p = null !== c && c > 0,
        h = p && l ? l : o,
        u = n.map((t, e) => {
          const a = Number(t.value) || 0;
          return { name: t.name, value: a, color: r[e % r.length], percent: h > 0 ? (a / h) * 100 : 0 };
        });
      (p && u.push({ name: "剩余", value: c, color: this._commRemainColor, percent: h > 0 ? (c / h) * 100 : 0 }),
        e.appendChild(
          this._commRing({
            mode: "share",
            segments: u,
            center: this._commRingNum(null === c ? s : c),
            centerUnit: a,
            caption: null === d ? (null === c ? "已用" : "剩余") : `剩余 ${Math.round(d)}%`,
            percentText: "",
          }),
        ),
        null !== l &&
          i.appendChild(
            this._commStatLine("已用 / 总量", `${this._commFmtNum(s)} / ${this._commFmtNum(l)} ${a}`.trim()),
          ),
        i.appendChild(this._commLegend(u, a)));
    } else if (
      (e.appendChild(
        this._commRing({
          mode: "progress",
          percent: t.percent,
          center: this._commRingNum(t.remain),
          centerUnit: a,
          caption: t.caption || "",
          percentText: `${this._commFmtNum(t.percent, 1)}%`,
          color: t.color,
        }),
      ),
      null !== t.used && void 0 !== t.used)
    ) {
      const e = this._commFmtNum(t.total) || "—";
      i.appendChild(this._commStatLine("已用 / 总量", `${this._commFmtNum(t.used)} / ${e} ${a}`.trim()));
    }
    return (t.packs && t.packs.length && i.appendChild(this._commPacks(t.packs)), e.appendChild(i), e);
  },
  _commStatLine(t, e) {
    const a = document.createElement("div");
    a.className = "comm-stat-line";
    const n = document.createElement("span");
    ((n.className = "comm-stat-label"), (n.textContent = t));
    const o = document.createElement("span");
    return ((o.className = "comm-stat-value"), (o.textContent = e), a.appendChild(n), a.appendChild(o), a);
  },
  _commLegend(t, e) {
    const a = document.createElement("div");
    return (
      (a.className = "comm-legend"),
      t.forEach((t) => {
        const n = document.createElement("div");
        n.className = "comm-legend-item";
        const o = document.createElement("span");
        ((o.className = "comm-legend-dot"), (o.style.background = t.color));
        const i = document.createElement("span");
        ((i.className = "comm-legend-name"), (i.textContent = t.name));
        const r = document.createElement("span");
        ((r.className = "comm-legend-value"), (r.textContent = `${this._commFmtNum(t.value)}${e ? " " + e : ""}`));
        const s = document.createElement("span");
        ((s.className = "comm-legend-percent"),
          (s.textContent = `${Math.round(t.percent)}%`),
          n.appendChild(o),
          n.appendChild(i),
          n.appendChild(r),
          n.appendChild(s),
          a.appendChild(n));
      }),
      a
    );
  },
  _commPacks(t) {
    const e = document.createElement("div");
    return (
      (e.className = "comm-packs"),
      t.forEach((t) => {
        const a = document.createElement("div");
        a.className = "comm-pack";
        const n = document.createElement("div");
        n.className = "comm-pack-head";
        const o = document.createElement("span");
        ((o.className = "comm-pack-label"), (o.textContent = t.label));
        const i = document.createElement("span");
        ((i.className = "comm-pack-text"), (i.textContent = t.text), n.appendChild(o), n.appendChild(i));
        const r = document.createElement("div");
        r.className = "comm-pack-track";
        const s = document.createElement("div");
        ((s.className = "comm-pack-fill"),
          (s.style.width = `${Math.max(2, Math.min(100, t.percent || 0))}%`),
          r.appendChild(s),
          a.appendChild(n),
          a.appendChild(r),
          e.appendChild(a));
      }),
      e
    );
  },
  _commMonthBar(t) {
    const e = document.createElement("div");
    e.className = "comm-month";
    const a = document.createElement("div");
    ((a.className = "comm-month-label"), (a.textContent = `${t.month}月`));
    const n = document.createElement("div");
    n.className = "comm-month-track";
    const o = document.createElement("div");
    ((o.className = "comm-month-fill"), (o.style.width = `${t.percent}%`), n.appendChild(o));
    const i = document.createElement("div");
    i.className = "comm-month-value";
    const r = this._commNum(t.value);
    return (
      (i.textContent = `${null === r ? "—" : r.toFixed(1)} 元`),
      e.appendChild(a),
      e.appendChild(n),
      e.appendChild(i),
      e
    );
  },
  _commFooter(t) {
    const e = [];
    if (
      (t.update.time && e.push(`数据更新 ${t.update.time}`),
      t.update.interval && e.push(t.update.interval),
      t.update.credential && e.push(`凭证 ${t.update.credential}`),
      !e.length)
    )
      return null;
    const a = document.createElement("div");
    return (
      (a.className = "comm-footer"),
      e.forEach((t, e) => {
        if (e) {
          const t = document.createElement("span");
          ((t.className = "comm-footer-sep"), (t.textContent = "·"), a.appendChild(t));
        }
        const n = document.createElement("span");
        ((n.textContent = t), a.appendChild(n));
      }),
      a
    );
  },
  _commRing(t) {
    const e = document.createElement("div");
    e.className = "comm-ring";
    const a = document.createElement("div");
    ((a.className = "comm-ring-canvas"), (a._commRingCfg = t));
    const n = document.createElement("div");
    n.className = "comm-ring-center";
    const o = document.createElement("div");
    if (((o.className = "comm-ring-value"), (o.textContent = t.center || "—"), n.appendChild(o), t.centerUnit)) {
      const e = document.createElement("div");
      ((e.className = "comm-ring-unit"), (e.textContent = t.centerUnit), n.appendChild(e));
    }
    if (t.caption) {
      const e = document.createElement("div");
      ((e.className = "comm-ring-caption"),
        (e.textContent = t.percentText ? `${t.caption} ${t.percentText}` : t.caption),
        n.appendChild(e));
    }
    return (e.appendChild(a), e.appendChild(n), e);
  },
  _commRingOption(t) {
    const e = t || {};
    if ("share" === e.mode && Array.isArray(e.segments) && e.segments.length) {
      const t = e.segments,
        a = e.centerUnit || "";
      return {
        animation: !1,
        tooltip: this._commIsCoarsePointer()
          ? { show: !1 }
          : {
              trigger: "item",
              appendToBody: !0,
              formatter: (e) => {
                const n = t[e.dataIndex];
                if (!n) return "";
                const o = `${this._commFmtNum(n.value)}${a ? " " + a : ""}`;
                return `${e.marker} ${this._escapeHtml(n.name)}: ${o} (${Math.round(n.percent)}%)`;
              },
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderColor: "rgba(0, 0, 0, 0.1)",
              borderWidth: 1,
              textStyle: { color: "#333", fontSize: 11 },
              padding: [6, 10],
            },
        series: [
          {
            type: "pie",
            radius: ["52%", "88%"],
            center: ["50%", "50%"],
            startAngle: 90,
            label: { show: !1 },
            labelLine: { show: !1 },
            emphasis: { scale: !1 },
            data: t.map((t) => ({
              name: t.name,
              value: Math.max(1e-4, Number(t.value) || 0),
              itemStyle: { color: t.color },
            })),
          },
        ],
      };
    }
    const a = Math.max(0, Math.min(100, Number(e.percent) || 0)),
      n = e.color || "#2196f3";
    return {
      animation: !1,
      series: [
        {
          type: "pie",
          radius: ["76%", "94%"],
          center: ["50%", "50%"],
          silent: !0,
          startAngle: 90,
          label: { show: !1 },
          labelLine: { show: !1 },
          data: [
            { value: Math.max(0.01, a), itemStyle: { color: n, borderRadius: 6 } },
            { value: Math.max(0.01, 100 - a), itemStyle: { color: "rgba(128,128,128,0.18)" } },
          ],
        },
      ],
    };
  },
  _commIsCoarsePointer() {
    return (
      void 0 === this._commCoarsePointer &&
        (this._commCoarsePointer = !(!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches)),
      this._commCoarsePointer
    );
  },
  _commShowSegmentBubble(t, e, a) {
    const n = document.createElement("div");
    n.className = "comm-ring-tip";
    const o = document.createElement("span");
    ((o.className = "comm-ring-tip-dot"), (o.style.background = e.color));
    const i = document.createElement("span");
    ((i.textContent = `${e.name}: ${this._commFmtNum(e.value)}${a ? " " + a : ""} (${Math.round(e.percent)}%)`),
      n.appendChild(o),
      n.appendChild(i));
    const r = t && t.closest ? t.closest(".comm-card") : null,
      s = String((e && e.name) || ""),
      c = !(!r || !r._commRingTip || r._commRingTip.key !== s);
    if ((r && this._commCloseTransientBubble(r, "_commRingTip"), c)) return null;
    const { bubble: l, close: d } = this._showBubble({
      target: t,
      content: n,
      placement: "bottom",
      width: 240,
      maxWidth: "86vw",
      className: "comm-ring-tip-wrap",
      animation: "spring",
      closeOnClickAway: !0,
      closeOnTargetClick: !1,
      onClose: () => {
        r && r._commRingTip && r._commRingTip.bubble === l && (r._commRingTip = null);
      },
    });
    return (r && (r._commRingTip = { bubble: l, close: d, key: s }), { bubble: l, close: d });
  },
  _commMountRings(t) {
    if (!t || "function" != typeof this._loadEchartsUnified) return;
    const e = t.querySelectorAll(".comm-ring-canvas");
    e.length &&
      this._loadEchartsUnified()
        .then((t) => {
          e.forEach((e) => {
            const a = e._commRingCfg;
            if (!e.isConnected || !a) return;
            let n = e._echartsInstance;
            if (n && !n.isDisposed()) n.setOption(this._commRingOption(a), !0);
            else {
              ((n = t.init(e, null, { renderer: "canvas", useDirtyRect: !0 })),
                (e._echartsInstance = n),
                n.setOption(this._commRingOption(a)));
              const o = new ResizeObserver(() => {
                e._echartsInstance && !e._echartsInstance.isDisposed() && e._echartsInstance.resize();
              });
              (o.observe(e), (e._commRingRO = o));
            }
            !e._commRingClickBound &&
              "share" === a.mode &&
              this._commIsCoarsePointer() &&
              ((e._commRingClickBound = !0),
              n.on("click", (t) => {
                const n = e._commRingCfg || a,
                  o = n.segments ? n.segments[t.dataIndex] : null;
                o && this._commShowSegmentBubble(e, o, n.centerUnit || "");
              }));
          });
        })
        .catch((t) => {
          console.warn("[comm] ECharts 加载失败，环形图已退化为数值文本:", t);
        });
  },
  _commDisposeRings(t) {
    t &&
      (t.querySelectorAll(".comm-ring-canvas").forEach((t) => {
        if (t._commRingRO) {
          try {
            t._commRingRO.disconnect();
          } catch (t) {}
          t._commRingRO = null;
        }
        const e = t._echartsInstance;
        (e && "function" == typeof e.dispose && !e.isDisposed() && e.dispose(), (t._echartsInstance = null));
      }),
      t.querySelectorAll(".comm-map-canvas, .comm-trend-canvas").forEach((t) => {
        const e = t._echartsInstance;
        (e && "function" == typeof e.dispose && !e.isDisposed() && e.dispose(), (t._echartsInstance = null));
      }));
  },
  _startCommRefresh(t, e) {
    t &&
      (t._commRefreshTimer && (this._unregisterLowFreqTask(t, t._commRefreshTimer), (t._commRefreshTimer = null)),
      (t._commRefreshTimer = this._registerLowFreqTask(
        t,
        () => {
          t.isConnected ? this.updateCommCard(t, t._commConfig || e) : this._commTeardown(t);
        },
        6e4,
      )));
  },
  _commTeardown(t) {
    if (t) {
      if (
        ([
          "_commAuthBubble",
          "_commSimBubble",
          "_commPkgBubble",
          "_commFeeBubble",
          "_commDailyTip",
          "_commRingTip",
          "_commFlowBubble",
        ].forEach((e) => {
          const a = t[e];
          if (a) {
            t[e] = null;
            try {
              a.close();
            } catch (t) {}
          }
        }),
        t._commRefreshTimer && (this._unregisterLowFreqTask(t, t._commRefreshTimer), (t._commRefreshTimer = null)),
        t._commSwipeTimer && (this._timers.clearTimeout(t._commSwipeTimer), (t._commSwipeTimer = null)),
        this._lowFreqObserver)
      )
        try {
          this._lowFreqObserver.unobserve(t);
        } catch (t) {}
      (this._lowFreqVisible && this._lowFreqVisible.delete(t), this._commDisposeRings(t));
    }
  },
};

// ============================================================================
// 精简核心: 只保留 comm (通讯) 卡片独立模式用到的生命周期
// 行为对齐 room-elves-card 的 standalone_type: comm —— 首次拿到 hass 时渲染，
// 之后由 comm 自己的低频任务 (60s) 比对数据签名后增量刷新
// ============================================================================
const CARD_TAG = "pocket-carrier-card";
const CARD_VERSION = "1.0.0";
const CARD_CSS =
  '.room-card{width:var(--room-card-width,300px);max-width:100%;height:var(--room-card-height,200px);border-radius:var(--room-card-border-radius,16px);background:var(--room-card-bg,#fffc);-webkit-backdrop-filter:var(--room-card-backdrop-filter,blur(12px));backdrop-filter:var(--room-card-backdrop-filter,blur(12px));box-shadow:var(--room-card-shadow,0 1px 3px #0000001a);box-sizing:border-box;isolation:isolate;z-index:1;justify-content:space-between;align-items:flex-start;padding:12px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif;transition:all .3s;display:flex;position:relative;overflow:hidden}.room-card:hover{box-shadow:var(--room-card-hover-shadow,0 12px 40px #00000026)}.timeline-tooltip{background:0 0;border-radius:20px;padding:0;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif;overflow:hidden}.timeline-tooltip::-webkit-scrollbar{width:4px}.timeline-tooltip::-webkit-scrollbar-track{background:var(--room-button-bg,#f5f5f5);border-radius:2px}.timeline-tooltip::-webkit-scrollbar-thumb{background:var(--room-slider-track,#3498db);border-radius:2px}.timeline-tooltip::-webkit-scrollbar-thumb:hover{background:var(--room-slider-track,#3498db)}.timeline-content::-webkit-scrollbar{width:4px}.timeline-content::-webkit-scrollbar-track{background:var(--room-button-bg,#f5f5f5);border-radius:2px}.timeline-content::-webkit-scrollbar-thumb{background:var(--room-slider-track,#3498db);border-radius:2px}.timeline-content::-webkit-scrollbar-thumb:hover{background:var(--room-slider-track,#3498db)}.device-popup{z-index:1000;border:1px solid #0000001a;width:auto;min-width:220px;max-width:500px;max-height:80vh;overflow:hidden}.popup-overlay{background:var(--room-overlay-bg,#00000080);z-index:998;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);width:100%;height:100%;position:fixed;top:0;left:0}.popup-overlay[data-popup-class-name=curtain-control-popup],.popup-overlay[data-popup-class-name=curtain-aggregate-popup]{-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);background:var(--room-overlay-bg,#00000080)}.popup-header{border-bottom:1px solid var(--room-popup-border,#0000004d);background:var(--room-popup-bg,#fffc);padding:6px 10px}.popup-content{max-height:400px;padding:16px;overflow-y:auto}.custom-card-popup{padding:0;transition:top .3s cubic-bezier(.4,0,.2,1),height .3s cubic-bezier(.4,0,.2,1),max-height .3s cubic-bezier(.4,0,.2,1);animation:.2s ease-out popupFadeIn}@keyframes popupFadeIn{0%{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}@keyframes scale{0%,to{transform:scale(1)}50%{transform:scale(1.2)}}.free-layout-popup{font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.universal-toast{animation:.3s toastFadeIn}@keyframes toastFadeIn{0%{opacity:0;transform:translate(-50%)translateY(20px)}to{opacity:1;transform:translate(-50%)translateY(0)}}.light-control-popup{min-width:380px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.light-card-popup{min-width:260px;max-width:400px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.popup-overlay[data-popup-class-name=light-card-popup]{background:#0000004d}.socket-control-popup{min-width:380px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.phone-control-popup{background:var(--room-popup-bg,#fffffffa);width:420px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.entity-details-popup{box-sizing:border-box;width:100%;max-width:400px;max-height:90vh;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif;overflow:hidden}.ac-control-popup{min-width:380px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.popup-overlay[data-popup-class-name*=ac-control-popup]{background:var(--room-overlay-bg,#00000080)}.ac-control-popup:not(.multi-ac){min-width:380px;max-width:450px}.media-control-popup{background:var(--room-popup-bg,#fffffffa);border-radius:20px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.person-popup-container{background:var(--room-popup-bg,#fffffffa);box-shadow:var(--room-popup-shadow,0 20px 60px #0003);border:1px solid var(--room-popup-border,#ffffff4d);z-index:1000;box-sizing:border-box;border-radius:20px;max-height:none;padding:0;position:fixed;overflow-y:visible}.automation-popup{font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.custom-card-popup::-webkit-scrollbar{width:8px}.custom-card-popup::-webkit-scrollbar-track{background:var(--room-slider-bg,#ccc);border-radius:4px}.custom-card-popup::-webkit-scrollbar-thumb{background:var(--room-button-bg,#f5f5f5);border-radius:4px;transition:background .3s}.custom-card-popup::-webkit-scrollbar-thumb:hover{background:var(--room-button-active-bg,#0000001a)}.consumables-popup{max-height:80vh;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif}.overview-control-popup{width:94vw;max-width:420px;max-height:85vh;overflow-y:auto;background:var(--room-popup-bg,#fffffffa)!important;-webkit-backdrop-filter:var(--room-opt-bd-md,blur(10px))!important;backdrop-filter:var(--room-opt-bd-md,blur(10px))!important;border:1px solid var(--room-popup-border,#0000001a)!important;color:var(--room-primary-text,#2a2724)!important;border-radius:20px!important;padding:6px 16px!important;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,sans-serif!important;box-shadow:0 24px 60px #0000002e!important}.overview-control-popup .unit{color:var(--room-secondary-text,#888);font-size:10px;font-weight:400}.hw-body{flex-direction:column;gap:8px;min-height:120px;display:flex}.overview-control-popup .popup-header{color:var(--room-primary-text,#2a2724);border-bottom:1px solid var(--room-popup-border,#00000014);justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;font-size:13px;font-weight:500;display:flex}.scene-mode-overlay{-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);width:100%;height:100%;-webkit-mask-image:radial-gradient(circle 120px at var(--scene-overlay-cx,50%) var(--scene-overlay-cy,50%), transparent 10px,  black 120px );mask-image:radial-gradient(circle 120px at var(--scene-overlay-cx,50%) var(--scene-overlay-cy,50%), transparent 10px,  black 120px );z-index:999;pointer-events:auto;opacity:0;background:#00000040;transition:opacity .25s;position:fixed;top:0;left:0}.scene-mode-overlay.visible{opacity:1}.generic-arrow-bubble.anim-spring{animation:.35s cubic-bezier(.34,1.56,.64,1) forwards bubbleSpringIn}.generic-arrow-bubble.anim-spring.closing{animation:.2s ease-in forwards bubbleSpringOut}@keyframes bubbleSpringIn{0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.03)}80%{transform:scale(.98)}to{opacity:1;transform:scale(1)}}@keyframes bubbleSpringOut{0%{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.7)}}.generic-arrow-bubble.anim-fade{animation:.2s ease-out forwards bubbleFadeIn}.generic-arrow-bubble.anim-fade.closing{animation:.15s ease-in forwards bubbleFadeOut}@keyframes bubbleFadeIn{0%{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}@keyframes bubbleFadeOut{0%{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.92)}}.generic-arrow-bubble.anim-slide[data-placement=bottom]{animation:.3s cubic-bezier(.34,1.2,.64,1) forwards bubbleSlideFromTop}.generic-arrow-bubble.anim-slide[data-placement=bottom].closing{animation:.2s ease-in forwards bubbleSlideToTop}.generic-arrow-bubble.anim-slide[data-placement=top]{animation:.3s cubic-bezier(.34,1.2,.64,1) forwards bubbleSlideFromBottom}.generic-arrow-bubble.anim-slide[data-placement=top].closing{animation:.2s ease-in forwards bubbleSlideToBottom}@keyframes bubbleSlideFromTop{0%{opacity:0;transform:translateY(-16px)scale(.95)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes bubbleSlideToTop{0%{opacity:1;transform:translateY(0)scale(1)}to{opacity:0;transform:translateY(-16px)scale(.95)}}@keyframes bubbleSlideFromBottom{0%{opacity:0;transform:translateY(16px)scale(.95)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes bubbleSlideToBottom{0%{opacity:1;transform:translateY(0)scale(1)}to{opacity:0;transform:translateY(16px)scale(.95)}}.generic-arrow-bubble.anim-none{opacity:1;transform:scale(1)}.generic-arrow-bubble.anim-none.closing{opacity:0}.scene-mode-progress-list{-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;flex-direction:column;flex:1;gap:3px;min-height:0;display:flex;overflow-y:auto}.ikuai-log-list{flex-direction:column;gap:6px;width:100%;min-width:0;max-height:45vh;display:flex;overflow-y:auto}.eh-bubble-list{flex-direction:column;gap:4px;height:240px;display:flex;overflow-y:auto}.recently-used-list{flex-direction:column;min-height:0;max-height:50vh;padding:6px 0;display:flex;overflow-y:auto}.recently-used-timeline-list{touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background-image:linear-gradient(#3498db,#95a5a6);background-position:22px 6px;background-repeat:no-repeat;background-size:2px 100%;background-attachment:local;min-height:0;max-height:45vh;padding:4px 4px 4px 35px;position:relative;overflow-x:hidden;overflow-y:auto}.uc-hour-date-pop-content{color:var(--room-primary-text,#333);box-sizing:border-box;padding:10px;font-size:11px}.uc-habit-content{flex-direction:column;gap:6px;display:flex}@media (max-width:768px){.uc-hour-date-pop-content.uc-habit-content>*{flex-shrink:0}}.comm-card{background:var(--room-popup-bg,#fffffff5);max-height:88vh;color:var(--room-primary-text,#2c3e50);flex-direction:column;font-size:13px;display:flex;overflow:hidden}.standalone-card-container .comm-card{background:var(--room-card-bg,#fffc);border-radius:var(--room-card-border-radius,16px);max-height:none}.comm-header{flex-direction:column;flex:none;align-items:stretch;padding:5px 10px 0;display:flex}.comm-title-wrap{justify-content:center;align-items:center;gap:8px;min-width:0;display:flex}.comm-title{text-align:center;font-size:15px;font-weight:600}.comm-accounts{--comm-acc-count:1;--comm-acc-index:0;scrollbar-width:none;border-bottom:1px solid #2196f32e;align-items:stretch;width:calc(100% + 28px);margin:0 -14px;padding-bottom:6px;display:flex;position:relative;overflow-x:auto}.comm-accounts::-webkit-scrollbar{display:none}.comm-account-tab{cursor:pointer;opacity:.5;z-index:2;background:0 0;border:none;flex-direction:column;flex:1 1 0;justify-content:center;align-items:center;gap:1px;min-width:40px;padding:0;transition:opacity .3s;display:flex}.comm-account-tab:hover{opacity:.8}.comm-account-tab.active{opacity:1}.comm-account-balance{color:var(--room-primary-text,#2c3e50);white-space:nowrap;font-size:14px;font-weight:700;transition:color .3s}.comm-account-name{color:var(--room-secondary-text,#7f8c8d);text-overflow:ellipsis;white-space:nowrap;max-width:100%;font-size:10px;font-weight:500;transition:color .3s;overflow:hidden}.comm-account-tab.active .comm-account-balance,.comm-account-tab.active .comm-account-name{color:#1565c0}.comm-account-tab.offline .comm-account-balance{color:var(--room-secondary-text,#7f8c8d)}.comm-account-tab.owed .comm-account-balance{color:#e53935}.comm-account-slider{pointer-events:none;z-index:1;height:3px;width:calc(100% / var(--comm-acc-count));bottom:0;left:calc(var(--comm-acc-index) * 100% / var(--comm-acc-count));background:linear-gradient(#2196f300,#2196f3);border-radius:3px 3px 0 0;transition:left .3s cubic-bezier(.4,0,.2,1);position:absolute;box-shadow:0 -4px 12px #2196f373}.comm-account-balance,.comm-rank-number,.comm-call-number{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;letter-spacing:.3px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,PingFang SC,Microsoft YaHei,sans-serif}.comm-dots{flex:none;justify-content:center;align-items:center;gap:6px;padding:6px 0 8px;display:flex}.comm-dot{cursor:pointer;background:#80808059;border:none;border-radius:999px;width:6px;height:6px;padding:0;transition:width .2s,background .2s}.comm-dot:hover{background:#2196f399}.comm-dot.active{background:#2196f3;width:16px}.comm-dot.active:hover{background:#1976d2}.comm-panels{touch-action:pan-y;-webkit-user-select:none;user-select:none;flex:0 auto;grid-template-rows:minmax(0,1fr);min-height:0;display:grid;position:relative;overflow:hidden}.comm-panel{visibility:hidden;pointer-events:none;touch-action:pan-y;grid-area:1/1;overflow-x:hidden;overflow-y:auto}.comm-panel.active{visibility:visible;pointer-events:auto}.comm-panel[data-panel=records]{position:absolute;top:0;bottom:0;left:0;right:0}.comm-panels.comm-swiping .comm-panel{visibility:visible;will-change:transform;transition:transform .32s cubic-bezier(.32,.72,0,1)}.comm-body{flex-direction:column;gap:10px;padding:12px 10px 10px;display:flex}.comm-auth-bubble,.comm-info-bubble{color:var(--room-primary-text,#2c3e50);padding:12px}.comm-auth{border:1px solid var(--room-popup-border,#00000014);background:var(--room-popup-card-bg,#fff9);border-radius:12px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}.comm-auth-in-bubble{background:0 0;border:none;padding:0}.comm-auth-title{color:var(--room-primary-text,#2c3e50);border-bottom:1px solid var(--room-popup-border,#00000012);align-items:center;gap:6px;padding-bottom:7px;font-size:12.5px;font-weight:600;display:flex}.comm-auth-title:before{content:"";background:#2196f3;border-radius:2px;flex:none;width:3px;height:12px}.comm-auth-title ha-icon{--mdc-icon-size:15px;color:#2196f3}.comm-auth-status{color:var(--room-secondary-text,#666);background:#0000000d;border-radius:999px;margin-left:auto;padding:1px 8px;font-size:11px;font-weight:500}.comm-auth-status.ok{color:#2e7d32;background:#4caf5024}.comm-auth-status.danger{color:#c62828;background:#f4433624}.comm-auth-body{flex-direction:column;gap:10px;display:flex}.comm-auth-action{box-sizing:border-box;cursor:pointer;color:#fff;background:linear-gradient(135deg,#42a5f5,#1e88e5);border:none;border-radius:10px;justify-content:center;align-items:center;gap:6px;width:100%;padding:10px 12px;font-size:13px;font-weight:600;transition:filter .15s;display:flex;box-shadow:0 2px 8px #2196f347}.comm-auth-action:hover{filter:brightness(1.06)}.comm-auth-action:active{filter:brightness(.94)}.comm-auth-action ha-icon{--mdc-icon-size:17px}.comm-auth-action.ready{background:linear-gradient(135deg,#66bb6a,#43a047);box-shadow:0 2px 8px #43a04747}.comm-auth-action-cap{text-align:center;color:var(--room-secondary-text,#8a8a8a);margin-top:-4px;font-size:10.5px;line-height:1.5}.comm-auth-fields{background:#80808014;border-radius:10px;flex-direction:column;gap:8px;padding:10px;display:flex}.comm-set{flex-direction:column;gap:6px;display:flex}.comm-set-title{color:#8a97a3;align-items:center;gap:4px;font-size:11px;display:flex}.comm-set-title ha-icon{--mdc-icon-size:13px}.comm-set-list{background:#80808014;border-radius:10px;flex-direction:column;display:flex;overflow:hidden}.comm-set-row{color:#2c3e50;align-items:center;gap:8px;padding:7px 10px;font-size:12.5px;display:flex}.comm-set-row+.comm-set-row{border-top:1px solid #8080801f}.comm-set-name{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-set-time{color:#2c3e50;background:#fff;border:1px solid #80808047;border-radius:7px;outline:none;flex:none;padding:3px 6px;font-family:inherit;font-size:12px}.comm-set-time:focus{border-color:#2196f3}.comm-set-time:disabled{opacity:.45}.comm-switch{cursor:pointer;background:#80808059;border:none;border-radius:999px;flex:none;width:36px;height:20px;padding:0;transition:background .18s;position:relative}.comm-switch.on{background:#2196f3}.comm-switch:disabled{opacity:.45;cursor:not-allowed}.comm-switch-knob{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .18s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}.comm-switch.on .comm-switch-knob{transform:translate(16px)}.comm-set-action{color:#1565c0;cursor:pointer;background:#2196f314;border:1px solid #2196f359;border-radius:10px;justify-content:center;align-items:center;gap:5px;width:100%;padding:7px 10px;font-size:12.5px;font-weight:600;transition:background .15s;display:flex}.comm-set-action:hover{background:#2196f329}.comm-set-action ha-icon{--mdc-icon-size:15px}.comm-set-action-inline{border-radius:999px;flex:none;width:auto;padding:3px 9px;font-size:12px;font-weight:500}.comm-set-action:disabled{opacity:.45;cursor:not-allowed;color:var(--room-secondary-text,#7f8c8d);background:#8080801a;border-color:#80808047}.comm-auth-field{grid-template-columns:68px minmax(0,1fr);align-items:center;gap:8px;display:grid}.comm-auth-field-label{color:var(--room-secondary-text,#7f8c8d);font-size:11.5px;line-height:1.3}.comm-auth-control{align-items:center;gap:6px;min-width:0;display:flex}.comm-auth-input{border:1px solid var(--room-popup-border,#00000024);background:var(--room-popup-bg,#fff);min-width:0;color:var(--room-primary-text,#2c3e50);box-sizing:border-box;border-radius:8px;outline:none;flex:1;padding:6px 9px;font-family:inherit;font-size:12.5px}.comm-auth-input:focus{border-color:#2196f3;box-shadow:0 0 0 2px #2196f326}.comm-auth-input::placeholder{color:#00000059}.comm-auth-op{cursor:pointer;color:#fff;background:#2196f3;border:none;border-radius:8px;flex:none;padding:6px 12px;font-size:12px;font-weight:600;transition:background .15s}.comm-auth-op:hover{background:#1976d2}.comm-auth-hints{flex-direction:column;gap:4px;display:flex}.comm-auth-hint{color:var(--room-secondary-text,#8a8a8a);word-break:break-word;padding-left:11px;font-size:10.5px;line-height:1.5;position:relative}.comm-auth-hint:before{content:"";opacity:.55;background:currentColor;border-radius:50%;width:3px;height:3px;position:absolute;top:6px;left:2px}.comm-auth-note{align-items:flex-start;gap:5px;display:flex}.comm-auth-note ha-icon{--mdc-icon-size:13px;flex:none;margin-top:1px}.comm-hero{--comm-hero-rgb:33, 150, 243;--comm-hero-ribbon-a:#42a5f5;--comm-hero-ribbon-b:#1976d2;border:1px solid rgba(var(--comm-hero-rgb), .18);background:linear-gradient(135deg, rgba(var(--comm-hero-rgb), .12), rgba(var(--comm-hero-rgb), .03));border-radius:12px;flex-direction:column;gap:4px;padding:12px 14px;display:flex;position:relative;overflow:hidden}.comm-hero.unicom{--comm-hero-rgb:229, 57, 53;--comm-hero-ribbon-a:#ef5350;--comm-hero-ribbon-b:#c62828}.comm-hero.mobile{--comm-hero-rgb:67, 160, 71;--comm-hero-ribbon-a:#66bb6a;--comm-hero-ribbon-b:#2e7d32}.comm-hero-carrier{color:#fff;background:linear-gradient(135deg, var(--comm-hero-ribbon-a), var(--comm-hero-ribbon-b));white-space:nowrap;text-overflow:ellipsis;border-bottom-left-radius:10px;max-width:62%;padding:3px 10px 3px 12px;font-size:11px;font-weight:600;line-height:1.6;position:absolute;top:0;right:0;overflow:hidden}.comm-hero-main{min-width:0;padding-right:86px}.comm-hero-phone{letter-spacing:.5px;word-break:break-all;cursor:pointer;-webkit-user-select:none;user-select:none;align-items:center;gap:6px;margin-top:2px;font-size:19px;font-weight:700;display:inline-flex}.comm-hero-phone-eye{--mdc-icon-size:14px;opacity:.55;flex:none}.comm-hero-phone:hover .comm-hero-phone-eye{opacity:.9}.comm-hero-phone.revealed .comm-hero-phone-text{color:#2196f3}.comm-hero-tags{flex-wrap:wrap;justify-content:space-evenly;gap:2px;display:flex}.comm-tag{color:var(--room-secondary-text,#666);white-space:nowrap;background:#0000000d;border-radius:999px;align-items:center;gap:3px;padding:2px 8px;font-size:11px;line-height:1.5;display:inline-flex}.comm-tag ha-icon{--mdc-icon-size:12px;opacity:.75;flex:none}.comm-tag.ok{color:#2e7d32;background:#4caf5024}.comm-tag.danger{color:#c62828;background:#f4433624}.comm-tag-action{cursor:pointer;background:var(--room-popup-card-bg,#ffffffeb);color:var(--room-primary-text,#2c3e50);border:1px solid #2196f359;font-weight:600}.comm-tag-action:hover{border-color:#2196f3}.comm-tag-action ha-icon{opacity:.9;color:#2196f3}.comm-tag-action.ok,.comm-tag-action.ok ha-icon{color:#2e7d32}.comm-tag-action.danger,.comm-tag-action.danger ha-icon{color:#c62828}.comm-hero-metrics{border-top:1px solid rgba(var(--comm-hero-rgb), .16);grid-template-columns:repeat(3,minmax(0,1fr));place-items:center;gap:8px;padding-top:10px;display:grid}.comm-metric{min-width:0}.comm-metric-value{white-space:nowrap;text-overflow:ellipsis;color:var(--room-primary-text,#2c3e50);font-size:19px;font-weight:700;line-height:1.15;overflow:hidden}.comm-metric-unit{color:var(--room-secondary-text,#7f8c8d);margin-left:2px;font-size:11px;font-weight:400}.comm-metric-label{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;text-overflow:ellipsis;font-size:11px;overflow:hidden}.comm-metric-balance .comm-metric-value{color:#2196f3}.comm-metric-flow .comm-metric-value{color:#00897b}.comm-metric-points .comm-metric-value{color:#ff9800}.comm-metric-danger .comm-metric-value{color:#e53935}.comm-section{border:1px solid var(--room-popup-border,#00000014);background:var(--room-popup-card-bg,#fff9);border-radius:12px;padding:10px 12px}.comm-section-title{border-bottom:1px solid var(--room-popup-border,#00000012);align-items:center;gap:6px;margin-bottom:8px;padding-bottom:7px;font-size:12.5px;font-weight:600;display:flex}.comm-section-title:before{content:"";background:#2196f3;border-radius:2px;flex:none;width:3px;height:12px}.comm-section-title ha-icon{--mdc-icon-size:15px;color:#2196f3}.comm-section-body{flex-direction:column;gap:8px;display:flex}.comm-section-in-bubble{background:0 0;border:none;padding:0}.comm-kv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;display:grid}.comm-kv{justify-content:space-between;align-items:baseline;gap:8px;min-width:0;font-size:12px;display:flex}.comm-kv-label{color:var(--room-secondary-text,#7f8c8d);flex:none}.comm-kv-value{text-align:right;word-break:break-all;min-width:0;font-weight:600}.comm-duo{align-items:center;gap:12px;display:flex}.comm-duo-main{flex-direction:column;flex:1;gap:7px;min-width:0;display:flex}.comm-ring{flex:none;width:152px;height:152px;position:relative}.comm-ring-canvas{position:absolute;top:0;bottom:0;left:0;right:0}.comm-ring-center{text-align:center;pointer-events:none;flex-direction:column;justify-content:center;align-items:center;line-height:1.05;display:flex;position:absolute;top:0;bottom:0;left:0;right:0}.comm-ring-value{font-size:17px;font-weight:700;line-height:1.02}.comm-ring-unit{color:var(--room-secondary-text,#7f8c8d);font-size:10px;line-height:1.05}.comm-ring-caption{color:var(--room-secondary-text,#7f8c8d);margin-top:0;font-size:10px;line-height:1.05}.comm-ring-tip{color:var(--room-primary-text,#2c3e50);white-space:nowrap;align-items:center;gap:6px;padding:9px 12px;font-size:12px;display:flex}.comm-ring-tip-dot{border-radius:50%;flex:none;width:8px;height:8px}.comm-stat-line{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;display:flex}.comm-stat-label{color:var(--room-secondary-text,#7f8c8d)}.comm-stat-value{font-weight:600}.comm-legend{flex-direction:column;gap:4px;display:flex}.comm-legend-item{grid-template-columns:8px minmax(0,1fr) auto auto;align-items:center;gap:6px;font-size:11.5px;display:grid}.comm-legend-dot{border-radius:50%;flex:none;width:8px;height:8px}.comm-legend-name{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.comm-legend-value{text-align:right;font-weight:600}.comm-legend-percent{text-align:right;min-width:36px;color:var(--room-secondary-text,#8a8a8a)}.comm-packs{flex-direction:column;gap:5px;display:flex}.comm-pack-head{justify-content:space-between;align-items:baseline;gap:8px;font-size:11px;display:flex}.comm-pack-label{color:var(--room-secondary-text,#7f8c8d);flex:none}.comm-pack-text{text-align:right;word-break:break-all;color:var(--room-primary-text,#2c3e50)}.comm-pack-track{background:#80808029;border-radius:999px;height:4px;margin-top:3px;overflow:hidden}.comm-pack-fill{background:#64b5f6;border-radius:999px;height:100%}.comm-months{flex-direction:column;gap:4px;margin-top:8px;display:flex}.comm-month{grid-template-columns:34px 1fr 74px;align-items:center;gap:8px;font-size:11.5px;display:grid}.comm-month-label{color:var(--room-secondary-text,#7f8c8d)}.comm-month-track{background:#80808029;border-radius:999px;height:6px;overflow:hidden}.comm-month-fill{background:linear-gradient(90deg,#42a5f5,#1e88e5);border-radius:999px;height:100%}.comm-month-value{text-align:right;font-variant-numeric:tabular-nums}.comm-mini-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;display:grid}.comm-mini{text-align:center;background:#8080800f;border-radius:8px;min-width:0;padding:6px 4px}.comm-mini-value{color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:700;overflow:hidden}.comm-mini-label{color:var(--room-secondary-text,#7f8c8d);margin-top:1px;font-size:11px}.comm-sub-title{color:var(--room-secondary-text,#7f8c8d);border-bottom:1px dashed #80808061;align-items:center;gap:6px;margin-top:2px;padding-bottom:3px;font-size:11px;display:flex}.comm-daily{flex-direction:column;gap:3px;display:flex}.comm-daily-bars{border-bottom:1px solid #8080802e;align-items:flex-end;gap:2px;height:54px;display:flex}.comm-daily-col{cursor:default;flex:1;align-items:flex-end;min-width:0;height:100%;display:flex}.comm-daily-bar{background:linear-gradient(#64b5f6,#2196f3);border-radius:3px 3px 0 0;width:100%;transition:filter .15s}.comm-daily-col:hover .comm-daily-bar{filter:brightness(1.15)}.comm-daily-col.today .comm-daily-bar{background:linear-gradient(#ffb74d,#fb8c00)}.comm-daily-axis{color:var(--room-secondary-text,#8a8a8a);gap:2px;font-size:9px;line-height:1;display:flex}.comm-daily-axis span{text-align:center;flex:1;min-width:0;overflow:hidden}.comm-daily-tip{flex-direction:column;gap:1px;padding:10px;display:flex}.comm-daily-tip-date{color:var(--room-secondary-text,#7f8c8d);font-size:11px}.comm-daily-tip-value{color:var(--room-primary-text,#2c3e50);font-size:15px;font-weight:700}.comm-daily-tip-sub{color:var(--room-secondary-text,#7f8c8d);font-size:11px}.comm-rank-list{flex-direction:column;gap:4px;display:flex}.comm-rank-item{cursor:pointer;border-radius:6px;align-items:center;gap:8px;margin:0 -4px;padding:2px 4px;font-size:12px;transition:background .15s;display:flex}.comm-rank-item:hover{background:#80808014}.comm-rank-item.active{background:#2196f324}.comm-rank-no{text-align:center;width:16px;height:16px;color:var(--room-secondary-text,#7f8c8d);background:#80808029;border-radius:50%;flex:none;font-size:10.5px;line-height:16px}.comm-rank-no.rank-1{color:#b8860b;background:#ffc10738}.comm-rank-no.rank-2{color:#607d8b;background:#90a4ae47}.comm-rank-no.rank-3{color:#a1662f;background:#bf897042}.comm-rank-number{min-width:0;color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12.5px;overflow:hidden}.comm-rank-value{color:var(--room-primary-text,#2c3e50);flex:none;font-weight:600}.comm-rank-count{color:#455a64;background:#607d8b29;border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-rank-time{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11px}.comm-place-scope{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border:1px solid #0000;border-radius:999px;align-items:center;gap:3px;margin-left:auto;padding:0 7px;font-size:10.5px;line-height:1.7;transition:background .15s,color .15s;display:inline-flex}.comm-place-scope ha-icon{--mdc-icon-size:12px}.comm-place-scope:hover{background:#80808033}.comm-place-scope[data-scope=number_location]{color:#1565c0;background:#2196f329}.comm-place-list{flex-wrap:wrap;gap:5px;display:flex}.comm-place{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border-radius:999px;padding:0 8px;font-size:11px;line-height:1.6;transition:background .15s,color .15s}.comm-place:hover{filter:brightness(.94)}.comm-place.active{font-weight:600;box-shadow:inset 0 0 0 1px}.comm-filter-clear{color:#2196f3;cursor:pointer;background:0 0;border:none;margin-left:4px;padding:0 2px;font-size:11px;font-weight:500}.comm-filter-clear:hover{text-decoration:underline}.comm-filter-bar{color:#1565c0;background:#2196f317;border-radius:8px;align-items:center;gap:8px;margin-top:6px;padding:3px 8px;font-size:11.5px;display:flex}.comm-filter-text{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-filter-bar .comm-filter-clear{margin-left:auto}.comm-view-toggle{background:#8080801f;border-radius:999px;flex:none;align-items:center;gap:2px;margin-left:auto;padding:1px;display:inline-flex}.comm-view-key{color:var(--room-secondary-text,#666);cursor:pointer;background:0 0;border:none;border-radius:999px;align-items:center;gap:3px;padding:1px 8px;font-size:11px;line-height:1.6;transition:background .15s,color .15s;display:inline-flex}.comm-view-key ha-icon{--mdc-icon-size:13px}.comm-view-key:hover{color:var(--room-primary-text,#2c3e50)}.comm-view-key.active{color:#1565c0;background:var(--room-popup-card-bg,#fff);font-weight:600;box-shadow:0 1px 2px #0000001f}.comm-map-wrap{flex-direction:column;gap:6px;display:flex}.comm-map-canvas{aspect-ratio:1.8;touch-action:none;width:100%;min-height:340px;max-height:480px}.comm-map-legend{color:var(--room-secondary-text,#7f8c8d);font-size:10.5px;line-height:1.5}.comm-flow-bubble-wrap .bubble-content-scrollable{padding:10px}.comm-flow-bubble{flex-direction:column;gap:8px;display:flex}.comm-flow-head{align-items:center;gap:6px;display:flex}.comm-flow-dir{border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-flow-dir-out{color:#e65100;background:#fb8c002e}.comm-flow-dir-in{color:#4527a0;background:#7e57c22e}.comm-flow-title{color:var(--room-primary-text,#2c3e50);font-size:13px;font-weight:600}.comm-mini-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.comm-flow-list{flex-direction:column;gap:3px;max-height:168px;display:flex;overflow-y:auto}.comm-flow-row{color:var(--room-secondary-text,#666);background:#80808012;border-radius:6px;flex:none;align-items:center;gap:8px;padding:3px 6px;font-size:11.5px;display:flex}.comm-flow-time,.comm-flow-dur{font-variant-numeric:tabular-nums;flex:none}.comm-flow-num{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.comm-flow-actions{display:flex}.comm-flow-filter{color:#1565c0;cursor:pointer;background:#2196f31a;border:1px solid #2196f359;border-radius:8px;width:100%;padding:6px 10px;font-size:12px;font-weight:600;transition:background .15s}.comm-flow-filter:hover{background:#2196f32e}@media (max-width:520px){.comm-map-canvas{min-height:300px}}.comm-phone-toggle{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border:1px solid #0000;border-radius:999px;flex:none;align-items:center;gap:3px;margin-left:auto;padding:1px 8px;font-size:11px;line-height:1.7;transition:background .15s,color .15s;display:inline-flex}.comm-phone-toggle ha-icon{--mdc-icon-size:13px}.comm-phone-toggle:hover{background:#80808033}.comm-phone-toggle.active{color:#1565c0;background:#2196f329}.comm-sort-bar{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;display:flex}.comm-sort-label{color:var(--room-secondary-text,#7f8c8d);align-items:center;gap:4px;font-size:11.5px;display:inline-flex}.comm-sort-label ha-icon{--mdc-icon-size:14px}.comm-sort-keys{flex-wrap:wrap;align-items:center;gap:5px;display:flex}.comm-sort-key{color:var(--room-secondary-text,#666);cursor:pointer;background:#8080801f;border:1px solid #0000;border-radius:999px;align-items:center;gap:1px;padding:2px 9px;font-size:11.5px;line-height:1.6;transition:background .15s,color .15s,border-color .15s;display:inline-flex}.comm-sort-key ha-icon{--mdc-icon-size:12px}.comm-sort-key:hover{background:#80808033}.comm-sort-key.active{color:#1565c0;background:#2196f32e;border-color:#2196f359;font-weight:600}.comm-call-list{flex-direction:column;gap:6px;display:flex}.comm-call-item{background:#8080800f;border-radius:8px;padding:6px 8px;position:relative}.comm-call-today{color:#2e7d32;pointer-events:none;background:#4caf5029;border-radius:999px;padding:0 6px;font-size:10px;line-height:1.6;position:absolute;bottom:6px;right:8px}.comm-call-item.today .comm-call-meta{padding-right:42px}.comm-call-main{align-items:center;gap:8px;font-size:12px;display:flex}.comm-call-type{color:#455a64;background:#607d8b29;border-radius:999px;flex:none;padding:0 7px;font-size:10.5px;line-height:1.7}.comm-call-type.out{color:#1565c0;background:#2196f329}.comm-call-type.in{color:#2e7d32;background:#4caf5029}.comm-call-number{min-width:0;color:var(--room-primary-text,#2c3e50);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12.5px;overflow:hidden}.comm-call-duration{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11.5px}.comm-call-meta{color:var(--room-secondary-text,#7f8c8d);flex-wrap:wrap;align-items:center;gap:3px 6px;margin-top:3px;font-size:11px;display:flex}.comm-call-meta-time{flex:none}.comm-call-chip{white-space:nowrap;border-radius:999px;flex:none;align-items:center;gap:2px;padding:0 7px;font-size:10.5px;line-height:1.7;display:inline-flex}.comm-call-chip ha-icon{--mdc-icon-size:11px}.comm-call-chip-domestic{color:#455a64;background:#607d8b29}.comm-call-chip-roaming{color:#c66900;background:#ff98002e}.comm-call-chip-international{color:#7b1fa2;background:#9c27b029}.comm-call-chip-video{color:#00695c;background:#00897b29}.comm-place-tone-0{color:#1565c0;background:#2196f329}.comm-place-tone-1{color:#00695c;background:#00897b29}.comm-place-tone-2{color:#283593;background:#3f51b529}.comm-place-tone-3{color:#2e7d32;background:#4caf5029}.comm-place-tone-4{color:#6a1b9a;background:#9c27b029}.comm-place-tone-5{color:#37474f;background:#607d8b33}.comm-place-tone-6{color:#0277bd;background:#0277bd29}.comm-place-tone-7{color:#827717;background:#afb42b33}.comm-call-chip-place{color:var(--room-secondary-text,#7f8c8d);background:#8080801a}.comm-call-place-arrow{color:var(--room-secondary-text,#8a8a8a);padding:0 1px}.comm-place-ink-0{color:#1565c0}.comm-place-ink-1{color:#00695c}.comm-place-ink-2{color:#283593}.comm-place-ink-3{color:#2e7d32}.comm-place-ink-4{color:#6a1b9a}.comm-place-ink-5{color:#37474f}.comm-place-ink-6{color:#0277bd}.comm-place-ink-7{color:#827717}.comm-rec-list{background:#8080800f;border-radius:10px;flex-direction:column;display:flex;overflow:hidden}.comm-rec-item{color:var(--room-primary-text,#2c3e50);align-items:center;gap:8px;padding:6px 10px;font-size:12px;display:flex}.comm-rec-item+.comm-rec-item{border-top:1px solid #8080801a}.comm-rec-time{color:var(--room-secondary-text,#7f8c8d);font-variant-numeric:tabular-nums;flex:none;font-size:11px}.comm-rec-badge{color:#1565c0;background:#2196f324;border-radius:999px;flex:none;padding:0 6px;font-size:10.5px;line-height:1.6}.comm-rec-badge.in{color:#2e7d32;background:#4caf5029}.comm-rec-main{text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;flex:1;min-width:0;overflow:hidden}.comm-rec-sub{color:var(--room-secondary-text,#7f8c8d);flex:none;font-size:11px}.comm-rec-fee{color:#ef6c00;flex:none;font-size:11px}.comm-rec-tag{color:var(--room-secondary-text,#7f8c8d);background:#8080801f;border-radius:999px;flex:none;padding:0 6px;font-size:10px}.comm-mini-clickable{cursor:pointer;border-radius:8px;transition:background .15s}.comm-mini-clickable:hover{background:#2196f314}.comm-mini-tip{color:var(--room-primary-text,#2c3e50);flex-direction:column;gap:8px;padding:10px;display:flex}.comm-mini-tip-title{color:var(--room-primary-text,#2c3e50);font-size:12.5px;font-weight:600}.comm-mini-tip .comm-kv-grid{grid-template-columns:1fr;gap:6px 0}.comm-mini-tip .comm-kv{font-size:12.5px}.comm-mini-tip .comm-kv-label{color:var(--room-primary-text,#2c3e50);opacity:.72}.comm-mini-tip .comm-kv-value{color:var(--room-primary-text,#2c3e50)}.comm-hour-chart{flex-direction:column;gap:4px;display:flex}.comm-hour-svg{width:100%;height:64px;display:block}.comm-hour-area{fill:#2196f329}.comm-hour-line{fill:none;stroke:#2196f3;stroke-width:1.8px;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.comm-hour-dot{fill:#2196f3}.comm-hour-dot-peak{fill:#ff9800;stroke:#fff;stroke-width:1.2px}.comm-hour-axis{height:12px;position:relative}.comm-hour-tick{color:var(--room-secondary-text,#7f8c8d);white-space:nowrap;font-size:9.5px;line-height:12px;position:absolute;transform:translate(-50%)}.comm-hour-foot{flex-wrap:wrap;justify-content:space-between;gap:2px 8px;font-size:11px;line-height:1.4;display:flex}.comm-hour-peak{color:var(--room-primary-text,#2c3e50);font-weight:600}.comm-hour-meta{color:var(--room-secondary-text,#7f8c8d)}.comm-record-tabs{z-index:3;background:var(--room-popup-card-bg,#fff);border-radius:10px;position:sticky;top:0}.comm-record-tabs:empty{display:none}.comm-record-tabs-slot{background:#8080801f;border-radius:10px;align-items:stretch;gap:2px;padding:2px;display:flex}.comm-record-tab{color:var(--room-secondary-text,#666);cursor:pointer;background:0 0;border:none;border-radius:8px;flex:1 1 0;justify-content:center;align-items:center;gap:4px;padding:5px 8px;font-size:12.5px;transition:background .15s,color .15s;display:inline-flex}.comm-record-tab ha-icon{--mdc-icon-size:15px}.comm-record-tab:hover{color:var(--room-primary-text,#2c3e50)}.comm-record-tab.active{color:#1565c0;background:var(--room-popup-card-bg,#fff);font-weight:600;box-shadow:0 1px 2px #0000001f}.comm-trend-canvas{touch-action:pan-y;width:100%;height:260px}@media (max-width:520px){.comm-trend-canvas{height:220px}}.comm-call-meta-fee{flex:none}.comm-call-meta-fee.charge{color:#e65100;font-weight:600}.comm-tip{color:var(--room-secondary-text,#7f8c8d);background:#2196f30f;border-left:2px solid #2196f366;border-radius:4px;padding:5px 8px;font-size:11px;line-height:1.5}.comm-empty{color:var(--room-secondary-text,#7f8c8d);justify-content:center;align-items:center;gap:8px;padding:40px 20px;font-size:12.5px;display:flex}.comm-empty ha-icon{--mdc-icon-size:18px;flex:none}.comm-footer{color:var(--room-secondary-text,#8a8a8a);flex-wrap:wrap;align-items:center;gap:5px;padding-top:2px;font-size:11px;display:flex}.comm-footer-sep{opacity:.6}@media (max-width:520px){.comm-kv-grid{grid-template-columns:1fr}.comm-duo{gap:10px}.comm-ring{width:120px;height:120px}.comm-ring-value{font-size:17px}.comm-ring-caption{font-size:9.5px}.comm-mini-grid{gap:5px}.comm-mini{padding:5px 2px}.comm-mini-value{font-size:12.5px}.comm-legend-percent{min-width:30px}.comm-month{grid-template-columns:30px 1fr 64px}.comm-hero-metrics{gap:6px}.comm-metric-value{font-size:17px}}';

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
])
  Object.assign(PocketCarrierCard.prototype, mixin);

// 同一页面里脚本可能被加载两次 (如资源版本号变化)，已注册过就跳过，避免 define 抛错
customElements.get(CARD_TAG) || customElements.define(CARD_TAG, PocketCarrierCard);
window.customCards = window.customCards || [];
window.customCards.some((c) => c && c.type === CARD_TAG) ||
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
