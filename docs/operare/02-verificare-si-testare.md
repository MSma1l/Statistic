# Operare 2 — Verificare & testare

Cum verifici că totul funcționează: un test automat (script bash) și un checklist manual. Pentru pornire vezi [01-pornire-locala.md](01-pornire-locala.md).

> **Onest despre acoperire:** proiectul **NU** are teste unitare sau e2e în cod (0 backend, 0 frontend). Singura suită automată e scriptul bash `examples/test_e2e.sh`, care lovește aplicația pornită prin HTTP. Vezi și [../STARE-PROIECT.md](../STARE-PROIECT.md).

---

## A. Test automat (recomandat — durează ~5 secunde)

Aplicația trebuie să fie pornită (`docker compose up -d`). Apoi:

```bash
bash examples/test_e2e.sh
```

Scriptul verifică ~**51 de lucruri** și îți spune la final `TOTUL FUNCȚIONEAZĂ ✓` sau ce a eșuat. Ce testează:

| Grup | Ce confirmă |
|------|-------------|
| 1. Sănătate & frontend | backend-ul, dashboard-ul și scriptul `t.js` răspund |
| 2. Autentificare | login corect/greșit, protejarea rutelor, cookie-ul de sesiune |
| 3. Guard securitate | blochează SQL injection și XSS (cod 400) |
| 4. Pixel | creare site, primire evenimente, statistici corecte, heatmap |
| 5. Linkuri & QR | creare, slug duplicat/invalid, redirecturi, scanări vs click-uri, imaginea QR |
| 6. Izolare utilizatori | un user nu vede datele altuia; non-adminii n-au drepturi de admin |
| 7. Galerie & QR cu logo | upload imagine, limita de 25 MB, tip link/QR, logo în QR (PNG+SVG), overview dashboard |
| 8. Permisiuni | un user „doar QR" e blocat la site-uri și la tip link (403), dar poate crea QR |
| 9. Curățenie | șterge datele de test la final |

> Dacă rulezi pe alte porturi: `BASE_URL=http://localhost:8000 bash examples/test_e2e.sh`

---

## B. Verificare manuală în interfață

### Pas 1 — Login
1. Deschide dashboard-ul (ex. <http://localhost:5173>).
2. Loghează-te cu adminul din `.env`.
3. ✅ Ar trebui să vezi **Tabloul de bord**.

### Pas 2 — Site + pixel „live"
1. **Site-uri (Pixel)** → **Site nou** → nume → **Creează**.
2. Deschide site-ul → **copiază snippet-ul**.
3. În `examples/test.html`, înlocuiește `CHEIA_TA` cu cheia ta (sau lipește snippet-ul). Salvează.
4. Deschide `examples/test.html` în browser, **dă click pe butoane** și **derulează**.
5. Reîncarcă pagina site-ului în dashboard.
   - ✅ Vizualizări / click-uri cresc.
   - ✅ La **„Cele mai apăsate elemente"** apar butoanele.
   - ✅ La **Heatmap**, alegi pagina din dropdown și vezi punctele colorate.

> Chiar deschis de pe disc (`file://`), pixelul tot trimite datele către backend. Funcționează.

### Pas 3 — Link + QR
1. **Linkuri & QR** → **Creează**: slug `test-meu`, destinație `https://google.com` → **Creează**.
2. Deschide `.../l/test-meu` → ✅ te duce la Google.
3. Deschide linkul detaliat → scanează QR-ul (sau deschide `.../q/test-meu`) → ✅ te duce la Google.
4. Reîncarcă pagina linkului.
   - ✅ „Total intrări" = 2, separate în **scanări QR** și **click-uri link**.
   - ✅ Poți descărca QR-ul ca PNG/SVG.

### Pas 3.5 — Galerie + QR cu logo
1. **Galerie** → **Încarcă imagine** (PNG/JPG) → ✅ apare în grilă; bara arată spațiul folosit din 25 MB.
2. **Linkuri & QR** → **Creează**, tip **QR cod** → la „Logo" alege imaginea.
3. Deschide linkul → QR-ul are **logo-ul în centru**. Descarcă PNG/SVG → ✅ tot se scanează (corecție de eroare ridicată).
4. Editează linkul (nume, locație, destinație, logo) → **Salvează** → ✅ modificările se aplică.

### Pas 4 — Utilizatori & permisiuni (doar admin)
1. **Utilizatori** → **Utilizator nou** → la **Permisiuni** alege o presetare (ex. **Doar QR**) → **Creează**.
2. Deloghează-te și loghează-te cu noul cont.
   - ✅ Vede **doar** secțiunile permise; la „Doar QR" nu apar Site-uri.
   - ✅ Nu vede datele tale (izolare); fără admin, nu are meniul **Utilizatori**.
3. Ca admin, la un user apasă **Permisiuni** → schimbă → **Salvează** → ✅ la următoarea logare accesul s-a modificat.

### Pas 5 — Securitate (opțional)
- La login, încearcă parola `x' OR 1=1 --` → ✅ cererea e **blocată** de guard-ul anti-SQLi.

---

## C. Documentația interactivă a API-ului

<http://localhost:8000/docs> — poți apăsa „Try it out" pe fiecare endpoint.
</content>
