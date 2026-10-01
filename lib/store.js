// store.js — noturīga glabātuve
// Glabā spēlētājus (Nick + PIN hash), reitingus pa līmeņiem, partiju vēsturi.
//
// Divi režīmi:
//  • DATABASE_URL iestatīts → Postgres (piem. Neon). Dati saglabājas arī pēc
//    servera pārstartēšanas / jaunas versijas.
//  • citādi → JSON fails data/players.json (ērti lokālai testēšanai).
//
// Visi spēlētāji tiek turēti atmiņā (ātri, sinhroni lasījumi); izmainītie
// ieraksti pēc 0,5 s tiek ierakstīti glabātuvē.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { ELO_START, LEVELS } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");
const DB_FILE = join(DATA_DIR, "players.json");
const DATABASE_URL = process.env.DATABASE_URL || "";

let db = { players: {} }; // players[nickLower] = { nick, pinHash, ratings, history, createdAt }
let saveTimer = null;
let pool = null;          // Postgres savienojumu pūls (ja DATABASE_URL)
const dirty = new Set();  // spēlētāju atslēgas, kas jāieraksta Postgres

function hashPin(nick, pin) {
  return createHash("sha256").update(`${nick.toLowerCase()}::${pin}`).digest("hex");
}

function emptyRatings() {
  const r = {};
  for (const l of LEVELS) r[l.id] = ELO_START;
  return r;
}

export function storageMode() {
  return pool ? "postgres" : "file";
}

// testPool — testiem var padot viltus pūlu (pg-mem), citādi izmanto "pg".
export async function loadDB(testPool) {
  if (DATABASE_URL || testPool) {
    // Ja Postgres nav pieejams, labāk nestartēt nekā sākt ar tukšu bāzi —
    // tad kāds varētu "reģistrēt" jau aizņemtu Nick ar citu PIN.
    if (testPool) pool = testPool;
    else {
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ ...pgConfig(DATABASE_URL), max: 3, idleTimeoutMillis: 30000 });
      pool.on("error", (e) => console.error("[store] Postgres kļūda:", e.message));
    }
    await withRetry(() => pool.query(
      `CREATE TABLE IF NOT EXISTS players (
         key TEXT PRIMARY KEY,
         data JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`));
    const res = await withRetry(() => pool.query("SELECT key, data FROM players"));
    db = { players: {} };
    for (const row of res.rows) {
      db.players[row.key] = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    }
    console.log(`[store] Postgres: ielādēti ${res.rows.length} spēlētāji`);
    return;
  }
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(DB_FILE)) {
      db = JSON.parse(readFileSync(DB_FILE, "utf8"));
      if (!db.players) db.players = {};
    }
  } catch (e) {
    console.error("[store] neizdevās ielādēt DB, sāku no tukša:", e.message);
    db = { players: {} };
  }
}


