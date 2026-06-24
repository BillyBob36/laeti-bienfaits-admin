/* ============================================================================
 * Laëti'Bienfaits — Console d'administration (moteur générique)
 * Rend les formulaires à partir de schema.js, charge/enregistre le contenu via
 * le backend, gère la connexion et l'upload d'images (réduites côté client).
 * ========================================================================== */
'use strict';

const API = ''; // la console est servie par le backend -> chemins relatifs
const TOKEN_KEY = 'lb_admin_token';

const State = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  schema: window.LB_SCHEMA || [],
  defaults: {},
  content: {},   // defaults fusionnés avec ce qui est enregistré
  section: null,
  dirty: false,
};

/* ---------- utilitaires chemin (a.b.c, listes via index) ----------------- */
function getPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = val;
}
function deepMerge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (over && typeof over === 'object') {
    const out = Object.assign({}, base && typeof base === 'object' ? base : {});
    for (const k in over) out[k] = deepMerge(out[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ---------- appels API --------------------------------------------------- */
async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  if (State.token) opts.headers['Authorization'] = 'Bearer ' + State.token;
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); throw new Error('Session expirée — reconnectez-vous.'); }
  return res;
}
async function login(password) {
  const res = await fetch(API + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Connexion impossible.'); }
  const { token } = await res.json();
  State.token = token;
  localStorage.setItem(TOKEN_KEY, token);
}
function logout() {
  State.token = '';
  localStorage.removeItem(TOKEN_KEY);
  renderLogin();
}
async function saveContent() {
  const res = await api('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(State.content),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Échec.'); }
  State.dirty = false;
}

/* ---------- upload image (réduction côté client) ------------------------- */
async function downscale(file, maxSide = 1600, quality = 0.82) {
  if (file.type === 'video/mp4' || file.type === 'image/gif') return file; // pas de ré-encodage
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => cv.toBlob(r, type, quality));
    bmp.close && bmp.close();
    return blob || file;
  } catch (e) { return file; }
}
async function uploadFile(file) {
  const blob = await downscale(file);
  const fd = new FormData();
  const ext = file.type === 'image/png' ? 'png' : file.type === 'video/mp4' ? 'mp4' : 'jpg';
  fd.append('file', blob, (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext);
  const res = await api('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Échec de l'upload."); }
  return (await res.json()).url;
}
/* Résout une URL d'image stockée vers une URL affichable dans la console.
   - /uploads/... -> servi par le backend
   - img/...      -> image d'origine du site (prévisualisée depuis le site public) */
function resolveImg(url) {
  if (!url) return '';
  if (/^(https?:|data:|\/uploads\/)/.test(url)) return url;
  return (window.LB_SITE_BASE || '') + url;
}

/* ---------- rendu : connexion ------------------------------------------- */
function renderLogin() {
  document.body.className = 'login';
  document.body.innerHTML = `
    <div class="login-card">
      <div class="login-logo">Laëti'<span>Bienfaits</span></div>
      <p class="login-sub">Espace d'administration</p>
      <form id="login-form">
        <input id="pw" type="password" placeholder="Mot de passe" autocomplete="current-password" autofocus required>
        <button type="submit">Se connecter</button>
        <div class="login-err" id="login-err"></div>
      </form>
    </div>`;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-err');
    err.textContent = '';
    try {
      await login(document.getElementById('pw').value);
      await boot();
    } catch (ex) { err.textContent = ex.message; }
  });
}

