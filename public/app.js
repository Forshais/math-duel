// app.js — Matemātikas duelis klients
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const state = {
  token: null,
  nick: null,
  profile: null,
  config: null,
  level: 1,
  format: "blitz",
  ops: ["+", "-", "*", "/"],
  match: null,      // { you, opponent, levelId }
  answer: "",
  locked: true,
  es: null,         // EventSource
  timerRAF: null,
  endsAt: 0,
};

const OP_LABELS = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function show(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

// ---------- Pieteikšanās ----------
async function login() {
  const nick = $("#in-nick").value.trim();
  const pin = $("#in-pin").value.trim();
  $("#login-error").textContent = "";
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick, pin }),
    });
    const data = await r.json();
    if (!r.ok) { $("#login-error").textContent = data.error || "Neizdevās pieteikties."; return; }
    state.token = data.token;
    state.nick = data.profile.nick;
    state.profile = data.profile;
    try { localStorage.setItem("md_nick", nick); } catch {}
    await loadConfig();
    connectStream();
    enterLobby();
  } catch (e) {
    $("#login-error").textContent = "Savienojuma kļūda. Mēģini vēlreiz.";
  }
}

async function loadConfig() {
  const r = await fetch("/api/config");
  state.config = await r.json();
}

// ---------- SSE straume ----------
function connectStream() {
  if (state.es) state.es.close();
  const es = new EventSource(`/api/stream?token=${encodeURIComponent(state.token)}`);
  state.es = es;
  es.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleEvent(msg);
  };
  es.onerror = () => { /* pārlūks pats mēģina atkārtoti savienoties */ };
}

function handleEvent(msg) {
  switch (msg.type) {
    case "ready": state.profile = msg.profile; renderLobbyProfile(); break;
    case "queued": break;
    case "queueCancelled": break;
    case "privateCreated": showWaitCode(msg.code); break;
    case "matchFound": onMatchFound(msg); break;
    case "roundStart": onRoundStart(msg); break;
    case "roundResult": onRoundResult(msg); break;
    case "matchEnd": onMatchEnd(msg); break;
    case "opponentLeft": onOpponentLeft(); break;
    case "opponentWantsRematch": $("#rematch-status").textContent = "Pretinieks grib vēlreiz!"; break;
    case "error": alert(msg.message || "Kļūda"); break;
  }
}

async function action(type, extra = {}) {
  const r = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: state.token, type, ...extra }),
  });
  return r.json();
}

// ---------- Lobby ----------
function enterLobby() {
  renderLobbyProfile();
  renderLevels();
  renderFormats();
  renderOps();
  renderHistory();
  show("#screen-lobby");
}

function renderLobbyProfile() {
  if (!state.profile) return;
  $("#lobby-nick").textContent = state.profile.nick;
  const rating = state.profile.ratings[state.level] ?? 1000;
  $("#lobby-rating").textContent = `Līmenis ${state.level} · reitings ${rating}`;
  renderHistory();
}

function renderLevels() {
  const grid = $("#level-grid");
  grid.innerHTML = "";
  for (const l of state.config.levels) {
    const div = document.createElement("div");
    div.className = "lvl" + (l.id === state.level ? " sel" : "");
    const cap = l.maxValue >= 1000000 ? "1M" : l.maxValue.toLocaleString("lv-LV");
    div.innerHTML = `<b>${l.id}</b><small>līdz ${cap}</small>`;
    div.onclick = () => { state.level = l.id; renderLevels(); renderLobbyProfile(); };
    grid.appendChild(div);
  }
}

function renderFormats() {
  const row = $("#format-row");
  row.innerHTML = "";
  for (const f of state.config.formats) {
    const b = document.createElement("button");
    b.className = "pill" + (f.id === state.format ? " sel" : "");
    b.textContent = f.label;
    b.onclick = () => { state.format = f.id; renderFormats(); };
    row.appendChild(b);
  }
}

function renderOps() {
  const row = $("#ops-row");
  row.innerHTML = "";
  for (const op of state.config.ops) {
    const b = document.createElement("button");
    b.className = "pill" + (state.ops.includes(op) ? " sel" : "");
    b.textContent = OP_LABELS[op];
    b.onclick = () => {
      if (state.ops.includes(op)) {
        if (state.ops.length > 1) state.ops = state.ops.filter((o) => o !== op);
      } else {
        state.ops = [...state.ops, op];
      }
      renderOps();
    };
    row.appendChild(b);
  }
}

