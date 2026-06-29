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
  const sBtn = document.getElementById('btn-save'), sSt = document.getElementById('save-state');
  if (sBtn) sBtn.style.display = sec.custom ? 'none' : '';
  if (sSt) sSt.style.display = sec.custom ? 'none' : '';
  if (sec.custom === 'rdv') renderRdv(c);
  else if (sec.custom === 'patients') renderPatients(c);
  else if (sec.custom === 'sms') renderSms(c);
  else (sec.fields || []).forEach((f) => c.appendChild(renderField(f, f.key)));
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
  function closeAll() { box.querySelectorAll('.list-item.open').forEach((c) => c.classList.remove('open')); }
  function draw() {
    const isObj = typeof field.item !== 'string';
    arr.forEach((_, i) => {
      const itemPath = path + '.' + i;
      const card = document.createElement('div'); card.className = 'list-item' + (isObj ? ' acc' : '');
      const head = document.createElement('div'); head.className = 'list-head';
      if (isObj) { const chev = document.createElement('span'); chev.className = 'acc-chev'; head.appendChild(chev); }
      const title = document.createElement('span'); title.className = 'list-title';
      let ttl = (field.itemLabel || 'Élément') + ' ' + (i + 1);
      if (isObj) { const lk = (field.item.find((f) => f.type === 'text') || field.item[0] || {}).key; const v = lk ? getPath(State.content, itemPath + '.' + lk) : ''; if (v) ttl = v; }
      title.textContent = ttl;
      const tools = document.createElement('div'); tools.className = 'list-tools';
      const up = mini('↑', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); redraw(); } });
      const down = mini('↓', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); redraw(); } });
      const del = mini('🗑', () => { if (confirm('Supprimer cet élément ?')) { arr.splice(i, 1); markDirty(); redraw(); } }, 'danger');
      tools.append(up, down, del);
      head.append(title, tools);
      card.appendChild(head);
      const cbody = document.createElement('div'); cbody.className = isObj ? 'acc-body' : 'item-body';
      if (typeof field.item === 'string') {
        cbody.appendChild(renderField({ type: field.item, label: '' }, itemPath));
      } else {
        field.item.forEach((sub) => cbody.appendChild(renderField(sub, itemPath + '.' + sub.key)));
      }
      card.appendChild(cbody);
      if (isObj) head.addEventListener('click', (e) => { if (e.target.closest('.list-tools')) return; const wasOpen = card.classList.contains('open'); closeAll(); if (!wasOpen) card.classList.add('open'); });
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
/* ---------- onglet « Rendez-vous » (custom) ----------------------------- */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const RDV_JOURS = [['1', 'Lundi'], ['2', 'Mardi'], ['3', 'Mercredi'], ['4', 'Jeudi'], ['5', 'Vendredi'], ['6', 'Samedi'], ['0', 'Dimanche']];

function renderRdv(c) {
  const bar = document.createElement('div'); bar.className = 'rdv-tabs';
  const bD = document.createElement('button'); bD.className = 'rdv-tab active'; bD.textContent = '📅 Mes disponibilités';
  const bC = document.createElement('button'); bC.className = 'rdv-tab'; bC.textContent = '➕ Nouveau RDV';
  const bR = document.createElement('button'); bR.className = 'rdv-tab'; bR.textContent = '📨 Demandes';
  bar.append(bD, bC, bR); c.appendChild(bar);
  const panel = document.createElement('div'); c.appendChild(panel);
  function loading() { panel.innerHTML = '<p style="color:#6f7c69;padding:10px">Chargement…</p>'; }
  function loadDispo() { loading(); api('/api/availability').then((r) => r.json()).then((av) => renderDispo(panel, av)).catch(() => { panel.innerHTML = '<p>Erreur de chargement.</p>'; }); }
  function loadDem() { loading(); api('/api/bookings').then((r) => r.json()).then((l) => renderDem(panel, l)).catch(() => { panel.innerHTML = '<p>Erreur de chargement.</p>'; }); }
  function tab(btn, fn) { [bD, bC, bR].forEach((x) => x.classList.remove('active')); btn.classList.add('active'); fn(); }
  bD.onclick = () => tab(bD, loadDispo);
  bC.onclick = () => tab(bC, () => renderCreate(panel));
  bR.onclick = () => tab(bR, loadDem);
  loadDispo();
}

