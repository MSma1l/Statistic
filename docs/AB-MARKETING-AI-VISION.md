# Statistic — Viziune: A/B Marketing + AI de optimizare a landing-urilor

> **Statut:** document de design / viziune. NU e implementare — e harta gândită împreună
> înainte de a scrie cod. Fiecare decizie de mai jos a fost luată conștient; secțiunea
> „Decizii luate" le rezumă.
>
> **Public:** noi doi (referință de pornire). Scris educativ — explicăm *de ce*, nu doar *ce*.

---

## 1. Ce construim, într-o frază

Un motor care:
1. știe **de unde vine traficul** (atribuire pe campanie/reclamă, prin UTM),
2. **compară landing-uri între ele** pe criteriul real — *cumpărări*, nu click-uri,
3. dă datele agregate (heatmap, scroll, funnel) unui **AI care propune îmbunătățiri de design**,
4. iar pe măsură ce capeți încredere, **aplică singur schimbările mici și dovedite**, lăsând
   cele mari pentru aprobare umană,
5. totul **sub un gardian GDPR care are drept de veto** asupra optimizatorului.

Adică: nu „analytics", ci un **motor de optimizare a conversiei (CRO) cu buclă închisă**.

---

## 2. De ce e diferit de A/B testing clasic

| | A/B Testing pe pagină | **A/B Marketing (ce facem)** |
|---|---|---|
| Ce compari | două versiuni ale aceleiași pagini | surse de trafic ȘI landing-uri întregi |
| Întrebarea | „ce buton convertește?" | „**ce landing + ce sursă aduc cumpărări reale?**" |
| Cheia tehnică | împărțirea vizitatorilor pe variante | **atribuirea** vizitatorului la sursă + urmărirea lui pe tot funnel-ul |

Avantajul nostru: pixelul vede ce Facebook/Google **nu** văd — *ce se întâmplă după click*.
Putem demonstra că o reclamă cu multe click-uri ieftine aduce de fapt trafic-gunoi, iar una
cu click-uri scumpe aduce cumpărători.

---

## 3. Modelul mental: cele 2 porți

Vizitatorul trece prin două porți succesive. Fiecare poartă se măsoară cu date pe care **deja
le colectăm**.

```
  Reclamă          POARTA 1                    POARTA 2
 (campanie)  →   landing bun?      →     merge mai departe?    →   VÂNZARE
              (rămâne, citește,        (dă click, navighează        (event custom
               nu dă bounce)            spre pagini adânci)          / pagina /multumim)
```

- **Poarta 1 = calitatea landing-ului.** bounce, timp activ (`duration_ms`), scroll depth,
  engagement peste pragul per-site (`sites.min_engagement_seconds`).
- **Poarta 2 = funnel-ul mai departe.** Reconstruit din `journey` / sesiuni:
  `/landing → /produs → /cos → /multumim`.

### Diagnostic cauzal (de ce contează cele 2 porți separat)
Separând porțile, AI-ul poate distinge cauza pierderii — lucru pe care un om îl ratează:
- pierde la **Poarta 1** → *traficul* e prost (schimbă reclama/audiența), nu pagina;
- trece Poarta 1 dar pică la **Poarta 2** → *site-ul* e problema (pagina de coș), nu marketingul.

---

## 4. Atribuirea pe tot lanțul (truc cheie)

Vizitatorul care cumpără pe `/multumim` are `utm_campaign` doar pe **primul** event (intrarea).
Eventul de vânzare s-ar putea să n-aibă UTM. Soluția:

> Legăm vânzarea de campanie prin **`visitor_id` / `session_id`** (există pe fiecare event),
> nu prin UTM-ul de pe eventul de vânzare.

„Acest `visitor_id` a venit din `fb_vara` ȘI a ajuns la `/multumim`" → vânzarea se atribuie
lui `fb_vara`. Infrastructura permite deja asta — lipsește doar logica de interogare.

---

## 5. Pâlnia per-landing (exemplu de output)

Folosind toate cele 3 definiții de conversie deodată (engagement + atingere pagină + event
custom) obținem o pâlnie comparativă:

