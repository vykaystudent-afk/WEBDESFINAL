/* ---------- Rules and pure helpers (no DOM). Safe to test on their own. ---------- */
// <pure>
const CONFIG = {
  OPEN_HOUR: 6,              // court opens 6 AM
  CLOSE_HOUR: 22,            // court closes 10 PM
  MAX_HOURS: 5,              // longest single reservation
  ADVANCE_DAYS: 30,          // how far ahead residents can book
  PUROKS: 7,                 // number of puroks in the barangay
  OUTSIDE: 'Outside the barangay',
  NONRESIDENT_MULTIPLIER: 2, // fee multiplier for people from outside
  ADMIN_PIN: '2468',         // barangay desk PIN when the data is saved on this device only. Change it.
  PURPOSES: [                // rate = pesos per hour (sample rates)
    { id: 'sports',  label: 'Sports (basketball, volleyball)',   short: 'Sports',        rate: 100 },
    { id: 'program', label: 'Barangay or school program',        short: 'Program',       rate: 0 },
    { id: 'private', label: 'Birthday, party, or private event', short: 'Private event', rate: 300 },
    { id: 'wake',    label: 'Wake or funeral',                   short: 'Wake',          rate: 0 },
    { id: 'other',   label: 'Something else',                    short: 'Other',         rate: 200 }
  ]
};
const pad = n => String(n).padStart(2, '0');
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM', h12 = ((h + 11) % 12) + 1;
  return h12 + (m ? ':' + pad(m) : '') + ' ' + ap;
}
function fmtRange(b) {
  const s = fmtTime(b.startMin), e = fmtTime(b.endMin);
  return s.slice(-2) === e.slice(-2) ? s.slice(0, -3) + '–' + e : s + '–' + e;
}
function peso(n) { return n ? '₱' + Number(n).toLocaleString('en-PH') : 'Free'; }
function overlaps(a, b) { return a.startMin < b.endMin && b.startMin < a.endMin; }
function isActive(b) { return b.status === 'pending' || b.status === 'approved'; }
function findClash(list, cand) {
  return list.find(b => b.id !== cand.id && b.date === cand.date && isActive(b) && overlaps(b, cand)) || null;
}
function purposeOf(id) { return CONFIG.PURPOSES.find(p => p.id === id) || CONFIG.PURPOSES[CONFIG.PURPOSES.length - 1]; }
function feeFor(purposeId, purok, hours) {
  const rate = purposeOf(purposeId).rate;
  const mult = purok === CONFIG.OUTSIDE ? CONFIG.NONRESIDENT_MULTIPLIER : 1;
  return Math.round(rate * mult * hours);
}
function maskName(n) {
  const p = String(n || '').trim().split(/\s+/);
  return p.length < 2 ? p[0] : p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.';
}
function normPhone(s) {
  let p = String(s || '').replace(/[\s\-().]/g, '');
  if (p.indexOf('+63') === 0) p = '0' + p.slice(3);
  else if (/^63\d{10}$/.test(p)) p = '0' + p.slice(2);
  return p;
}
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode(rand) {
  rand = rand || Math.random;
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return 'CC-' + s;
}
function normCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.indexOf('CC') === 0 ? 'CC-' + c.slice(2) : c;
}
function fail(field, msg) { return { ok: false, field: field, msg: msg }; }
/* Checks a request against the rules. `now` is a Date, `items` the current reservations. */
function validate(inp, now, items) {
  const name = String(inp.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3) return fail('fName', 'Enter your full name.');
  const phone = normPhone(inp.phone);
  if (!/^09\d{9}$/.test(phone)) return fail('fPhone', 'Enter an 11-digit mobile number that starts with 09.');
  if (!CONFIG.PURPOSES.some(p => p.id === inp.purposeId)) return fail('fPurpose', 'Choose what the court is for.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.date || '')) return fail('fDate', 'Pick a date.');
  const today = ymd(now);
  if (inp.date < today) return fail('fDate', 'That date has already passed.');
  if (inp.date > ymd(addDays(now, CONFIG.ADVANCE_DAYS))) return fail('fDate', 'You can reserve up to ' + CONFIG.ADVANCE_DAYS + ' days ahead.');
  const hours = Number(inp.hours);
  if (!(hours >= 1 && hours <= CONFIG.MAX_HOURS)) return fail('fHours', 'Choose 1 to ' + CONFIG.MAX_HOURS + ' hours.');
  const startMin = Number(inp.startMin), endMin = startMin + hours * 60;
  if (!(startMin >= CONFIG.OPEN_HOUR * 60) || endMin > CONFIG.CLOSE_HOUR * 60)
    return fail('fStart', 'The court is open ' + fmtTime(CONFIG.OPEN_HOUR * 60) + ' to ' + fmtTime(CONFIG.CLOSE_HOUR * 60) + '. Choose an earlier start or a shorter length.');
  if (inp.date === today && startMin <= now.getHours() * 60 + now.getMinutes()) return fail('fStart', 'That start time has already passed.');
  const people = Math.round(Number(inp.people));
  if (!(people >= 1 && people <= 300)) return fail('fPeople', 'Enter how many people to expect (1 to 300).');
  const data = {
    name: name, phone: phone, purok: inp.purok, purposeId: inp.purposeId,
    details: String(inp.details || '').trim().slice(0, 80), people: people,
    date: inp.date, startMin: startMin, endMin: endMin, hours: hours,
    fee: feeFor(inp.purposeId, inp.purok, hours)
  };
  const clash = findClash(items, data);
  if (clash) return fail('fStart', 'Not available: ' + fmtRange(clash) + ' is already ' + (clash.status === 'approved' ? 'reserved' : 'requested') + '. Pick another time.');
  return { ok: true, data: data };
}
// </pure>

/* ---------- App ---------- */
const ROW = 42; // keep equal to --row in the CSS
const LS_KEY = 'bcc.court.bookings.v1';
const state = {
  items: [], date: ymd(new Date()), mode: 'connecting', canWrite: true, isAdmin: false,
  deskOpen: false, unlocked: false, listFilter: 'upcoming', declining: null, reason: '',
  confirm: null, lookup: null, uid: null, userApi: null, visits: [], people: {}
};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byTime = (a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin;
const fmtDay = ds => parseYmd(ds).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const todayStr = () => ymd(new Date());

function errText(err) {
  const c = err && err.code;
  if (c === 'quota_exceeded') return 'The database is full. Remove old requests, then try again.';
  if (c === 'invalid_argument') return 'This account is not allowed to change reservations here.';
  return 'Something went wrong. Check your connection and try again.';
}
let toastTimer;
function toast(msg, bad) {
  const el = $('toast');
  el.textContent = msg; el.className = 'toast' + (bad ? ' bad' : ''); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

/* ---------- Storage: shared database when the page has one, otherwise this browser ---------- */
const Store = {
  db: null,
  holder: Math.random().toString(36).slice(2, 10),
  async init() {
    let db = null;
    try { if (window.claude && typeof window.claude.use === 'function') db = await window.claude.use('db'); } catch (e) { db = null; }
    if (db) {
      this.db = db; state.mode = 'shared';
      try {
        const user = await window.claude.use('user');
        if (user) {
          state.userApi = user;
          state.isAdmin = await user.canEdit();
          state.uid = await user.id();
          const w = await user.can('data.write');
          state.canWrite = w !== false;
        }
      } catch (e) { /* keep defaults */ }
      this.logVisit();
      if (state.isAdmin) {
        // Only the barangay desk (page editors) can read the visitor log.
        db.collection('visits').onSnapshot(
          snap => { state.visits = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })); render(); },
          () => { /* no access: leave the log empty */ }
        );
      }
      db.collection('bookings').onSnapshot(
        snap => { state.items = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })); render(); },
        () => { state.mode = 'offline'; render(); }
      );
    } else {
      state.mode = 'local'; this.loadLocal();
      window.addEventListener('storage', ev => { if (ev.key === LS_KEY) { this.loadLocal(); render(); } });
    }
    render();
  },
  /* Records that this signed-in account opened the page: first visit, last visit, visit count. Stores the id only. */
  async logVisit() {
    if (!this.db || !state.uid) return;
    try {
      const ref = this.db.doc('visits/' + state.uid), snap = await ref.get(), prev = snap.exists ? snap.data() : null;
      await ref.set({ firstSeen: prev ? prev.firstSeen : Date.now(), lastSeen: Date.now(), visits: (prev ? prev.visits : 0) + 1 });
    } catch (e) { /* view-only accounts cannot write; ignore */ }
  },
  loadLocal() {
    try { state.items = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { state.items = []; }
  },
  saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(state.items)); } catch (e) { /* private mode */ } },
  /* Saves a new request. Returns {ok, rec} or {ok:false, msg}. Checks for a clash again at save time. */
  async create(data) {
    if (this.db) {
      const db = this.db;
      // One short lock per date so two people cannot save overlapping slots at the same moment.
      const got = await db.doc('locks/' + data.date).acquire({ holder: this.holder, ttlMs: 8000 });
      if (!got.acquired) return { ok: false, msg: 'Someone else is booking this date right now. Wait a few seconds and send again.' };
      const snap = await db.collection('bookings').where('date', '==', data.date).get();
      const clash = findClash(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })), data);
      if (clash) return { ok: false, msg: 'Just taken: ' + fmtRange(clash) + was reserved a moment ago. Pick another time.' };
      let code = makeCode();
      for (let i = 0; i < 5; i++) {
        const ex = await db.doc('bookings/' + code).get();
        if (!ex.exists) break;
        code = makeCode();
      }
      const rec = Object.assign({}, data, { id: code, uid: state.uid || null, status: 'pending', paid: false, createdAt: Date.now() });
      await db.doc('bookings/' + code).set(rec);
      return { ok: true, rec: rec };
    }
    this.loadLocal();
    const clash = findClash(state.items, data);
    if (clash) return { ok: false, msg: 'Just taken: ' + fmtRange(clash) + ' is already booked. Pick another time.' };
    let code = makeCode();
    while (state.items.some(b => b.id === code)) code = makeCode();
    const rec = Object.assign({}, data, { id: code, status: 'pending', paid: false, createdAt: Date.now() });
    state.items = state.items.concat([rec]); this.saveLocal(); render();
    return { ok: true, rec: rec };
  },
  async update(id, patch) {
    if (this.db) { await this.db.doc('bookings/' + id).update(patch); return; }
    state.items = state.items.map(b => b.id === id ? Object.assign({}, b, patch) : b);
    this.saveLocal(); render();
  }
};

