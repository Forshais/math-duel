// app.js — Matemātikas duelis klients
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const NUMPAD_LAYOUTS = {
  calc:  [7, 8, 9, 4, 5, 6, 1, 2, 3], // kalkulatora stils (7-8-9 augšā)
  phone: [1, 2, 3, 4, 5, 6, 7, 8, 9], // telefona stils (1-2-3 augšā)
};
const TOL_OPTIONS = [30, 100, 200, 500, "any"];

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

const state = {
  token: null,
  nick: null,
  profile: null,
  config: null,
  level: 1,
  formats: ["blitz"],          // vairāki formāti atļauti matchmaking
  ops: ["+", "-", "*", "/"],
  numpadLayout: lsGet("md_numpad", "calc"),
  ratingTol: (() => { const t = lsGet("md_tol", "200"); return t === "any" ? "any" : Number(t); })(),
  vibrate: lsGet("md_vibrate", "1") === "1",
  match: null,
  answer: "",
  locked: true,
  seq: 0,
  es: null,
  timerRAF: null,
  countdownIv: null,
  endsAt: 0,
  clockOffset: 0,              // servera pulkstenis − telefona pulkstenis (ms)
  pendingJoin: null,           // istabas kods no uzaicinājuma saites (?join=KODS)
  settingsBack: "#screen-lobby",
};

const OP_LABELS = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function show(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}
function isActive(id) { return $(id).classList.contains("active"); }

function buzz(pattern) {
  if (state.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch {} }
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
    if (!r.ok) { $("#login-error").textContent = tErr(data.error, "login.failed"); return; }
    lsSet("md_nick", nick);
    await startSession(data.token, data.profile);
  } catch (e) {
    $("#login-error").textContent = t("login.netError");
  }
}

async function startSession(token, profile) {
  state.token = token;
  state.nick = profile.nick;
  state.profile = profile;
  lsSet("md_token", token);
  await loadConfig();
  connectStream();
  enterLobby();
  if (state.pendingJoin) {
    const code = state.pendingJoin;
    state.pendingJoin = null;
    $("#in-code").value = code;
    joinByCode(code);
  }
}

// Pēc lapas pārlādes mēģinām turpināt to pašu sesiju (ja serveris nav pārstartējies).
async function tryResume() {
  const token = lsGet("md_token", null);
  if (!token) return false;
  try {
    const r = await fetch(`/api/profile?token=${encodeURIComponent(token)}`);
    if (!r.ok) { lsDel("md_token"); return false; }
    const d = await r.json();
    await startSession(token, d.profile);
    return true;
  } catch { return false; }
}

function sessionExpired() {
  if (state.es) { state.es.close(); state.es = null; }
  state.token = null;
  lsDel("md_token");
  cancelAnimationFrame(state.timerRAF);
  $("#login-error").textContent = t("login.expired");
  show("#screen-login");
}

async function logout() {
  try { await action("logout"); } catch {}
  if (state.es) { state.es.close(); state.es = null; }
  state.token = null;
  lsDel("md_token");
  $("#login-error").textContent = "";
  show("#screen-login");
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
  es.onerror = async () => {
    // CONNECTING = pārlūks pats mēģina vēlreiz. CLOSED = serveris atteica (parasti 401).
    if (es.readyState !== EventSource.CLOSED || state.es !== es) return;
    try {
      const r = await fetch(`/api/profile?token=${encodeURIComponent(state.token)}`);
      if (r.status === 401) return sessionExpired();
    } catch {}
    setTimeout(() => { if (state.es === es && state.token) connectStream(); }, 2000);
  };
}

