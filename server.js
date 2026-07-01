'use strict';
// ============================================================================
// Laëti'Bienfaits — Backend admin
// API de contenu (JSON) + upload d'images + auth simple par mot de passe.
// Stockage : fichiers sur un volume persistant (DATA_DIR, ex. /data sur Coolify).
// ----------------------------------------------------------------------------
//  GET  /api/content        -> contenu courant (public ; lu par le site)
//  POST /api/content        -> enregistre le contenu (auth)
//  POST /api/login          -> { password } -> { token }
//  POST /api/upload         -> multipart "file" -> { url } (auth)
//  GET  /uploads/<fichier>  -> images/vidéos uploadées
//  GET  /admin/             -> console d'administration (statique)
// ============================================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const google = require('./google');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'laeti';
// Secret de signature des jetons. Dérivé du mot de passe si non fourni, pour que
// changer le mot de passe invalide aussi les anciennes sessions.
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('laeti-bienfaits::' + ADMIN_PASSWORD).digest('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 h

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- Auth (jeton signé HMAC, sans dépendance) ------------------------------
function sign(exp) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex');
}
function makeToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  return Buffer.from(exp + '.' + sign(exp)).toString('base64url');
}
function verifyToken(token) {
  try {
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const dot = raw.indexOf('.');
    if (dot < 0) return false;
    const exp = Number(raw.slice(0, dot));
    const sig = raw.slice(dot + 1);
    if (!exp || Date.now() > exp) return false;
    const expected = sign(exp);
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (verifyToken(token)) return next();
  return res.status(401).json({ error: 'Non autorisé — reconnectez-vous.' });
}

const app = express();
app.disable('x-powered-by');
app.use(cors()); // le contenu est public ; les écritures sont protégées par jeton
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false }));

// ---- Connexion -------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const pw = Buffer.from(String((req.body && req.body.password) || ''));
  const ref = Buffer.from(ADMIN_PASSWORD);
  const ok = pw.length === ref.length && crypto.timingSafeEqual(pw, ref);
  if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  res.json({ token: makeToken(), ttl: TOKEN_TTL_MS });
});

// Vérifie qu'un jeton est encore valide (au chargement de la console)
app.get('/api/session', requireAuth, (req, res) => res.json({ ok: true }));

// ---- Contenu ---------------------------------------------------------------
app.get('/api/content', (req, res) => {
  fs.readFile(CONTENT_FILE, 'utf8', (err, data) => {
    if (err) return res.json({}); // pas encore d'enregistrement -> site sur défauts
    res.type('application/json').send(data);
  });
});

app.post('/api/content', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Format de contenu invalide.' });
  }
  const tmp = CONTENT_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(body, null, 2), (err) => {
    if (err) return res.status(500).json({ error: "Échec de l'enregistrement." });
    fs.rename(tmp, CONTENT_FILE, (err2) => {
      if (err2) return res.status(500).json({ error: "Échec de l'enregistrement." });
      res.json({ ok: true, savedAt: new Date().toISOString() });
    });
  });
});

// ---- Upload d'images / vidéos ----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const m = (file.originalname || '').toLowerCase().match(/\.(jpe?g|png|webp|avif|gif|mp4)$/);
    const ext = m ? m[0] : '.jpg';
    const name = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/.test(file.mimetype) || file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté (images ou MP4 uniquement).'));
    }
  },
});
app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname });
  });
});

// ============================================================================
// RENDEZ-VOUS — demandes (Phase 1 : disponibilités + créneaux + demandes)
// Heures stockées en heure locale FR (Europe/Paris) : date "YYYY-MM-DD" + "HH:MM".
// ============================================================================
const AVAIL_FILE = path.join(DATA_DIR, 'availability.json');
const BOOK_FILE = path.join(DATA_DIR, 'bookings.json');
const DEFAULT_AVAIL = {
  weekly: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] }, // 0 = dimanche
  slotInterval: 30, defaultDuration: 60, minNoticeHours: 24, horizonDays: 28, blockedDates: [],
};
function readJson(file, fb) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fb; } }
function writeJson(file, obj, cb) {
  const tmp = file + '.tmp';
  fs.writeFile(tmp, JSON.stringify(obj, null, 2), (e) => { if (e) return cb(e); fs.rename(tmp, file, cb); });
}
function hm(t) { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
function pad(min) { const h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
function overlap(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
function parisParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = {}; f.formatToParts(d).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; });
  return { date: p.year + '-' + p.month + '-' + p.day, minutes: (+p.hour) * 60 + (+p.minute) };
}
function dowOf(ds) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(ds + 'T12:00:00Z'));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

