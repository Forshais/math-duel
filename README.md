# Matemātikas duelis

Reāllaika matemātikas duelis diviem spēlētājiem, ar reitingiem (ELO) atsevišķi
katram grūtības līmenim — līdzīgi kā chess.com, tikai ar rēķināšanu.

Uzbūvēts bez ārējām atkarībām: tikai Node.js iebūvētais (HTTP + SSE reāllaikam).

## Jaunumi v0.3

- **Angļu valoda** kā noklusētā, latviešu — iestatījumos (vai pieteikšanās ekrānā).
- **Raunda rezultāts vienmēr redzams** līdz nākamajam uzdevumam: ✓ pareizi,
  ✗ + pareizā atbilde pelēkā, pretinieka Nick + atbilde, ja viņš paspēja pirmais.
- **Ātrāka ciparnīca** (reaģē uz pieskārienu uzreiz, bez telefona aizkaves).
- **Savienojuma pārtraukumi**: 15 s laiks atgriezties partijā; pamešana = zaudējums.
- **Uzaicinājuma saite** istabai (`?join=KODS`), paliek pieteicies pēc pārlādes.
- Taimeris neatkarīgs no telefona pulksteņa, punktu uzlēcieni, vibrācija, iziešana.

## Iespējas (v0.1)

- **Pieteikšanās ar Nick + PIN** — reitings un vēsture saglabājas starp reizēm.
- **9 grūtības līmeņi** pēc skaitļu vērtības: līdz 50, 100, 200, 500, 1000, 5000,
  10 000, 50 000, 1 000 000. Katram līmenim **atsevišķs reitings**.
- **Darbību izvēle**: +, −, ×, ÷ (var izvēlēties tikai dažas).
- **3 partijas formāti**: 60 s Blitz, 3 minūtes, 5 minūtes.
- **Spēles noteikumi**: pirmais, kas paspēj atbildēt, aizslēdz raundu.
  Pareizi = + punkti (+ ātruma bonuss, reizināts ar līmeņa koeficientu),
  nepareizi = − punkti. Starp uzdevumiem 3 s vizuāla pāreja (uzpūšanās aplis).
- **Divi savienošanās veidi**: "Ātrā spēle" (automātisks pretinieks) vai
  "Spēlē ar draugu" (privāta istaba ar 4 zīmju kodu).
- **Iebūvēta ciparnīca** — ērti spēlēt uz telefona.
- **Tops** katram līmenim.

## Palaišana lokāli

Vajag Node.js 18+ (ieteicams 20/22). Pārbaudi: `node --version`.

```bash
cd math-duel
node server.js
```

Atver http://localhost:3000. Lai iztestētu dueli uz viena datora, atver divus
pārlūka logus (viens parasts, otrs inkognito), piesakies ar diviem dažādiem
Nick, viens izveido istabu, otrs pievienojas ar kodu.

Dati (spēlētāji, reitingi, vēsture) glabājas failā `data/players.json`.

## Izvietošana online (bezmaksas) — testam ar draugiem

Priekš reāllaika multiplayer vajag serveri (GitHub Pages der tikai statiskām
lapām, tur šis nedarbosies). Zemāk — vienkāršākais bezmaksas ceļš ar **Render**.

### Render (ieteicams sākumam)

1. Izveido kontu https://render.com (var ar GitHub).
2. Ieliec šo projektu GitHub repozitorijā (vai izmanto Render "Deploy from Git").
3. Render → **New → Web Service** → izvēlies repo.
4. Iestatījumi:
   - **Runtime**: Node
   - **Build Command**: (tukšs — atkarību nav)
   - **Start Command**: `node server.js`
5. Deploy. Pēc pāris minūtēm saņemsi publisku saiti (piem.
   `https://matematikas-duelis.onrender.com`), ko var sūtīt draugiem.

**Svarīgi par datu noturību:** Render bezmaksas plānā failu sistēma ir
"pārejoša" — pēc servera pārstartēšanas `data/players.json` var pazust, tātad
reitingi nostrādās sesijas laikā, bet ilgtermiņā var nesaglabāties. Testa
versijai tas ir OK. Kad gribēsim noturīgus reitingus, pārliksim glabāšanu uz
datubāzi (piem. Render Postgres bezmaksas plāns vai SQLite ar noturīgu disku) —
kods jau ir sagatavots tā, lai to nomainīt vienā vietā (`lib/store.js`).

### Citi bezmaksas varianti

- **Railway** vai **Fly.io** — tāpat darbojas; start komanda `node server.js`.
- Visos gadījumos serveris klausās uz `process.env.PORT` (jau iebūvēts).

## Struktūra

```
math-duel/
  server.js            HTTP + SSE + maršrutēšana
  lib/
    game.js            uzdevumi, punktu formula, ELO
    store.js           glabāšana (Nick+PIN, reitingi, vēsture)
    rooms.js           matchmaking + raundu cikls
  public/
    index.html         saskarne
    styles.css         noformējums (mobilajam)
    app.js             klienta loģika
  data/                players.json (izveidojas pats; gitignored)
```

## Ko var regulēt (`lib/game.js`)

- `SCORE` — bāzes punkti, ātruma bonuss, sods par nepareizu atbildi.
- `levelMultiplier()` — cik punktu vairāk par grūtākiem līmeņiem.
- `LEVELS` — vērtību diapazoni.
- `FORMATS` — partijas ilgumi.
- Pārejas/raundu laiki — `lib/rooms.js` (`TRANSITION_MS`, `ROUND_TIMEOUT_MS`).

## Nākamie soļi (idejas)

- Noturīga datubāze reitingiem.
- Bots, ar ko spēlēt, kamēr nav pretinieka.
- Mobilā aplikācija (šo pašu var iesaiņot kā PWA vai caur Capacitor).
- Vairāk tēmu (ne tikai matemātika).