function handleEvent(msg) {
  switch (msg.type) {
    case "ready":
      state.profile = msg.profile;
      renderLobbyProfile();
      // Savienojums atjaunojās, bet partija pa to laiku beidzās/pazuda
      if (!msg.inMatch && (isActive("#screen-duel") || isActive("#screen-countdown"))) enterLobby();
      break;
    case "queued": break;
    case "queueCancelled": break;
    case "privateCreated": showWaitCode(msg.code); break;
    case "matchFound": onMatchFound(msg); break;
    case "resume": onResume(msg); break;
    case "roundStart": onRoundStart(msg); break;
    case "roundResult": onRoundResult(msg); break;
    case "matchEnd": onMatchEnd(msg); break;
    case "opponentLeft": onOpponentLeft(); break;
    case "opponentGone": onOpponentGone(); break;
    case "opponentWantsRematch": $("#rematch-status").textContent = t("result.oppWants"); break;
    case "error": alert(msg.message || "Error"); break;
  }
}

async function action(type, extra = {}) {
  const r = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: state.token, type, ...extra }),
  });
  if (r.status === 401) { sessionExpired(); return { ok: false }; }
  return r.json();
}

// ---------- Lobby ----------
function enterLobby() {
  cancelAnimationFrame(state.timerRAF);
  clearInterval(state.countdownIv);
  renderLobby();
  show("#screen-lobby");
}

function renderLobby() {
  if (!state.config) return;
  renderLobbyProfile();
  renderLevels();
  renderFormats();
  renderOps();
}

function renderLobbyProfile() {
  if (!state.profile) return;
  $("#lobby-nick").textContent = state.profile.nick;
  const rating = state.profile.ratings[state.level] ?? 1000;
  $("#lobby-rating").textContent = t("lobby.ratingLine", { level: state.level, rating });
  renderHistory();
}

function renderLevels() {
  const grid = $("#level-grid");
  grid.innerHTML = "";
  for (const l of state.config.levels) {
    const div = document.createElement("button");
    div.className = "lvl" + (l.id === state.level ? " sel" : "");
    const cap = l.maxValue >= 1000000 ? "1M" : l.maxValue.toLocaleString(numLocale());
    div.innerHTML = `<b>${l.id}</b><small>${t("lobby.upTo", { n: cap })}</small>`;
    div.onclick = () => { state.level = l.id; renderLevels(); renderLobbyProfile(); };
    grid.appendChild(div);
  }
}

function renderFormats() {
  const row = $("#format-row");
  row.innerHTML = "";
  for (const f of state.config.formats) {
    const b = document.createElement("button");
    b.className = "pill" + (state.formats.includes(f.id) ? " sel" : "");
    b.textContent = t("format." + f.id);
    b.onclick = () => {
      if (state.formats.includes(f.id)) {
        if (state.formats.length > 1) state.formats = state.formats.filter((x) => x !== f.id);
      } else {
        state.formats = [...state.formats, f.id];
      }
      renderFormats();
    };
    row.appendChild(b);
  }
}

