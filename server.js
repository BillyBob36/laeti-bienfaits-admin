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

// ---- Statiques -------------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use('/admin', express.static(path.join(__dirname, 'admin'), { extensions: ['html'] }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.redirect('/admin/'));

app.listen(PORT, () => {
  console.log('[laeti-admin] écoute sur :' + PORT + ' — données dans ' + DATA_DIR);
});