function renderHistory() {
  const ul = $("#history-list");
  ul.innerHTML = "";
  const h = state.profile?.history || [];
  if (!h.length) { ul.innerHTML = '<li class="empty">Vēl nav partiju</li>'; return; }
  for (const g of h.slice(0, 10)) {
    const li = document.createElement("li");
    const resLv = { win: "U", loss: "Z", draw: "N" }[g.result];
    const delta = g.delta > 0 ? `+${g.delta}` : `${g.delta}`;
    li.innerHTML =
      `<span class="h-res ${g.result}">${resLv}</span>` +
      `<span class="h-mid">L${g.levelId} · pret ${g.oppNick} · ${g.myScore}:${g.oppScore}</span>` +
      `<span class="h-delta ${g.delta >= 0 ? "up" : "down"}">${delta}</span>`;
    ul.appendChild(li);
  }
}

// ---------- Gaidīšana ----------
function showWait(title, withCode) {
  $("#wait-title").textContent = title;
  $("#wait-code").hidden = !withCode;
  show("#screen-wait");
}
function showWaitCode(code) {
  $("#code-value").textContent = code;
  showWait("Istaba izveidota", true);
}

// ---------- Spēle ----------
function onMatchFound(m) {
  state.match = { you: m.you, opponent: m.opponent, levelId: m.levelId };
  $("#cd-you").textContent = m.you;
  $("#cd-opp").textContent = m.opponent;
  $("#sb-you").querySelector(".sb-name").textContent = m.you;
  $("#sb-opp").querySelector(".sb-name").textContent = m.opponent;
  $("#sb-you").querySelector(".sb-score").textContent = "0";
  $("#sb-opp").querySelector(".sb-score").textContent = "0";
  show("#screen-countdown");
  let n = Math.ceil((m.countdownMs || 3000) / 1000);
  $("#cd-number").textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); return; }
    const el = $("#cd-number");
    el.textContent = n;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  }, 1000);
}

function onRoundStart(m) {
  show("#screen-duel");
  state.answer = "";
  state.locked = false;
  state.endsAt = m.endsAt;
  updateScores(m.scores);
  $("#question-text").textContent = m.text;
  $("#question-text").style.visibility = "visible";
  $("#answer-display").innerHTML = "&nbsp;";
  $("#numpad").classList.remove("locked");
  startTimer();
}

function onRoundResult(m) {
  state.locked = true;
  $("#numpad").classList.add("locked");
  updateScores(m.scores);

  const flash = $("#round-flash");
  flash.className = "round-flash";
  void flash.offsetWidth;
  if (m.answeredBy === null) {
    flash.textContent = "—";
    flash.classList.add("show");
  } else {
    const mine = m.answeredBy === state.match.you;
    flash.textContent = m.correct ? (mine ? "✓" : "✓ " + m.answeredBy) : "✗";
    flash.classList.add("show", m.correct ? "good" : "bad");
  }
  // pāreja: uzpūšanās aplis
  const circle = $("#transition-circle");
  circle.className = "transition-circle";
  void circle.offsetWidth;
  circle.classList.add("run");
  $("#question-text").style.visibility = "hidden";
  $("#answer-display").innerHTML = "&nbsp;";
}

function updateScores(scores) {
  if (!scores || !state.match) return;
  for (const s of scores) {
    if (s.nick === state.match.you) $("#sb-you").querySelector(".sb-score").textContent = s.score;
    else $("#sb-opp").querySelector(".sb-score").textContent = s.score;
  }
}

function startTimer() {
  cancelAnimationFrame(state.timerRAF);
  const tick = () => {
    const left = Math.max(0, state.endsAt - Date.now());
    const total = state.config.formats.find((f) => f.id === state.format)?.seconds * 1000 || 60000;
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    $("#timer-fill").style.width = pct + "%";
    const sec = Math.ceil(left / 1000);
    $("#timer-text").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    if (left > 0) state.timerRAF = requestAnimationFrame(tick);
  };
  tick();
}

// Ciparnīca
function onKey(k) {
  if (state.locked) return;
  if (k === "del") state.answer = state.answer.slice(0, -1);
  else if (k === "ok") { submitAnswer(); return; }
  else if (state.answer.length < 9) state.answer += k;
  $("#answer-display").textContent = state.answer || " ";
}

