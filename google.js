'use strict';
// ============================================================================
// Google Agenda via COMPTE DE SERVICE (sans dépendance : JWT RS256 maison).
// Désactivé tant que GOOGLE_SERVICE_ACCOUNT n'est pas défini -> tout est no-op.
// Laetitia partage son agenda avec l'email du compte de service (droit
// « Apporter des modifications aux événements »). GOOGLE_CALENDAR_ID = son email.
// ============================================================================
const crypto = require('crypto');

let SA = null;
try { if (process.env.GOOGLE_SERVICE_ACCOUNT) SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); }
catch (e) { console.warn('[google] GOOGLE_SERVICE_ACCOUNT illisible (JSON invalide).'); }
const CAL_ID = process.env.GOOGLE_CALENDAR_ID || 'laetibienfaits@gmail.com';
const PUBLIC_BASE = (process.env.PUBLIC_BASE || 'https://laeti-admin.lamidetlm.com').replace(/\/$/, '');
const TZ = 'Europe/Paris';
const enabled = () => !!(SA && SA.client_email && SA.private_key);

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function endTime(time, durationMin) {
  const p = String(time).split(':'); const m = (+p[0]) * 60 + (+p[1]) + (durationMin || 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function calUrl(suffix) { return 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CAL_ID) + '/events' + (suffix || ''); }

let tok = { v: null, exp: 0 };
async function getToken() {
  if (!enabled()) return null;
  if (tok.v && Date.now() < tok.exp - 60000) return tok.v;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(header + '.' + claim);
  const jwt = header + '.' + claim + '.' + b64url(signer.sign(SA.private_key));
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt });
    const j = await r.json();
    if (!j.access_token) { console.warn('[google] token KO : ' + JSON.stringify(j)); return null; }
    tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return tok.v;
  } catch (e) { console.warn('[google] token err : ' + e.message); return null; }
}

// Crée l'événement « DEMANDE » (jaune) ; renvoie l'id ou null
async function createEvent(b) {
  const t = await getToken(); if (!t) return null;
  const ev = {
    summary: '⏳ DEMANDE — ' + b.name,
    description: 'Demande de rendez-vous À CONFIRMER.\nClient : ' + b.name + '\nTéléphone : ' + b.phone
      + '\nPrestation : ' + (b.prestation || b.motif || '—')
      + '\n\n👉 Accepter / refuser (et ajuster la durée) :\n' + PUBLIC_BASE + '/r/' + b.token,
    start: { dateTime: b.date + 'T' + b.time + ':00', timeZone: TZ },
    end: { dateTime: b.date + 'T' + endTime(b.time, b.durationMin) + ':00', timeZone: TZ },
    colorId: '5',
  };
  try {
    const r = await fetch(calUrl(), { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
    const j = await r.json(); if (j.id) return j.id;
    console.warn('[google] createEvent KO : ' + JSON.stringify(j)); return null;
  } catch (e) { console.warn('[google] createEvent err : ' + e.message); return null; }
}
async function confirmEvent(b) {
  const t = await getToken(); if (!t || !b.gcalId) return;
  try {
    await fetch(calUrl('/' + b.gcalId), { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: '✅ RDV — ' + b.name, colorId: '10', end: { dateTime: b.date + 'T' + endTime(b.time, b.durationMin) + ':00', timeZone: TZ } }) });
  } catch (e) { console.warn('[google] confirmEvent err : ' + e.message); }
}
async function deleteEvent(b) {
  const t = await getToken(); if (!t || !b.gcalId) return;
  try { await fetch(calUrl('/' + b.gcalId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } }); }
  catch (e) { console.warn('[google] deleteEvent err : ' + e.message); }
}

// Plages occupées (freeBusy) — cache 60 s pour ne pas marteler l'API
let bcache = { key: '', at: 0, val: [] };
async function busyRanges(fromISO, toISO) {
  if (!enabled()) return [];
  const key = fromISO + '|' + toISO;
  if (bcache.key === key && Date.now() - bcache.at < 60000) return bcache.val;
  const t = await getToken(); if (!t) return [];
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: fromISO, timeMax: toISO, timeZone: TZ, items: [{ id: CAL_ID }] }) });
    const j = await r.json();
    const busy = (j.calendars && j.calendars[CAL_ID] && j.calendars[CAL_ID].busy) || [];
    bcache = { key: key, at: Date.now(), val: busy };
    return busy;
  } catch (e) { console.warn('[google] freeBusy err : ' + e.message); return []; }
}

module.exports = { enabled, createEvent, confirmEvent, deleteEvent, busyRanges };
