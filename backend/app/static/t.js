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

  // Mod preview: când pagina e încărcată în heatmap-ul „Live" din dashboard,
  // URL-ul conține _st_preview => NU înregistrăm nimic (altfel am umfla datele).
  try {
    if (new URLSearchParams(location.search).has("_st_preview")) return;
  } catch (e) {}

  var ENDPOINT;
  var ORIGIN;
  try {
    ORIGIN = new URL(script.src).origin;
    ENDPOINT = ORIGIN + "/px/collect";
  } catch (e) {
    return;
  }

  // ===========================================================================
  //  GDPR — CONSIMȚĂMÂNT (Nivel 1 din viziune)
  //  Dacă snippetul are data-consent="required", NU pornim nimic (nici măcar nu
  //  creăm identificatorul vizitatorului) până nu primim consimțământ explicit:
  //    window.statistic.consent('grant')  → pornește tracking-ul (și-l ține minte);
  //    window.statistic.consent('deny')   → rămâne oprit.
  //  Așa respectăm „consimțământ înainte de pornirea t.js / înainte de a seta id".
  // ===========================================================================
  var consentRequired =
    (script.getAttribute("data-consent") || "") === "required";
  function storedConsent() {
    try {
      return localStorage.getItem("_st_consent");
    } catch (e) {
      return null;
    }
  }
  // Pornim doar dacă nu e nevoie de consimțământ SAU dacă a fost deja acordat.
  var consentGranted = !consentRequired || storedConsent() === "1";
  var started = false;

  // --- Identitate anonimă (vizitator + sesiune) — create DOAR după consimțământ ---
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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

  // Stare la nivel de modul; se completează în `init()` după consimțământ.
  var visitorId = "";
  var sessionId = "";
  var utm = {};

  function getUTM() {
    try {
      var p = new URLSearchParams(location.search);
      return {
        utm_source: p.get("utm_source") || null,
        utm_medium: p.get("utm_medium") || null,
        utm_campaign: p.get("utm_campaign") || null,
      };
    } catch (e) {
      return {};
    }
  }

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
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([data], { type: "text/plain;charset=UTF-8" })
        );
        return;
      }
    } catch (e) {}
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
    // Fără consimțământ (când e cerut) NU colectăm nimic — poarta GDPR.
    if (!consentGranted) return;
    var ev = {
      type: type,
      path: location.pathname,
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

  // ===========================================================================
  //  ENGAGEMENT (timp ACTIV pe pagină) + scroll MAXIM atins
  // ===========================================================================
  var currentPath = location.pathname;
  var activeMs = 0;
  var lastResume = Date.now();
  var isVisible = document.visibilityState !== "hidden";
  var maxScroll = 0;
  var scrollHits = { 25: false, 50: false, 75: false, 100: false };

  function accumulate() {
    if (!isVisible) return;
    var now = Date.now();
    var delta = now - lastResume;
    lastResume = now;
    if (delta > 0 && delta < 60000) activeMs += delta;
  }

  function sendEngagement() {
    accumulate();
    if (activeMs < 250) return;
    track("engagement", {
      path: currentPath,
      duration_ms: Math.min(activeMs, 86400000),
      scroll_depth: maxScroll,
    });
    activeMs = 0;
  }

  function resetPage() {
    activeMs = 0;
    lastResume = Date.now();
    maxScroll = 0;
    scrollHits = { 25: false, 50: false, 75: false, 100: false };
    currentPath = location.pathname;
  }

  function pageview() {
    track("pageview", {
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    });
  }

  // ===========================================================================
  //  FAZA 3 + bandit — aplicare LIVE a patch-urilor / brațelor (model „C")
  //  Aplicăm prin textContent/style/setAttribute — NICIODATĂ innerHTML.
  // ===========================================================================
  function applyPatch(p) {
    if (!p || !p.selector) return;
    try {
      var els = document.querySelectorAll(p.selector);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (p.op === "text") el.textContent = p.value;
        else if (p.op === "style" && p.prop) el.style.setProperty(p.prop, p.value);
        else if (p.op === "attr" && p.prop) el.setAttribute(p.prop, p.value);
      }
    } catch (e) {}
  }

  function applyLivePatches() {
    try {
      fetch(
        ORIGIN +
          "/px/patches?site=" +
          encodeURIComponent(SITE) +
          "&path=" +
          encodeURIComponent(location.pathname),
        { method: "GET", mode: "cors", credentials: "omit" }
      )
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (data && data.patches) data.patches.forEach(applyPatch);
        })
        .catch(function () {});
    } catch (e) {}
  }

  function applyExperiment() {
    try {
      fetch(
        ORIGIN +
          "/px/experiment?site=" +
          encodeURIComponent(SITE) +
          "&path=" +
          encodeURIComponent(location.pathname) +
          "&vid=" +
          encodeURIComponent(visitorId),
        { method: "GET", mode: "cors", credentials: "omit" }
      )
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (data && data.arm) applyPatch(data.arm);
        })
        .catch(function () {});
    } catch (e) {}
  }

  function applyAll() {
    applyLivePatches();
    applyExperiment();
  }

  // SPA: la schimbarea de istoric închidem engagement-ul paginii vechi, apoi
  // resetăm, înregistrăm noul pageview și recerem patch-urile/brațul.
  function onSpaNavigate() {
    if (location.pathname === currentPath) return;
    sendEngagement();
    resetPage();
    pageview();
    applyAll();
  }

  // ===========================================================================
  //  INIT — pornește efectiv tracking-ul. Apelat doar DUPĂ consimțământ.
  // ===========================================================================
  function init() {
    if (started) return; // o singură pornire
    started = true;

    visitorId = getVisitor();
    sessionId = getSession();
    utm = getUTM();

    pageview();
    applyAll();

    setInterval(accumulate, 5000);

    var _push = history.pushState;
    history.pushState = function () {
      _push.apply(this, arguments);
      onSpaNavigate();
    };
    var _replace = history.replaceState;
    history.replaceState = function () {
      _replace.apply(this, arguments);
      onSpaNavigate();
    };
    window.addEventListener("popstate", onSpaNavigate);

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
        var anchor = el.closest ? el.closest("a") : null;
        var href = anchor
          ? anchor.getAttribute("href")
          : el.tagName === "A"
          ? el.getAttribute("href")
          : "";
        track("click", {
          element_selector: selectorFor(el),
          element_text: text.slice(0, 120),
          x_pct: Math.round(x * 100) / 100,
          y_pct: Math.round(y * 100) / 100,
          doc_w: docW,
          doc_h: docH,
          props: {
            href: (href || "").slice(0, 512),
            tag: (el.tagName || "").toLowerCase(),
          },
        });
      },
      true
    );

    window.addEventListener(
      "scroll",
      function () {
        var st = window.scrollY || document.documentElement.scrollTop;
        var h = document.documentElement.scrollHeight - window.innerHeight;
        if (h <= 0) return;
        var pct = (st / h) * 100;
        if (pct > maxScroll) maxScroll = Math.min(100, Math.round(pct));
        [25, 50, 75, 100].forEach(function (d) {
          if (!scrollHits[d] && pct >= d) {
            scrollHits[d] = true;
            track("scroll", { scroll_depth: d });
          }
        });
      },
      { passive: true }
    );

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        accumulate();
        isVisible = false;
        sendEngagement();
        flush();
      } else {
        isVisible = true;
        lastResume = Date.now();
      }
    });

    window.addEventListener("pagehide", function () {
      sendEngagement();
      flush();
    });
  }

  // ===========================================================================
  //  API PUBLIC: window.statistic(...)
  //   - window.statistic('eveniment', {props})  → event custom
  //   - window.statistic.consent('grant'|'deny') → consimțământ GDPR
  //   - window.statistic.forget()                → drept la ștergere (self-service)
  // ===========================================================================
  window.statistic = function (name, props) {
    track("custom", { element_text: String(name).slice(0, 120), props: props || null });
  };

  window.statistic.consent = function (decision) {
    if (decision === "grant") {
      try {
        localStorage.setItem("_st_consent", "1");
      } catch (e) {}
      consentGranted = true;
      init(); // pornește acum (dacă nu pornise deja)
    } else if (decision === "deny") {
      try {
        localStorage.setItem("_st_consent", "0");
      } catch (e) {}
      consentGranted = false;
    }
  };

  window.statistic.forget = function () {
    // Șterge datele de pe server (self-service) + curăță identificatorii locali.
    try {
      var body = JSON.stringify({ site: SITE, visitor_id: visitorId || "" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ORIGIN + "/px/forget", new Blob([body], { type: "text/plain" }));
      } else {
        fetch(ORIGIN + "/px/forget", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: body,
          keepalive: true,
          mode: "cors",
        });
      }
    } catch (e) {}
    try {
      localStorage.removeItem("_st_vid");
      localStorage.removeItem("_st_consent");
      sessionStorage.removeItem("_st_sid");
    } catch (e) {}
    consentGranted = false;
  };

  // Bootstrap: pornim acum doar dacă avem voie. Altfel așteptăm consent('grant').
  if (consentGranted) init();
})();
