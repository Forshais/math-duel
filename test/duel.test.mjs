// Two simulated players against a running server.
// Usage: start the server (PORT=3456), then: node test/duel.test.mjs [baseUrl]
// Takes ~25 s (waits out the 15 s reconnect grace period once).
const BASE = process.argv[2] || "http://localhost:3456";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK  " : "  FAIL") + " " + msg); if (!cond) fails++; };

function solve(text) {
  const [a, op, b] = text.split(" ");
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
}

async function login(nick, pin) {
  const r = await fetch(BASE + "/api/login", { method: "POST", body: JSON.stringify({ nick, pin }) });
  return { status: r.status, ...(await r.json()) };
}

class Player {
  constructor(nick, token) { this.nick = nick; this.token = token; this.events = []; this.waiters = []; }
  async connect() {
    this.ctrl = new AbortController();
    const r = await fetch(`${BASE}/api/stream?token=${this.token}`, { signal: this.ctrl.signal });
    if (r.status !== 200) throw new Error("stream " + r.status);
    (async () => {
      const dec = new TextDecoder(); let buf = "";
      try {
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
            buf = buf.slice(i + 2);
            if (!line) continue;
            const msg = JSON.parse(line.slice(6));
            this.events.push(msg);
            this.waiters = this.waiters.filter((w) => !(w.pred(msg) && (w.res(msg), true)));
          }
        }
      } catch {}
    })();
  }
  disconnect() { this.ctrl.abort(); }
  forget() { this.events.forEach((e) => (e._used = true)); }
  wait(type, ms = 8000) {
    const hit = this.events.find((e) => e.type === type && !e._used);
    if (hit) { hit._used = true; return Promise.resolve(hit); }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${this.nick}: timeout waiting ${type}`)), ms);
      this.waiters.push({ pred: (m) => m.type === type, res: (m) => { m._used = true; clearTimeout(t); res(m); } });
    });
  }
  act(type, extra = {}) {
    return fetch(BASE + "/api/action", { method: "POST", body: JSON.stringify({ token: this.token, type, ...extra }) }).then((r) => r.json());
  }
}

async function newMatch(A, B) {
  const cr = await A.act("createPrivate", { levelId: 1, formats: ["blitz"], ops: ["+"] });
  await B.act("joinPrivate", { code: cr.code });
  await A.wait("matchFound"); await B.wait("matchFound");
}

const suffix = Math.floor(Math.random() * 9000 + 1000);
const nA = "Alice" + suffix, nB = "Bob" + suffix;

console.log("1) Login + error codes");
ok((await login("x", "1234")).error === "nick_length", "short nick → nick_length");
const la = await login(nA, "1234"), lb = await login(nB, "5678");
ok(la.token && lb.token, "both signed in");
ok((await login(nA, "9999")).error === "nick_taken", "wrong PIN → nick_taken");

const A = new Player(nA, la.token), B = new Player(nB, lb.token);
await A.connect(); await B.connect();
ok((await A.wait("ready")).inMatch === false, "ready.inMatch=false");
await B.wait("ready");

console.log("2) Private room");
ok((await B.act("joinPrivate", { code: "ZZZZ" })).error === "no_room", "bad code → no_room");
await newMatch(A, B);
ok(true, "matchFound for both");

console.log("3) Rounds");
let rs = await A.wait("roundStart"); await B.wait("roundStart");
await A.act("answer", { value: solve(rs.text), seq: rs.seq });
let rr = await B.wait("roundResult");
ok(rr.answeredBy === nA && rr.correct === true && rr.delta > 0, "A correct → B sees nick + answer");
await A.wait("roundResult");
rs = await A.wait("roundStart", 6000); await B.wait("roundStart", 6000);
await B.act("answer", { value: solve(rs.text) + 1, seq: rs.seq });
rr = await A.wait("roundResult");
ok(rr.answeredBy === nB && rr.correct === false && rr.delta < 0, "B wrong → A sees ✗ + correct answer");

console.log("4) Short disconnect (back in time)");
B.disconnect(); await sleep(1500); B.forget(); await B.connect();
const resume = await B.wait("resume", 5000);
ok(resume.opponent === nA, "B gets resume");
ok((await B.wait("ready")).inMatch === true, "ready.inMatch=true");
ok(!A.events.some((e) => e.type === "opponentLeft" || e.type === "matchEnd"), "A was not kicked");

console.log("5) Gone > 15 s → forfeit win");
B.disconnect();
const end = await A.wait("matchEnd", 25000);
ok(end.result === "win" && end.forfeit === true, "A wins by forfeit");

console.log("6) Leave during match → instant win");
A.forget(); await B.connect(); B.forget();
await newMatch(A, B);
await A.wait("roundStart");
await B.act("leave");
ok((await A.wait("matchEnd", 5000)).result === "win", "A wins immediately");

console.log("7) Logout");
await A.act("logout");
ok((await fetch(`${BASE}/api/profile?token=${la.token}`)).status === 401, "token invalid after logout");

A.disconnect(); B.disconnect();
console.log(fails ? `\n${fails} FAIL` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
