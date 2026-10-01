// server.js — HTTP serveris (statiskās lapas + REST + SSE reāllaikam)
// Matemātikas duelis. Bez ārējām atkarībām, tikai Node iebūvētais.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { loadDB, flushDB, storageMode, loginOrRegister, newSession, sessionNick, dropSession, getPlayer, publicProfile, leaderboard } from "./lib/store.js";
import { registerClient, unregisterClient, dropClient, isInMatch, joinQueue, cancelQueue, createPrivate, joinPrivate, submitAnswer, requestRematch, leaveAll } from "./lib/rooms.js";
import { LEVELS, FORMATS, OPS } from "./lib/game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = process.env.PORT || 3000;

await loadDB();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

// token -> http response (SSE straume)
const sseClients = new Map();

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

function sseSend(res, type, data) {
  try {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  } catch { /* savienojums slēgts */ }
}

async function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  rel = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) throw new Error("dir");
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ---- Konfigurācija (līmeņi, formāti, operācijas) ----
  if (path === "/api/config" && req.method === "GET") {
    return sendJSON(res, 200, { levels: LEVELS, formats: Object.values(FORMATS), ops: OPS });
  }

  // ---- Pieteikšanās / reģistrācija ----
  if (path === "/api/login" && req.method === "POST") {
    const { nick, pin } = await readBody(req);
    const r = loginOrRegister(nick, pin);
    if (!r.ok) return sendJSON(res, 400, { error: r.error });
    const token = newSession(r.player.nick);
    return sendJSON(res, 200, { token, isNew: r.isNew, profile: publicProfile(r.player) });
  }

  // ---- Profils ----
  if (path === "/api/profile" && req.method === "GET") {
    const nick = sessionNick(url.searchParams.get("token"));
    if (!nick) return sendJSON(res, 401, { error: "not_logged_in" });
    return sendJSON(res, 200, { profile: publicProfile(getPlayer(nick)) });
  }

  // ---- Topa tabula ----
  if (path === "/api/leaderboard" && req.method === "GET") {
    const level = Number(url.searchParams.get("level") || 1);
    return sendJSON(res, 200, { level, top: leaderboard(level) });
  }

  // ---- SSE straume (server -> klients) ----
  if (path === "/api/stream" && req.method === "GET") {
    const token = url.searchParams.get("token");
    const nick = sessionNick(token);
    if (!nick) { res.writeHead(401); return res.end(); }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":ok\n\n");
    sseClients.set(token, res);
    const player = getPlayer(nick);
    const send = (type, data) => sseSend(res, type, data);
    // "ready" jāsūta pirms registerClient — tas var uzreiz atsūtīt "resume"
    send("ready", { profile: publicProfile(player), inMatch: isInMatch(token) });
    registerClient(token, player.nick, send);

    const ping = setInterval(() => { try { res.write(":ping\n\n"); } catch {} }, 25000);
    req.on("close", () => {
      clearInterval(ping);
      if (sseClients.get(token) === res) sseClients.delete(token);
      unregisterClient(token, send);
    });
    return;
  }

  // ---- Darbības (klients -> server) ----
  if (path === "/api/action" && req.method === "POST") {
    const body = await readBody(req);
    const { token, type } = body;
    const nick = sessionNick(token);
    if (!nick) return sendJSON(res, 401, { error: "not_logged_in" });
    let result = { ok: true };
    switch (type) {
      case "queue": result = joinQueue(token, body); break;
      case "cancelQueue": cancelQueue(token); break;
      case "createPrivate": result = createPrivate(token, body); break;
      case "joinPrivate": result = joinPrivate(token, body.code); break;
      case "answer": submitAnswer(token, body.value, body.seq); break;
      case "rematch": requestRematch(token); break;
      case "leave": leaveAll(token); break;
      case "logout": dropClient(token); dropSession(token); break;
      default: return sendJSON(res, 400, { error: "unknown_action" });
    }
    return sendJSON(res, 200, result);
  }

  // ---- Statiskās lapas ----
  return serveStatic(req, res, path);
});

server.listen(PORT, () => {
  console.log(`Matemātikas duelis darbojas: http://localhost:${PORT} (glabātuve: ${storageMode()})`);
});

// Render pirms jaunas versijas sūta SIGTERM — saglabājam nesaglabātās izmaiņas.
let shuttingDown = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${sig} — saglabāju datus un izslēdzos`);
    try { await flushDB(); } catch (e) { console.error("[server] flush kļūda:", e.message); }
    process.exit(0);
  });
}
