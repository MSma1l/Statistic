# ✅ Cum verifici că totul funcționează

Două moduri: **automat** (un script care testează singur) și **manual** (tu, în interfață).

---

## A. Test automat (recomandat — durează ~5 secunde)

Aplicația trebuie să fie pornită (`docker compose up -d`). Apoi:

```bash
bash examples/test_e2e.sh
```

Scriptul verifică **51 de lucruri** și îți spune la final `TOTUL FUNCȚIONEAZĂ ✓` sau ce a eșuat. Ce testează:

| Grup | Ce confirmă |
|------|-------------|
| 1. Sănătate & frontend | backend-ul, dashboard-ul și scriptul `t.js` răspund |
| 2. Autentificare | login corect/greșit, protejarea rutelor, cookie-ul de sesiune |
| 3. Guard securitate | blochează SQL injection și XSS (cod 400) |
| 4. Pixel | creare site, primire evenimente, statistici corecte, heatmap |
| 5. Linkuri & QR | creare, slug duplicat/invalid, redirect-uri, scanări vs click-uri, imaginea QR |
| 6. Izolare utilizatori | un user nu vede datele altuia; non-adminii n-au drepturi de admin |
| 7. Galerie & QR cu logo | upload imagine, limita de 25 MB, tip link/QR, logo în QR (PNG+SVG), overview dashboard |
| 8. Permisiuni | un user „doar QR" e blocat la site-uri și la tip link (403), dar poate crea QR |
| 9. Curățenie | șterge datele de test la final |

> Dacă rulezi pe alte porturi, setează-le: `BASE_URL=http://localhost:8000 bash examples/test_e2e.sh`

---

## B. Verificare manuală în interfață

### Pas 1 — Login
1. Deschide <http://localhost:5180>.
2. Loghează-te cu `admin@statistic.app` / `admin1234`.
3. ✅ Ar trebui să vezi **Tabloul de bord**.

### Pas 2 — Creezi un site și testezi pixelul „live"
1. Mergi la **Site-uri (Pixel)** → **Site nou** → dă-i un nume → **Creează**.
2. Deschide site-ul → **copiază snippet-ul**.
3. Deschide fișierul `examples/test.html` într-un editor și înlocuiește `CHEIA_TA` cu cheia ta (sau lipește snippet-ul copiat). Salvează.
4. Deschide `examples/test.html` în browser (dublu-click).
5. **Dă click pe butoane** și **derulează** pagina în jos.
6. Întoarce-te în dashboard la pagina site-ului (reîncarcă).
   - ✅ Vizualizări / click-uri cresc.
   - ✅ La **„Cele mai apăsate elemente"** apar butoanele.
   - ✅ La **Heatmap**, alegi pagina din dropdown și vezi punctele colorate.

> Notă: dacă deschizi `test.html` direct de pe disc (`file://`), pixelul tot trimite datele către `localhost:8010`. Funcționează.

### Pas 3 — Creezi un link + QR
1. Mergi la **Linkuri & QR** → **Creează**.
2. Slug: `test-meu`, Destinație: `https://google.com`, Nume + Locație după preferință → **Creează**.
3. Deschide într-un tab nou: <http://localhost:8010/l/test-meu>.
   - ✅ Te duce la Google.
4. Deschide linkul detaliat → scanează QR-ul cu telefonul (sau deschide <http://localhost:8010/q/test-meu>).
   - ✅ Te duce la Google.
5. Reîncarcă pagina linkului.
   - ✅ „Total intrări" = 2, separate în **scanări QR** și **click-uri link**.
   - ✅ Poți descărca QR-ul ca PNG/SVG.

### Pas 3.5 — Galerie + QR cu logo
1. Mergi la **Galerie** → **Încarcă imagine** → alege un logo (PNG/JPG).
   - ✅ Apare în grilă; bara de sus arată spațiul folosit din 25 MB.
2. La **Linkuri & QR** → **Creează**, alege tipul **QR cod** → la „Logo" selectează imaginea.
3. Deschide linkul → QR-ul are **logo-ul în centru**. Descarcă-l PNG/SVG.
   - ✅ Scanează-l cu telefonul — tot funcționează (corecție de eroare ridicată).
4. Editează linkul (nume, locație, destinație, logo) → **Salvează**.
   - ✅ Modificările se aplică; QR-ul se actualizează.

### Pas 4 — Utilizatori & permisiuni (doar admin)
1. Mergi la **Utilizatori** → **Utilizator nou**.
2. La **Permisiuni**, apasă o presetare (ex. **Doar QR**) sau bifează manual ce poate accesa → **Creează**.
3. Deloghează-te și loghează-te cu noul cont.
   - ✅ Vede **doar** secțiunile permise (ex. la „Doar QR" nu apar Site-uri; la creare poate alege doar tip QR).
   - ✅ Nu vede datele tale (izolare). Dacă nu e admin, nu are meniul **Utilizatori**.
4. Înapoi ca admin: la un user apasă **Permisiuni** → schimbă-le → **Salvează**.
   - ✅ La următoarea logare, accesul lui s-a modificat.

### Pas 5 — Securitate (opțional, de curiozitate)
- La login, încearcă parola `x' OR 1=1 --`.
  - ✅ Cererea e **blocată** (guard-ul anti-SQLi).

---

## C. Unde te uiți dacă ceva nu merge

```bash
docker compose ps              # toate 3 trebuie să fie "Up" (db: healthy)
docker compose logs backend    # erori din backend
docker compose logs frontend   # erori din frontend
docker compose restart         # repornire rapidă
```

Documentația interactivă a API-ului (poți apăsa „Try it out" pe fiecare endpoint):
<http://localhost:8010/docs>