/* ---------- Form helpers ---------- */
function readForm() {
  const p = ($('fStart').value || '17:00').split(':').map(Number);
  return {
    name: $('fName').value, phone: $('fPhone').value, purok: $('fPurok').value, purposeId: $('fPurpose').value,
    details: $('fDetails').value, date: $('fDate').value, startMin: p[0] * 60 + p[1],
    hours: Number($('fHours').value), people: $('fPeople').value
  };
}
function candidateFrom(f) { return { id: '', date: f.date, startMin: f.startMin, endMin: f.startMin + f.hours * 60 }; }
function showFormErr(msg, field) {
  const el = $('formErr'); el.textContent = msg; el.hidden = false;
  const f = field && $(field); if (f) f.focus();
}

/* ---------- Rendering ---------- */
function renderConn() {
  const map = { connecting: ['Connecting', ''], shared: ['Live and shared', 'ok'], local: ['This device only', 'warn'], offline: ['Offline', 'bad'] };
  const m = map[state.mode];
  $('connText').textContent = m[0]; $('conn').className = 'pill ' + m[1];
  $('modeNote').textContent = state.mode === 'local'
    ? 'Demo mode: reservations are saved in this browser only. Connect a shared database so every phone sees the same schedule.'
    : state.mode === 'shared' ? 'Signed-in visitors are recorded (name, first visit, last visit) so the barangay desk can see who used the system.' : '';
}
function renderChrome() {
  $('deskBtn').hidden = state.mode === 'connecting' || (state.mode === 'shared' && !state.isAdmin);
  $('deskBtn').textContent = state.deskOpen ? 'Back to schedule' : 'Barangay desk';
  const notice = $('notice');
  if (state.mode === 'shared' && !state.canWrite) {
    notice.hidden = false;
    notice.textContent = 'You can view the schedule, but this account cannot send requests. Ask the barangay desk for contributor access.';
  } else if (state.mode === 'offline') {
    notice.hidden = false; notice.textContent = 'The connection to the shared schedule was lost. Reload the page to reconnect.';
  } else notice.hidden = true;
  $('fs').disabled = state.mode === 'shared' && !state.canWrite;
}
function renderDays() {
  const base = new Date(); let html = '';
  for (let i = 0; i <= CONFIG.ADVANCE_DAYS; i++) {
    const d = addDays(base, i), ds = ymd(d);
    const n = state.items.filter(b => b.date === ds && isActive(b)).length;
    html += '<button type="button" class="day' + (ds === state.date ? ' on' : '') + '" data-date="' + ds + '" aria-pressed="' + (ds === state.date) + '">' +
      '<span class="dw">' + (i === 0 ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })) + '</span>' +
      '<span class="dn">' + d.getDate() + '</span><span class="dc">' + (n ? n + ' booked' : 'open') + '</span></button>';
  }
  $('days').innerHTML = html;
  $('dateLong').textContent = parseYmd(state.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function renderTimeline() {
  const open = CONFIG.OPEN_HOUR * 60, close = CONFIG.CLOSE_HOUR * 60;
  const pos = (s, e) => 'top:' + ((s - open) / 60 * ROW + 1) + 'px;height:' + ((e - s) / 60 * ROW - 2) + 'px';
  let html = '';
  for (let h = CONFIG.OPEN_HOUR; h < CONFIG.CLOSE_HOUR; h++)
    html += '<button type="button" class="hour" data-h="' + h + '" aria-label="Start a request at ' + fmtTime(h * 60) + '"><span class="t">' + fmtTime(h * 60) + '</span><span class="slot"></span></button>';
  state.items.filter(b => b.date === state.date && isActive(b)).forEach(b => {
    html += '<div class="blk ' + b.status + '" style="' + pos(b.startMin, b.endMin) + '"><strong>' + esc(purposeOf(b.purposeId).short) + '</strong><span>' +
      fmtRange(b) + (b.status === 'pending' ? ' · pending' : '') + '</span></div>';
  });
  const f = readForm(), c = candidateFrom(f);
  if (f.date === state.date && c.startMin >= open && c.endMin <= close) {
    const bad = !!findClash(state.items, c);
    html += '<div class="blk preview' + (bad ? ' bad' : '') + '" style="' + pos(c.startMin, c.endMin) + '"><strong>Your request</strong><span>' + fmtRange(c) + '</span></div>';
  }
  $('timeline').innerHTML = html;
}
function updateSummary() {
  const f = readForm(), el = $('summary'), c = candidateFrom(f);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) { el.className = 'summary'; el.textContent = 'Pick a date to see the fee.'; return; }
  const label = fmtDay(f.date) + ' · ' + fmtRange(c);
  const clash = findClash(state.items, c);
  if (c.endMin > CONFIG.CLOSE_HOUR * 60) { el.className = 'summary bad'; el.textContent = label + ' ends after closing at ' + fmtTime(CONFIG.CLOSE_HOUR * 60) + '.'; return; }
  if (clash) { el.className = 'summary bad'; el.textContent = label + ' overlaps a ' + (clash.status === 'approved' ? 'reserved' : 'requested') + ' slot (' + fmtRange(clash) + ').'; return; }
  const p = purposeOf(f.purposeId), mult = f.purok === CONFIG.OUTSIDE ? CONFIG.NONRESIDENT_MULTIPLIER : 1;
  const fee = feeFor(f.purposeId, f.purok, f.hours);
  el.className = 'summary';
  el.textContent = label + ' · ' + (fee ? 'Fee ' + peso(fee) + ' (' + peso(p.rate * mult) + ' per hour)' : 'No fee');
}
function statusChip(b) {
  const m = { pending: ['Pending review', 'warn'], approved: ['Approved', 'ok'], rejected: ['Declined', 'bad'], cancelled: ['Cancelled', ''] }[b.status] || ['', ''];
  return '<span class="chip ' + m[1] + '">' + m[0] + '</span>';
}
function renderList() {
  const t = todayStr(), act = state.items.filter(isActive).sort(byTime);
  const up = act.filter(b => b.date >= t), past = act.filter(b => b.date < t).reverse();
  const show = state.listFilter === 'past' ? past : up;
  $('tabUp').className = 'tab' + (state.listFilter === 'upcoming' ? ' on' : '');
  $('tabPast').className = 'tab' + (state.listFilter === 'past' ? ' on' : '');
  $('listBody').innerHTML = show.length ? show.map(b =>
    '<article class="row"><div class="when"><strong>' + esc(fmtDay(b.date)) + '</strong><span class="mono">' + fmtRange(b) + '</span></div>' +
    '<div class="what"><strong>' + esc(purposeOf(b.purposeId).label) + '</strong>' + (b.details ? ' · ' + esc(b.details) : '') +
    '<br><small>' + esc(maskName(b.name)) + ' · ' + esc(b.purok) + '</small></div><div class="acts">' + statusChip(b) + '</div></article>').join('')
    : '<p class="empty">' + (state.listFilter === 'past' ? 'No past reservations yet.' : 'No upcoming reservations. Tap an open hour on the schedule and send the first request.') + '</p>';
}
function renderLookup() {
  const el = $('lookupOut'), L = state.lookup;
  if (!L) { el.innerHTML = ''; return; }
  const b = L.id && state.items.find(x => x.id === L.id);
  if (!b) { el.innerHTML = '<div class="found"><p class="err">No request matches that code and mobile number. Check both and try again.</p></div>'; return; }
  const canCancel = isActive(b) && b.date >= todayStr();
  let html = '<div class="found"><div>' + statusChip(b) + '</div><p><strong>' + esc(fmtDay(b.date)) + '</strong> · <span class="mono">' + fmtRange(b) + '</span></p>' +
    '<p>' + esc(purposeOf(b.purposeId).label) + ' · Fee ' + peso(b.fee) + (b.status === 'approved' && b.fee ? (b.paid ? ' (paid)' : ' (pay at the barangay hall)') : '') + '</p>';
  if (b.status === 'rejected' && b.note) html += '<p>Reason: ' + esc(b.note) + '</p>';
  if (canCancel) {
    html += state.confirm === 'lc:' + b.id
      ? '<div class="btns"><button class="btn bad sm" type="button" data-act="lc-yes" data-id="' + esc(b.id) + '">Yes, cancel it</button><button class="btn ghost sm" type="button" data-act="lc-no">Keep it</button></div>'
      : '<div class="btns"><button class="btn ghost sm" type="button" data-act="lc-ask" data-id="' + esc(b.id) + '">Cancel this request</button></div>';
  }
  el.innerHTML = html + '</div>';
}

