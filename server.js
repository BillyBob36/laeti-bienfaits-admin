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
app.get('/api/slots', (req, res) => {
  const av = readJson(AVAIL_FILE, DEFAULT_AVAIL);
  const taken = readJson(BOOK_FILE, []).filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const dur = Math.max(15, parseInt(req.query.duration, 10) || av.defaultDuration || 60);
  const now = parisParts(new Date());
  const out = [];
  for (let dd = 0; dd <= (av.horizonDays || 28); dd++) {
    const ds = parisParts(new Date(Date.now() + dd * 86400000)).date;
    if ((av.blockedDates || []).indexOf(ds) >= 0) continue;
    const windows = (av.weekly && av.weekly[String(dowOf(ds))]) || [];
    if (!windows.length) continue;
    const slots = [];
    windows.forEach((w) => {
      const we = hm(w.end);
      for (let t = hm(w.start); t + dur <= we; t += (av.slotInterval || 30)) {
        if (ds === now.date && t < now.minutes + (av.minNoticeHours || 0) * 60) continue;
        const clash = taken.some((b) => b.date === ds && overlap(hm(b.time), hm(b.time) + (b.durationMin || dur), t, t + dur));
        if (!clash) slots.push(pad(t));
      }
    });
    if (slots.length) out.push({ date: ds, slots });
  }
  res.json({ duration: dur, days: out });
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
    // Phase 2-3 : créer l'événement Google Agenda + SMS de notification à Laetitia.
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
  if (u.status && ['pending', 'confirmed', 'refused'].indexOf(u.status) >= 0) books[i].status = u.status;
  if (u.durationMin) books[i].durationMin = Math.max(15, parseInt(u.durationMin, 10));
  if (typeof u.note === 'string') books[i].adminNote = u.note.slice(0, 300);
  writeJson(BOOK_FILE, books, (e) => {
    if (e) return res.status(500).json({ error: 'Échec.' });
    // Phase 3 : SMS au client (validé / refusé).
    res.json({ ok: true, booking: books[i] });
  });
});

// ---- Statiques -------------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use('/admin', express.static(path.join(__dirname, 'admin'), { extensions: ['html'] }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.redirect('/admin/'));

app.listen(PORT, () => {
  console.log('[laeti-admin] écoute sur :' + PORT + ' — données dans ' + DATA_DIR);
});
