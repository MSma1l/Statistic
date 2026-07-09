# 1. Viziune & idee

Ce este „Statistic", ce probleme rezolvă și de ce a fost gândit așa. Acest fișier e despre **idee**; pentru „cum e construit" vezi [02-arhitectura.md](02-arhitectura.md).

---

## Ce este

**Statistic** este o mini-platformă personală de analytics și tracking. Nu e un produs SaaS pentru clienți — e unealta ta, pe serverul tău, cu datele tale. Are două funcții mari:

| # | Funcție | La ce folosește |
|---|---------|-----------------|
| 1 | **Pixel de analytics** | Un script JS pe care îl pui pe site-urile tale. Vede vizualizări, click-uri, scroll, surse de trafic și generează un **heatmap** (harta de click-uri). E ideea din spatele „Meta Pixel", dar a ta. |
| 2 | **Linkuri scurte & QR permanente** | Creezi linkuri personalizate (`/l/slug-ul-tau`) și QR coduri „pe viață". Vezi câți oameni au intrat, separat pe scanări QR vs click-uri pe link. |

În plus: autentificare pe invitație (fără înregistrare publică), permisiuni per utilizator (RBAC) și un **guard de securitate** care blochează tentative de SQL injection și XSS la fiecare cerere.

---

## Filozofia: „Meta Pixel, dar al tău"

Marile platforme de reclame îți dau un pixel de tracking — dar datele ajung la ele, nu la tine. Statistic răstoarnă asta:

- **Datele stau la tine** — în propria bază PostgreSQL, pe propriul server.
- **Fără terți** — nimeni altcineva nu vede traficul site-urilor tale.
- **Anonim din construcție** — pixelul nu colectează date personale; folosește doar un `visitor_id` (localStorage) și un `session_id` (sessionStorage).

---

## Ce probleme rezolvă

| Problemă | Cum o rezolvă Statistic |
|----------|--------------------------|
| „Unde apasă oamenii pe pagina mea?" | Heatmap real de click-uri, per pagină. |
| „Ce surse îmi aduc trafic?" | Breakdown pe referrer + dispozitive + campanii UTM. |
| „Am printat un QR pe un afiș și acum vreau altă destinație." | Slug permanent, destinație editabilă — QR-ul rămâne valabil pe viață. |
| „Câți au scanat QR-ul vs câți au dat click pe link?" | Rute separate `/q/` (scanare) și `/l/` (click), statistici separate. |
| „Nu vreau să-mi dau datele unei platforme externe." | Totul self-hosted, datele la tine. |

---

## Conceptul cheie: slug permanent, destinație editabilă

Fiecare link/QR are un **slug** care **nu se schimbă niciodată** (ex. `promo-vara`):

- Link scurt stabil: `.../l/promo-vara`
- QR cod stabil (encodează `.../q/promo-vara`)
- **Poți schimba oricând destinația** fără să reprintezi QR-ul.

De aici ideea de **„QR pe viață"**: tipărești o dată afișul, dar controlezi mereu unde duce. QR-ul cu logo folosește corecție de eroare ridicată (~30%), deci rămâne scanabil chiar cu imaginea în centru.

---

## Viitorul: A/B marketing + AI de optimizare

Direcția în care se îndreaptă produsul e un strat de **A/B testing** peste landing-uri, plus un **consultant AI de CRO** (Conversion Rate Optimization) care citește datele agregate (heatmap, scrollmap, pâlnie) și propune îmbunătățiri concrete de design — filtrate de un **gardian GDPR** care respinge dark patterns.

Această viziune e documentată în întregime în [AB-MARKETING-AI-VISION.md](AB-MARKETING-AI-VISION.md). E un document de design, nu implementare — pentru ce e deja construit din acest strat, vezi [STARE-PROIECT.md](STARE-PROIECT.md).
</content>