/* ---------- Barangay desk ---------- */
function adminOK() { return state.mode === 'shared' ? state.isAdmin : state.unlocked; }
function adminRow(b) {
  const p = purposeOf(b.purposeId);
  let acts = statusChip(b);
  if (b.status === 'approved' && b.fee) acts += ' <span class="chip ' + (b.paid ? 'ok' : 'warn') + '">' + (b.paid ? 'Paid ' + peso(b.fee) : 'Unpaid ' + peso(b.fee)) + '</span>';
  if (b.status === 'pending') {
    if (state.declining === b.id) {
      acts = '<div class="reason"><input id="reasonInput" maxlength="100" placeholder="Reason shown to the resident (optional)" value="' + esc(state.reason) + '">' +
        '<button class="btn bad sm" type="button" data-act="d-yes" data-id="' + esc(b.id) + '">Decline request</button><button class="btn ghost sm" type="button" data-act="d-no">Back</button></div>';
    } else {
      acts += ' <button class="btn ok sm" type="button" data-act="approve" data-id="' + esc(b.id) + '">Approve</button><button class="btn ghost sm" type="button" data-act="d-open" data-id="' + esc(b.id) + '">Decline</button>';
    }
  } else if (b.status === 'approved' && b.date >= todayStr()) {
    if (b.fee) acts += ' <button class="btn ghost sm" type="button" data-act="' + (b.paid ? 'unpaid' : 'paid') + '" data-id="' + esc(b.id) + '">' + (b.paid ? 'Mark unpaid' : 'Mark paid') + '</button>';
    acts += state.confirm === 'c:' + b.id
      ? ' <button class="btn bad sm" type="button" data-act="c-yes" data-id="' + esc(b.id) + '">Confirm cancel</button><button class="btn ghost sm" type="button" data-act="c-no">Keep</button>'
      : ' <button class="btn ghost sm" type="button" data-act="c-ask" data-id="' + esc(b.id) + '">Cancel booking</button>';
  } else if (b.status === 'approved' && b.fee && !b.paid) {
    acts += ' <button class="btn ghost sm" type="button" data-act="paid" data-id="' + esc(b.id) + '">Mark paid</button>';
  }
  return '<article class="row"><div class="when"><strong>' + esc(fmtDay(b.date)) + '</strong><span class="mono">' + fmtRange(b) + '</span></div>' +
    '<div class="what"><strong>' + esc(b.name) + '</strong> · <span class="mono">' + esc(b.phone) + '</span> · ' + esc(b.purok) +
    '<br><small>' + esc(p.label) + (b.details ? ' · ' + esc(b.details) : '') + ' · ' + b.people + ' people · ' + peso(b.fee) + '</small>' +
    '<br><small class="code">' + esc(b.id) + (b.note ? ' · ' + esc(b.note) : '') + '</small>' +
    (b.uid && state.people[b.uid] && state.people[b.uid].name ? '<br><small>Sent from account: ' + esc(state.people[b.uid].name) + '</small>' : '') +
    '</div><div class="acts">' + acts + '</div></article>';
}
const fmtStamp = ts => new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/* Everyone who sent a request, grouped by mobile number. Works with or without sign-in. */
function requesterList() {
  const m = {};
  state.items.forEach(b => {
    const k = normPhone(b.phone), r = m[k] || (m[k] = { name: b.name, phone: b.phone, purok: b.purok, count: 0, last: 0 });
    r.count++;
    if ((b.createdAt || 0) >= r.last) { r.last = b.createdAt || 0; r.name = b.name; r.purok = b.purok; }
  });
  return Object.keys(m).map(k => m[k]).sort((a, b) => b.last - a.last);
}
let resolving = false;
/* Looks up display names for account ids. Ids are stored; names are fetched fresh each session. */
async function resolveNames(ids) {
  const api = state.userApi;
  const need = ids.filter((id, i) => id && ids.indexOf(id) === i && !(id in state.people));
  if (!api || !need.length || resolving) return;
  resolving = true;
  try {
    const ps = await api.profiles(need);
    need.forEach(id => { state.people[id] = ps[id] || { name: '' }; });
    resolving = false; renderDesk();
  } catch (e) { need.forEach(id => { state.people[id] = { name: '' }; }); resolving = false; }
}
/* "Who has used it": requesters from the bookings, plus signed-in visitors when the data is shared. */
function usageSections() {
  const reqs = requesterList();
  let html = '<div class="sec"><h3>Who has sent requests</h3>' + (reqs.length ? reqs.map(r =>
    '<article class="row"><div class="what"><strong>' + esc(r.name) + '</strong> · <span class="mono">' + esc(r.phone) + '</span> · ' + esc(r.purok) +
    '</div><div class="acts"><span class="chip acc">' + r.count + (r.count === 1 ? ' request' : ' requests') + '</span><span class="muted">last ' + esc(fmtStamp(r.last)) + '</span></div></article>').join('')
    : '<p class="empty">Nobody has sent a request yet.</p>') + '</div>';
  if (state.mode === 'shared') {
    const vs = state.visits.slice().sort((a, b) => b.lastSeen - a.lastSeen);
    html += '<div class="sec"><h3>Signed-in people who opened the page</h3>' + (vs.length ? vs.map(v => {
      const p = state.people[v.id] || {}, n = state.items.filter(b => b.uid === v.id).length;
      return '<article class="row"><div class="what"><strong>' + esc(p.name || 'Name not shared') + '</strong>' + (p.guest ? ' <span class="chip">Guest</span>' : '') +
        (p.isMe ? ' <span class="chip acc">You</span>' : '') + '<br><small>First visit ' + esc(fmtStamp(v.firstSeen)) + '</small></div>' +
        '<div class="acts"><span class="chip">' + v.visits + (v.visits === 1 ? ' visit' : ' visits') + '</span><span class="chip acc">' + n + (n === 1 ? ' request' : ' requests') +
        '</span><span class="muted">last ' + esc(fmtStamp(v.lastSeen)) + '</span></div></article>';
    }).join('') : '<p class="empty">No one has opened the page yet. Share the link and visitors will appear here.</p>') + '</div>';
  } else {
    html += '<div class="sec"><h3>People who only looked</h3><p class="empty">This standalone version cannot tell who opened the page. Only people who send a request are listed above. The shared version also lists signed-in visitors.</p></div>';
  }
  return html;
}
function renderDesk() {
  const card = $('deskCard');
  card.hidden = !state.deskOpen; $('listCard').hidden = state.deskOpen;
  if (!state.deskOpen) return;
  if (!adminOK()) {
    card.innerHTML = '<h2 id="deskH">Barangay desk</h2><form id="pinForm" class="fs" style="margin-top:12px;max-width:320px"><div class="f"><label for="pinInput">Desk PIN</label><input id="pinInput" type="password" autocomplete="off" inputmode="numeric"></div>' +
      '<p class="err" id="pinErr" hidden>That PIN is not right.</p><button class="btn" type="submit">Unlock</button></form>';
    return;
  }
  const hadFocus = document.activeElement && document.activeElement.id === 'reasonInput';
  const t = todayStr();
  const pending = state.items.filter(b => b.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const upcoming = state.items.filter(b => b.status === 'approved' && b.date >= t).sort(byTime);
  const history = state.items.filter(b => !pending.includes(b) && !upcoming.includes(b)).sort((a, b) => byTime(b, a)).slice(0, 25);
  const paidSum = state.items.filter(b => b.status === 'approved' && b.paid).reduce((s, b) => s + (b.fee || 0), 0);
  const dueSum = state.items.filter(b => b.status === 'approved' && !b.paid).reduce((s, b) => s + (b.fee || 0), 0);
  const sec = (title, list, none) => '<div class="sec"><h3>' + title + '</h3>' + (list.length ? list.map(adminRow).join('') : '<p class="empty">' + none + '</p>') + '</div>';
  card.innerHTML = '<h2 id="deskH">Barangay desk</h2><div class="stats">' +
    '<div class="stat' + (pending.length ? ' hot' : '') + '"><b>' + pending.length + '</b><span>Waiting for review</span></div>' +
    '<div class="stat"><b>' + upcoming.length + '</b><span>Approved, coming up</span></div>' +
    '<div class="stat"><b>' + peso(paidSum).replace('Free', '₱0') + '</b><span>Fees collected</span></div>' +
    '<div class="stat"><b>' + peso(dueSum).replace('Free', '₱0') + '</b><span>Fees still due</span></div></div>' +
    sec('Needs review', pending, 'Nothing waiting. New requests show up here.') +
    sec('Approved and coming up', upcoming, 'No approved reservations ahead.') +
    sec('History', history, 'Past, declined and cancelled requests appear here.') + usageSections();
  resolveNames(state.visits.map(v => v.id).concat(state.items.map(b => b.uid)));
  if (hadFocus && $('reasonInput')) { const r = $('reasonInput'); r.focus(); r.setSelectionRange(r.value.length, r.value.length); }
}

function render() {
  renderConn(); renderChrome(); renderDays(); renderTimeline(); updateSummary(); renderList(); renderDesk(); renderLookup();
}

/* ---------- Actions ---------- */
let busy = false;
async function run(fn, okMsg) {
  if (busy) return; busy = true;
  try { await fn(); if (okMsg) toast(okMsg); } catch (err) { toast(errText(err), true); } finally { busy = false; }
}
function setDate(ds) { state.date = ds; $('fDate').value = ds; renderDays(); renderTimeline(); updateSummary(); }
function pickHour(h) {
  $('fStart').value = pad(h) + ':00'; renderTimeline(); updateSummary();
  if (window.matchMedia('(max-width:880px)').matches) $('formH').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('fName').focus({ preventScroll: true });
}
function showDone(rec) {
  $('bookForm').hidden = true;
  const d = $('done'); d.hidden = false;
  d.innerHTML = '<p class="eyebrow">Request sent</p><p>Your reference code</p><p class="codebig mono" id="codeText">' + esc(rec.id) + '</p>' +
    '<p><strong>' + esc(fmtDay(rec.date)) + '</strong> · ' + fmtRange(rec) + ' · ' + esc(purposeOf(rec.purposeId).short) + ' · ' + (rec.fee ? 'Fee ' + peso(rec.fee) : 'No fee') + '</p>' +
    '<p class="muted">The slot is held while the barangay desk reviews your request. Keep this code and your mobile number. You need both to check or cancel the request.</p>' +
    '<div class="btns"><button class="btn" type="button" data-act="copy">Copy code</button><button class="btn ghost" type="button" data-act="new">Reserve another slot</button></div>';
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-date],[data-h],[data-filter]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.date) return setDate(ds.date);
  if (ds.h) return pickHour(Number(ds.h));
  if (ds.filter) { state.listFilter = ds.filter; return renderList(); }
  const id = ds.id;
  const b = id && state.items.find(x => x.id === id);
  switch (ds.act) {
    case 'desk': state.deskOpen = !state.deskOpen; return render();
    case 'copy': {
      const code = $('codeText').textContent;
      try { navigator.clipboard.writeText(code).then(() => toast('Code copied'), () => toast('Select the code and copy it.')); } catch (err) { toast('Select the code and copy it.'); }
      return;
    }
    case 'new': $('done').hidden = true; $('bookForm').hidden = false; $('fDetails').value = ''; renderTimeline(); return updateSummary();
    case 'lc-ask': state.confirm = 'lc:' + id; return renderLookup();
    case 'lc-no': case 'c-no': state.confirm = null; return render();
    case 'c-ask': state.confirm = 'c:' + id; return renderDesk();
    case 'd-open': state.declining = id; state.reason = ''; return renderDesk();
    case 'd-no': state.declining = null; return renderDesk();
    case 'lc-yes': state.confirm = null; return run(() => Store.update(id, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'requester' }), 'Request cancelled');
    case 'c-yes': state.confirm = null; return run(() => Store.update(id, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'barangay' }), 'Booking cancelled');
    case 'd-yes': {
      const note = state.reason.trim(); state.declining = null; state.reason = '';
      return run(() => Store.update(id, { status: 'rejected', note: note, decidedAt: Date.now() }), 'Request declined');
    }
    case 'approve':
      if (b && findClash(state.items, b)) return toast('This overlaps another active reservation. Decline or cancel one of them first.', true);
      return run(() => Store.update(id, { status: 'approved', decidedAt: Date.now() }), 'Approved');
    case 'paid': return run(() => Store.update(id, { paid: true, paidAt: Date.now() }), 'Marked as paid');
    case 'unpaid': return run(() => Store.update(id, { paid: false, paidAt: null }), 'Marked as unpaid');
  }
});
document.addEventListener('input', e => { if (e.target.id === 'reasonInput') state.reason = e.target.value; });
document.addEventListener('submit', e => {
  if (e.target.id !== 'pinForm') return;
  e.preventDefault();
  if ($('pinInput').value === CONFIG.ADMIN_PIN) { state.unlocked = true; render(); } else $('pinErr').hidden = false;
});

