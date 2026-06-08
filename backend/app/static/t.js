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
  try {
    ENDPOINT = new URL(script.src).origin + "/px/collect";
  } catch (e) {
    return;
  }

  // --- Identitate anonimă (vizitator + sesiune) ---
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

  var visitorId = getVisitor();
  var sessionId = getSession();

  // --- Atribuire campanie: capturăm UTM-urile din URL-ul de intrare (o dată
  //     pe încărcare = nivel sesiune, ca în Meta Pixel / Yandex Metrica). ---
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
  var utm = getUTM();

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
      // DOAR pathname (fără query): aceeași pagină deschisă cu UTM-uri diferite
      // se grupează corect în rapoarte (heatmap/scroll/top-pages). UTM-urile sunt
      // capturate separat. Override-uit prin `extra.path` pentru engagement (SPA).
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
  //  Cronometrăm doar cât pagina e vizibilă (tab activ). La plecare/navigare
  //  trimitem un eveniment `engagement` cu durata și scroll-ul maxim.
  // ===========================================================================
  var currentPath = location.pathname;
  var activeMs = 0; // ms acumulați cât pagina a fost vizibilă
  var lastResume = Date.now(); // momentul ultimei „reactivări"
  var isVisible = document.visibilityState !== "hidden";
  var maxScroll = 0; // % maxim de scroll atins pe pagina curentă

  function accumulate() {
    // Adaugă timpul scurs de la ultima reactivare, dacă pagina e vizibilă.
    if (!isVisible) return;
    var now = Date.now();
    var delta = now - lastResume;
    lastResume = now;
    // Plafon: dacă au trecut peste 60s între măsurători, tab-ul a fost probabil
    // suspendat în fundal (fără visibilitychange, cazuri de mobil) — nu contăm
    // acel timp ca „activ". Heartbeat-ul de mai jos ține delta-urile mici.
    if (delta > 0 && delta < 60000) activeMs += delta;
  }

  // Heartbeat: măsoară timpul activ în pași mici (5s) cât pagina e vizibilă.
  // Astfel cititul îndelungat se numără corect, dar pauzele lungi (fundal) nu.
  setInterval(accumulate, 5000);

  function sendEngagement() {
    accumulate();
    if (activeMs < 250) return; // sub prag de zgomot; rămâne acumulat pt. data viitoare
    // Trimitem DELTA (timpul de la ultima trimitere), apoi resetăm. Backend-ul
    // adună deltele per (sesiune, pagină) => fără dublă numărare la hide/show.
    track("engagement", {
      path: currentPath,
      duration_ms: Math.min(activeMs, 86400000),
      scroll_depth: maxScroll,
    });
    activeMs = 0;
  }

  function resetPage() {
    // La trecerea pe o pagină nouă (SPA): zero contoarele.
    activeMs = 0;
    lastResume = Date.now();
    maxScroll = 0;
    scrollHits = { 25: false, 50: false, 75: false, 100: false };
    currentPath = location.pathname;
  }

  // --- Pageview ---
  function pageview() {
    track("pageview", {
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    });
  }
  pageview();

  // ===========================================================================
  //  FAZA 3 — Aplicare LIVE a patch-urilor aprobate (modelul „C" din viziune)
  //  Cerem serverului patch-urile DOM puse LIVE pentru ACEASTĂ pagină și le
  //  aplicăm în browser. Serverul servește DOAR patch-uri aprobate ȘI trecute de
  //  gardianul GDPR (veto dur), deci `t.js` are încredere în ce primește.
  //  Aplicăm prin textContent/style/setAttribute — NICIODATĂ innerHTML — ca o
  //  valoare de patch să nu poată injecta și executa cod pe site-ul clientului.
  // ===========================================================================
  function applyPatch(p) {
    if (!p || !p.selector) return;
    try {
      var els = document.querySelectorAll(p.selector);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (p.op === "text") {
          el.textContent = p.value;
        } else if (p.op === "style" && p.prop) {
          el.style.setProperty(p.prop, p.value);
        } else if (p.op === "attr" && p.prop) {
          el.setAttribute(p.prop, p.value);
        }
      }
    } catch (e) {}
  }

  function applyLivePatches() {
    var url;
    try {
      url =
        new URL(script.src).origin +
        "/px/patches?site=" +
        encodeURIComponent(SITE) +
        "&path=" +
        encodeURIComponent(location.pathname);
    } catch (e) {
      return;
    }
    // GET „simplu" (fără headere custom) => fără preflight CORS; răspunsul are
    // Access-Control-Allow-Origin: * ca să-l putem citi de pe domeniul clientului.
    try {
      fetch(url, { method: "GET", mode: "cors", credentials: "omit" })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (data && data.patches) data.patches.forEach(applyPatch);
        })
        .catch(function () {});
    } catch (e) {}
  }

  // --- Experiment A/B cu bandit (viziune §6): cerem BRAȚUL vizitatorului ---
  // Serverul (Thompson sampling) alege ce variantă vede acest vizitator și o ține
  // sticky prin visitor_id. Aplicăm patch-ul brațului la fel ca un patch live.
  function applyExperiment() {
    var url;
    try {
      url =
        new URL(script.src).origin +
        "/px/experiment?site=" +
        encodeURIComponent(SITE) +
        "&path=" +
        encodeURIComponent(location.pathname) +
        "&vid=" +
        encodeURIComponent(visitorId);
    } catch (e) {
      return;
    }
    try {
      fetch(url, { method: "GET", mode: "cors", credentials: "omit" })
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

  // DOM-ul poate să nu fie încă parsat (scriptul e în <head>, async): așteptăm
  // DOMContentLoaded doar dacă e nevoie, altfel aplicăm imediat (mai puțin flicker).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll);
  } else {
    applyAll();
  }

  // SPA: la schimbarea de istoric închidem engagement-ul paginii vechi, apoi
  // resetăm și înregistrăm noul pageview — DOAR dacă s-a schimbat efectiv
  // pagina (pathname). Un simplu salt la o ancoră internă (#pricing) sau o
  // schimbare de query NU e o pagină nouă, deci nu o dublăm.
  function onSpaNavigate() {
    if (location.pathname === currentPath) return;
    sendEngagement();
    resetPage();
    pageview();
    // Pagina nouă (SPA) poate avea propriile patch-uri live + experiment — recerem.
    applyAll();
  }
  var _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    onSpaNavigate();
  };
  // Și replaceState: multe routere SPA îl folosesc (ex. redirect/replace),
  // altfel am pierde pageview-ul noii pagini.
  var _replace = history.replaceState;
  history.replaceState = function () {
    _replace.apply(this, arguments);
    onSpaNavigate();
  };
  window.addEventListener("popstate", onSpaNavigate);

  // --- Click + coordonate pentru heatmap + context (link/buton) ---
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
      // Linkul cel mai apropiat (dacă s-a apăsat în interiorul unui <a>).
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
        // Dimensiunile complete ale documentului: necesare ca să suprapunem
        // heatmap-ul peste pagina reală la proporțiile corecte.
        doc_w: docW,
        doc_h: docH,
        props: { href: (href || "").slice(0, 512), tag: (el.tagName || "").toLowerCase() },
      });
    },
    true
  );

  // --- Scroll depth (milestone) + scroll maxim (pentru engagement) ---
  var scrollHits = { 25: false, 50: false, 75: false, 100: false };
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

  // --- Vizibilitate: pauză/reluare cronometru + flush la ascundere ---
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

  // La închiderea/părăsirea paginii: engagement final + trimitere.
  window.addEventListener("pagehide", function () {
    sendEngagement();
    flush();
  });

  // API public: window.statistic('custom_event', {props})
  window.statistic = function (name, props) {
    track("custom", {
      element_text: String(name).slice(0, 120),
      props: props || null,
    });
  };
})();