// Disponibilités
app.get('/api/availability', (req, res) => res.json(readJson(AVAIL_FILE, DEFAULT_AVAIL)));
app.post('/api/availability', requireAuth, (req, res) => {
  const a = req.body;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return res.status(400).json({ error: 'Format invalide.' });
  writeJson(AVAIL_FILE, a, (e) => (e ? res.status(500).json({ error: 'Échec.' }) : res.json({ ok: true })));
});

// Créneaux libres (public) : ?duration=minutes
function nextDate(ds) { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
app.get('/api/slots', async (req, res) => {
  const av = readJson(AVAIL_FILE, DEFAULT_AVAIL);
  const taken = readJson(BOOK_FILE, []).filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const dur = Math.max(15, parseInt(req.query.duration, 10) || av.defaultDuration || 60);
  const now = parisParts(new Date());
  // Plage : un mois précis (?month=YYYY-MM, sans aucune limite d'horizon) ou, par défaut, ~2 mois à partir d'aujourd'hui.
  let fromDate, toDate;
  const mm = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
  if (mm) {
    const y = +mm[1], m = +mm[2];
    const first = mm[1] + '-' + mm[2] + '-01';
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    fromDate = first < now.date ? now.date : first;
    toDate = mm[1] + '-' + mm[2] + '-' + String(lastDay).padStart(2, '0');
  } else {
    fromDate = now.date;
    toDate = parisParts(new Date(Date.now() + 62 * 86400000)).date;
  }
  // Anti-doublon : plages occupées dans Google Agenda (ramenées en heure locale FR)
  let busyLocal = [];
  if (google.enabled()) {
    try {
      const busy = await google.busyRanges(new Date(fromDate + 'T00:00:00Z').toISOString(), new Date(toDate + 'T23:59:59Z').toISOString());
      busyLocal = busy.map((r) => { const s = parisParts(new Date(r.start)), e = parisParts(new Date(r.end)); return { sd: s.date, sm: s.minutes, ed: e.date, em: e.minutes }; });
    } catch (e) { busyLocal = []; }
  }
  function busyClash(ds, t, d) {
    return busyLocal.some((b) => {
      if (b.sd === ds && b.ed === ds) return overlap(b.sm, b.em, t, t + d);
      return b.sd <= ds && b.ed >= ds && !(b.ed === ds && b.em <= 0);
    });
  }
  const out = [];
  let cur = fromDate, guard = 0;
  while (cur <= toDate && guard < 400) {
    const ds = cur; cur = nextDate(cur); guard++;
    if ((av.blockedDates || []).indexOf(ds) >= 0) continue;
    const windows = (av.weekly && av.weekly[String(dowOf(ds))]) || [];
    if (!windows.length) continue;
    const slots = [];
    windows.forEach((w) => {
      const we = hm(w.end);
      for (let t = hm(w.start); t + dur <= we; t += (av.slotInterval || 30)) {
        if (ds === now.date && t < now.minutes + (av.minNoticeHours || 0) * 60) continue;
        if (taken.some((b) => b.date === ds && overlap(hm(b.time), hm(b.time) + (b.durationMin || dur), t, t + dur))) continue;
        if (busyClash(ds, t, dur)) continue;
        slots.push(pad(t));
      }
    });
    if (slots.length) out.push({ date: ds, slots });
  }
  res.json({ duration: dur, month: mm ? (mm[1] + '-' + mm[2]) : null, days: out });
});

// Nouvelle demande (public)
app.post('/api/booking', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim(), phone = String(b.phone || '').trim();
  const date = String(b.date || '').trim(), time = String(b.time || '').trim();
  if (!name || !/^[+0-9 .]{6,20}$/.test(phone) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Informations incomplètes ou invalides.' });
  }
  const av = readJson(AVAIL_FILE, DEFAULT_AVAIL);
  const dur = Math.max(15, parseInt(b.duration, 10) || av.defaultDuration || 60);
  const books = readJson(BOOK_FILE, []);
  const clash = books.some((x) => (x.status === 'pending' || x.status === 'confirmed') && x.date === date && overlap(hm(x.time), hm(x.time) + (x.durationMin || dur), hm(time), hm(time) + dur));
  if (clash) return res.status(409).json({ error: "Ce créneau vient d'être pris, merci d'en choisir un autre." });
  const rec = {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    token: crypto.randomBytes(16).toString('hex'),
    name: name.slice(0, 80), phone: phone.slice(0, 20),
    prestation: String(b.prestation || '').slice(0, 120), motif: String(b.motif || '').slice(0, 500),
    date, time, durationMin: dur, status: 'pending', createdAt: new Date().toISOString(),
  };
  books.push(rec);
  writeJson(BOOK_FILE, books, (e) => {
    if (e) return res.status(500).json({ error: 'Échec.' });
    // Laetitia est notifiée par Google Agenda (événement « ⏳ DEMANDE » + email « nouveaux événements ») — plus de SMS pour elle.
    if (google.enabled()) google.createEvent(rec).then(function (id) { if (id) { const bb = readJson(BOOK_FILE, []); const k = bb.findIndex((x) => x.id === rec.id); if (k >= 0) { bb[k].gcalId = id; writeJson(BOOK_FILE, bb, () => {}); } } });
    res.json({ ok: true });
  });
});

