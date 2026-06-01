# ✅ Cum verifici că totul funcționează

Două moduri: **automat** (un script care testează singur) și **manual** (tu, în interfață).

---

## A. Test automat (recomandat — durează ~5 secunde)

Aplicația trebuie să fie pornită (`docker compose up -d`). Apoi:

```bash
bash examples/test_e2e.sh
```

Scriptul verifică **37 de lucruri** și îți spune la final `TOTUL FUNCȚIONEAZĂ ✓` sau ce a eșuat. Ce testează:

| Grup | Ce confirmă |
|------|-------------|
| 1. Sănătate & frontend | backend-ul, dashboard-ul și scriptul `t.js` răspund |
| 2. Autentificare | login corect/greșit, protejarea rutelor, cookie-ul de sesiune |
| 3. Guard securitate | blochează SQL injection și XSS (cod 400) |
| 4. Pixel | creare site, primire evenimente, statistici corecte, heatmap |
| 5. Linkuri & QR | creare, slug duplicat/invalid, redirect-uri, scanări vs click-uri, imaginea QR |
| 6. Izolare utilizatori | un user nu vede datele altuia; non-adminii n-au drepturi de admin |
| 7. Curățenie | șterge datele de test la final |

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

### Pas 4 — Utilizatori (doar admin)
1. Mergi la **Utilizatori** → **Utilizator nou** → creează unul.
2. Deloghează-te și loghează-te cu noul cont.
   - ✅ Nu vede site-urile/linkurile tale (datele sunt izolate).
   - ✅ Dacă nu e admin, nu are meniul **Utilizatori**.

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
