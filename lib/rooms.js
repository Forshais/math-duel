// rooms.js — matchmaking un raundu cikls
// Pārvalda spēlētāju savienošanu (rinda ar reitinga toleranci + vairāki formāti,
// un privātas istabas) un partijas gaitu.

import { makeQuestion, getFormat, getLevel, scoreCorrect, scoreWrong, eloUpdate, OPS, FORMATS, ELO_START } from "./game.js";
import { getPlayer, recordMatch } from "./store.js";

const TRANSITION_MS = 3000;   // pāreja starp uzdevumiem (uzpūšanās aplis)
const ROUND_TIMEOUT_MS = 20000; // ja neviens neatbild, raundu izlaiž
const COUNTDOWN_MS = 3000;    // atpakaļskaitīšana pirms partijas sākuma
const FORMAT_PRIORITY = ["blitz", "m3", "m5"]; // kuru kopīgo formātu izvēlēties

// Aktīvais spēlētājs: { token, nick, send(type,data), roomId }
const clients = new Map();     // token -> client
const rooms = new Map();       // roomId -> room
let waiting = [];              // rindas ieraksti: { token, levelId, formats, ops, rating, tol, joinedAt }
const privateRooms = new Map();// code -> { host, levelId, format, ops }

let roomSeq = 1;

export function registerClient(token, nick, send) {
  const c = { token, nick, send, roomId: null };
  clients.set(token, c);
  return c;
}

export function unregisterClient(token) {
  const c = clients.get(token);
  if (!c) return;
  leaveAll(token);
  clients.delete(token);
}

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normalizeOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0) return [...OPS];
  const clean = [...new Set(ops.filter((o) => OPS.includes(o)))];
  return clean.length ? clean : [...OPS];
}

function normalizeFormats(formats) {
  const valid = Object.keys(FORMATS);
  if (typeof formats === "string") formats = [formats];
  if (!Array.isArray(formats) || formats.length === 0) return ["blitz"];
  const clean = [...new Set(formats.filter((f) => valid.includes(f)))];
  return clean.length ? clean : ["blitz"];
}

function sameOps(a, b) {
  const sa = [...a].sort().join(""), sb = [...b].sort().join("");
  return sa === sb;
}

function commonFormat(a, b) {
  const set = new Set(b);
  for (const f of FORMAT_PRIORITY) if (a.includes(f) && set.has(f)) return f;
  return null;
}

function ratingOf(nick, levelId) {
  const p = getPlayer(nick);
  return p ? (p.ratings[levelId] ?? ELO_START) : ELO_START;
}

// ---- Rindas (publiskais matchmaking) ----
export function joinQueue(token, { levelId, formats, format, ops, ratingTol }) {
  const c = clients.get(token);
  if (!c) return { ok: false, error: "Nezināma sesija." };
  leaveAll(token);
  levelId = Number(levelId);
  ops = normalizeOps(ops);
  const fmts = normalizeFormats(formats ?? format);
  const tol = (ratingTol == null || ratingTol === "any") ? Infinity : Number(ratingTol);
  const myRating = ratingOf(c.nick, levelId);

  // Meklējam labāko sakritību: tuvākais reitings, kopīgs formāts, tolerance abās pusēs
  let best = null, bestGap = Infinity;
  for (const e of waiting) {
    if (e.token === token || !clients.has(e.token)) continue;
    if (e.levelId !== levelId) continue;
    if (!sameOps(e.ops, ops)) continue;
    if (!commonFormat(e.formats, fmts)) continue;
    const gap = Math.abs(e.rating - myRating);
    if (gap > Math.min(e.tol, tol)) continue;
    if (gap < bestGap) { best = e; bestGap = gap; }
  }

  if (best) {
    waiting = waiting.filter((e) => e.token !== best.token && e.token !== token);
    const fmt = commonFormat(best.formats, fmts) || "blitz";
    startMatch(best.token, token, { levelId, format: fmt, ops });
    return { ok: true, matched: true };
  }

  waiting = waiting.filter((e) => e.token !== token);
  waiting.push({ token, levelId, formats: fmts, ops, rating: myRating, tol, joinedAt: Date.now() });
  c.send("queued", { levelId, formats: fmts, ops, ratingTol: tol === Infinity ? "any" : tol });
  return { ok: true, matched: false };
}

export function cancelQueue(token) {
  waiting = waiting.filter((e) => e.token !== token);
  const c = clients.get(token);
  if (c) c.send("queueCancelled", {});
}