function renderOps() {
  const row = $("#ops-row");
  row.innerHTML = "";
  for (const op of state.config.ops) {
    const b = document.createElement("button");
    b.className = "pill op" + (state.ops.includes(op) ? " sel" : "");
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
  if (!h.length) { ul.innerHTML = `<li class="empty">${t("lobby.noHistory")}</li>`; return; }
  for (const g of h.slice(0, 10)) {
    const li = document.createElement("li");
    const letter = t("history." + ({ win: "W", loss: "L", draw: "D" }[g.result]));
    const delta = g.delta > 0 ? `+${g.delta}` : `${g.delta}`;
    const mid = t("history.vs", { level: g.levelId, opp: escapeHtml(g.oppNick), me: g.myScore, them: g.oppScore });
    li.innerHTML =
      `<span class="h-res ${g.result}">${letter}</span>` +
      `<span class="h-mid">${mid}${g.forfeit ? " 🏳" : ""}</span>` +
      `<span class="h-delta ${g.delta >= 0 ? "up" : "down"}">${delta}</span>`;
    ul.appendChild(li);
  }
}

// ---------- Ciparnīca ----------
function buildNumpad(container, interactive) {
  container.innerHTML = "";
  const digits = NUMPAD_LAYOUTS[state.numpadLayout] || NUMPAD_LAYOUTS.calc;
  const cls = interactive ? "np" : "np-preview";
  for (const d of digits) {
    const b = document.createElement("button");
    b.className = cls;
    b.dataset.k = String(d);
    b.textContent = String(d);
    container.appendChild(b);
  }
  // apakšējā rinda: ⌫ 0 OK
  const del = document.createElement("button");
  del.className = cls; del.dataset.k = "del"; del.textContent = "⌫";
  const zero = document.createElement("button");
  zero.className = cls; zero.dataset.k = "0"; zero.textContent = "0";
  const ok = document.createElement("button");
  ok.className = interactive ? "np np-ok" : "np-preview ok"; ok.dataset.k = "ok"; ok.textContent = "OK";
  container.append(del, zero, ok);
}

function renderNumpad() { buildNumpad($("#numpad"), true); }

// ---------- Gaidīšana ----------
function showWait(title, withCode) {
  $("#wait-title").textContent = title;
  $("#wait-code").hidden = !withCode;
  show("#screen-wait");
}
function showWaitCode(code) {
  $("#code-value").textContent = code;
  $("#btn-share").textContent = t("wait.share");
  showWait(t("wait.roomCreated"), true);
}

function inviteLink(code) {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
}

async function shareInvite() {
  const code = $("#code-value").textContent;
  const url = inviteLink(code);
  const text = t("wait.shareText", { code });
  if (navigator.share) {
    try { await navigator.share({ title: t("title"), text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    $("#btn-share").textContent = t("wait.copied");
  } catch {
    prompt(text, url);
  }
}

async function joinByCode(code) {
  code = String(code || "").trim().toUpperCase();
  if (code.length < 4) return;
  const r = await action("joinPrivate", { code });
  if (!r.ok) { if (r.error) alert(tErr(r.error, "alert.joinFailed")); }
  else if (!isActive("#screen-countdown")) showWait(t("wait.connecting"), false);
}

// ---------- Spēle ----------
function setupMatch(m) {
  state.match = { you: m.you, opponent: m.opponent, levelId: m.levelId, format: m.format, seconds: m.seconds };
  renderNumpad();
  $("#cd-you").textContent = m.you;
  $("#cd-opp").textContent = m.opponent;
  $("#sb-you .sb-name").textContent = m.you;
  $("#sb-opp .sb-name").textContent = m.opponent;
  $("#sb-you .sb-score").textContent = "0";
  $("#sb-opp .sb-score").textContent = "0";
  $("#sb-you .sb-delta").textContent = "";
  $("#sb-opp .sb-delta").textContent = "";
  hideFlash();
}

function onMatchFound(m) {
  setupMatch(m);
  show("#screen-countdown");
  let n = Math.ceil((m.countdownMs || 3000) / 1000);
  const el = $("#cd-number");
  el.textContent = n;
  restartAnim(el);
  clearInterval(state.countdownIv);
  state.countdownIv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(state.countdownIv); return; }
    el.textContent = n;
    restartAnim(el);
  }, 1000);
}

// Savienojums atjaunojās partijas laikā — atjaunojam ekrānu no servera stāvokļa
function onResume(m) {
  clearInterval(state.countdownIv);
  setupMatch(m);
  updateScores(m.scores);
  if (m.round) {
    onRoundStart({ seq: m.round.seq, text: m.round.text, scores: m.scores, endsAt: m.endsAt, serverNow: m.serverNow });
  } else if (m.endsAt) {
    state.endsAt = m.endsAt;
    state.clockOffset = m.serverNow - Date.now();
    state.locked = true;
    $("#numpad").classList.add("locked");
    $("#question-text").style.visibility = "hidden";
    show("#screen-duel");
    startTimer();
  } else {
    show("#screen-countdown");
  }
}

// Animācijas pārstartēšana: noņem klasi, piespiež pārlūku to "ievērot", pieliek atpakaļ.
// (Bez šī vairāki telefoni otro reizi animāciju vairs nerāda.)
function restartAnim(el, cls) {
  if (cls) el.classList.remove(cls);
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  if (cls) el.classList.add(cls);
}

function hideFlash() {
  $("#round-flash").className = "round-flash";
  $("#transition-circle").className = "transition-circle";
}

function onRoundStart(m) {
  show("#screen-duel");
  hideFlash();
  state.answer = "";
  state.locked = false;
  state.seq = m.seq;
  state.endsAt = m.endsAt;
  if (m.serverNow) state.clockOffset = m.serverNow - Date.now();
  updateScores(m.scores);
  const q = $("#question-text");
  q.textContent = m.text;
  q.style.visibility = "visible";
  restartAnim(q, "enter");
  $("#answer-display").innerHTML = "&nbsp;";
  $("#answer-display").classList.remove("sent");
  $("#numpad").classList.remove("locked");
  startTimer();
}

// Raunda rezultāts. Rāda līdz nākamajam uzdevumam:
//  • es pareizi            → zaļš ✓ (+punkti)
//  • es nepareizi          → sarkans ✗ + pareizā atbilde pelēkā
//  • pretinieks pareizi    → pretinieka Nick + pareizā atbilde pelēkā
//  • pretinieks nepareizi  → ✗ Nick + pareizā atbilde pelēkā
//  • neviens nepaspēja     → "Laiks beidzās" + pareizā atbilde pelēkā
function onRoundResult(m) {
  if (m.seq != null && m.seq !== state.seq) return;
  state.locked = true;
  $("#numpad").classList.add("locked");
  updateScores(m.scores);

  const main = $("#rf-main");
  const sub = $("#rf-sub");
  main.className = "rf-main";
  sub.className = "rf-sub";
  main.innerHTML = "";
  sub.innerHTML = "";

  const mine = !!(m.answeredBy && state.match && m.answeredBy === state.match.you);
  const answer = Number(m.answer).toLocaleString(numLocale());
  let tone;

  if (m.answeredBy == null) {
    tone = "neutral";
    main.innerHTML = `<span class="rf-small">${t("duel.nobody")}</span>`;
    sub.textContent = "= " + answer;
  } else if (mine && m.correct) {
    tone = "good";
    main.innerHTML = `<span class="rf-icon">✓</span>`;
    sub.innerHTML = `<span class="rf-pts good">+${m.delta}</span>`;
    buzz(30);
  } else if (mine) {
    tone = "bad";
    main.innerHTML = `<span class="rf-icon">✗</span>`;
    sub.innerHTML = `<s class="rf-wrong">${escapeHtml(String(m.submitted))}</s> = ${answer}`;
    buzz([60, 40, 60]);
  } else if (m.correct) {
    tone = "opp";
    main.innerHTML = `<span class="rf-nick">${escapeHtml(m.answeredBy)}</span>`;
    sub.textContent = "= " + answer;
    buzz(80);
  } else {
    tone = "neutral";
    main.innerHTML = `<span class="rf-icon bad">✗</span><span class="rf-nick">${escapeHtml(m.answeredBy)}</span>`;
    sub.textContent = "= " + answer;
  }
  main.classList.add(tone);

  if (m.answeredBy != null && m.delta) {
    showDelta(mine ? "#sb-you" : "#sb-opp", m.delta);
  }

  $("#question-text").style.visibility = "hidden";
  $("#answer-display").innerHTML = "&nbsp;";
  restartAnim($("#round-flash"), "show");

  // pāreja: aplis aiz rezultāta, iekrāsots pēc iznākuma
  const circle = $("#transition-circle");
  circle.className = "transition-circle " + tone;
  restartAnim(circle, "run");
}

function showDelta(sel, delta) {
  const el = $(sel + " .sb-delta");
  el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
  el.className = "sb-delta " + (delta > 0 ? "up" : "down");
  restartAnim(el, "pop");
}

function updateScores(scores) {
  if (!scores || !state.match) return;
  for (const s of scores) {
    if (s.nick === state.match.you) $("#sb-you .sb-score").textContent = s.score;
    else $("#sb-opp .sb-score").textContent = s.score;
  }
}

function startTimer() {
  cancelAnimationFrame(state.timerRAF);
  const tick = () => {
    const now = Date.now() + state.clockOffset;
    const left = Math.max(0, state.endsAt - now);
    const total = (state.match?.seconds || 60) * 1000;
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    const fill = $("#timer-fill");
    fill.style.width = pct + "%";
    fill.classList.toggle("low", left < 10000);
    const sec = Math.ceil(left / 1000);
    $("#timer-text").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    if (left > 0) state.timerRAF = requestAnimationFrame(tick);
  };
  tick();
}

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
  $("#answer-display").classList.add("sent");
  action("answer", { value: val, seq: state.seq }).catch(() => {});
}

