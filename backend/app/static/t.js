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

  // Referrer-ul brut conține și query string-ul paginii de proveniență, unde
  // ajung frecvent token-uri de reset, id-uri de sesiune sau adrese de email
  // (ex. ...?email=ion@exemplu.md). Păstrăm doar originea și calea — atât cât
  // trebuie ca să știm de unde a venit vizitatorul.
  function safeReferrer() {
    if (!document.referrer) return "";
    try {
      var u = new URL(document.referrer);
      return u.origin + u.pathname;
    } catch (e) {
      return "";
    }
  }
  var REFERRER = safeReferrer();

  function track(type, extra) {
    var ev = {
      // DOAR pathname (fără query): aceeași pagină deschisă cu UTM-uri diferite
      // se grupează corect în rapoarte (heatmap/scroll/top-pages). UTM-urile sunt
      // capturate separat. Override-uit prin `extra.path` pentru engagement (SPA).
      type: type,
      path: location.pathname,
      referrer: REFERRER,
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

  // SPA: la schimbarea de istoric închidem engagement-ul paginii vechi, apoi
  // resetăm și înregistrăm noul pageview — DOAR dacă s-a schimbat efectiv
  // pagina (pathname). Un simplu salt la o ancoră internă (#pricing) sau o
  // schimbare de query NU e o pagină nouă, deci nu o dublăm.
  function onSpaNavigate() {
    if (location.pathname === currentPath) return;
    sendEngagement();
    resetPage();
    pageview();
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

  // Textul elementului apăsat — NICIODATĂ conținutul unui câmp de formular.
  // `el.value` ar trimite spre /px/collect exact ce a tastat vizitatorul: nume,
  // email, telefon, mesaj, chiar și parola dacă pixelul ajunge pe o pagină de
  // login. Un click pe un câmp deja completat (repoziționare de cursor, revenire
  // pe mobil, autofill) are ca țintă chiar acel input.
  // Click-ul se înregistrează în continuare pentru heatmap, doar fără text.
  function isEditable(el) {
    // `isContentEditable` e calculat (moștenit de la părinți), dar lipsește în
    // unele medii non-browser. Verificarea pe atribut, cu `closest`, acoperă și
    // click-urile pe elementele dinăuntrul unei zone editabile.
    if (el.isContentEditable) return true;
    return !!(
      el.closest && el.closest('[contenteditable=""], [contenteditable="true"]')
    );
  }

  function clickText(el) {
    var tag = (el.tagName || "").toUpperCase();
    if (tag === "INPUT") {
      // La <input type="button|submit|reset"> `value` este eticheta vizibilă,
      // nu date introduse de utilizator — pe aceea o păstrăm.
      return /^(button|submit|reset)$/i.test(el.type || "")
        ? (el.value || "").trim()
        : "";
    }
    if (tag === "TEXTAREA" || tag === "SELECT" || isEditable(el)) return "";

    // Trimitem DOAR eticheta unui control de interfață (link, buton), niciodată
    // textul de conținut al paginii. Altfel un click pe un paragraf ar transmite
    // ce scrie acolo — iar dacă pagina afișează date ale utilizatorului (nume,
    // email, o comandă), acelea ar pleca spre server. Etichetele controalelor
    // sunt scrise de site, nu de vizitator.
    // `closest` urcă la control când s-a apăsat pe un <span> dinăuntrul lui.
    var ctl = el.closest ? el.closest('a, button, summary, [role="button"]') : null;
    if (!ctl) return "";
    return (ctl.innerText || ctl.textContent || "").trim();
  }

  // Href-ul brut poate căra query string și fragment (token-uri, email-uri), iar
  // schemele mailto:/tel: conțin date de contact. Reținem doar destinația:
  // calea, plus originea când linkul duce în afara site-ului.
  function safeHref(raw) {
    if (!raw) return "";
    try {
      var u = new URL(raw, location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol;
      return (u.origin === location.origin ? "" : u.origin) + u.pathname;
    } catch (e) {
      return "";
    }
  }

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
      var text = clickText(el);
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
        props: { href: safeHref(href).slice(0, 512), tag: (el.tagName || "").toLowerCase() },
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
