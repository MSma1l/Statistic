/*! Statistic tracker — pixel de analytics. Servit la /px/t.js */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();
  if (!script) return;

  var SITE = script.getAttribute("data-site");
  if (!SITE) return;

  var ENDPOINT;
  try {
    ENDPOINT = new URL(script.src).origin + "/px/collect";
  } catch (e) {
    return;
  }

  // --- Identitate anonimă (vizitator + sesiune) ---
  function uid() {
    return (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    );
  }
  function getVisitor() {
    try {
      var v = localStorage.getItem("_st_vid");
      if (!v) {
        v = uid();
        localStorage.setItem("_st_vid", v);
      }
      return v;
    } catch (e) {
      return uid();
    }
  }
  function getSession() {
    try {
      var s = sessionStorage.getItem("_st_sid");
      if (!s) {
        s = uid();
        sessionStorage.setItem("_st_sid", s);
      }
      return s;
    } catch (e) {
      return uid();
    }
  }

  var visitorId = getVisitor();
  var sessionId = getSession();

  // --- Coadă de evenimente + trimitere în batch ---
  var queue = [];
  var timer = null;

  function flush() {
    if (!queue.length) return;
    var payload = {
      site: SITE,
      visitor_id: visitorId,
      events: queue.splice(0, queue.length),
    };
    var data = JSON.stringify(payload);
    // Folosim text/plain: request "simplu" (fără preflight CORS) cross-origin.
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([data], { type: "text/plain;charset=UTF-8" })
        );
        return;
      }
    } catch (e) {}
    // Fallback fetch
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: data,
        keepalive: true,
        mode: "cors",
      });
    } catch (e) {}
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      flush();
    }, 1200);
  }

  function track(type, extra) {
    var ev = {
      type: type,
      path: location.pathname + location.search,
      referrer: document.referrer || "",
      session_id: sessionId,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    };
    if (extra) for (var k in extra) ev[k] = extra[k];
    queue.push(ev);
    schedule();
  }

  // --- Selector CSS simplu pentru elementul apăsat ---
  function selectorFor(el) {
    if (!el || el === document) return "";
    if (el.id) return "#" + el.id;
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      var part = node.tagName.toLowerCase();
      if (node.className && typeof node.className === "string") {
        var cls = node.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (cls) part += "." + cls;
      }
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  // --- Pageview ---
  track("pageview");

  // SPA: re-track la schimbarea de istoric
  var _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    track("pageview");
  };
  window.addEventListener("popstate", function () {
    track("pageview");
  });

  // --- Click + coordonate pentru heatmap ---
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      var docW = Math.max(
        document.documentElement.scrollWidth,
        window.innerWidth
      );
      var docH = Math.max(
        document.documentElement.scrollHeight,
        window.innerHeight
      );
      var x = (e.pageX / docW) * 100;
      var y = (e.pageY / docH) * 100;
      var text = (el.innerText || el.textContent || el.value || "").trim();
      track("click", {
        element_selector: selectorFor(el),
        element_text: text.slice(0, 120),
        x_pct: Math.round(x * 100) / 100,
        y_pct: Math.round(y * 100) / 100,
      });
    },
    true
  );

  // --- Scroll depth ---
  var depths = { 25: false, 50: false, 75: false, 100: false };
  window.addEventListener(
    "scroll",
    function () {
      var st = window.scrollY || document.documentElement.scrollTop;
      var h =
        document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      var pct = (st / h) * 100;
      [25, 50, 75, 100].forEach(function (d) {
        if (!depths[d] && pct >= d) {
          depths[d] = true;
          track("scroll", { scroll_depth: d });
        }
      });
    },
    { passive: true }
  );

  // Flush la ieșire
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  // API public: window.statistic('custom_event', {props})
  window.statistic = function (name, props) {
    track("custom", { element_text: String(name).slice(0, 120), props: props || null });
  };
})();
