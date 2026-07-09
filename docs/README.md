# 📚 Documentația „Statistic" — index master

Punctul de intrare în toată documentația proiectului. De aici ajungi la orice: idee, arhitectură, backend, frontend, operare, învățare și viziune. Fiecare fișier are lângă el o frază despre ce acoperă.

> **Ce este Statistic (pe scurt):** mini-platformă personală cu două funcții mari — un **pixel de analytics** cu heatmap și un modul de **linkuri scurte & QR permanente**. „Meta Pixel, dar al tău." Detalii în [01-viziune-si-idee.md](01-viziune-si-idee.md).

---

## 🧭 Ansamblu (privire de sus)

| Fișier | Ce acoperă |
|--------|-----------|
| [01-viziune-si-idee.md](01-viziune-si-idee.md) | Ideea produsului: ce e, ce probleme rezolvă, cele două funcții mari, conceptul „slug permanent, destinație editabilă". |
| [02-arhitectura.md](02-arhitectura.md) | Arhitectura de ansamblu: cele 3 servicii (frontend / backend / PostgreSQL), fluxul de date, porturile, drumul unei cereri. |
| [03-structura-proiect.md](03-structura-proiect.md) | Harta completă a folderelor din rădăcină (arbore ASCII + explicații). |
| [STARE-PROIECT.md](STARE-PROIECT.md) | **Starea reală pe etape:** ce e complet ✅, în lucru 🟡, lipsește ⚪. Citește-o prima dacă vrei să știi „unde suntem". |

---

## ⚙️ Backend (FastAPI + PostgreSQL)

Documentație detaliată a serverului — scrisă în [`backend/`](backend/). Punct de intrare: [backend/README.md](backend/README.md).

| Zonă | Unde |
|------|------|
| API, module, modele de date, securitate, colectare pixel, redirecturi | [`docs/backend/`](backend/) |

---

## 🖥️ Frontend (React + Vite + Tailwind)

Documentație detaliată a dashboard-ului — scrisă în [`frontend/`](frontend/). Punct de intrare: [frontend/README.md](frontend/README.md).

| Zonă | Unde |
|------|------|
| Pagini, rutare cu guards, componente, stratul API, autentificare | [`docs/frontend/`](frontend/) |

---

## 🚀 Operare (pornire, testare, deploy)

| Fișier | Ce acoperă |
|--------|-----------|
| [operare/01-pornire-locala.md](operare/01-pornire-locala.md) | Cum pornești local cu Docker Compose: `.env`, porturi, acces dashboard/API, login inițial, probleme frecvente. |
| [operare/02-verificare-si-testare.md](operare/02-verificare-si-testare.md) | Cum verifici că totul merge: scriptul `examples/test_e2e.sh` + checklist manual. |
| [operare/03-deployment.md](operare/03-deployment.md) | Deploy în producție: nginx dispecer, `.env.prod`, HTTPS cu certbot, `COOKIE_SECURE`. |

---

## 🎓 Învățare & Viziune

| Fișier | Ce acoperă |
|--------|-----------|
| [INVATARE.md](INVATARE.md) | Ghid educativ: cum e construit proiectul, sintaxa explicată pas cu pas, exerciții. |
| [AB-MARKETING-AI-VISION.md](AB-MARKETING-AI-VISION.md) | Viziunea de viitor: A/B marketing + consultant AI de CRO + gardian GDPR. Document de design, nu implementare. |

---

## Prin ce începi?

- **Vreau să înțeleg ideea** → [01-viziune-si-idee.md](01-viziune-si-idee.md)
- **Vreau să pornesc aplicația** → [operare/01-pornire-locala.md](operare/01-pornire-locala.md)
- **Vreau să știu ce e gata și ce nu** → [STARE-PROIECT.md](STARE-PROIECT.md)
- **Vreau să învăț cum e făcut** → [INVATARE.md](INVATARE.md)
</content>
</invoke>