// ---- Privātās istabas (spēle ar draugu pēc koda) ----
export function createPrivate(token, { levelId, formats, format, ops }) {
  const c = clients.get(token);
  if (!c) return { ok: false, error: "Nezināma sesija." };
  leaveAll(token);
  const fmt = normalizeFormats(formats ?? format)[0];
  ops = normalizeOps(ops);
  let code;
  do { code = genCode(); } while (privateRooms.has(code));
  privateRooms.set(code, { host: token, levelId: Number(levelId), format: fmt, ops });
  c.send("privateCreated", { code, levelId: Number(levelId), format: fmt, ops });
  return { ok: true, code };
}

export function joinPrivate(token, code) {
  const c = clients.get(token);
  if (!c) return { ok: false, error: "Nezināma sesija." };
  code = String(code || "").toUpperCase().trim();
  const pr = privateRooms.get(code);
  if (!pr) return { ok: false, error: "Nav tādas istabas koda." };
  if (pr.host === token) return { ok: false, error: "Nevar pievienoties pats savai istabai." };
  if (!clients.has(pr.host)) { privateRooms.delete(code); return { ok: false, error: "Istabas veidotājs vairs nav tiešsaistē." }; }
  privateRooms.delete(code);
  leaveAll(token);
  startMatch(pr.host, token, { levelId: pr.levelId, format: pr.format, ops: pr.ops });
  return { ok: true };
}

// ---- Partijas dzīves cikls ----
function startMatch(tokenA, tokenB, { levelId, format, ops }) {
  const a = clients.get(tokenA);
  const b = clients.get(tokenB);
  if (!a || !b) return;
  const fmt = getFormat(format);
  const id = roomSeq++;
  const room = {
    id,
    levelId: Number(levelId),
    format: fmt.id,
    seconds: fmt.seconds,
    ops,
    players: [
      { token: tokenA, nick: a.nick, score: 0 },
      { token: tokenB, nick: b.nick, score: 0 },
    ],
    round: null,
    roundTimer: null,
    transitionTimer: null,
    endTimer: null,
    startsAt: Date.now() + COUNTDOWN_MS,
    endsAt: null,
    finished: false,
    rematch: new Set(),
  };
  rooms.set(id, room);
  a.roomId = id;
  b.roomId = id;

  const level = getLevel(levelId);
  const info = {
    roomId: id,
    levelId: room.levelId,
    levelLabel: level.label,
    format: fmt.id,
    formatLabel: fmt.label,
    seconds: fmt.seconds,
    ops,
    countdownMs: COUNTDOWN_MS,
  };
  a.send("matchFound", { ...info, you: a.nick, opponent: b.nick });
  b.send("matchFound", { ...info, you: b.nick, opponent: a.nick });

  setTimeout(() => beginMatch(id), COUNTDOWN_MS);
}

function beginMatch(id) {
  const room = rooms.get(id);
  if (!room || room.finished) return;
  room.endsAt = Date.now() + room.seconds * 1000;
  room.endTimer = setTimeout(() => endMatch(id), room.seconds * 1000);
  beginRound(id);
}

function sendBoth(room, type, data) {
  for (const p of room.players) {
    const c = clients.get(p.token);
    if (c) c.send(type, data);
  }
}

function scoresPayload(room) {
  return room.players.map((p) => ({ nick: p.nick, score: p.score }));
}

function beginRound(id) {
  const room = rooms.get(id);
  if (!room || room.finished) return;
  if (Date.now() >= room.endsAt) return endMatch(id);

  const q = makeQuestion(room.levelId, room.ops);
  room.round = {
    seq: (room.round?.seq || 0) + 1,
    question: q,
    startedAt: Date.now(),
    locked: false,
  };
  sendBoth(room, "roundStart", {
    seq: room.round.seq,
    text: q.text,
    scores: scoresPayload(room),
    endsAt: room.endsAt,
    serverNow: Date.now(),
  });
  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => {
    if (room.round && !room.round.locked && !room.finished) {
      room.round.locked = true;
      sendBoth(room, "roundResult", {
        seq: room.round.seq,
        answeredBy: null,
        correct: null,
        answer: room.round.question.answer,
        scores: scoresPayload(room),
        transitionMs: TRANSITION_MS,
      });
      scheduleNext(id);
    }
  }, ROUND_TIMEOUT_MS);
}