// Liste des demandes (console)
app.get('/api/bookings', requireAuth, (req, res) => res.json(readJson(BOOK_FILE, [])));
// Accepter / refuser / ajuster (console)
app.post('/api/bookings/:id', requireAuth, (req, res) => {
  const books = readJson(BOOK_FILE, []);
  const i = books.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Demande introuvable.' });
  const u = req.body || {};
  if (u.status && ['pending', 'confirmed', 'refused', 'cancelled'].indexOf(u.status) >= 0) books[i].status = u.status;
  if (u.durationMin) books[i].durationMin = Math.max(15, parseInt(u.durationMin, 10));
  if (typeof u.sendReminder === 'boolean') books[i].sendReminder = u.sendReminder;
  if (books[i].status === 'cancelled') { books[i].reminderSent = true; books[i].sendReminder = false; }
  if (typeof u.note === 'string') books[i].adminNote = u.note.slice(0, 300);
  writeJson(BOOK_FILE, books, (e) => {
    if (e) return res.status(500).json({ error: 'Échec.' });
    const b = books[i];
    if (b.status === 'confirmed') { if (u.sendConfirm !== false) notifyClient(b, u.customSms); google.confirmEvent(b); }
    else if (b.status === 'refused') { if (u.sendRefuse !== false) notifyClient(b, u.customSms); google.deleteEvent(b); }
    else if (b.status === 'cancelled') { if (u.sendCancel) notifyClient(b, u.customSms); google.deleteEvent(b); }
    res.json({ ok: true, booking: b });
  });
});

// ============================================================================
// SMS (smsmode) + acceptation / refus par lien sécurisé (token)
// ============================================================================
const SMS_API_KEY = process.env.SMSMODE_API_KEY || '';
const SMS_SENDER = (process.env.SMS_SENDER || 'LaetiBienf').slice(0, 11);
const OWNER_PHONE = process.env.OWNER_PHONE || '0673962183';
const PUBLIC_BASE = (process.env.PUBLIC_BASE || 'https://laeti-admin.lamidetlm.com').replace(/\/$/, '');

function normPhone(p) {
  let d = String(p).replace(/[^0-9+]/g, '');
  if (d[0] === '+') d = d.slice(1);
  else if (d.slice(0, 2) === '00') d = d.slice(2);
  else if (d[0] === '0') d = '33' + d.slice(1); // numéro français
  return d;
}
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function frWhen(b) { const p = b.date.split('-'); return p[2] + '/' + p[1] + '/' + p[0] + ' à ' + b.time; }