$('bookForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  $('formErr').hidden = true;
  const res = validate(readForm(), new Date(), state.items);
  if (!res.ok) return showFormErr(res.msg, res.field);
  const btn = $('submitBtn'); busy = true; btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const out = await Store.create(res.data);
    if (!out.ok) showFormErr(out.msg, 'fStart'); else showDone(out.rec);
  } catch (err) { showFormErr(errText(err)); }
  finally { busy = false; btn.disabled = false; btn.textContent = 'Send reservation request'; }
});
$('lookupForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = normCode($('lCode').value), phone = normPhone($('lPhone').value);
  const hit = state.items.find(b => b.id === code && normPhone(b.phone) === phone);
  state.lookup = { id: hit ? hit.id : null }; state.confirm = null; renderLookup();
});
function onFormChange(e) {
  $('formErr').hidden = true;
  if (e.target.id === 'fDate' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { state.date = e.target.value; renderDays(); }
  renderTimeline(); updateSummary();
}
$('bookForm').addEventListener('change', onFormChange);
$('bookForm').addEventListener('input', onFormChange);

/* ---------- Start ---------- */
(function boot() {
  let o = '';
  for (let i = 1; i <= CONFIG.PUROKS; i++) o += '<option>Purok ' + i + '</option>';
  $('fPurok').innerHTML = o + '<option>' + CONFIG.OUTSIDE + '</option>';
  $('fPurpose').innerHTML = CONFIG.PURPOSES.map(p => '<option value="' + p.id + '">' + esc(p.label) + '</option>').join('');
  o = '';
  for (let m = CONFIG.OPEN_HOUR * 60; m <= CONFIG.CLOSE_HOUR * 60 - 60; m += 30) o += '<option value="' + pad(Math.floor(m / 60)) + ':' + pad(m % 60) + '">' + fmtTime(m) + '</option>';
  $('fStart').innerHTML = o; $('fStart').value = '17:00';
  $('fHours').innerHTML = Array.from({ length: CONFIG.MAX_HOURS }, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + (i ? ' hours' : ' hour') + '</option>').join('');
  $('fHours').value = '2';
  const now = new Date();
  $('fDate').min = ymd(now); $('fDate').max = ymd(addDays(now, CONFIG.ADVANCE_DAYS)); $('fDate').value = state.date;
  render();
  Store.init();
})();