// seq — raunds, uz kuru klients atbild; novērš novēlotu atbilžu attiecināšanu
// uz nākamo uzdevumu ("pareizi, bet X" kļūda).
export function submitAnswer(token, value, seq) {
  const c = clients.get(token);
  if (!c || c.roomId == null) return;
  const room = rooms.get(c.roomId);
  if (!room || room.finished || !room.round || room.round.locked) return;
  if (seq != null && Number(seq) !== room.round.seq) return; // novēlota atbilde uz vecu raundu

  room.round.locked = true; // pirmais paspēja — aizslēdz raundu
  clearTimeout(room.roundTimer);

  const p = room.players.find((x) => x.token === token);
  const elapsed = Date.now() - room.round.startedAt;
  const submitted = Number(value);
  const correct = submitted === room.round.question.answer;
  const delta = correct ? scoreCorrect(room.levelId, elapsed) : scoreWrong();
  p.score += delta;

  sendBoth(room, "roundResult", {
    seq: room.round.seq,
    answeredBy: p.nick,
    correct,
    submitted,
    answer: room.round.question.answer,
    delta,
    scores: scoresPayload(room),
    transitionMs: TRANSITION_MS,
  });
  scheduleNext(c.roomId);
}

function scheduleNext(id) {
  const room = rooms.get(id);
  if (!room || room.finished) return;
  clearTimeout(room.transitionTimer);
  room.transitionTimer = setTimeout(() => beginRound(id), TRANSITION_MS);
}

function endMatch(id) {
  const room = rooms.get(id);
  if (!room || room.finished) return;
  room.finished = true;
  clearTimeout(room.roundTimer);
  clearTimeout(room.transitionTimer);
  clearTimeout(room.endTimer);

  const [pa, pb] = room.players;
  const dbA = getPlayer(pa.nick);
  const dbB = getPlayer(pb.nick);
  const rA = dbA ? (dbA.ratings[room.levelId] ?? ELO_START) : ELO_START;
  const rB = dbB ? (dbB.ratings[room.levelId] ?? ELO_START) : ELO_START;
  const { newA, newB, deltaA, deltaB } = eloUpdate(rA, rB, pa.score, pb.score);

  recordMatch(pa.nick, { levelId: room.levelId, format: room.format, myScore: pa.score, oppNick: pb.nick, oppScore: pb.score, newRating: newA, delta: deltaA });
  recordMatch(pb.nick, { levelId: room.levelId, format: room.format, myScore: pb.score, oppNick: pa.nick, oppScore: pa.score, newRating: newB, delta: deltaB });

  const base = { levelId: room.levelId, format: room.format, scores: scoresPayload(room) };
  const ca = clients.get(pa.token);
  const cb = clients.get(pb.token);
  if (ca) ca.send("matchEnd", { ...base, you: pa.nick, yourScore: pa.score, oppScore: pb.score, result: outcome(pa.score, pb.score), newRating: newA, delta: deltaA });
  if (cb) cb.send("matchEnd", { ...base, you: pb.nick, yourScore: pb.score, oppScore: pa.score, result: outcome(pb.score, pa.score), newRating: newB, delta: deltaB });
}

function outcome(mine, opp) {
  return mine > opp ? "win" : mine < opp ? "loss" : "draw";
}

export function requestRematch(token) {
  const c = clients.get(token);
  if (!c || c.roomId == null) return;
  const room = rooms.get(c.roomId);
  if (!room || !room.finished) return;
  room.rematch.add(token);
  const other = room.players.find((p) => p.token !== token);
  const otherC = other && clients.get(other.token);
  if (otherC) otherC.send("opponentWantsRematch", {});
  if (room.rematch.size === 2) {
    const [pa, pb] = room.players;
    const cfg = { levelId: room.levelId, format: room.format, ops: room.ops };
    cleanupRoom(room.id);
    startMatch(pa.token, pb.token, cfg);
  }
}

function cleanupRoom(id) {
  const room = rooms.get(id);
  if (!room) return;
  clearTimeout(room.roundTimer);
  clearTimeout(room.transitionTimer);
  clearTimeout(room.endTimer);
  for (const p of room.players) {
    const c = clients.get(p.token);
    if (c && c.roomId === id) c.roomId = null;
  }
  rooms.delete(id);
}

export function leaveAll(token) {
  waiting = waiting.filter((e) => e.token !== token);
  for (const [code, pr] of privateRooms) if (pr.host === token) privateRooms.delete(code);
  const c = clients.get(token);
  if (c && c.roomId != null) {
    const room = rooms.get(c.roomId);
    if (room && !room.finished) {
      room.finished = true;
      clearTimeout(room.roundTimer);
      clearTimeout(room.transitionTimer);
      clearTimeout(room.endTimer);
      const other = room.players.find((p) => p.token !== token);
      const otherC = other && clients.get(other.token);
      if (otherC) { otherC.send("opponentLeft", {}); otherC.roomId = null; }
    }
    if (room) cleanupRoom(room.id);
    c.roomId = null;
  }
}