// --- Modèles de SMS (éditables par Laetitia depuis la console) ---
const TPL_FILE = path.join(DATA_DIR, 'sms_templates.json');
const DEFAULT_TPL = {
  confirm: "Bonjour {prenom}, votre rendez-vous du {date} a {heure} avec Laeti'Bienfaits est CONFIRME. A bientot !",
  reminder: "Rappel : votre rendez-vous du {date} a {heure} avec Laeti'Bienfaits, c'est dans 2 jours. A bientot !",
  refuse: "Bonjour {prenom}, votre demande de RDV du {date} a {heure} n'a pas pu etre retenue. Rappelez le 06 73 96 21 83 pour convenir d'un autre creneau.",
  cancel: "Bonjour {prenom}, votre rendez-vous du {date} a {heure} avec Laeti'Bienfaits a ete ANNULE. Pour reprendre RDV, appelez le 06 73 96 21 83. A bientot !",
};
function smsTemplates() { return Object.assign({}, DEFAULT_TPL, readJson(TPL_FILE, {})); }
function firstNameOf(b) { return b.firstname || String(b.name || '').trim().split(/\s+/)[0] || ''; }
function fillTpl(tpl, b) {
  const p = String(b.date || '').split('-');
  return String(tpl)
    .replace(/{prenom}/g, firstNameOf(b))
    .replace(/{nom}/g, b.lastname || '')
    .replace(/{date}/g, p[2] ? (p[2] + '/' + p[1] + '/' + p[0]) : '')
    .replace(/{heure}/g, b.time || '')
    .replace(/{motif}/g, b.prestation || b.motif || '');
}
function isMobileFR(phone) { const d = String(phone || '').replace(/[^0-9+]/g, '').replace(/^\+33/, '0').replace(/^0033/, '0'); return /^0[67]\d{8}$/.test(d); }

async function sendSms(to, text) {
  if (!SMS_API_KEY) { console.warn('[sms] clé API absente — SMS ignoré'); return; }
  try {
    const r = await fetch('https://rest.smsmode.com/sms/v1/messages', {
      method: 'POST',
      headers: { 'X-Api-Key': SMS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ recipient: { to: normPhone(to) }, body: { text: text }, from: SMS_SENDER }),
    });
    if (!r.ok) console.warn('[sms] échec ' + r.status + ' : ' + (await r.text().catch(() => '')));
  } catch (e) { console.warn('[sms] erreur : ' + e.message); }
}
function notifyClient(b, customSms) {
  const tpl = smsTemplates();
  if (b.status === 'confirmed') sendSms(b.phone, customSms || fillTpl(tpl.confirm, b));
  else if (b.status === 'refused') sendSms(b.phone, customSms || fillTpl(tpl.refuse, b));
  else if (b.status === 'cancelled') sendSms(b.phone, customSms || fillTpl(tpl.cancel, b));
}

function rdvPage(title, inner) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + " — Laeti'Bienfaits</title><style>"
    + 'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#eef4ea;color:#2b3a26;display:grid;place-items:center;min-height:100vh;padding:20px}'
    + '.box{background:#fff;max-width:440px;width:100%;border-radius:20px;padding:30px 26px;box-shadow:0 20px 60px -28px rgba(43,58,38,.5)}'
    + 'h1{font-size:21px;margin:0 0 14px}.lbl{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700;color:#5f7d5c;margin:0 0 8px}'
    + '.card{background:#f7f3ed;border:1px solid rgba(122,155,118,.3);border-radius:14px;padding:16px 18px;margin-bottom:8px;line-height:1.6}'
    + '.big{font-size:20px;font-weight:700;margin-top:6px}label{display:block;font-weight:600;font-size:14px;margin:16px 0 6px}'
    + 'input{width:100%;padding:12px;font-size:16px;border:1px solid rgba(122,155,118,.4);border-radius:10px;box-sizing:border-box}'
    + 'button{width:100%;margin-top:12px;padding:15px;font-size:16px;font-weight:700;border:0;border-radius:12px;cursor:pointer;color:#fff}'
    + '.ok{background:#5f7d5c}.no{background:#b0392b}p{line-height:1.6}</style></head><body><div class="box">' + inner + '</div></body></html>';
}