// sslmode=require no savienojuma virknes "pg" bibliotēka uztver kā verify-full un
// izdrukā brīdinājumu. Tāpēc sslmode noņemam un SSL ar sertifikāta pārbaudi
// iestatām paši (tas pats drošības līmenis, bez brīdinājuma).
function pgConfig(url) {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  const ssl = mode === "disable" || (local && !mode) ? false : { rejectUnauthorized: true };
  return { connectionString: u.toString(), ssl };
}
// Neon bezmaksas datubāze pēc pauzes "aizmieg" — pirmais pieprasījums var aizņemt brīdi.
async function withRetry(fn, tries = 5) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries) throw e;
      console.error(`[store] mēģinājums ${i} neizdevās (${e.message}), atkārtoju…`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

async function saveNow() {
  if (pool) {
    const keys = [...dirty];
    dirty.clear();
    for (const key of keys) {
      const p = db.players[key];
      if (!p) continue;
      try {
        await withRetry(() => pool.query(
          `INSERT INTO players (key, data, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [key, JSON.stringify(p)]), 3);
      } catch (e) {
        console.error(`[store] neizdevās saglabāt ${key}:`, e.message);
        dirty.add(key); // mēģināsim nākamreiz
      }
    }
    return;
  }
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(db));
    renameSync(tmp, DB_FILE); // atomiska aizvietošana
  } catch (e) {
    console.error("[store] saglabāšana neizdevās:", e.message);
  }
}

function scheduleSave(key) {
  if (key) dirty.add(key);
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await saveNow();
    if (dirty.size) scheduleSave(); // kļūdas gadījumā vai ja pa to laiku nāca jaunas izmaiņas
  }, 500);
}

// Pirms servera izslēgšanas (jauna versija) — ieraksta visu, kas vēl nav saglabāts.
export async function flushDB() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveNow();
  if (pool && !pool._isTest) await pool.end().catch(() => {});
}


// Reģistrē jaunu spēlētāju vai pieteic esošu ar to pašu Nick+PIN.
// Kļūdas atgriež kā kodus — klients tos pārtulko (EN/LV).
// Atgriež { ok, player } vai { ok:false, error }.
export function loginOrRegister(nick, pin) {
  nick = String(nick || "").trim();
  pin = String(pin || "").trim();
  if (nick.length < 2 || nick.length > 20) {
    return { ok: false, error: "nick_length" };
  }
  if (!/^[\p{L}0-9_\- ]+$/u.test(nick)) {
    return { ok: false, error: "nick_chars" };
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return { ok: false, error: "pin_format" };
  }
  const key = nick.toLowerCase();
  const ph = hashPin(nick, pin);
  let p = db.players[key];
  if (!p) {
    p = {
      nick,
      pinHash: ph,
      ratings: emptyRatings(),
      history: [],
      createdAt: Date.now(),
    };
    db.players[key] = p;
    scheduleSave(key);
    return { ok: true, player: p, isNew: true };
  }
  if (p.pinHash !== ph) {
    return { ok: false, error: "nick_taken" };
  }
  // saskaņo reitingus, ja pievienoti jauni līmeņi
  let added = false;
  for (const l of LEVELS) if (p.ratings[l.id] == null) { p.ratings[l.id] = ELO_START; added = true; }
  if (added) scheduleSave(key);
  return { ok: true, player: p, isNew: false };
}

export function getPlayer(nick) {
  return db.players[String(nick || "").toLowerCase()] || null;
}

// Pēc partijas: atjauno reitingu konkrētajam līmenim un pieraksta vēsturi.
// result — neobligāts (piem. "loss" pametējam, kam punktu bija vairāk).
export function recordMatch(nick, { levelId, format, myScore, oppNick, oppScore, newRating, delta, result, forfeit }) {
  const p = getPlayer(nick);
  if (!p) return;
  p.ratings[levelId] = newRating;
  p.history.unshift({
    at: Date.now(),
    levelId,
    format,
    myScore,
    oppNick,
    oppScore,
    result: result || (myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw"),
    forfeit: !!forfeit,
    rating: newRating,
    delta,
  });
  if (p.history.length > 100) p.history.length = 100; // ierobežojam
  scheduleSave(p.nick.toLowerCase());
}

// Publiskais profils (bez PIN hash)
export function publicProfile(p) {
  if (!p) return null;
  return {
    nick: p.nick,
    ratings: p.ratings,
    history: p.history.slice(0, 20),
  };
}

// Topa tabula konkrētam līmenim
export function leaderboard(levelId, limit = 20) {
  return Object.values(db.players)
    .map((p) => ({ nick: p.nick, rating: p.ratings[levelId] ?? ELO_START, games: p.history.filter(h => h.levelId == levelId).length }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

// Sesijas tokeni (atmiņā) — saista SSE savienojumu ar spēlētāju
const sessions = new Map(); // token -> nickLower
export function newSession(nick) {
  const token = randomUUID();
  sessions.set(token, nick.toLowerCase());
  return token;
}
export function sessionNick(token) {
  return sessions.get(token) || null;
}
export function dropSession(token) {
  sessions.delete(token);
}