function onMatchEnd(m) {
  cancelAnimationFrame(state.timerRAF);
  clearInterval(state.countdownIv);
  hideFlash();
  const badge = $("#result-badge");
  badge.textContent = t("result." + m.result);
  badge.className = "result-badge " + m.result;
  $("#result-note").textContent = m.forfeit && m.result === "win" ? t("result.forfeit") : "";
  $("#result-you-score").textContent = m.yourScore;
  $("#result-opp-score").textContent = m.oppScore;
  const dir = m.delta >= 0 ? "up" : "down";
  const sign = m.delta > 0 ? "+" : "";
  $("#result-rating").innerHTML = t("result.rating", { level: m.levelId, rating: m.newRating, dir, delta: sign + m.delta });
  $("#rematch-status").textContent = "";
  $("#btn-rematch").disabled = !!m.forfeit;
  if (m.result === "win") buzz([40, 60, 40, 60, 120]);
  refreshProfile();
  show("#screen-result");
}

function onOpponentLeft() {
  if (isActive("#screen-duel") || isActive("#screen-countdown")) {
    alert(t("alert.oppLeft"));
  }
  refreshProfile();
  enterLobby();
}

function onOpponentGone() {
  if (!isActive("#screen-result")) return;
  $("#rematch-status").textContent = t("result.oppGone");
  $("#btn-rematch").disabled = true;
}