function submitAnswer() {
  if (state.locked || state.answer === "") return;
  const val = state.answer;
  state.locked = true;
  action("answer", { value: val });
}

function onMatchEnd(m) {
  cancelAnimationFrame(state.timerRAF);
  const badge = $("#result-badge");
  const label = { win: "UZVARA!", loss: "Zaudējums", draw: "Neizšķirts" }[m.result];
  badge.textContent = label;
  badge.className = "result-badge " + m.result;
  $("#result-you-score").textContent = m.yourScore;
  $("#result-opp-score").textContent = m.oppScore;
  const dir = m.delta >= 0 ? "up" : "down";
  const sign = m.delta > 0 ? "+" : "";
  $("#result-rating").innerHTML =
    `Reitings (L${m.levelId}): <b>${m.newRating}</b> <span class="${dir}">(${sign}${m.delta})</span>`;
  $("#rematch-status").textContent = "";
  $("#btn-rematch").disabled = false;
  refreshProfile();
  show("#screen-result");
}

function onOpponentLeft() {
  if ($("#screen-duel").classList.contains("active") || $("#screen-countdown").classList.contains("active")) {
    alert("Pretinieks aizgāja no partijas.");
  }
  refreshProfile();
  enterLobby();
}

async function refreshProfile() {
  try {
    const r = await fetch(`/api/profile?token=${encodeURIComponent(state.token)}`);
    const d = await r.json();
    if (d.profile) { state.profile = d.profile; }
  } catch {}
}

// ---------- Tops ----------
let boardLevel = 1;
async function openBoard() {
  boardLevel = state.level;
  renderBoardLevels();
  await loadBoard();
  show("#screen-board");
}
function renderBoardLevels() {
  const row = $("#board-levels");
  row.innerHTML = "";
  for (const l of state.config.levels) {
    const b = document.createElement("button");
    b.className = "pill" + (l.id === boardLevel ? " sel" : "");
    b.textContent = "L" + l.id;
    b.onclick = async () => { boardLevel = l.id; renderBoardLevels(); await loadBoard(); };
    row.appendChild(b);
  }
}
async function loadBoard() {
  const r = await fetch(`/api/leaderboard?level=${boardLevel}`);
  const d = await r.json();
  const ol = $("#board-list");
  ol.innerHTML = "";
  if (!d.top.length) { ol.innerHTML = '<li class="empty">Vēl nav spēlētāju</li>'; return; }
  for (const p of d.top) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="b-nick">${escapeHtml(p.nick)}</span><span class="b-rating">${p.rating}</span><span class="b-games">${p.games} sp.</span>`;
    ol.appendChild(li);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- Notikumu piesaiste ----------
$("#btn-login").onclick = login;
$("#in-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
try { const saved = localStorage.getItem("md_nick"); if (saved) $("#in-nick").value = saved; } catch {}

$("#btn-quick").onclick = async () => {
  showWait("Meklējam pretinieku…", false);
  await action("queue", { levelId: state.level, format: state.format, ops: state.ops });
};
$("#btn-create").onclick = async () => {
  await action("createPrivate", { levelId: state.level, format: state.format, ops: state.ops });
};
$("#btn-join").onclick = async () => {
  const code = $("#in-code").value.trim().toUpperCase();
  if (code.length < 4) return;
  const r = await action("joinPrivate", { code });
  if (!r.ok) alert(r.error || "Neizdevās pievienoties.");
  else showWait("Savienojam…", false);
};
$("#btn-cancel-wait").onclick = async () => { await action("leave"); enterLobby(); };
$("#btn-rematch").onclick = async () => {
  $("#btn-rematch").disabled = true;
  $("#rematch-status").textContent = "Gaidām pretinieku…";
  await action("rematch");
};
$("#btn-lobby").onclick = async () => { await action("leave"); enterLobby(); };
$("#btn-board").onclick = openBoard;
$("#btn-board-back").onclick = () => show("#screen-lobby");

$("#numpad").addEventListener("click", (e) => {
  const b = e.target.closest(".np");
  if (b) onKey(b.dataset.k);
});
// Fiziskā klaviatūra (datoram)
document.addEventListener("keydown", (e) => {
  if (!$("#screen-duel").classList.contains("active")) return;
  if (e.key >= "0" && e.key <= "9") onKey(e.key);
  else if (e.key === "Backspace") onKey("del");
  else if (e.key === "Enter") onKey("ok");
});