// Page ouverte depuis le SMS / l'agenda : Laetitia accepte ou refuse
app.get('/r/:token', (req, res) => {
  const books = readJson(BOOK_FILE, []);
  const b = books.find((x) => x.token === req.params.token);
  res.type('html');
  if (!b) return res.send(rdvPage('Lien invalide', '<h1>Lien invalide</h1><p>Cette demande est introuvable.</p>'));
  if (b.status !== 'pending') return res.send(rdvPage('Déjà traité', '<h1>Déjà traité</h1><p>Cette demande a déjà été <b>' + (b.status === 'confirmed' ? 'confirmée ✅' : 'refusée') + '</b>.</p>'));
  const inner = '<p class="lbl">Demande de rendez-vous</p>'
    + '<div class="card"><div><b>' + escHtml(b.name) + '</b> — ' + escHtml(b.phone) + '</div>'
    + '<div>' + escHtml(b.prestation || b.motif || '—') + '</div>'
    + '<div class="big">' + frWhen(b) + '</div></div>'
    + '<form method="post" action="/r/' + b.token + '">'
    + '<label>Durée du rendez-vous (minutes)</label>'
    + '<input name="durationMin" type="number" value="' + b.durationMin + '" min="15" step="15">'
    + '<button class="ok" name="action" value="confirm" type="submit">✅ Confirmer le rendez-vous</button>'
    + '<button class="no" name="action" value="refuse" type="submit">❌ Refuser</button></form>';
  res.send(rdvPage('Demande de RDV', inner));
});
app.post('/r/:token', (req, res) => {
  const books = readJson(BOOK_FILE, []);
  const i = books.findIndex((x) => x.token === req.params.token);
  res.type('html');
  if (i < 0) return res.send(rdvPage('Lien invalide', '<h1>Lien invalide</h1>'));
  if (books[i].status !== 'pending') return res.send(rdvPage('Déjà traité', '<h1>Déjà traité</h1><p>Cette demande a déjà été traitée.</p>'));
  if (req.body.action === 'confirm') {
    books[i].status = 'confirmed';
    if (req.body.durationMin) books[i].durationMin = Math.max(15, parseInt(req.body.durationMin, 10));
  } else if (req.body.action === 'refuse') {
    books[i].status = 'refused';
  } else {
    return res.send(rdvPage('Erreur', '<h1>Action inconnue</h1>'));
  }
  writeJson(BOOK_FILE, books, () => {});
  notifyClient(books[i]);
  if (books[i].status === 'confirmed') google.confirmEvent(books[i]); else google.deleteEvent(books[i]);
  const ok = books[i].status === 'confirmed';
  res.send(rdvPage("C'est fait", '<h1>' + (ok ? '✅ Rendez-vous confirmé' : '❌ Rendez-vous refusé') + '</h1><p>' + (ok ? 'Le client va recevoir un SMS de confirmation.' : 'Le client va être prévenu par SMS.') + '</p>'));
});

// Rappels J-2 (vérifié toutes les heures)
function checkReminders() {
  const books = readJson(BOOK_FILE, []);
  const tpl = smsTemplates();
  const target = parisParts(new Date(Date.now() + 2 * 86400000)).date;
  let changed = false;
  books.forEach((b) => {
    if (b.status === 'confirmed' && b.date === target && !b.reminderSent && b.sendReminder !== false) {
      sendSms(b.phone, fillTpl(tpl.reminder, b));
      b.reminderSent = true; changed = true;
    }
  });
  if (changed) writeJson(BOOK_FILE, books, () => {});
}
setInterval(checkReminders, 3600 * 1000);