function renderDispo(panel, av) {
  av.weekly = av.weekly || {}; av.blockedDates = av.blockedDates || [];
  ['defaultDuration', 'slotInterval', 'minNoticeHours', 'horizonDays'].forEach((k) => { if (av[k] == null) av[k] = { defaultDuration: 60, slotInterval: 30, minNoticeHours: 24, horizonDays: 28 }[k]; });
  panel.innerHTML = '';
  const help = document.createElement('p'); help.className = 'sec-intro';
  help.textContent = "Pour chaque jour, indiquez vos plages d'ouverture. Les créneaux proposés aux clients sont générés automatiquement à l'intérieur. Laissez un jour vide si vous ne travaillez pas ce jour-là.";
  panel.appendChild(help);

  RDV_JOURS.forEach(([k, label]) => {
    if (!Array.isArray(av.weekly[k])) av.weekly[k] = [];
    const row = document.createElement('div'); row.className = 'jour';
    const h = document.createElement('div'); h.className = 'jour-h'; h.textContent = label;
    const wins = document.createElement('div'); wins.className = 'wins';
    function drawWins() {
      wins.innerHTML = '';
      av.weekly[k].forEach((w, i) => {
        const wd = document.createElement('div'); wd.className = 'win';
        const s = document.createElement('input'); s.type = 'time'; s.value = w.start || '09:00'; s.onchange = () => { w.start = s.value; };
        const sep = document.createElement('span'); sep.className = 'win-sep'; sep.textContent = '→';
        const e = document.createElement('input'); e.type = 'time'; e.value = w.end || '12:00'; e.onchange = () => { w.end = e.value; };
        const rm = document.createElement('button'); rm.className = 'win-rm'; rm.textContent = '✕'; rm.title = 'Retirer cette plage'; rm.onclick = () => { av.weekly[k].splice(i, 1); drawWins(); };
        wd.append(s, sep, e, rm); wins.appendChild(wd);
      });
      const add = document.createElement('button'); add.className = 'win-add'; add.textContent = '＋ ajouter une plage';
      add.onclick = () => { av.weekly[k].push({ start: '09:00', end: '12:00' }); drawWins(); };
      wins.appendChild(add);
    }
    drawWins();
    row.append(h, wins); panel.appendChild(row);
  });

  const note = document.createElement('div'); note.className = 'rdv-note';
  note.innerHTML = '<strong>Congés, absence, ou rendez-vous personnel&nbsp;?</strong><br>Ajoutez simplement l\'événement dans votre <strong>agenda Google</strong> (même une journée entière «&nbsp;Congés&nbsp;»). Les créneaux concernés se libèrent automatiquement — rien à indiquer ici.';
  panel.appendChild(note);

  const save = document.createElement('button'); save.className = 'btn-save'; save.style.marginTop = '22px'; save.textContent = '💾 Enregistrer mes disponibilités';
  save.onclick = async () => {
    save.disabled = true; save.textContent = '⏳ Enregistrement…';
    try {
      const r = await api('/api/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(av) });
      if (!r.ok) throw new Error();
      toast('✓ Disponibilités enregistrées.');
    } catch (e) { toast('⚠ Échec de l\'enregistrement.', true); }
    save.disabled = false; save.textContent = '💾 Enregistrer mes disponibilités';
  };
  panel.appendChild(save);
}

function renderDem(panel, list) {
  panel.innerHTML = '';
  if (!Array.isArray(list) || !list.length) { panel.innerHTML = '<p class="sec-intro">Aucune demande de rendez-vous pour le moment.</p>'; return; }
  const ord = { pending: 0, confirmed: 1, refused: 2 };
  list = list.slice().sort((a, b) => (ord[a.status] - ord[b.status]) || ((a.date + a.time) < (b.date + b.time) ? -1 : 1));
  function applyDecision(b, status, durationMin, opts, card) {
    card.style.opacity = '.5';
    api('/api/bookings/' + b.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ status: status, durationMin: durationMin }, opts)) })
      .then((r) => r.json()).then(() => { toast(status === 'confirmed' ? '✓ RDV confirmé.' : 'Demande refusée.'); b.status = status; if (durationMin) b.durationMin = durationMin; renderDem(panel, list); })
      .catch(() => { toast('⚠ Échec.', true); card.style.opacity = '1'; });
  }
  function decide(b, status, durationMin, card) {
    const isMob = isMobilePhone(b.phone);
    api('/api/sms-templates').then((r) => r.json()).then((tpl) => {
      if (status === 'confirmed') {
        smsConfirmModal('Confirmer le rendez-vous', [{ key: 'confirm', label: 'Envoyer le SMS de confirmation', checked: true }, { key: 'reminder', label: 'Envoyer le SMS de rappel (2 j avant)', checked: true }], fillSmsPreview(tpl.confirm || '', b), isMob, (s) => applyDecision(b, 'confirmed', durationMin, { sendConfirm: !!s.confirm, sendReminder: !!s.reminder, customSms: s.custom ? s.text : undefined }, card));
      } else {
        smsConfirmModal('Refuser la demande', [{ key: 'refuse', label: 'Envoyer un SMS pour informer du refus', checked: true }], fillSmsPreview(tpl.refuse || '', b), isMob, (s) => applyDecision(b, 'refused', null, { sendRefuse: !!s.refuse, customSms: s.custom ? s.text : undefined }, card));
      }
    }).catch(() => applyDecision(b, status, durationMin, {}, card));
  }
  list.forEach((b) => {
    const card = document.createElement('div'); card.className = 'dem dem-' + b.status;
    const st = b.status === 'pending' ? '<span class="badge wait">En attente</span>' : b.status === 'confirmed' ? '<span class="badge ok">Confirmé</span>' : '<span class="badge no">Refusé</span>';
    const when = b.date.split('-').reverse().join('/') + ' à ' + b.time;
    card.innerHTML = '<div class="dem-h"><b>' + esc(b.name) + '</b> ' + st + '</div>'
      + '<div class="dem-i">📞 ' + esc(b.phone) + ' · ' + esc(b.prestation || b.motif || '—') + '</div>'
      + '<div class="dem-w">🗓 ' + when + ' · ' + b.durationMin + ' min</div>';
    if (b.status === 'pending') {
      const act = document.createElement('div'); act.className = 'dem-act';
      const lbl = document.createElement('span'); lbl.className = 'dem-durlbl'; lbl.textContent = 'Durée :';
      const dur = document.createElement('input'); dur.type = 'number'; dur.className = 'dem-dur'; dur.value = b.durationMin; dur.min = 15; dur.step = 15;
      const ok = document.createElement('button'); ok.className = 'dem-ok'; ok.textContent = '✅ Accepter';
      const no = document.createElement('button'); no.className = 'dem-no'; no.textContent = '❌ Refuser';
      ok.onclick = () => decide(b, 'confirmed', parseInt(dur.value, 10) || b.durationMin, card);
      no.onclick = () => decide(b, 'refused', null, card);
      act.append(lbl, dur, ok, no); card.appendChild(act);
    }
    panel.appendChild(card);
  });
}

