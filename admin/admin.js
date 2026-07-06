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
    bmp.close && bmp.close();
    // WebP = meilleur rapport qualité/poids (et supprime les métadonnées EXIF) ; repli JPEG si non supporté
    let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality));
    return blob || file;
  } catch (e) { return file; }
}
async function uploadFile(file) {
  const blob = await downscale(file);
  const t = blob.type || file.type || '';
  const ext = t === 'image/webp' ? 'webp' : t === 'image/png' ? 'png' : t === 'video/mp4' ? 'mp4' : t === 'image/gif' ? 'gif' : 'jpg';
  const fd = new FormData();
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
        <div id="push-cta"></div>
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
  setupNotifications();
}

/* ---------- Notifications push (application installable) ----------------- */
var lbDeferredPrompt = null;
var lbIsMobile = true; // téléphone/tablette (pointeur tactile) vs ordinateur — met à jour le tuto affiché
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); lbDeferredPrompt = e; try { setupNotifications(); } catch (_) {} });
window.addEventListener('appinstalled', function () { lbDeferredPrompt = null; try { setupNotifications(); } catch (_) {} });
function urlB64ToU8(s) {
  var pad = '='.repeat((4 - s.length % 4) % 4);
  var b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(b64), arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function setupNotifications() {
  var cta = document.getElementById('push-cta'); if (!cta) return;
  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  if (!supported) { cta.innerHTML = ''; return; }
  var installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  lbIsMobile = window.matchMedia('(pointer: coarse)').matches;
  var subscribed = false;
  try {
    var reg = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
    await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    subscribed = !!sub && Notification.permission === 'granted';
  } catch (e) {}
  renderPushCta(cta, { subscribed: subscribed, installed: installed, canInstall: !!lbDeferredPrompt, mobile: lbIsMobile });
}
function renderPushCta(cta, st) {
  // Application installée ET notifications déjà activées → rien à afficher
  if (st.installed && st.subscribed) { cta.innerHTML = ''; return; }

  var device = st.mobile ? 'téléphone' : 'ordinateur';
  var tapWord = st.mobile ? 'Touchez' : 'Cliquez sur';
  var title, msg, btns = '';
  if (!st.installed) {
    // Étape 1 : installer d'abord, activer ensuite (grisé)
    title = 'Installez l\'application (étape 1)';
    msg = st.mobile
      ? 'Installez l\'application, puis ouvrez-la depuis son icône sur l\'écran d\'accueil : les notifications s\'activeront à l\'étape 2.'
      : 'Installez l\'application : elle s\'ouvre dans sa propre fenêtre, où vous activerez les notifications à l\'étape 2.';
    btns += '<button class="push-btn" id="push-install">📲 Installer l\'application</button>';
    btns += '<button class="push-btn push-btn-2" id="push-enable" disabled title="Disponible une fois l\'application installée">🔔 Activer les notifications</button>';
  } else {
    // Étape 2 : app installée, pas encore abonnée — inclut l'étape « redémarrer l'app »
    title = 'Activez les notifications (étape 2)';
    msg = tapWord + ' «&nbsp;Activer&nbsp;», autorisez, puis <b>fermez et rouvrez l\'application une fois</b> pour finaliser. Vous serez prévenue sur cet ' + device + ' à chaque nouvelle demande de rendez-vous.';
    btns += '<button class="push-btn" id="push-enable">🔔 Activer les notifications</button>';
  }
  cta.innerHTML = '<div class="push-banner"><div class="push-txt"><b>' + title + '</b><br><span>' + msg + '</span></div>'
    + '<div class="push-actions">' + btns + '</div></div>';
  var be = document.getElementById('push-enable'); if (be && !be.disabled) be.onclick = enablePush;
  var bi = document.getElementById('push-install'); if (bi) bi.onclick = doInstall;
}
function showInstallHelp() {
  var cta = document.getElementById('push-cta'); if (!cta) return;
  var head = lbIsMobile ? 'Ajoutez l\'application à l\'écran d\'accueil' : 'Installez l\'application';
  var steps = lbIsMobile
    ? '<ul class="push-help"><li><b>Android (Chrome) :</b> menu <b>⋮</b> en haut à droite → <b>Ajouter à l\'écran d\'accueil</b> → <b>Installer</b>.</li><li><b>iPhone (Safari) :</b> bouton <b>Partager</b> (carré + flèche) → <b>Sur l\'écran d\'accueil</b>.</li></ul>'
    : '<ul class="push-help"><li>Cliquez sur l\'icône <b>Installer</b> (un écran avec une flèche, à droite de la barre d\'adresse).</li><li>Ou&nbsp;: menu <b>⋮</b> du navigateur → <b>Installer Laëti Admin…</b></li></ul>';
  var ending = lbIsMobile
    ? 'Ouvrez ensuite l\'application depuis son icône, puis activez les notifications.'
    : 'L\'application s\'ouvre dans sa propre fenêtre&nbsp;: fermez-la et rouvrez-la une fois, puis activez les notifications.';
  cta.innerHTML = '<div class="push-banner" style="flex-direction:column;align-items:flex-start;text-align:left;">'
    + '<div class="push-txt"><b>' + head + '</b></div>' + steps
    + '<div class="push-txt"><span>' + ending + '</span></div></div>';
}
async function doInstall() {
  if (!lbDeferredPrompt) { showInstallHelp(); return; }
  lbDeferredPrompt.prompt();
  try { await lbDeferredPrompt.userChoice; } catch (e) {}
  lbDeferredPrompt = null; setupNotifications();
}
async function enablePush() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Ce navigateur ne gère pas les notifications. Sur Android, ouvrez l\'app installée (Chrome).', true); return;
    }
    if (Notification.permission === 'denied') { showPushHelp(); return; }
    var perm = await Notification.requestPermission();
    if (perm === 'denied') { showPushHelp(); return; }
    if (perm !== 'granted') { toast('Réappuyez sur « Activer » puis choisissez « Autoriser » dans la fenêtre qui apparaît.', true); return; }
    var reg = await navigator.serviceWorker.ready;
    var key = (await (await fetch(API + '/api/push/key')).text()).trim();
    if (!key) { toast('Notifications indisponibles pour le moment.', true); return; }
    var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
    var r = await api('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
    if (!r.ok) throw new Error();
    await api('/api/push/test', { method: 'POST' });
    toast('✓ Notifications activées ! Une notification de test vient d\'être envoyée.');
    setupNotifications();
  } catch (e) { toast('Impossible d\'activer les notifications (' + (e && e.message ? e.message : 'erreur') + ').', true); }
}
function showPushHelp() {
  var cta = document.getElementById('push-cta'); if (!cta) return;
  cta.innerHTML = '<div class="push-banner" style="flex-direction:column;align-items:flex-start;text-align:left;">'
    + '<div class="push-txt"><b>Les notifications sont bloquées sur cet appareil</b><br><span>Pour les réautoriser :</span></div>'
    + (lbIsMobile
        ? '<ul class="push-help"><li><b>Android :</b> appui long sur l\'icône « Laëti Admin » → <b>Infos sur l\'appli</b> → <b>Notifications</b> → activez.</li><li><b>iPhone :</b> Réglages → descendez jusqu\'à <b>Laëti Admin</b> → <b>Notifications</b> → activez (iOS 16.4 minimum).</li></ul>'
        : '<ul class="push-help"><li>Cliquez sur l\'icône <b>🔒 cadenas</b> à gauche de la barre d\'adresse → <b>Notifications</b> → <b>Autoriser</b>.</li></ul>')
    + '<div class="push-txt" style="margin-top:2px;"><span>Ensuite, <b>fermez complètement l\'application et rouvrez-la</b>, puis appuyez sur le bouton ci-dessous.</span></div>'
    + '<div class="push-actions"><button class="push-btn" id="push-enable">🔔 J\'ai activé, réessayer</button></div></div>';
  var be = document.getElementById('push-enable'); if (be) be.onclick = enablePush;
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
// Tri alphabétique des patients sur le nom affiché (prénom + nom), insensible aux accents/majuscules.
function patSort(a, b) { return (((a.firstname || '') + ' ' + (a.lastname || '')).trim()).localeCompare(((b.firstname || '') + ' ' + (b.lastname || '')).trim(), 'fr', { sensitivity: 'base' }); }
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

const DISPO_FIXED = ['09:30', '11:00', '14:00', '15:30'];
function dispoMin(t) { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
function renderDispo(panel, av) {
  av.weekly = av.weekly || {};
  ['defaultDuration', 'slotInterval', 'minNoticeHours', 'horizonDays'].forEach((k) => { if (av[k] == null) av[k] = { defaultDuration: 60, slotInterval: 30, minNoticeHours: 24, horizonDays: 28 }[k]; });
  // État coché par jour, en lisant le nouveau format (tableau d'heures) OU l'ancien (plages {start,end}).
  function selectedFor(k) {
    const raw = av.weekly[k]; const set = {};
    if (Array.isArray(raw) && raw.length) {
      if (typeof raw[0] === 'string') { raw.forEach((t) => { set[t] = 1; }); }
      else { const wins = raw.map((w) => [dispoMin(w.start), dispoMin(w.end)]); DISPO_FIXED.forEach((t) => { const m = dispoMin(t); if (wins.some((w) => w[0] <= m && m < w[1])) set[t] = 1; }); }
    }
    return set;
  }
  const state = {}; RDV_JOURS.forEach(([k]) => { state[k] = selectedFor(k); });

  panel.innerHTML = '';
  const help = document.createElement('p'); help.className = 'sec-intro';
  help.textContent = "Touchez les heures auxquelles vous acceptez des rendez-vous, jour par jour. C'est exactement ce que verront vos clients. Un jour sans aucune heure = fermé.";
  panel.appendChild(help);

  const grid = document.createElement('div'); grid.className = 'dispo-grid';
  RDV_JOURS.forEach(([k, label]) => {
    const day = document.createElement('div'); day.className = 'dispo-day';
    const lab = document.createElement('div'); lab.className = 'dispo-lab';
    function refreshLab() {
      const none = !Object.keys(state[k]).length;
      day.classList.toggle('closed', none);
      lab.innerHTML = '<span class="dispo-name">' + label + '</span>' + (none ? '<span class="dispo-closed">fermé</span>' : '');
    }
    const pills = document.createElement('div'); pills.className = 'dispo-pills';
    DISPO_FIXED.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slot-pill' + (i === 2 ? ' pill-gap' : '');
      b.textContent = t.replace(':', 'h');
      function refresh() { const on = !!state[k][t]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      b.onclick = () => { if (state[k][t]) delete state[k][t]; else state[k][t] = 1; refresh(); refreshLab(); };
      refresh(); pills.appendChild(b);
    });
    refreshLab();
    day.append(lab, pills); grid.appendChild(day);
  });
  panel.appendChild(grid);

  const note = document.createElement('div'); note.className = 'rdv-note';
  note.innerHTML = '<strong>Congés, absence, ou rendez-vous personnel&nbsp;?</strong><br>Ajoutez l\'événement dans votre <strong>agenda Google</strong> (même une journée entière). Les créneaux concernés se libèrent tout seuls — rien à faire ici.<br><span style="color:#6f7c69">Astuce&nbsp;: si vous acceptez un rendez-vous de 2&nbsp;h à 14&nbsp;h, le 15&nbsp;h30 devient 16&nbsp;h automatiquement.</span>';
  panel.appendChild(note);

  const save = document.createElement('button'); save.className = 'btn-save'; save.style.marginTop = '18px'; save.textContent = '💾 Enregistrer mes disponibilités';
  save.onclick = async () => {
    save.disabled = true; save.textContent = '⏳ Enregistrement…';
    RDV_JOURS.forEach(([k]) => { av.weekly[k] = DISPO_FIXED.filter((t) => state[k][t]); }); // écrit le nouveau format
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
  const ord = { pending: 0, confirmed: 1, refused: 2, cancelled: 3 };
  list = list.slice().sort((a, b) => (ord[a.status] - ord[b.status]) || ((a.date + a.time) < (b.date + b.time) ? -1 : 1));
  function applyDecision(b, status, durationMin, opts, card) {
    card.style.opacity = '.5';
    api('/api/bookings/' + b.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ status: status, durationMin: durationMin }, opts)) })
      .then((r) => r.json()).then(() => { toast(status === 'confirmed' ? '✓ RDV confirmé.' : status === 'cancelled' ? '✓ RDV annulé.' : 'Demande refusée.'); b.status = status; if (durationMin) b.durationMin = durationMin; renderDem(panel, list); })
      .catch(() => { toast('⚠ Échec.', true); card.style.opacity = '1'; });
  }
  function cancelRdv(b, card) {
    const isMob = isMobilePhone(b.phone);
    api('/api/sms-templates').then((r) => r.json()).then((tpl) => {
      smsConfirmModal('Annuler le rendez-vous', [{ key: 'cancel', label: 'Prévenir le patient par SMS de l\'annulation', checked: false }], fillSmsPreview(tpl.cancel || '', b), isMob, (s) => applyDecision(b, 'cancelled', null, { sendCancel: !!s.cancel, customSms: s.custom ? s.text : undefined }, card));
    }).catch(() => applyDecision(b, 'cancelled', null, {}, card));
  }
  function rescheduleRdv(b, card) {
    const isMob = isMobilePhone(b.phone);
    rescheduleModal(b, isMob, (s) => {
      card.style.opacity = '.5';
      api('/api/bookings/' + b.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reschedule: true, date: s.date, time: s.time, durationMin: s.durationMin, sendReschedule: !!s.sms, customSms: (s.sms ? s.text : undefined) }) })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then((res) => { if (!res.ok) throw new Error((res.j && res.j.error) || 'Erreur'); toast('✓ Rendez-vous déplacé.'); b.date = s.date; b.time = s.time; b.durationMin = s.durationMin; renderDem(panel, list); })
        .catch((e) => { toast('⚠ ' + e.message, true); card.style.opacity = '1'; });
    });
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
    const st = b.status === 'pending' ? '<span class="badge wait">En attente</span>' : b.status === 'confirmed' ? '<span class="badge ok">Confirmé</span>' : b.status === 'cancelled' ? '<span class="badge no">Annulé</span>' : '<span class="badge no">Refusé</span>';
    const when = b.date.split('-').reverse().join('/') + ' à ' + b.time;
    card.innerHTML = '<div class="dem-h"><b>' + esc(b.name) + '</b> ' + st + '</div>'
      + '<div class="dem-i">📞 ' + esc(b.phone) + ' · ' + esc(b.prestation || '—') + '</div>'
      + (b.motif && b.motif !== b.prestation ? '<div class="dem-i" style="font-style:italic;color:#4a5744">📝 ' + esc(b.motif) + '</div>' : '')
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
    } else if (b.status === 'confirmed') {
      const act = document.createElement('div'); act.className = 'dem-act';
      const mo = document.createElement('button'); mo.className = 'dem-edit'; mo.textContent = '✏️ Modifier';
      mo.onclick = () => rescheduleRdv(b, card);
      const cx = document.createElement('button'); cx.className = 'dem-no'; cx.textContent = '🗑 Annuler le RDV';
      cx.onclick = () => cancelRdv(b, card);
      act.append(mo, cx); card.appendChild(act);
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

/* ---------- modale « Déplacer le rendez-vous » -------------------------- */
function rescheduleModal(b, isMobile, onValidate) {
  const RESCHED_TPL = "Bonjour {prenom}, votre rendez-vous avec Laeti'Bienfaits est deplace au {date} a {heure}. Ne pas repondre a ce SMS.";
  const ov = document.createElement('div'); ov.className = 'cm-ov';
  const box = document.createElement('div'); box.className = 'cm-box';
  let html = '<h3 class="cm-title">Déplacer le rendez-vous</h3>';
  html += '<div class="cm-warn" style="background:#eef4ea;color:#3f5636;border-color:#cfe0c8">Actuellement : ' + esc(b.date.split('-').reverse().join('/')) + ' à ' + esc(b.time) + ' · ' + (b.durationMin || 60) + ' min</div>';
  html += '<div class="cr-2"><div><label class="cm-lbl">Nouveau jour</label><input class="cm-in" type="date" data-k="date" value="' + esc(b.date) + '"></div><div><label class="cm-lbl">Nouvelle heure</label><input class="cm-in" type="time" step="900" data-k="time" value="' + esc(b.time) + '"></div></div>';
  html += '<label class="cm-lbl">Durée (min)</label><input class="cm-in" type="number" min="15" step="15" data-k="dur" value="' + (b.durationMin || 60) + '">';
  html += '<label class="cm-check"><input type="checkbox" data-k="sms"' + (isMobile ? '' : ' disabled') + '> Prévenir le patient par SMS du changement</label>';
  if (!isMobile) html += '<div class="cm-warn">⚠ Le numéro n\'est pas un mobile : aucun SMS ne pourra être envoyé.</div>';
  html += '<button type="button" class="cm-custom-toggle">✏️ Personnaliser le SMS</button>';
  html += '<textarea class="cm-text" rows="3" style="display:none"></textarea>';
  html += '<div class="cm-act"><button type="button" class="cm-cancel">Annuler</button><button type="button" class="cm-ok">Déplacer</button></div>';
  box.innerHTML = html; ov.appendChild(box); document.body.appendChild(ov);
  const dEl = box.querySelector('[data-k="date"]'), tEl = box.querySelector('[data-k="time"]'), ta = box.querySelector('.cm-text');
  let customOn = false;
  function preview() { if (!customOn) ta.value = fillSmsPreview(RESCHED_TPL, Object.assign({}, b, { date: dEl.value, time: tEl.value })); }
  preview(); dEl.onchange = preview; tEl.onchange = preview;
  box.querySelector('.cm-custom-toggle').onclick = () => { customOn = !customOn; ta.style.display = customOn ? 'block' : 'none'; box.querySelector('.cm-custom-toggle').classList.toggle('on', customOn); };
  function close() { ov.remove(); }
  box.querySelector('.cm-cancel').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
  box.querySelector('.cm-ok').onclick = () => {
    const date = dEl.value, time = tEl.value;
    if (!date || !time) { toast('Choisissez une date et une heure.', true); return; }
    preview();
    const dur = parseInt(box.querySelector('[data-k="dur"]').value, 10) || (b.durationMin || 60);
    const sms = !!box.querySelector('[data-k="sms"]').checked;
    const text = ta.value; close();
    onValidate({ date: date, time: time, durationMin: dur, sms: sms, text: text });
  };
}

/* ---------- onglet « Messages SMS » ------------------------------------- */
function renderSms(c) {
  const wrap = document.createElement('div'); c.appendChild(wrap);
  wrap.innerHTML = '<p style="color:#6f7c69;padding:10px">Chargement…</p>';
  api('/api/sms-templates').then((r) => r.json()).then((tpl) => {
    wrap.innerHTML = '';
    const defs = [['confirm', 'SMS de confirmation', 'Envoyé quand vous acceptez ou créez un RDV.'], ['reminder', 'SMS de rappel (2 jours avant)', 'Envoyé automatiquement 2 jours avant le RDV.'], ['refuse', 'SMS de refus', 'Envoyé quand vous refusez une demande.'], ['cancel', "SMS d'annulation", 'Proposé (envoi optionnel) quand vous annulez un rendez-vous confirmé.']];
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
    save.onclick = async () => { save.disabled = true; save.textContent = '⏳…'; try { const r = await api('/api/sms-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: tas.confirm.value, reminder: tas.reminder.value, refuse: tas.refuse.value, cancel: tas.cancel.value }) }); if (!r.ok) throw 0; toast('✓ Messages enregistrés.'); } catch (e) { toast('⚠ Échec.', true); } save.disabled = false; save.textContent = '💾 Enregistrer les messages'; };
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
    list.slice().sort(patSort).forEach((p) => {
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
  Promise.all([
    api('/api/patients').then((r) => r.json()).catch(() => []),
    api('/api/bookings').then((r) => r.json()).catch(() => []),
  ]).then(([patients, bookings]) => {
    patients = Array.isArray(patients) ? patients : [];
    bookings = Array.isArray(bookings) ? bookings : [];
    const prestas = prestationsList();
    panel.innerHTML = '';
    const intro = document.createElement('p'); intro.className = 'sec-intro'; intro.textContent = 'Créez un rendez-vous vous-même (appel, en direct…). Il est confirmé immédiatement, ajouté à votre agenda Google, et un SMS peut partir au patient.';
    panel.appendChild(intro);
    const form = document.createElement('div'); form.className = 'cr-form';
    let opts = '<option value="">— Nouveau patient —</option>';
    patients.slice().sort(patSort).forEach((p) => { opts += '<option value="' + p.id + '">' + esc(((p.firstname || '') + ' ' + (p.lastname || '')).trim() + (p.phone ? ' · ' + p.phone : '')) + '</option>'; });
    let mopts = '<option value="">— Choisir —</option>';
    prestas.forEach((p) => { mopts += '<option value="' + esc(p.name) + '" data-dur="' + (p.duration || 0) + '">' + esc(p.name) + (p.duration ? ' (' + p.duration + ' min)' : '') + '</option>'; });
    mopts += '<option value="__autre__">Autre…</option>';
    form.innerHTML =
      '<label class="f-label">Patient existant</label><select class="f-input" id="cr-pat">' + opts + '</select>'
      + '<div class="cr-2"><div><label class="f-label">Prénom *</label><input class="f-input" id="cr-first"></div><div><label class="f-label">Nom *</label><input class="f-input" id="cr-last"></div></div>'
      + '<label class="f-label">Téléphone *</label><input class="f-input" id="cr-phone" inputmode="tel">'
      + '<label class="f-label">Email</label><input class="f-input" id="cr-email" inputmode="email">'
      + '<label class="f-label">Motif / prestation *</label><select class="f-input" id="cr-motif-sel">' + mopts + '</select>'
      + '<input class="f-input" id="cr-motif-other" placeholder="Précisez le motif" style="display:none;margin-top:8px">'
      + '<label class="f-label" style="margin-top:14px">Informations complémentaires</label>'
      + '<textarea class="f-input" id="cr-info" rows="3" placeholder="Motif détaillé, suivi, remarques… (facultatif)"></textarea>'
      + '<div class="f-hint" style="margin:2px 0 4px">Vous pouvez choisir n\'importe quel jour et n\'importe quelle heure (par tranche de 15 min), même en dehors des créneaux proposés en ligne.</div>'
      + '<div class="cr-2"><div><label class="f-label">Jour *</label><input class="f-input" id="cr-day" type="date"></div><div><label class="f-label">Heure *</label><input class="f-input" id="cr-time" type="time" step="900"></div></div>'
      + '<label class="f-label">Durée (min)</label><input class="f-input" id="cr-dur" type="number" min="15" step="15" value="60">'
      + '<label class="cm-check"><input type="checkbox" id="cr-sc" checked> Envoyer un SMS de confirmation</label>'
      + '<label class="cm-check"><input type="checkbox" id="cr-sr" checked> Envoyer un SMS de rappel (2 j avant)</label>'
      + '<div class="rdv-err" id="cr-err" style="color:#b0392b;font-size:14px;min-height:18px;margin-top:8px"></div>'
      + '<button class="btn-save" id="cr-go" style="margin-top:4px">📅 Créer le rendez-vous</button>';
    panel.appendChild(form);
    const $ = (s) => form.querySelector(s);
    const daySel = $('#cr-day'), timeSel = $('#cr-time'), mSel = $('#cr-motif-sel'), mOther = $('#cr-motif-other');
    const pad2 = (n) => (n < 10 ? '0' : '') + n;
    // Jour = n'importe quelle date (défaut aujourd'hui) ; Heure = libre par tranche de 15 min.
    const _today = new Date();
    daySel.value = _today.getFullYear() + '-' + pad2(_today.getMonth() + 1) + '-' + pad2(_today.getDate());
    timeSel.value = '09:30';
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
      $('#cr-info').value = (last && last.motif && last.motif !== last.prestation) ? last.motif : ''; // infos de la dernière consultation
      if (last && last.durationMin) $('#cr-dur').value = last.durationMin;
    };
    $('#cr-go').onclick = () => {
      const isAutre = mSel.value === '__autre__';
      const prestation = isAutre ? mOther.value.trim() : mSel.value;
      const info = $('#cr-info').value.trim();
      const v = { firstname: $('#cr-first').value.trim(), lastname: $('#cr-last').value.trim(), phone: $('#cr-phone').value.trim(), email: $('#cr-email').value.trim(), prestation: prestation, motif: info, date: daySel.value, time: timeSel.value, duration: parseInt($('#cr-dur').value, 10) || 60, sendConfirm: $('#cr-sc').checked, sendReminder: $('#cr-sr').checked };
      const err = $('#cr-err'); err.textContent = '';
      if (!v.firstname || !v.lastname || !prestation) { err.textContent = 'Prénom, nom et motif / prestation sont obligatoires.'; return; }
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