// ============================================================================
// MESSAGES SMS (modèles éditables) — Lot 1
// ============================================================================
app.get('/api/sms-templates', requireAuth, (req, res) => res.json(smsTemplates()));
app.post('/api/sms-templates', requireAuth, (req, res) => {
  const b = req.body || {};
  const out = {
    confirm: String(b.confirm != null ? b.confirm : DEFAULT_TPL.confirm).slice(0, 480),
    reminder: String(b.reminder != null ? b.reminder : DEFAULT_TPL.reminder).slice(0, 480),
    refuse: String(b.refuse != null ? b.refuse : DEFAULT_TPL.refuse).slice(0, 480),
    cancel: String(b.cancel != null ? b.cancel : DEFAULT_TPL.cancel).slice(0, 480),
  };
  writeJson(TPL_FILE, out, (e) => (e ? res.status(500).json({ error: 'Échec.' }) : res.json({ ok: true })));
});

// ============================================================================
// ANNUAIRE PATIENTS — Lot 2
// ============================================================================
const PAT_FILE = path.join(DATA_DIR, 'patients.json');
function newId() { return Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
function phoneKey(p) { return String(p || '').replace(/[^0-9]/g, ''); }
function upsertPatient(b) {
  const pats = readJson(PAT_FILE, []);
  const k = phoneKey(b.phone);
  let p = k ? pats.find((x) => phoneKey(x.phone) === k) : null;
  if (!p) { p = { id: newId(), createdAt: new Date().toISOString() }; pats.push(p); }
  p.firstname = b.firstname || p.firstname || '';
  p.lastname = b.lastname || p.lastname || '';
  p.phone = b.phone || p.phone || '';
  if (b.email) p.email = b.email;
  if (b.prestation || b.motif) p.motif = b.prestation || b.motif;
  p.updatedAt = new Date().toISOString();
  writeJson(PAT_FILE, pats, () => {});
}
app.get('/api/patients', requireAuth, (req, res) => res.json(readJson(PAT_FILE, [])));
app.post('/api/patients', requireAuth, (req, res) => {
  const b = req.body || {};
  const pats = readJson(PAT_FILE, []);
  let p = b.id ? pats.find((x) => x.id === b.id) : null;
  if (!p) { p = { id: newId(), createdAt: new Date().toISOString() }; pats.push(p); }
  ['firstname', 'lastname', 'phone', 'email', 'motif', 'notes'].forEach((kk) => { if (b[kk] != null) p[kk] = String(b[kk]).slice(0, 600); });
  p.updatedAt = new Date().toISOString();
  writeJson(PAT_FILE, pats, (e) => (e ? res.status(500).json({ error: 'Échec.' }) : res.json({ ok: true, patient: p })));
});
app.post('/api/patients/delete', requireAuth, (req, res) => {
  const id = (req.body || {}).id;
  const pats = readJson(PAT_FILE, []).filter((x) => x.id !== id);
  writeJson(PAT_FILE, pats, (e) => (e ? res.status(500).json({ error: 'Échec.' }) : res.json({ ok: true })));
});
function csvCell(v) { v = String(v == null ? '' : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ';' || c === ',') { out.push(cur); cur = ''; } else cur += c; } }
  out.push(cur); return out.map((s) => s.trim());
}
app.get('/api/patients/export', requireAuth, (req, res) => {
  const pats = readJson(PAT_FILE, []);
  const cols = ['firstname', 'lastname', 'phone', 'email', 'motif', 'notes'];
  const head = ['Prenom', 'Nom', 'Telephone', 'Email', 'Motif', 'Notes'].join(';');
  const rows = pats.map((p) => cols.map((c) => csvCell(p[c])).join(';'));
  res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="patients.csv"').send('﻿' + head + '\n' + rows.join('\n'));
});
app.post('/api/patients/import', requireAuth, (req, res) => {
  const csv = String((req.body || {}).csv || '');
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return res.json({ ok: true, added: 0, updated: 0 });
  const pats = readJson(PAT_FILE, []);
  let added = 0, updated = 0;
  const start = /pr[ée]nom|firstname|t[ée]l|phone/i.test(lines[0]) ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const firstname = c[0] || '', lastname = c[1] || '', phone = c[2] || '', email = c[3] || '', motif = c[4] || '', notes = c[5] || '';
    if (!firstname && !lastname && !phone) continue;
    const k = phoneKey(phone);
    let p = k ? pats.find((x) => phoneKey(x.phone) === k) : null;
    if (!p) { p = { id: newId(), createdAt: new Date().toISOString() }; pats.push(p); added++; } else updated++;
    p.firstname = firstname || p.firstname || ''; p.lastname = lastname || p.lastname || ''; p.phone = phone || p.phone || '';
    p.email = email || p.email || ''; p.motif = motif || p.motif || ''; p.notes = notes || p.notes || '';
    p.updatedAt = new Date().toISOString();
  }
  writeJson(PAT_FILE, pats, (e) => (e ? res.status(500).json({ error: 'Échec.' }) : res.json({ ok: true, added, updated })));
});

