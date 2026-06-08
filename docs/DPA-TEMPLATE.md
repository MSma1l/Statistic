# Acord de prelucrare a datelor (DPA) — template

> **Statut:** model de pornire, NU consultanță juridică. Adaptează-l la situația ta
> și verifică-l cu un jurist înainte de a-l folosi în producție. Acoperă Nivelul 1
> din viziunea GDPR (`docs/AB-MARKETING-AI-VISION.md`, §10).

Acest acord se încheie între:

- **Operator** („Clientul") — cel care pune pixelul Statistic pe site-ul său și
  decide scopurile prelucrării;
- **Persoană împuternicită** („Statistic") — care prelucrează datele în numele
  Operatorului, conform instrucțiunilor lui.

## 1. Obiectul prelucrării

Statistic colectează, în numele Operatorului, **date de comportament anonime** de
pe site-ul Operatorului: vizualizări de pagină, click-uri (cu coordonate pentru
heatmap), adâncime de scroll, timp activ, sursă de trafic (UTM) și evenimente
custom definite de Operator.

## 2. Categorii de date și de persoane vizate

- **Persoane vizate:** vizitatorii site-ului Operatorului.
- **Date:** identificator anonim de vizitator/sesiune (generat în browser, fără
  nume/email), user-agent, paginile vizitate, interacțiuni. **NU** se colectează
  nume, email sau alte date direct identificatoare. IP-ul nu este stocat în clar.

## 3. Temei și măsuri tehnice

- **Consimțământ:** când Operatorul activează „cere consimțământ", pixelul `t.js`
  **nu pornește și nu creează niciun identificator** până la `window.statistic.consent('grant')`.
- **Anonimizare:** identificatorii sunt aleatori, fără fingerprinting agresiv.
- **Retenție:** evenimentele brute se șterg automat după `retention_days` (configurabil
  per site). Agregatele rezultate nu conțin identificatori.
- **Dreptul la ștergere:** persoana vizată își poate șterge datele singură
  (`window.statistic.forget()`), iar Operatorul poate procesa cereri din dashboard
  (Confidențialitate → ștergere după `visitor_id`).

## 4. Sub-împuterniciți

Statistic folosește furnizori pentru găzduire și, opțional, **Anthropic (Claude API)**
pentru recomandările AI — căruia i se trimit **DOAR agregate**, niciodată evenimente
brute sau identificatori.

## 5. Obligațiile părților

- **Operatorul** afișează o politică de confidențialitate corectă și obține
  consimțământul unde e necesar.
- **Statistic** prelucrează datele doar conform acestui acord, aplică măsurile de
  securitate descrise și sprijină Operatorul la exercitarea drepturilor persoanelor vizate.

## 6. Încetare

La încetarea relației, Statistic șterge sau returnează datele Operatorului, conform
cererii acestuia, în afara cazurilor în care legea impune păstrarea.

---

*Completează datele părților, data și semnăturile. Verifică juridic înainte de utilizare.*
