// i18n.js — tulkojumi (EN noklusēti, LV iestatījumos)
"use strict";

const I18N = {
  en: {
    "title": "Math Duel",
    "logo.a": "Math",
    "logo.b": "Duel",
    "tagline": "Faster. Sharper. Win.",
    "login.nick": "Your nick",
    "login.nickPh": "e.g. John",
    "login.pin": "PIN (4–8 digits)",
    "login.btn": "Sign in / Register",
    "login.hint": "Use the same nick + PIN next time to keep your rating and history.",
    "login.failed": "Could not sign in.",
    "login.netError": "Connection error. Please try again.",
    "login.expired": "Your session expired (server restarted). Please sign in again.",

    "lobby.settings": "⚙ Settings",
    "lobby.board": "Leaderboard",
    "lobby.level": "Difficulty level",
    "lobby.formats": "Match length",
    "lobby.formatsHint": "(you can pick several)",
    "lobby.ops": "Operations",
    "lobby.quick": "Quick match",
    "lobby.or": "or play with a friend",
    "lobby.create": "Create room",
    "lobby.codePh": "CODE",
    "lobby.join": "Join",
    "lobby.history": "Recent matches",
    "lobby.noHistory": "No matches yet",
    "lobby.ratingLine": "Level {level} · rating {rating}",
    "lobby.upTo": "up to {n}",
    "lobby.logout": "Sign out",

    "format.blitz": "Blitz · 60 s",
    "format.m3": "3 minutes",
    "format.m5": "5 minutes",

    "history.vs": "L{level} · vs {opp} · {me}:{them}",
    "history.W": "W", "history.L": "L", "history.D": "D",

    "wait.searching": "Looking for an opponent…",
    "wait.roomCreated": "Room created",
    "wait.connecting": "Connecting…",
    "wait.sendCode": "Send this code to a friend:",
    "wait.codeHint": "Your friend enters it under “Join” — or just send them the link.",
    "wait.share": "Share invite link",
    "wait.copied": "Link copied!",
    "wait.shareText": "Join my Math Duel! Room code: {code}",
    "wait.cancel": "Cancel",

    "duel.nobody": "Time’s up",

    "result.win": "VICTORY!",
    "result.loss": "Defeat",
    "result.draw": "Draw",
    "result.rating": "Rating (L{level}): <b>{rating}</b> <span class=\"{dir}\">({delta})</span>",
    "result.forfeit": "Your opponent left the match — the win is yours.",
    "result.rematch": "Rematch",
    "result.lobby": "Back to lobby",
    "result.oppWants": "Your opponent wants a rematch!",
    "result.waitingOpp": "Waiting for your opponent…",
    "result.oppGone": "Your opponent has left.",

    "board.title": "Leaderboard",
    "board.back": "← Back",
    "board.empty": "No players yet",
    "board.games": "{n} gm",

    "settings.title": "Settings",
    "settings.lang": "Language",
    "settings.numpad": "Keypad layout",
    "settings.numpadCalc": "Calculator (7-8-9 on top)",
    "settings.numpadPhone": "Phone (1-2-3 on top)",
    "settings.tol": "Opponent rating range",
    "settings.tolHint": "Smaller range = more even opponents. Larger = faster matches when few people are online.",
    "settings.tolAny": "Any",
    "settings.vibrate": "Vibration on answers",
    "settings.on": "On",
    "settings.off": "Off",

    "alert.oppLeft": "Your opponent left the match.",
    "alert.joinFailed": "Could not join.",

    "err.nick_length": "Nick must be 2–20 characters long.",
    "err.nick_chars": "Nick may only contain letters, digits, spaces, _ and -.",
    "err.pin_format": "PIN must be 4–8 digits.",
    "err.nick_taken": "This nick is already taken with a different PIN.",
    "err.no_session": "Unknown session.",
    "err.no_room": "No room with that code.",
    "err.own_room": "You can’t join your own room.",
    "err.host_offline": "The room creator is no longer online.",
    "err.not_logged_in": "You are not signed in.",
  },

  lv: {
    "title": "Matemātikas duelis",
    "logo.a": "Matemātikas",
    "logo.b": "duelis",
    "tagline": "Ātrāk. Precīzāk. Uzvari.",
    "login.nick": "Tavs Nick",
    "login.nickPh": "piem. Janis",
    "login.pin": "PIN (4–8 cipari)",
    "login.btn": "Ienākt / Reģistrēties",
    "login.hint": "Ar to pašu Nick + PIN nākamreiz saglabāsies tavs reitings un vēsture.",
    "login.failed": "Neizdevās pieteikties.",
    "login.netError": "Savienojuma kļūda. Mēģini vēlreiz.",
    "login.expired": "Sesija beigusies (serveris pārstartējās). Lūdzu, piesakies vēlreiz.",

    "lobby.settings": "⚙ Iestatījumi",
    "lobby.board": "Tops",
    "lobby.level": "Grūtības līmenis",
    "lobby.formats": "Partijas garums",
    "lobby.formatsHint": "(var atzīmēt vairākus)",
    "lobby.ops": "Darbības",
    "lobby.quick": "Ātrā spēle",
    "lobby.or": "vai spēlē ar draugu",
    "lobby.create": "Izveidot istabu",
    "lobby.codePh": "KODS",
    "lobby.join": "Pievienoties",
    "lobby.history": "Pēdējās partijas",
    "lobby.noHistory": "Vēl nav partiju",
    "lobby.ratingLine": "Līmenis {level} · reitings {rating}",
    "lobby.upTo": "līdz {n}",
    "lobby.logout": "Iziet",

    "format.blitz": "Blitz · 60 s",
    "format.m3": "3 minūtes",
    "format.m5": "5 minūtes",

    "history.vs": "L{level} · pret {opp} · {me}:{them}",
    "history.W": "U", "history.L": "Z", "history.D": "N",

    "wait.searching": "Meklējam pretinieku…",
    "wait.roomCreated": "Istaba izveidota",
    "wait.connecting": "Savienojam…",
    "wait.sendCode": "Nosūti draugam šo kodu:",
    "wait.codeHint": "Draugs ievada to sadaļā “Pievienoties” — vai vienkārši nosūti saiti.",
    "wait.share": "Dalīties ar saiti",
    "wait.copied": "Saite nokopēta!",
    "wait.shareText": "Nāc uz Matemātikas dueli! Istabas kods: {code}",
    "wait.cancel": "Atcelt",

    "duel.nobody": "Laiks beidzās",

    "result.win": "UZVARA!",
    "result.loss": "Zaudējums",
    "result.draw": "Neizšķirts",
    "result.rating": "Reitings (L{level}): <b>{rating}</b> <span class=\"{dir}\">({delta})</span>",
    "result.forfeit": "Pretinieks pameta partiju — uzvara tev.",
    "result.rematch": "Vēlreiz",
    "result.lobby": "Uz sākumu",
    "result.oppWants": "Pretinieks grib vēlreiz!",
    "result.waitingOpp": "Gaidām pretinieku…",
    "result.oppGone": "Pretinieks aizgāja.",

    "board.title": "Tops",
    "board.back": "← Atpakaļ",
    "board.empty": "Vēl nav spēlētāju",
    "board.games": "{n} sp.",

    "settings.title": "Iestatījumi",
    "settings.lang": "Valoda",
    "settings.numpad": "Ciparnīcas izkārtojums",
    "settings.numpadCalc": "Kalkulators (7-8-9 augšā)",
    "settings.numpadPhone": "Telefons (1-2-3 augšā)",
    "settings.tol": "Ar kādiem pretiniekiem meklēt (reitinga starpība)",
    "settings.tolHint": "Mazāka starpība = līdzvērtīgāks pretinieks. Lielāka = ātrāk atrod spēli, kad maz cilvēku tiešsaistē.",
    "settings.tolAny": "Jebkurš",
    "settings.vibrate": "Vibrācija pie atbildēm",
    "settings.on": "Ieslēgta",
    "settings.off": "Izslēgta",

    "alert.oppLeft": "Pretinieks aizgāja no partijas.",
    "alert.joinFailed": "Neizdevās pievienoties.",

    "err.nick_length": "Nick jābūt 2–20 rakstzīmes garam.",
    "err.nick_chars": "Nick drīkst saturēt tikai burtus, ciparus, atstarpi, _ un -.",
    "err.pin_format": "PIN jābūt 4–8 cipari.",
    "err.nick_taken": "Šis Nick jau aizņemts ar citu PIN.",
    "err.no_session": "Nezināma sesija.",
    "err.no_room": "Nav tādas istabas koda.",
    "err.own_room": "Nevar pievienoties pats savai istabai.",
    "err.host_offline": "Istabas veidotājs vairs nav tiešsaistē.",
    "err.not_logged_in": "Nav pieteicies.",
  },
};

const LANGS = [
  { id: "en", label: "English" },
  { id: "lv", label: "Latviešu" },
];

let currentLang = (() => {
  try { const v = localStorage.getItem("md_lang"); if (v && I18N[v]) return v; } catch {}
  return "en";
})();

function t(key, vars) {
  let s = I18N[currentLang][key] ?? I18N.en[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}

// Servera kļūdas nāk kā kodi (piem. "nick_taken"); ja kods nav zināms, rāda tekstu kā ir.
function tErr(code, fallbackKey) {
  if (code && (I18N.en["err." + code])) return t("err." + code);
  return code || t(fallbackKey);
}

function numLocale() { return currentLang === "lv" ? "lv-LV" : "en-US"; }

// Pārtulko visus statiskos elementus ar data-i18n / data-i18n-ph
function applyI18n() {
  document.documentElement.lang = currentLang;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  try { localStorage.setItem("md_lang", lang); } catch {}
  applyI18n();
}