/* ---------- aperçu d'un SMS (variables remplacées côté client) ----------- */
function fillSmsPreview(tpl, b) {
  const p = String(b.date || '').split('-');
  return String(tpl)
    .replace(/{prenom}/g, b.firstname || String(b.name || '').trim().split(/\s+/)[0] || '')
    .replace(/{nom}/g, b.lastname || '')
    .replace(/{date}/g, p[2] ? (p[2] + '/' + p[1] + '/' + p[0]) : '')
    .replace(/{heure}/g, b.time || '')
    .replace(/{motif}/g, b.prestation || b.motif || '');
}
function isMobilePhone(phone) { const d = String(phone || '').replace(/[^0-9]/g, '').replace(/^33/, '0'); return /^0[67]\d{8}$/.test(d); }

/* ---------- modale de confirmation d'envoi SMS (Accepter / Refuser) ------ */
function smsConfirmModal(title, checks, defaultText, isMobile, onValidate) {
  const ov = document.createElement('div'); ov.className = 'cm-ov';
  const box = document.createElement('div'); box.className = 'cm-box';
  let html = '<h3 class="cm-title">' + esc(title) + '</h3>';
  if (!isMobile) html += '<div class="cm-warn">⚠ Le numéro n\'est pas un mobile : aucun SMS ne pourra être envoyé.</div>';
  checks.forEach((c) => { html += '<label class="cm-check"><input type="checkbox" data-k="' + c.key + '"' + (c.checked && isMobile ? ' checked' : '') + (isMobile ? '' : ' disabled') + '> ' + esc(c.label) + '</label>'; });
  html += '<button type="button" class="cm-custom-toggle">✏️ Personnaliser le SMS</button>';
  html += '<textarea class="cm-text" rows="3" style="display:none">' + esc(defaultText) + '</textarea>';
  html += '<div class="cm-act"><button type="button" class="cm-cancel">Annuler</button><button type="button" class="cm-ok">Valider</button></div>';
  box.innerHTML = html; ov.appendChild(box); document.body.appendChild(ov);
  const ta = box.querySelector('.cm-text'); let customOn = false;
  box.querySelector('.cm-custom-toggle').onclick = () => { customOn = !customOn; ta.style.display = customOn ? 'block' : 'none'; box.querySelector('.cm-custom-toggle').classList.toggle('on', customOn); };
  function close() { ov.remove(); }
  box.querySelector('.cm-cancel').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
  box.querySelector('.cm-ok').onclick = () => { const state = { custom: customOn, text: ta.value }; box.querySelectorAll('input[data-k]').forEach((i) => { state[i.getAttribute('data-k')] = i.checked; }); close(); onValidate(state); };
}