/* ---------- rendu : application ----------------------------------------- */
function renderApp() {
  document.body.className = '';
  document.body.innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="side-head">
          <div class="side-logo">Laëti'<span>Bienfaits</span></div>
          <div class="side-sub">Administration</div>
        </div>
        <nav class="side-nav" id="side-nav"></nav>
        <div class="side-foot">
          <a class="side-link" id="view-site" target="_blank" rel="noopener">↗ Voir le site</a>
          <button class="side-link" id="logout-btn">⎋ Se déconnecter</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="burger" id="burger" aria-label="Menu">☰</button>
          <h1 class="topbar-title" id="topbar-title">Administration</h1>
          <div class="topbar-actions">
            <span class="save-state" id="save-state"></span>
            <button class="btn-save" id="btn-save">💾 Enregistrer</button>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <div class="scrim" id="scrim"></div>
      <div class="toast" id="toast"></div>
    </div>`;

  const siteUrl = window.LB_SITE_BASE || '#';
  document.getElementById('view-site').href = siteUrl;
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('btn-save').onclick = onSave;
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  document.getElementById('burger').onclick = () => { sidebar.classList.toggle('open'); scrim.classList.toggle('show'); };
  scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };

  renderNav();
  selectSection(State.schema[0].id);
  window.addEventListener('beforeunload', (e) => { if (State.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

function renderNav() {
  const nav = document.getElementById('side-nav');
  nav.innerHTML = '';
  State.schema.forEach((sec) => {
    const b = document.createElement('button');
    b.className = 'nav-item' + (sec.id === State.section ? ' active' : '');
    b.dataset.id = sec.id;
    b.innerHTML = `<span class="nav-ico">${sec.icon || '•'}</span><span>${sec.label}</span>`;
    b.onclick = () => {
      selectSection(sec.id);
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('scrim').classList.remove('show');
    };
    nav.appendChild(b);
  });
}

function selectSection(id) {
  State.section = id;
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.id === id));
  const sec = State.schema.find((s) => s.id === id);
  document.getElementById('topbar-title').textContent = sec.label;
  const c = document.getElementById('content');
  c.innerHTML = '';
  if (sec.intro) {
    const p = document.createElement('p'); p.className = 'sec-intro'; p.textContent = sec.intro; c.appendChild(p);
  }
  sec.fields.forEach((f) => c.appendChild(renderField(f, f.key)));
  c.scrollTop = 0;
}

/* ---------- rendu : un champ -------------------------------------------- */
function renderField(field, path) {
  const wrap = document.createElement('div');
  wrap.className = 'field field-' + field.type;

  if (field.type === 'group') {
    const fs = document.createElement('div'); fs.className = 'group';
    if (field.label) { const h = document.createElement('h3'); h.className = 'group-title'; h.textContent = field.label; fs.appendChild(h); }
    field.fields.forEach((sub) => fs.appendChild(renderField(sub, path ? path + '.' + sub.key : sub.key)));
    return fs;
  }

  if (field.label) { const lab = document.createElement('label'); lab.className = 'f-label'; lab.textContent = field.label; wrap.appendChild(lab); }
  if (field.hint) { const h = document.createElement('div'); h.className = 'f-hint'; h.textContent = field.hint; wrap.appendChild(h); }

  if (field.type === 'text' || field.type === 'textarea') {
    const el = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    el.className = 'f-input';
    if (field.type === 'textarea') el.rows = field.rows || 4;
    el.value = getPath(State.content, path) != null ? getPath(State.content, path) : '';
    el.addEventListener('input', () => { setPath(State.content, path, el.value); markDirty(); });
    wrap.appendChild(el);

  } else if (field.type === 'image') {
    wrap.appendChild(renderImage(path, field));

  } else if (field.type === 'gallery') {
    wrap.appendChild(renderGalleryGrid(field, path));

  } else if (field.type === 'toggle') {
    const sw = document.createElement('label'); sw.className = 'switch';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = !!getPath(State.content, path);
    const sl = document.createElement('span'); sl.className = 'slider';
    const txt = document.createElement('span'); txt.className = 'switch-txt';
    txt.textContent = cb.checked ? 'Affiché' : 'Masqué';
    cb.addEventListener('change', () => {
      setPath(State.content, path, cb.checked);
      txt.textContent = cb.checked ? 'Affiché' : 'Masqué';
      markDirty();
    });
    sw.append(cb, sl, txt);
    wrap.appendChild(sw);

  } else if (field.type === 'list') {
    wrap.appendChild(renderList(field, path));
  }
  return wrap;
}

function renderImage(path, field) {
  const box = document.createElement('div'); box.className = 'img-field';
  const cur = getPath(State.content, path) || '';
  const isVideo = /\.mp4($|\?)/i.test(cur);
  const prev = document.createElement(isVideo ? 'video' : 'img');
  prev.className = 'img-prev';
  if (isVideo) { prev.muted = true; prev.loop = true; prev.playsInline = true; prev.controls = true; }
  prev.src = resolveImg(cur);
  if (!cur) prev.classList.add('empty');
  const controls = document.createElement('div'); controls.className = 'img-ctl';
  const pick = document.createElement('label'); pick.className = 'btn-mini'; pick.textContent = '📷 Changer';
  const input = document.createElement('input'); input.type = 'file';
  input.accept = field.accept || 'image/*'; input.style.display = 'none';
  pick.appendChild(input);
  const status = document.createElement('span'); status.className = 'img-status';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0]; if (!file) return;
    status.textContent = 'Envoi…'; pick.classList.add('loading');
    try {
      const url = await uploadFile(file);
      setPath(State.content, path, url); markDirty();
      prev.src = resolveImg(url); prev.classList.remove('empty'); status.textContent = '✓';
    } catch (e) { status.textContent = '⚠ ' + e.message; }
    pick.classList.remove('loading'); input.value = '';
  });
  controls.appendChild(pick); controls.appendChild(status);
  box.appendChild(prev); box.appendChild(controls);
  return box;
}

function renderList(field, path) {
  const box = document.createElement('div'); box.className = 'list';
  let arr = getPath(State.content, path);
  if (!Array.isArray(arr)) { arr = []; setPath(State.content, path, arr); }

  function blankItem() {
    if (typeof field.item === 'string') return '';
    const o = {}; field.item.forEach((f) => { o[f.key] = f.type === 'list' ? [] : ''; }); return o;
  }
  function redraw() { box.innerHTML = ''; draw(); }
  function draw() {
    arr.forEach((_, i) => {
      const itemPath = path + '.' + i;
      const card = document.createElement('div'); card.className = 'list-item';
      const head = document.createElement('div'); head.className = 'list-head';
      const title = document.createElement('span'); title.className = 'list-title';
      title.textContent = (field.itemLabel || 'Élément') + ' ' + (i + 1);
      const tools = document.createElement('div'); tools.className = 'list-tools';
      const up = mini('↑', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); redraw(); } });
      const down = mini('↓', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); redraw(); } });
      const del = mini('🗑', () => { if (confirm('Supprimer cet élément ?')) { arr.splice(i, 1); markDirty(); redraw(); } }, 'danger');
      tools.append(up, down, del);
      head.append(title, tools);
      card.appendChild(head);
      if (typeof field.item === 'string') {
        card.appendChild(renderField({ type: field.item, label: '' }, itemPath));
      } else {
        field.item.forEach((sub) => card.appendChild(renderField(sub, itemPath + '.' + sub.key)));
      }
      box.appendChild(card);
    });
    const add = document.createElement('button'); add.className = 'btn-add';
    add.textContent = '＋ Ajouter ' + (field.itemLabel ? field.itemLabel.toLowerCase() : 'un élément');
    add.onclick = () => { arr.push(blankItem()); markDirty(); redraw(); };
    box.appendChild(add);
  }
  draw();
  return box;
}

function mini(label, onClick, cls) {
  const b = document.createElement('button'); b.type = 'button';
  b.className = 'btn-icon' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = onClick; return b;
}

/* ---------- galerie : grille de vignettes (ajout multiple, ✕, réordonner) -- */
function renderGalleryGrid(field, path) {
  const box = document.createElement('div');
  let arr = getPath(State.content, path);
  if (!Array.isArray(arr)) { arr = []; setPath(State.content, path, arr); }
  const grid = document.createElement('div'); grid.className = 'gal-grid';

  function move(i, d) {
    const j = i + d; if (j < 0 || j >= arr.length) return;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t; markDirty(); redraw();
  }
  function draw() {
    arr.forEach((src, i) => {
      const item = document.createElement('div'); item.className = 'gal-item';
      const im = document.createElement('img'); im.src = resolveImg(src); im.alt = 'Photo ' + (i + 1); im.loading = 'lazy';
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'gal-rm'; rm.title = 'Supprimer cette photo'; rm.textContent = '✕';
      rm.onclick = () => { arr.splice(i, 1); markDirty(); redraw(); };
      const mv = document.createElement('div'); mv.className = 'gal-mv';
      const lf = document.createElement('button'); lf.type = 'button'; lf.title = 'Déplacer avant'; lf.textContent = '‹'; lf.onclick = () => move(i, -1);
      const rt = document.createElement('button'); rt.type = 'button'; rt.title = 'Déplacer après'; rt.textContent = '›'; rt.onclick = () => move(i, 1);
      mv.append(lf, rt);
      item.append(im, mv, rm);
      grid.appendChild(item);
    });
    const add = document.createElement('label'); add.className = 'gal-add';
    add.innerHTML = '<span class="gal-add-plus">＋</span><span>Ajouter une photo</span>';
    const input = document.createElement('input'); input.type = 'file';
    input.accept = field.accept || 'image/*'; input.multiple = true; input.style.display = 'none';
    add.appendChild(input);
    input.addEventListener('change', async () => {
      const files = Array.prototype.slice.call(input.files || []); if (!files.length) return;
      add.classList.add('loading');
      for (let f = 0; f < files.length; f++) {
        try { const url = await uploadFile(files[f]); arr.push(url); markDirty(); }
        catch (e) { toast('⚠ ' + e.message, true); }
      }
      add.classList.remove('loading'); input.value = ''; redraw();
    });
    grid.appendChild(add);
  }
  function redraw() { grid.innerHTML = ''; draw(); }
  draw();
  box.appendChild(grid);
  return box;
}

/* ---------- enregistrement ---------------------------------------------- */
function markDirty() {
  State.dirty = true;
  document.getElementById('save-state').textContent = 'Modifications non enregistrées';
  document.getElementById('save-state').className = 'save-state dirty';
}
async function onSave() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = '⏳ Enregistrement…';
  try {
    await saveContent();
    toast('✓ Enregistré — le site est à jour.');
    document.getElementById('save-state').textContent = '';
    document.getElementById('save-state').className = 'save-state';
  } catch (e) { toast('⚠ ' + e.message, true); }
  btn.disabled = false; btn.textContent = '💾 Enregistrer';
}
let toastT = null;
function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/* ---------- démarrage ---------------------------------------------------- */
async function boot() {
  // valeurs par défaut (= contenu actuel du site) + ce qui a été enregistré
  const defs = await fetch(API + '/admin/content.default.json').then((r) => r.ok ? r.json() : {}).catch(() => ({}));
  State.defaults = defs;
  let saved = {};
  try { saved = await api('/api/content').then((r) => r.json()); } catch (e) { saved = {}; }
  State.content = deepMerge(clone(defs), saved || {});
  renderApp();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!State.schema.length) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Erreur : schema.js non chargé.</p>'; return; }
  if (State.token) {
    try { const r = await api('/api/session'); if (r.ok) { await boot(); return; } } catch (e) {}
  }
  renderLogin();
});