async function refreshProfile() {
  try {
    const r = await fetch(`/api/profile?token=${encodeURIComponent(state.token)}`);
    const d = await r.json();
    if (d.profile) { state.profile = d.profile; renderLobbyProfile(); }
  } catch {}
}

// ---------- Valoda ----------
function renderLangRow(row) {
  row.innerHTML = "";
  for (const l of LANGS) {
    const b = document.createElement("button");
    b.className = "pill" + (currentLang === l.id ? " sel" : "");
    b.textContent = l.label;
    b.onclick = () => changeLang(l.id);
    row.appendChild(b);
  }
}

function changeLang(lang) {
  setLang(lang);
  renderLangRow($("#login-lang"));
  renderLangRow($("#lang-row"));
  renderLobby();
  if (isActive("#screen-settings")) renderSettings();
  // Kļūdas teksts paliktu vecajā valodā — notīrām
  $("#login-error").textContent = "";
}

// ---------- Iestatījumi ----------
function openSettings() {
  renderSettings();
  show("#screen-settings");
}
function renderSettings() {
  renderLangRow($("#lang-row"));
  renderNumpadLayoutRow();
  renderTolRow();
  renderVibrateRow();
  buildNumpad($("#numpad-preview"), false);
}
function renderNumpadLayoutRow() {
  const row = $("#numpad-layout-row");
  row.innerHTML = "";
  const opts = [{ v: "calc", label: t("settings.numpadCalc") }, { v: "phone", label: t("settings.numpadPhone") }];
  for (const o of opts) {
    const b = document.createElement("button");
    b.className = "pill" + (state.numpadLayout === o.v ? " sel" : "");
    b.textContent = o.label;
    b.onclick = () => {
      state.numpadLayout = o.v; lsSet("md_numpad", o.v);
      renderNumpadLayoutRow(); buildNumpad($("#numpad-preview"), false);
    };
    row.appendChild(b);
  }
}
function renderTolRow() {
  const row = $("#tol-row");
  row.innerHTML = "";
  for (const v of TOL_OPTIONS) {
    const b = document.createElement("button");
    b.className = "pill" + (String(state.ratingTol) === String(v) ? " sel" : "");
    b.textContent = v === "any" ? t("settings.tolAny") : `±${v}`;
    b.onclick = () => {
      state.ratingTol = v; lsSet("md_tol", String(v));
      renderTolRow();
    };
    row.appendChild(b);
  }
}
function renderVibrateRow() {
  const row = $("#vibrate-row");
  row.innerHTML = "";
  for (const v of [true, false]) {
    const b = document.createElement("button");
    b.className = "pill" + (state.vibrate === v ? " sel" : "");
    b.textContent = t(v ? "settings.on" : "settings.off");
    b.onclick = () => {
      state.vibrate = v; lsSet("md_vibrate", v ? "1" : "0");
      renderVibrateRow();
      buzz(30);
    };
    row.appendChild(b);
  }
}