/* ---------- onglet « Messages SMS » ------------------------------------- */
function renderSms(c) {
  const wrap = document.createElement('div'); c.appendChild(wrap);
  wrap.innerHTML = '<p style="color:#6f7c69;padding:10px">Chargement…</p>';
  api('/api/sms-templates').then((r) => r.json()).then((tpl) => {
    wrap.innerHTML = '';
    const defs = [['confirm', 'SMS de confirmation', 'Envoyé quand vous acceptez ou créez un RDV.'], ['reminder', 'SMS de rappel (2 jours avant)', 'Envoyé automatiquement 2 jours avant le RDV.'], ['refuse', 'SMS de refus', 'Envoyé quand vous refusez une demande.']];
    const tas = {};
    defs.forEach(([k, label, hint]) => {
      const f = document.createElement('div'); f.className = 'field';
      f.innerHTML = '<label class="f-label">' + label + '</label><div class="f-hint">' + hint + '</div>';
      const ta = document.createElement('textarea'); ta.className = 'f-input'; ta.rows = 3; ta.value = tpl[k] || '';
      const cnt = document.createElement('div'); cnt.className = 'sms-count';
      function upd() { const n = ta.value.length; cnt.textContent = n + ' caractères · ' + (n > 160 ? Math.ceil(n / 153) + ' SMS' : '1 SMS'); }
      ta.addEventListener('input', upd); upd(); tas[k] = ta; f.append(ta, cnt); wrap.appendChild(f);
    });
    const hint = document.createElement('p'); hint.className = 'f-hint'; hint.style.marginTop = '4px';
    hint.textContent = 'Variables : {prenom} {date} {heure} {motif} — remplacées automatiquement à l\'envoi.';
    wrap.appendChild(hint);
    const save = document.createElement('button'); save.className = 'btn-save'; save.style.marginTop = '18px'; save.textContent = '💾 Enregistrer les messages';
    save.onclick = async () => { save.disabled = true; save.textContent = '⏳…'; try { const r = await api('/api/sms-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: tas.confirm.value, reminder: tas.reminder.value, refuse: tas.refuse.value }) }); if (!r.ok) throw 0; toast('✓ Messages enregistrés.'); } catch (e) { toast('⚠ Échec.', true); } save.disabled = false; save.textContent = '💾 Enregistrer les messages'; };
    wrap.appendChild(save);
  }).catch(() => { wrap.innerHTML = '<p>Erreur de chargement.</p>'; });
}

/* ---------- onglet « Patients » ----------------------------------------- */
function renderPatients(c) {
  const wrap = document.createElement('div'); c.appendChild(wrap);
  function load() { wrap.innerHTML = '<p style="color:#6f7c69;padding:10px">Chargement…</p>'; api('/api/patients').then((r) => r.json()).then((l) => draw(Array.isArray(l) ? l : [])).catch(() => { wrap.innerHTML = '<p>Erreur.</p>'; }); }
  function draw(list) {
    wrap.innerHTML = '';
    const bar = document.createElement('div'); bar.className = 'pat-bar';
    const add = document.createElement('button'); add.className = 'btn-add'; add.textContent = '＋ Nouveau patient';
    const exp = document.createElement('button'); exp.className = 'btn-mini'; exp.textContent = '⬇ Exporter CSV';
    const imp = document.createElement('label'); imp.className = 'btn-mini'; imp.textContent = '⬆ Importer CSV';
    const impf = document.createElement('input'); impf.type = 'file'; impf.accept = '.csv,text/csv'; impf.style.display = 'none'; imp.appendChild(impf);
    bar.append(add, exp, imp); wrap.appendChild(bar);
    add.onclick = () => patientModal({}, load);
    exp.onclick = () => api('/api/patients/export').then((r) => r.text()).then((csv) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'patients.csv'; a.click(); URL.revokeObjectURL(a.href); });
    impf.onchange = () => { const f = impf.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => api('/api/patients/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: rd.result }) }).then((r) => r.json()).then((d) => { toast('✓ ' + (d.added || 0) + ' ajouté(s), ' + (d.updated || 0) + ' mis à jour.'); load(); }).catch(() => toast('⚠ Échec import.', true)); rd.readAsText(f); };
    if (!list.length) { const e = document.createElement('p'); e.className = 'sec-intro'; e.textContent = 'Aucun patient pour le moment.'; wrap.appendChild(e); }
    list.slice().sort((a, b) => (a.lastname || '').localeCompare(b.lastname || '')).forEach((p) => {
      const card = document.createElement('div'); card.className = 'list-item acc';
      const head = document.createElement('div'); head.className = 'list-head';
      const chev = document.createElement('span'); chev.className = 'acc-chev';
      const title = document.createElement('span'); title.className = 'list-title'; title.textContent = ((p.firstname || '') + ' ' + (p.lastname || '')).trim() || '(sans nom)';
      const tools = document.createElement('div'); tools.className = 'list-tools';
      const del = document.createElement('button'); del.className = 'btn-icon danger'; del.textContent = '🗑';
      del.onclick = (e) => { e.stopPropagation(); if (confirm('Supprimer ' + title.textContent + ' ?')) api('/api/patients/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) }).then(() => { toast('Patient supprimé.'); load(); }); };
      tools.appendChild(del); head.append(chev, title, tools); card.appendChild(head);
      const body = document.createElement('div'); body.className = 'acc-body';
      body.innerHTML = '<div class="pat-line">📞 ' + esc(p.phone || '—') + (p.email ? ' · ✉ ' + esc(p.email) : '') + '</div>' + (p.motif ? '<div class="pat-line">' + esc(p.motif) + '</div>' : '') + (p.notes ? '<div class="pat-line" style="color:#6f7c69">' + esc(p.notes) + '</div>' : '');
      const ed = document.createElement('button'); ed.className = 'btn-mini'; ed.textContent = '✏️ Modifier'; ed.style.marginTop = '8px'; ed.onclick = () => patientModal(p, load); body.appendChild(ed); card.appendChild(body);
      head.addEventListener('click', (e) => { if (e.target.closest('.list-tools')) return; const o = card.classList.contains('open'); wrap.querySelectorAll('.list-item.open').forEach((x) => x.classList.remove('open')); if (!o) card.classList.add('open'); });
      wrap.appendChild(card);
    });
  }
  load();
}
function patientModal(p, onSave) {
  const fields = [['firstname', 'Prénom'], ['lastname', 'Nom'], ['phone', 'Téléphone'], ['email', 'Email'], ['motif', 'Motif habituel'], ['notes', 'Notes']];
  const ov = document.createElement('div'); ov.className = 'cm-ov';
  const box = document.createElement('div'); box.className = 'cm-box';
  let html = '<h3 class="cm-title">' + (p.id ? 'Modifier le patient' : 'Nouveau patient') + '</h3>';
  fields.forEach(([k, label]) => { html += '<label class="cm-lbl">' + label + '</label>' + (k === 'notes' || k === 'motif' ? '<textarea class="cm-in" data-k="' + k + '" rows="2">' + esc(p[k] || '') + '</textarea>' : '<input class="cm-in" data-k="' + k + '" value="' + esc(p[k] || '') + '">'); });
  html += '<div class="cm-act"><button type="button" class="cm-cancel">Annuler</button><button type="button" class="cm-ok">Enregistrer</button></div>';
  box.innerHTML = html; ov.appendChild(box); document.body.appendChild(ov);
  function close() { ov.remove(); }
  box.querySelector('.cm-cancel').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
  box.querySelector('.cm-ok').onclick = () => {
    const body = { id: p.id }; box.querySelectorAll('[data-k]').forEach((i) => { body[i.getAttribute('data-k')] = i.value; });
    if (!body.firstname && !body.lastname) { toast('Indiquez au moins un nom.', true); return; }
    api('/api/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).then(() => { toast('✓ Patient enregistré.'); close(); onSave(); }).catch(() => toast('⚠ Échec.', true));
  };
}

/* ---------- sous-onglet « Nouveau RDV » --------------------------------- */
function frDateLong(ds) { try { const s = new Date(ds + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); } catch (e) { return ds; } }
function rdvParseDur(s) { if (!s) return 0; s = String(s).toLowerCase(); let m = s.match(/(\d+)\s*h\s*(\d+)?/); if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0); m = s.match(/(\d+)\s*min/); return m ? parseInt(m[1], 10) : 0; }
function prestationsList() { const out = []; const cards = (State.content && State.content.tarifs && State.content.tarifs.cards) || []; cards.forEach((cat) => (cat.items || []).forEach((it) => { if (it && it.name) out.push({ name: it.name, duration: rdvParseDur(it.duration) }); })); return out; }
function renderCreate(panel) {
  panel.innerHTML = '<p style="color:#6f7c69;padding:10px">Chargement…</p>';
  const _n = new Date(), _curYM = _n.getFullYear() + '-' + (_n.getMonth() + 1 < 10 ? '0' : '') + (_n.getMonth() + 1);
  Promise.all([
    api('/api/patients').then((r) => r.json()).catch(() => []),
    fetch(API + '/api/slots?duration=60&month=' + _curYM).then((r) => r.json()).catch(() => ({ days: [] })),
    api('/api/bookings').then((r) => r.json()).catch(() => []),
  ]).then(([patients, slots, bookings]) => {
    patients = Array.isArray(patients) ? patients : [];
    bookings = Array.isArray(bookings) ? bookings : [];
    const prestas = prestationsList();
    panel.innerHTML = '';
    const intro = document.createElement('p'); intro.className = 'sec-intro'; intro.textContent = 'Créez un rendez-vous vous-même (appel, en direct…). Il est confirmé immédiatement, ajouté à votre agenda Google, et un SMS peut partir au patient.';
    panel.appendChild(intro);
    const form = document.createElement('div'); form.className = 'cr-form';
    let opts = '<option value="">— Nouveau patient —</option>';
    patients.slice().sort((a, b) => (a.lastname || '').localeCompare(b.lastname || '')).forEach((p) => { opts += '<option value="' + p.id + '">' + esc(((p.firstname || '') + ' ' + (p.lastname || '')).trim() + (p.phone ? ' · ' + p.phone : '')) + '</option>'; });
    let mopts = '<option value="">— Choisir —</option>';
    prestas.forEach((p) => { mopts += '<option value="' + esc(p.name) + '" data-dur="' + (p.duration || 0) + '">' + esc(p.name) + (p.duration ? ' (' + p.duration + ' min)' : '') + '</option>'; });
    mopts += '<option value="__autre__">Autre…</option>';
    let days = slots.days || [];
    form.innerHTML =
      '<label class="f-label">Patient existant</label><select class="f-input" id="cr-pat">' + opts + '</select>'
      + '<div class="cr-2"><div><label class="f-label">Prénom *</label><input class="f-input" id="cr-first"></div><div><label class="f-label">Nom *</label><input class="f-input" id="cr-last"></div></div>'
      + '<label class="f-label">Téléphone *</label><input class="f-input" id="cr-phone" inputmode="tel">'
      + '<label class="f-label">Email</label><input class="f-input" id="cr-email" inputmode="email">'
      + '<label class="f-label">Motif / prestation *</label><select class="f-input" id="cr-motif-sel">' + mopts + '</select>'
      + '<input class="f-input" id="cr-motif-other" placeholder="Précisez le motif" style="display:none;margin-top:8px">'
      + '<div class="cr-2"><div><label class="f-label">Mois</label><select class="f-input" id="cr-month"></select></div><div><label class="f-label">Année</label><select class="f-input" id="cr-year"></select></div></div>'
      + '<div class="cr-2"><div><label class="f-label">Jour *</label><select class="f-input" id="cr-day"></select></div><div><label class="f-label">Heure *</label><select class="f-input" id="cr-time"></select></div></div>'
      + '<label class="f-label">Durée (min)</label><input class="f-input" id="cr-dur" type="number" min="15" step="15" value="60">'
      + '<label class="cm-check"><input type="checkbox" id="cr-sc" checked> Envoyer un SMS de confirmation</label>'
      + '<label class="cm-check"><input type="checkbox" id="cr-sr" checked> Envoyer un SMS de rappel (2 j avant)</label>'
      + '<div class="rdv-err" id="cr-err" style="color:#b0392b;font-size:14px;min-height:18px;margin-top:8px"></div>'
      + '<button class="btn-save" id="cr-go" style="margin-top:4px">📅 Créer le rendez-vous</button>';
    panel.appendChild(form);
    const $ = (s) => form.querySelector(s);
    const daySel = $('#cr-day'), timeSel = $('#cr-time'), monthSel = $('#cr-month'), yearSel = $('#cr-year'), mSel = $('#cr-motif-sel'), mOther = $('#cr-motif-other');
    const MOISFR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const pad2 = (n) => (n < 10 ? '0' : '') + n;
    const _today = new Date(), curY = _today.getFullYear(), curM = _today.getMonth() + 1;
    let mo = ''; for (let m = 1; m <= 12; m++) mo += '<option value="' + pad2(m) + '"' + (m === curM ? ' selected' : '') + '>' + MOISFR[m - 1] + '</option>';
    let yo = ''; for (let y = curY; y <= curY + 5; y++) yo += '<option value="' + y + '"' + (y === curY ? ' selected' : '') + '>' + y + '</option>';
    monthSel.innerHTML = mo; yearSel.innerHTML = yo;
    const fillTimes = () => { const d = days.find((x) => x.date === daySel.value) || days[0]; timeSel.innerHTML = (d && d.slots ? d.slots : []).map((t) => '<option value="' + t + '">' + t + '</option>').join(''); };
    const fillDays = () => {
      if (!days.length) { daySel.innerHTML = '<option value="">Aucun créneau libre ce mois-ci</option>'; timeSel.innerHTML = ''; return; }
      daySel.innerHTML = days.map((d) => '<option value="' + d.date + '">' + frDateLong(d.date) + '</option>').join('');
      fillTimes();
    };
    const loadMonth = () => {
      const ym = yearSel.value + '-' + monthSel.value;
      daySel.innerHTML = '<option value="">Chargement…</option>'; timeSel.innerHTML = '';
      fetch(API + '/api/slots?duration=60&month=' + ym).then((r) => r.json()).then((d) => { days = d.days || []; fillDays(); }).catch(() => { days = []; daySel.innerHTML = '<option value="">Erreur de chargement</option>'; timeSel.innerHTML = ''; });
    };
    daySel.onchange = fillTimes;
    monthSel.onchange = loadMonth; yearSel.onchange = loadMonth;
    const shiftYM = (ym, n) => { const p = ym.split('-'); const dd = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 1); return dd.getFullYear() + '-' + pad2(dd.getMonth() + 1); };
    const setSelTo = (ym) => { monthSel.value = ym.slice(5, 7); yearSel.value = ym.slice(0, 4); };
    const autoAdvance = (ym, tries) => {
      if (tries <= 0) { days = []; fillDays(); return; }
      fetch(API + '/api/slots?duration=60&month=' + ym).then((r) => r.json()).then((d) => {
        if (d.days && d.days.length) { days = d.days; setSelTo(ym); fillDays(); }
        else autoAdvance(shiftYM(ym, 1), tries - 1);
      }).catch(() => { days = []; fillDays(); });
    };
    if (days.length) fillDays();
    else { daySel.innerHTML = '<option value="">Recherche du prochain créneau…</option>'; timeSel.innerHTML = ''; autoAdvance(shiftYM(_curYM, 1), 11); }
    mSel.onchange = () => { if (mSel.value === '__autre__') { mOther.style.display = 'block'; mOther.focus(); } else { mOther.style.display = 'none'; const o = mSel.options[mSel.selectedIndex]; const d = o && parseInt(o.getAttribute('data-dur'), 10); if (d) $('#cr-dur').value = d; } };
    function setMotif(motif) { if (!motif) { mSel.value = ''; mOther.style.display = 'none'; mOther.value = ''; return; } const match = prestas.find((p) => p.name === motif); if (match) { mSel.value = motif; mOther.style.display = 'none'; mOther.value = ''; } else { mSel.value = '__autre__'; mOther.style.display = 'block'; mOther.value = motif; } }
    $('#cr-pat').onchange = () => {
      const p = patients.find((x) => x.id === $('#cr-pat').value); if (!p) return;
      const k = String(p.phone || '').replace(/[^0-9]/g, '');
      const hist = bookings.filter((b) => k && String(b.phone || '').replace(/[^0-9]/g, '') === k).sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
      const last = hist[0];
      $('#cr-first').value = (last && last.firstname) || p.firstname || '';
      $('#cr-last').value = (last && last.lastname) || p.lastname || '';
      $('#cr-phone').value = (last && last.phone) || p.phone || '';
      $('#cr-email').value = (last && last.email) || p.email || '';
      setMotif((last && (last.prestation || last.motif)) || p.motif || '');
      if (last && last.durationMin) $('#cr-dur').value = last.durationMin;
    };
    $('#cr-go').onclick = () => {
      const isAutre = mSel.value === '__autre__';
      const motif = isAutre ? mOther.value.trim() : mSel.value;
      const v = { firstname: $('#cr-first').value.trim(), lastname: $('#cr-last').value.trim(), phone: $('#cr-phone').value.trim(), email: $('#cr-email').value.trim(), motif: motif, prestation: isAutre ? '' : motif, date: daySel.value, time: timeSel.value, duration: parseInt($('#cr-dur').value, 10) || 60, sendConfirm: $('#cr-sc').checked, sendReminder: $('#cr-sr').checked };
      const err = $('#cr-err'); err.textContent = '';
      if (!v.firstname || !v.lastname || !v.motif) { err.textContent = 'Prénom, nom et motif (prestation ou « Autre ») sont obligatoires.'; return; }
      if (!v.date || !v.time) { err.textContent = 'Choisissez un créneau libre.'; return; }
      const isMob = isMobilePhone(v.phone);
      if ((v.sendConfirm || v.sendReminder) && !isMob) { if (!confirm('Téléphone absent ou non mobile : les SMS ne pourront pas être envoyés. Créer quand même le rendez-vous ?')) return; }
      const go = $('#cr-go'); go.disabled = true; go.textContent = '⏳…';
      api('/api/rdv-create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then((res) => { if (!res.ok) throw new Error((res.j && res.j.error) || 'Erreur'); toast('✓ Rendez-vous créé.' + (v.sendConfirm && isMob ? ' SMS envoyé.' : '')); renderCreate(panel); }).catch((e) => { err.textContent = e.message; go.disabled = false; go.textContent = '📅 Créer le rendez-vous'; });
    };
  }).catch(() => { panel.innerHTML = '<p>Erreur de chargement.</p>'; });
}

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
