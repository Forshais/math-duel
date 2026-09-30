// store.js — noturīga glabātuve (JSON fails prototipam)
// Glabā spēlētājus (Nick + PIN hash), reitingus pa līmeņiem, partiju vēsturi.
// Vēlāk viegli nomainīt uz SQLite/Postgres, saglabājot šo pašu saskarni.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { ELO_START, LEVELS } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");
const DB_FILE = join(DATA_DIR, "players.json");

let db = { players: {} }; // players[nickLower] = { nick, pinHash, ratings, history, createdAt }
let saveTimer = null;

function hashPin(nick, pin) {
  return createHash("sha256").update(`${nick.toLowerCase()}::${pin}`).digest("hex");
}

function emptyRatings() {
  const r = {};
  for (const l of LEVELS) r[l.id] = ELO_START;
  return r;
}

export function loadDB() {
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

function saveNow() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(db));
    renameSync(tmp, DB_FILE); // atomiska aizvietošana
  } catch (e) {
    console.error("[store] saglabāšana neizdevās:", e.message);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 500);
}

// Reģistrē jaunu spēlētāju vai pieteic esošu ar to pašu Nick+PIN.
// Atgriež { ok, player } vai { ok:false, error }.
export function loginOrRegister(nick, pin) {
  nick = String(nick || "").trim();
  pin = String(pin || "").trim();
  if (nick.length < 2 || nick.length > 20) {
    return { ok: false, error: "Nick jābūt 2–20 rakstzīmes garam." };
  }
  if (!/^[\p{L}0-9_\- ]+$/u.test(nick)) {
    return { ok: false, error: "Nick drīkst saturēt tikai burtus, ciparus, atstarpi, _ un -." };
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return { ok: false, error: "PIN jābūt 4–8 cipari." };
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
    scheduleSave();
    return { ok: true, player: p, isNew: true };
  }
  if (p.pinHash !== ph) {
    return { ok: false, error: "Šis Nick jau aizņemts ar citu PIN." };
  }
  // saskaņo reitingus, ja pievienoti jauni līmeņi
  for (const l of LEVELS) if (p.ratings[l.id] == null) p.ratings[l.id] = ELO_START;
  return { ok: true, player: p, isNew: false };
}

export function getPlayer(nick) {
  return db.players[String(nick || "").toLowerCase()] || null;
}

// Pēc partijas: atjauno reitingu konkrētajam līmenim un pieraksta vēsturi.
export function recordMatch(nick, { levelId, format, myScore, oppNick, oppScore, newRating, delta }) {
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
    result: myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw",
    rating: newRating,
    delta,
  });
  if (p.history.length > 100) p.history.length = 100; // ierobežojam
  scheduleSave();
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
