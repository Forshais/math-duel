// game.js — uzdevumu ģenerēšana, punktu formula, ELO reitings
// Matemātikas duelis

// 9 grūtības līmeņi: maksimālā skaitļu vērtība katram
export const LEVELS = [
  { id: 1, maxValue: 50,        label: "1 · līdz 50" },
  { id: 2, maxValue: 100,       label: "2 · līdz 100" },
  { id: 3, maxValue: 200,       label: "3 · līdz 200" },
  { id: 4, maxValue: 500,       label: "4 · līdz 500" },
  { id: 5, maxValue: 1000,      label: "5 · līdz 1000" },
  { id: 6, maxValue: 5000,      label: "6 · līdz 5000" },
  { id: 7, maxValue: 10000,     label: "7 · līdz 10 000" },
  { id: 8, maxValue: 50000,     label: "8 · līdz 50 000" },
  { id: 9, maxValue: 1000000,   label: "9 · līdz miljonam" },
];

// Partijas formāti (ilgums sekundēs)
export const FORMATS = {
  blitz: { id: "blitz", seconds: 60,  label: "Blitz · 60 s" },
  m3:    { id: "m3",    seconds: 180, label: "3 minūtes" },
  m5:    { id: "m5",    seconds: 300, label: "5 minūtes" },
};

// Operāciju kopas — kuras darbības atļautas. Noklusēti visas četras.
// Lietotājs vēlāk var izvēlēties, piem. tikai + un -.
export const OPS = ["+", "-", "*", "/"];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === Number(id)) || LEVELS[0];
}

export function getFormat(id) {
  return FORMATS[id] || FORMATS.blitz;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Ģenerē vienu uzdevumu dotajam līmenim un atļautajām operācijām.
// Atgriež { text, answer }.
export function makeQuestion(levelId, ops = OPS) {
  const level = getLevel(levelId);
  const max = level.maxValue;
  const op = pick(ops.length ? ops : OPS);

  let a, b, text, answer;

  if (op === "+") {
    a = randInt(1, max);
    b = randInt(1, max);
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (op === "-") {
    a = randInt(1, max);
    b = randInt(1, max);
    if (b > a) [a, b] = [b, a]; // bez negatīviem rezultātiem
    answer = a - b;
    text = `${a} − ${b}`;
  } else if (op === "*") {
    // Reizināšanā ierobežojam faktorus, lai rezultāts iekļaujas līmeņa mērogā.
    const cap = Math.max(2, Math.floor(Math.sqrt(max)));
    a = randInt(2, cap);
    b = randInt(2, Math.max(2, Math.min(cap, Math.floor(max / a))));
    answer = a * b;
    text = `${a} × ${b}`;
  } else {
    // Dalīšana: veidojam no reizinājuma, lai atbilde ir vesels skaitlis.
    const cap = Math.max(2, Math.floor(Math.sqrt(max)));
    b = randInt(2, cap);
    answer = randInt(2, cap);
    a = b * answer;
    text = `${a} ÷ ${b}`;
  }

  return { text, answer };
}

// ---- Punktu formula ----
// Pirmais, kas paspēj atbildēt, aizslēdz raundu.
// Pareizi  -> +BASE + ātruma bonuss (jo ātrāk, jo lielāks)
// Nepareizi -> -PENALTY
// Grūtāki līmeņi reizina iegūtos plus punktus.
export const SCORE = {
  base: 10,
  speedBonusMax: 5,   // maksimālais ātruma bonuss
  speedWindowMs: 6000, // pēc cik ms bonuss nokrīt līdz 0
  penalty: 8,          // sods par nepareizu atbildi
};

export function levelMultiplier(levelId) {
  // 1.0 pirmajam līmenim, aug lēni līdz ~2.6 devītajam
  return 1 + (Number(levelId) - 1) * 0.2;
}

// elapsedMs — cik ilgi spēlētājs domāja no uzdevuma parādīšanās
export function scoreCorrect(levelId, elapsedMs) {
  const mult = levelMultiplier(levelId);
  const t = Math.max(0, Math.min(1, 1 - elapsedMs / SCORE.speedWindowMs));
  const bonus = Math.round(SCORE.speedBonusMax * t);
  return Math.round((SCORE.base + bonus) * mult);
}

export function scoreWrong() {
  return -SCORE.penalty;
}

// ---- ELO reitings (atsevišķs katram līmenim) ----
export const ELO_START = 1000;
const ELO_K = 32;

// scoreA/scoreB — partijas gala punkti; nosaka rezultātu (uzvara/neizšķirts/zaudējums)
export function eloUpdate(ratingA, ratingB, scoreA, scoreB) {
  const expA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expB = 1 - expA;
  let sA;
  if (scoreA > scoreB) sA = 1;
  else if (scoreA < scoreB) sA = 0;
  else sA = 0.5;
  const sB = 1 - sA;
  const newA = Math.round(ratingA + ELO_K * (sA - expA));
  const newB = Math.round(ratingB + ELO_K * (sB - expB));
  return { newA, newB, deltaA: newA - ratingA, deltaB: newB - ratingB };
}