// ============================================================================
// CRÉATION DE RDV PAR LAETITIA (confirmé direct) — Lot 3
// ============================================================================
app.post('/api/rdv-create', requireAuth, (req, res) => {
  const b = req.body || {};
  const firstname = String(b.firstname || '').trim(), lastname = String(b.lastname || '').trim();
  const phone = String(b.phone || '').trim();
  const date = String(b.date || '').trim(), time = String(b.time || '').trim();
  if (!firstname || !lastname || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Informations incomplètes ou invalides.' });
  }
  const av = readJson(AVAIL_FILE, DEFAULT_AVAIL);
  const dur = Math.max(15, parseInt(b.duration, 10) || av.defaultDuration || 60);
  const books = readJson(BOOK_FILE, []);
  const clash = books.some((x) => (x.status === 'pending' || x.status === 'confirmed') && x.date === date && overlap(hm(x.time), hm(x.time) + (x.durationMin || dur), hm(time), hm(time) + dur));
  if (clash) return res.status(409).json({ error: "Ce créneau est déjà occupé, choisissez-en un autre." });
  const rec = {
    id: newId(), token: crypto.randomBytes(16).toString('hex'),
    name: (firstname + ' ' + lastname).trim(), firstname, lastname,
    phone: phone.slice(0, 20), email: String(b.email || '').slice(0, 120),
    prestation: String(b.prestation || b.motif || '').slice(0, 120), motif: String(b.motif || '').slice(0, 500),
    date, time, durationMin: dur, status: 'confirmed', source: 'admin',
    sendReminder: b.sendReminder !== false, createdAt: new Date().toISOString(),
  };
  books.push(rec);
  upsertPatient(rec);
  writeJson(BOOK_FILE, books, (e) => {
    if (e) return res.status(500).json({ error: 'Échec.' });
    if (b.sendConfirm !== false && isMobileFR(rec.phone)) notifyClient(rec, b.customSms);
    if (google.enabled()) google.createEvent(Object.assign({}, rec, { confirmed: true })).then((id) => { if (id) { const bb = readJson(BOOK_FILE, []); const k = bb.findIndex((x) => x.id === rec.id); if (k >= 0) { bb[k].gcalId = id; writeJson(BOOK_FILE, bb, () => {}); } } });
    res.json({ ok: true, booking: rec });
  });
});

// ---- Statiques -------------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
// La console admin n'est servie que sur le domaine canonique. Ailleurs (ancien sous-domaine
// laeti-admin.lamidetlm.com, conservé pour /api /uploads /r) -> 301 vers laeti-bienfaits.fr/admin/.
function adminCanonicalHost(req) { return (req.headers.host || '').toLowerCase().indexOf('laeti-bienfaits.fr') !== -1; }
app.use('/admin', (req, res, next) => {
  if (req.headers.host && !adminCanonicalHost(req)) return res.redirect(301, 'https://laeti-bienfaits.fr' + req.originalUrl);
  next();
});
app.use('/admin', express.static(path.join(__dirname, 'admin'), { extensions: ['html'] }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.redirect(req.headers.host && !adminCanonicalHost(req) ? 'https://laeti-bienfaits.fr/admin/' : '/admin/'));

app.listen(PORT, () => {
  console.log('[laeti-admin] écoute sur :' + PORT + ' — données dans ' + DATA_DIR);
});