```
fb_vara:   1000 intrări → 320 angajați (32%) → 90 la /produs (9%) → 12 cumpără (1.2%)
google:     300 intrări → 210 angajați (70%) → 140 la /produs (47%) → 38 cumpără (12.7%)
```

Dintr-o privire vezi *unde* pierde fiecare landing/campanie oameni.

### Cele 3 definiții de conversie, mapate pe funnel
| Definiție | Unde în lanț | Ce-ți spune |
|---|---|---|
| **Engagement** (peste prag) | Poarta 1 | landing-ul prinde atenția? |
| **Atingere pagină** (`/produs`, `/cos`) | mijloc funnel | îi duce mai adânc? |
| **Event custom** (`buy`/`signup`) | Poarta 2, final | chiar se fac vânzări? |

---

## 6. Scală: 20–25 landinguri și cadența de optimizare

Realizare importantă: **nu sunt 2 landinguri, sunt 20–25**, iar optimizarea rulează **periodic
(săptămânal) sau la cerere (buton „optimizează acum")**. Asta schimbă fundamental două lucruri:
**statistica** și **orchestrarea**.

### 6.1 Problema statistică a celor ~25 de „brațe"
Cu traficul împărțit în 25 → fiecare landing primește puține date → greu de atins semnificație.
În plus, dacă compari toate perechile (25×24/2 ≈ 300 comparații), apar „câștigători" din pură
întâmplare (**problema comparațiilor multiple** → false positives). Soluții gândite:

- **Champion–challenger, nu all-vs-all:** există un „campion" curent (cel mai bun de până acum);
  ceilalți sunt „provocatori" comparați DOAR cu campionul. Reduce ~300 comparații la ~24.
- **Multi-armed bandit în loc de split egal:** trimite dinamic *mai mult* trafic spre landingurile
  care merg bine, dar continuă să exploreze restul. Mult mai eficient ca trafic decât A/B clasic
  cu 25 de brațe — nu „irosești" jumătate din trafic pe variante clar slabe.
- **Pragul „destule date" (din §9) devine per-landing:** un landing fără destule conversii e marcat
  *„încă nu știu"* — nici eliminat, nici declarat câștigător. Apărarea contra optimizării pe zgomot.

### 6.2 Cadența: săptămânal SAU buton
- Rularea **săptămânală** = job programat (potrivit pentru skill-ul `/schedule` / cron).
- Butonul **„optimizează acum"** = aceeași rutină, declanșată manual.
- Fiecare rulare, per landing: citește agregate + heatmap → AI propune îmbunătățire → gardian
  GDPR (veto) → clasare → aplicare (auto pentru mic+dovedit, aprobare pentru mare).

### 6.3 Orchestrare: un agent per landing (fan-out)
Cu 20–25 de landinguri analizate în paralel, rularea e un caz natural de **orchestrare
multi-agent** (Workflow): câte un agent AI per landing, analiză independentă, apoi o etapă de
sinteză/clasare. Ține fiecare analiză focusată și rulează totul în paralel, nu secvențial.
*(De construit la Faza 1+; nu acum.)*

---

## 7. Rolul AI-ului: optimizare ancorată în date reale

AI-ul **nu ghicește** ce-i place clientului — **citește din heatmap unde s-a uitat lumea de
fapt** și optimizează spre asta.

Principii CRO pe care le aplică, citind exact datele noastre:
- **Heatmap = harta atenției.** Click pe element ne-clickabil → acolo e atenția, mută CTA-ul acolo.
- **Scroll map = cât de jos ajung.** CTA dincolo de unde ajunge 80% din lume → e mort, urcă-l.
- **Contrast / anchoring / ierarhie vizuală** → scoate în evidență ce duce la cumpărare.
- **Design „izbitor"** reține atenția mai mult (măsurabil prin `duration_ms`) — și se poate
  *testa* prin A/B, nu doar presupune.

**Cost & GDPR:** dăm AI-ului **doar agregate**, niciodată evenimente brute. Mai ieftin, mai
rapid, mai sigur legal. Folosim Claude API (skill `claude-api`) cu **prompt caching** pe
instrucțiuni (analizele se repetă → cache-ul taie mult din cost).

---

## 8. Cum „modifică" AI-ul landing-ul — 3 modele

Landing-ul **nu e în Statistic**, e pe site-ul clientului. Deci „AI modifică pagina" poate
însemna 3 lucruri:

- **A — AI recomandă, omul aplică.** AI-ul dă instrucțiuni concrete; omul le aplică. Sigur, rapid, zero risc.
- **B — Statistic găzduiește landing-urile.** Devii builder+hosting (Unbounce-like). Scope uriaș. **Respins.**
- **C — `t.js` modifică pagina live.** AI-ul dă patch-uri, `t.js` le aplică în browser (Optimizely-like). Buclă automată, dar flicker + risc de securitate.

> **DECIZIE: începem cu A, evoluăm spre C.** Fiecare fază are valoare de sine stătătoare.

---

## 9. Mecanismul „hibrid pe încredere" + gardianul GDPR

O schimbare se aplică **automat** doar dacă trece **TREI filtre simultan**:

```
   AUTO ⟺  risc mic  ȘI  încredere mare  ȘI  trece gardianul GDPR (veto dur)

   RISC:        mic = text/culoare/mărime · mediu = mutare element · mare = layout
   ÎNCREDERE:   destule conversii ca să nu fie noroc (semnificație statistică)
   GARDIAN:     orice dark pattern / atingere consimțământ / legal = RESPINS, oricât de mic
```

- Schimbările **mari** (layout) merg mereu la **aprobare umană**, oricât de sigure.
- Schimbările **mici + dovedite** se aplică automat — DAR doar dacă gardianul GDPR nu le blochează.
- Pragul „destule date" se aliniază filozofic cu pragul de engagement existent: *nu numărăm zgomotul*.

---

## 10. GDPR — pe două niveluri

### Nivel 1 — Statistic ca platformă (obligație legală de bază)
Colectăm date personale (heatmap, journey, `visitor_id`). Avem nevoie de:
- **Consimțământ** înainte de pornirea `t.js` (sau mod cookieless cu id efemer);
- **Anonimizare** (IP trunchiat, fără fingerprinting agresiv) — *stăm deja bine: id anonim, fără signup*;
- **Retenție** — ștergem evenimentele brute după X luni (agregatele rămân);
- **Drept la ștergere** — endpoint care șterge tot ce ține de un `visitor_id`;
- **DPA** între noi și clientul care pune pixelul.

> **DECIZIE:** parte din viziune, pilon în acest doc; implementat la timpul lui (nu blochează prototipul).

### Nivel 2 — GDPR ca „skill" al AI-ului (gardianul)
Când AI-ul modifică landing-ul, un al doilea AI-gardian verifică fiecare propunere:
1. nu adaugă colectare de date fără consimțământ;
2. nu șterge textul legal obligatoriu (cookie banner, link politică);
3. **nu creează dark patterns.**

### Tensiunea de fond (cel mai important risc al proiectului)
Un AI optimizat pur pe „crește conversia" **gravitează natural spre dark patterns**, fiindcă
ele chiar cresc conversia pe termen scurt — dar sunt **ilegale** (GDPR + ePrivacy + DSA).

| Optimizare legitimă ✅ | Dark pattern ilegal ❌ |
|---|---|
| CTA mai vizibil, contrast bun | „Refuz" ascuns/gri vs „Accept" uriaș |
| anchoring de preț corect | urgență fabricată („mai sunt 2 locuri!" fals) |
| ierarhie vizuală spre beneficiu | consimțământ pre-bifat |
| highlight pe ce contează | „Nu, mulțumesc" greu de găsit |

> **DECIZIE: gardianul are VETO DUR.** Orice propunere dark-pattern sau care atinge
> consimțământ/legal e **respinsă automat**, nu ajunge live niciodată. Practic: doi AI care se
> cenzurează reciproc — unul vrea conversie, altul apără legalitatea.

---

## 11. Drumul în 4 faze

| Fază | Ce livrează | Model | Risc | Atinge colectarea / site-ul clientului? |
|---|---|---|---|---|
| **0 — Fundația de comparație** | endpoint pâlnie campanie→landing→cumpărare, citește doar din `events` | — | ~zero | NU |
| **1 — AI consultant** | agregate → AI → raport cu recomandări concrete, ancorate în heatmap/scroll | A | mic | NU |
| **2 — Aplicare asistată** | AI pregătește schimbarea, tu „aprobi"; apare mecanismul risc×încredere×GDPR | A→C | mediu | parțial |
| **3 — Hibrid live** | `t.js` aplică automat schimbările mici+dovedite+legale; restul la aprobare | C (hibrid) | controlat | DA |

**Fiecare fază are valoare de sine stătătoare** — te poți opri la Faza 1 și deja ai un produs
vandabil. Fazele 2-3 sunt upgrade-uri, nu condiții.

---

## 12. Bilanț: ce avem ✅ vs ce construim ❌

**Avem (fundație deja făcută):**
- atribuire UTM pe event (`utm_source/medium/campaign`)
- identitate vizitator pe tot lanțul (`visitor_id`, `session_id`)
- calitate landing (endpoint-uri: `engagement`, bounce, timp mediu, `scrollmap`)
- heatmap click (`x_pct/y_pct` + `doc_w/doc_h` + `PageSnapshot`)
- reconstrucție funnel (`journey`, sesiuni)
- prag engagement per-site (`min_engagement_seconds`)
- guard securitate (anti-SQLi/XSS)
- skill `claude-api` pentru partea de AI

**Construim:**
- logica de pâlnie per-landing (Faza 0) — endpoint read
- stratul AI: prompt pe agregate + caching → raport/recomandări (Faza 1)
- mecanismul risc × încredere × gardian-GDPR + flux de aprobare (Faza 2)
- aplicatorul din `t.js` pentru schimbări live (Faza 3)
- compliance platformă: consent, retenție, drept la ștergere, DPA (Nivel 1, la timpul lui)
- alocare trafic multi-armed bandit + champion-challenger între cele ~25 de landinguri
- orchestrare multi-agent (un agent per landing) + job programat pentru cadența săptămânală

---

## 13. Decizii luate (rezumat)

| Temă | Decizie |
|---|---|
| Tipul produsului | A/B **Marketing** (compară surse + landing-uri), nu A/B testing pe element |
| Criteriul de succes | calitatea traficului + **vânzări mai departe pe funnel** (nu doar click-uri) |
| Cost/ROI | **doar calitatea** acum; cost/ROI = fază viitoare |
| Definiția conversiei | **toate 3**: engagement + atingere pagină + event custom |
| Cum modifică AI-ul | **începem cu A** (recomandă), **evoluăm spre C** (live prin `t.js`) |
| Autonomie | **hibrid pe încredere**: mic+dovedit = auto; mare = aprobare umană |
| Gardian GDPR | **veto dur** — blochează dark patterns / atingeri legale, oricât de mici |
| GDPR platformă (Nivel 1) | **parte din viziune**, implementat la timpul lui |
| Scală | **20–25 landinguri**, nu 2 → champion-challenger + multi-armed bandit, NU all-vs-all |
| Cadență | optimizare **săptămânală** (job programat) SAU **buton „optimizează acum"** |
| Orchestrare | **un agent AI per landing** (fan-out / Workflow) + etapă de clasare/sinteză |

---

## 14. Întrebări deschise pentru când trecem la treabă

- Cum definim concret „o cumpărare" per site — event custom (`buy`) vs pagină (`/multumim`) vs ambele?
- Cum definește clientul **treptele funnel-ului** per site (config UI)?
- Ce prag de semnificație statistică folosim ca să declarăm un câștigător?
- Ce model concret de „risc" al unei schimbări (text/culoare/layout) → mapare la auto vs aprobare?
- Lista de reguli a gardianului GDPR (catalog de dark patterns de blocat).
- De la ce volum de trafic merită multi-armed bandit vs split egal între cele ~25 de landinguri?
- Cum alegem campionul inițial dintre 25 (la prima rulare nu există istoric)?
- Cadența exactă: săptămânal fix, sau prag minim de date înainte de a re-optimiza un landing?