// ---------- Tops ----------
let boardLevel = 1;
async function openBoard() {
  boardLevel = state.level;
  renderBoardLevels();
  show("#screen-board");
  await loadBoard();
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
  if (!d.top.length) { ol.innerHTML = `<li class="empty">${t("board.empty")}</li>`; return; }
  for (const p of d.top) {
    const li = document.createElement("li");
    if (state.profile && p.nick === state.profile.nick) li.className = "me";
    li.innerHTML = `<span class="b-nick">${escapeHtml(p.nick)}</span><span class="b-rating">${p.rating}</span><span class="b-games">${t("board.games", { n: p.games })}</span>`;
    ol.appendChild(li);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- Notikumu piesaiste ----------
$("#btn-login").onclick = login;
$("#in-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
try { const saved = localStorage.getItem("md_nick"); if (saved) $("#in-nick").value = saved; } catch {}

$("#btn-quick").onclick = async () => {
  showWait(t("wait.searching"), false);
  await action("queue", { levelId: state.level, formats: state.formats, ops: state.ops, ratingTol: state.ratingTol });
};
$("#btn-create").onclick = async () => {
  await action("createPrivate", { levelId: state.level, formats: state.formats, ops: state.ops });
};
$("#btn-join").onclick = () => joinByCode($("#in-code").value);
$("#in-code").addEventListener("keydown", (e) => { if (e.key === "Enter") joinByCode($("#in-code").value); });
$("#btn-share").onclick = shareInvite;
$("#btn-cancel-wait").onclick = async () => { await action("leave"); enterLobby(); };
$("#btn-rematch").onclick = async () => {
  $("#btn-rematch").disabled = true;
  $("#rematch-status").textContent = t("result.waitingOpp");
  await action("rematch");
};
$("#btn-lobby").onclick = async () => { await action("leave"); refreshProfile(); enterLobby(); };
$("#btn-board").onclick = openBoard;
$("#btn-board-back").onclick = () => show("#screen-lobby");
$("#btn-settings").onclick = openSettings;
$("#btn-settings-back").onclick = () => { renderLobby(); show("#screen-lobby"); };
$("#btn-logout").onclick = logout;

// pointerdown (nevis click) — reaģē uzreiz pie pieskāriena, bez telefona aizkaves.
// Ātruma spēlē katra milisekunde skaitās.
$("#numpad").addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".np");
  if (!b) return;
  e.preventDefault();
  onKey(b.dataset.k);
});
document.addEventListener("keydown", (e) => {
  if (!isActive("#screen-duel")) return;
  if (e.key >= "0" && e.key <= "9") onKey(e.key);
  else if (e.key === "Backspace") onKey("del");
  else if (e.key === "Enter") onKey("ok");
});

// ---------- Starts ----------
(async function boot() {
  const params = new URLSearchParams(location.search);
  const join = params.get("join");
  if (join) {
    state.pendingJoin = join.toUpperCase().slice(0, 4);
    history.replaceState(null, "", location.pathname); // lai pārlādējot neiestātos atkal
  }
  applyI18n();
  renderLangRow($("#login-lang"));
  await tryResume();
})();
