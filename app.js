'use strict';
/* ═══════════════════════════════════════════════════
   NUPTIA — app.js
   Universal Wedding Planner
   Cloud storage: Firebase Firestore (falls back to localStorage)
   ═══════════════════════════════════════════════════ */

/* ════════════════════════════════
   STORAGE — dual layer (cloud + local)
════════════════════════════════ */
const COLLECTION = 'nuptia';
const DOC_SETTINGS = 'settings';

const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let _cloudSettings = {};

async function cloudGet(key, def) {
  if (!FIREBASE_READY || !db) return LS.get(key, def);
  try {
    if (Object.keys(_cloudSettings).length === 0) {
      const snap = await db.collection(COLLECTION).doc(DOC_SETTINGS).get();
      _cloudSettings = snap.exists ? snap.data() : {};
    }
    const val = _cloudSettings[key];
    if (val !== undefined) { LS.set(key, val); return val; }
  } catch {}
  return LS.get(key, def);
}

let _savePending = false;
let _saveTimeout;
function cloudSet(key, val) {
  LS.set(key, val);
  _cloudSettings[key] = val;
  if (!FIREBASE_READY || !db) return;
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(async () => {
    setCloudStatus('saving');
    try {
      await db.collection(COLLECTION).doc(DOC_SETTINGS).set(_cloudSettings, { merge: true });
      setCloudStatus('online');
    } catch { setCloudStatus('error'); }
  }, 800);
}

/* Guests are stored in their own Firestore collection */
async function cloudGetGuests() {
  if (!FIREBASE_READY || !db) return LS.get('guests', []);
  try {
    const snap = await db.collection(COLLECTION).doc('guestList').collection('guests').get();
    const guests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    LS.set('guests', guests);
    return guests;
  } catch { return LS.get('guests', []); }
}

async function cloudSaveGuest(guest) {
  LS.set('guests', guests);
  if (!FIREBASE_READY || !db) return;
  setCloudStatus('saving');
  try {
    await db.collection(COLLECTION).doc('guestList').collection('guests').doc(guest.id).set(guest);
    setCloudStatus('online');
  } catch { setCloudStatus('error'); }
}

async function cloudDeleteGuest(id) {
  LS.set('guests', guests);
  if (!FIREBASE_READY || !db) return;
  try { await db.collection(COLLECTION).doc('guestList').collection('guests').doc(id).delete(); setCloudStatus('online'); }
  catch { setCloudStatus('error'); }
}

async function cloudSaveAllGuests() {
  LS.set('guests', guests);
  if (!FIREBASE_READY || !db) return;
  setCloudStatus('saving');
  try {
    const batch = db.batch();
    // Clear existing
    const snap = await db.collection(COLLECTION).doc('guestList').collection('guests').get();
    snap.docs.forEach(d => batch.delete(d.ref));
    guests.forEach(g => {
      const ref = db.collection(COLLECTION).doc('guestList').collection('guests').doc(g.id);
      batch.set(ref, g);
    });
    await batch.commit();
    setCloudStatus('online');
  } catch { setCloudStatus('error'); }
}

/* ════════════════════════════════
   CLOUD STATUS UI
════════════════════════════════ */
function setCloudStatus(status) {
  const dot1 = document.getElementById('cloudDot');
  const dot2 = document.getElementById('drawerCloudDot');
  const lbl1 = document.getElementById('cloudLabel');
  const lbl2 = document.getElementById('drawerCloudLabel');
  const map = {
    online:  { cls:'online',  txt:'Synced' },
    offline: { cls:'offline', txt:'Offline (local only)' },
    saving:  { cls:'saving',  txt:'Saving…' },
    error:   { cls:'error',   txt:'Sync error' },
    local:   { cls:'offline', txt:'Local mode' },
  };
  const s = map[status] || map.local;
  [dot1,dot2].forEach(d => { if (d) { d.className='cloud-dot'; d.classList.add(s.cls); } });
  if (lbl1) lbl1.textContent = s.txt;
  if (lbl2) lbl2.textContent = FIREBASE_READY ? s.txt : 'Local mode (no Firebase)';
}

/* ════════════════════════════════
   TOAST
════════════════════════════════ */
let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ════════════════════════════════
   EDITABLE TEXT FIELDS
════════════════════════════════ */
function initEditableTexts() {
  document.querySelectorAll('.editable-text[data-key]').forEach(el => {
    const key = 'et_' + el.dataset.key;
    const saved = LS.get(key, null);
    if (saved) el.innerHTML = saved;
    el.addEventListener('blur', () => {
      cloudSet(key, el.innerHTML);
      toast('✅ Saved');
    });
  });
}

/* ════════════════════════════════
   NAV / MOBILE MENU
════════════════════════════════ */
function toggleMenu() {
  const d = document.getElementById('navDrawer');
  const b = document.getElementById('drawerBackdrop');
  const h = document.getElementById('hamburger');
  d.classList.toggle('open'); b.classList.toggle('open'); h.classList.toggle('open');
}
function closeMenu() {
  document.getElementById('navDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}
window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;

/* ════════════════════════════════
   WEDDING DATE & HERO COUNTDOWN
════════════════════════════════ */
function getWeddingDate() {
  const saved = LS.get('weddingDate', '2026-12-15');
  const inp = document.getElementById('weddingDate');
  if (inp) inp.value = saved;
  return new Date(saved + 'T00:00:00');
}

window.onDateChange = function() {
  const val = document.getElementById('weddingDate').value;
  cloudSet('weddingDate', val);
  updateAllCountdowns();
};

function updateAllCountdowns() {
  const target = getWeddingDate();
  const now = new Date();
  const diff = Math.max(0, target - now);

  const days  = Math.floor(diff / 864e5);
  const hours = Math.floor((diff % 864e5) / 36e5);
  const mins  = Math.floor((diff % 36e5) / 6e4);
  const secs  = Math.floor((diff % 6e4) / 1e3);

  // Hero strip
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('hcsDays', days); set('hcsHours', String(hours).padStart(2,'0'));
  set('hcsMins',  String(mins).padStart(2,'0')); set('hcsSecs', String(secs).padStart(2,'0'));

  // Big countdown section
  const bc = document.getElementById('bigCountdown');
  if (!bc) return;
  bc.innerHTML = [
    [days,'Days'],[hours,'Hours'],[mins,'Mins'],[secs,'Secs']
  ].map(([ v, l], i) => `
    <div class="cd-block"><div class="cd-num">${v}</div><div class="cd-label">${l}</div></div>
    ${i < 3 ? '<div class="cd-sep">·</div>' : ''}
  `).join('');
}

/* ════════════════════════════════
   BUDGET
════════════════════════════════ */
const DEFAULT_CATS = [
  { emoji:'🏛️', name:'Venue & Accommodation',       pct:22, min:10, max:35 },
  { emoji:'🍽️', name:'Catering (Food & Beverage)',  pct:27, min:10, max:40 },
  { emoji:'🌸', name:'Décor & Florals',              pct:17, min:5,  max:30 },
  { emoji:'👗', name:'Bridal Attire & Jewellery',    pct:12, min:5,  max:25 },
  { emoji:'📸', name:'Photography & Videography',    pct:10, min:4,  max:20 },
  { emoji:'🎶', name:'Entertainment & Sound',         pct:6,  min:2,  max:15 },
  { emoji:'🚗', name:'Transport & Logistics',         pct:4,  min:1,  max:10 },
  { emoji:'🎁', name:'Gifts & Favours',               pct:2,  min:1,  max:8  },
  { emoji:'🆘', name:'Emergency Buffer',               pct:7,  min:3,  max:15 },
];

const CAT_COLOURS = ['#B8872A','#C8897A','#7E9E84','#8B8AC8','#C0956A','#6AACBB','#B8A02A','#A86A8B','#6A9AB8'];

let budgetCats = [];

function loadBudget() {
  budgetCats = LS.get('budgetCats', DEFAULT_CATS.map(c => ({...c})));
}
window.resetBudget = function() {
  budgetCats = DEFAULT_CATS.map(c => ({...c}));
  cloudSet('budgetCats', budgetCats);
  renderBudget();
  toast('↺ Budget reset');
};
window.onBudgetInput = function() {
  const v = parseFloat(document.getElementById('totalBudget').value) || 40;
  cloudSet('totalBudget', v);
  renderBudgetAmounts(v);
  updateBudgetStats(v);
  drawDonut();
};
window.onSlider = function(i, v) {
  budgetCats[i].pct = +v;
  cloudSet('budgetCats', budgetCats);
  renderBudgetAmounts(getBudgetLakhs());
  updateBudgetStats(getBudgetLakhs());
  const badge = document.getElementById(`bc-pct-${i}`);
  if (badge) badge.textContent = v + '%';
  const bar = document.getElementById(`bc-bar-${i}`);
  if (bar) bar.style.width = (v * 3.2) + '%';
  const slval = document.getElementById(`bc-slval-${i}`);
  if (slval) slval.textContent = v + '%';
  drawDonut();
};
function getBudgetLakhs() { return parseFloat(document.getElementById('totalBudget')?.value) || 40; }

function renderBudget() {
  const total = LS.get('totalBudget', 40);
  const inp = document.getElementById('totalBudget');
  if (inp) inp.value = total;

  const grid = document.getElementById('budgetCards');
  if (!grid) return;
  grid.innerHTML = '';
  budgetCats.forEach((cat, i) => {
    const el = document.createElement('div');
    el.className = 'budget-card reveal';
    el.style.animationDelay = `${i * 0.04}s`;
    el.innerHTML = `
      <span class="bc-emoji">${cat.emoji}</span>
      <div class="bc-name">${cat.name}</div>
      <div class="bc-amount" id="bc-amt-${i}"></div>
      <div class="bc-slider-row">
        <input type="range" class="bc-slider" id="bc-sl-${i}"
          min="${cat.min}" max="${cat.max}" value="${cat.pct}"
          oninput="onSlider(${i}, this.value)" />
        <span class="bc-pct" id="bc-slval-${i}">${cat.pct}%</span>
      </div>
      <div class="bc-bar"><div class="bc-bar-fill" id="bc-bar-${i}" style="width:${cat.pct*3.2}%"></div></div>
    `;
    grid.appendChild(el);
  });
  renderBudgetAmounts(total);
  updateBudgetStats(total);
  setTimeout(drawDonut, 100);
}

function renderBudgetAmounts(lakhs) {
  const rs = lakhs * 100000;
  budgetCats.forEach((c, i) => {
    const amt = rs * c.pct / 100;
    const fmt = amt >= 100000 ? `₹${(amt/100000).toFixed(1)}L` : `₹${Math.round(amt/1000)}K`;
    const el = document.getElementById(`bc-amt-${i}`);
    if (el) el.textContent = fmt;
    const pctEl = document.getElementById(`bc-pct-${i}`);
    if (pctEl) pctEl.textContent = c.pct + '%';
  });
  const centreEl = document.getElementById('bvCentreAmt');
  if (centreEl) centreEl.textContent = `₹${lakhs}L`;
}

function updateBudgetStats(lakhs) {
  const total = lakhs;
  const allocPct = budgetCats.reduce((s,c) => s + c.pct, 0);
  const alloc = (total * allocPct / 100).toFixed(1);
  const buf = Math.max(0, total - alloc).toFixed(1);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('bcTotal',     `₹${total}L`);
  set('bcAllocated', `₹${alloc}L`);
  set('bcBuffer',    `₹${buf}L`);
}

function drawDonut() {
  const canvas = document.getElementById('budgetChart');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2, cy = size / 2, R = size * 0.44, r = size * 0.28;
  ctx.clearRect(0, 0, size, size);
  const total = budgetCats.reduce((s, c) => s + c.pct, 0);
  let start = -Math.PI / 2;
  budgetCats.forEach((cat, i) => {
    const sweep = (cat.pct / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, start, start + sweep);
    ctx.closePath();
    ctx.fillStyle = CAT_COLOURS[i] || '#ccc';
    ctx.fill();
    start += sweep;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff';
  ctx.fill();

  // Legend
  const legend = document.getElementById('bvLegend');
  if (legend) {
    legend.innerHTML = budgetCats.map((c, i) => `
      <div class="bv-leg-item">
        <div class="bv-leg-dot" style="background:${CAT_COLOURS[i]}"></div>
        <span class="bv-leg-name">${c.emoji} ${c.name}</span>
        <span class="bv-leg-pct">${c.pct}%</span>
      </div>
    `).join('');
  }
}

/* ════════════════════════════════
   GUEST LIST
════════════════════════════════ */
let guests = [];
let editingId = null;
let sortKey = 'name';
let sortAsc = true;

const CAT_LABELS = { immediate:'Immediate Family', close:'Close Friends & Cousins', extended:'Extended Family', colleagues:'Colleagues', courtesy:'Courtesy Invite' };
const SIDE_LABELS = { bride:"Bride's Side", groom:"Groom's Side", both:'Both' };
const RSVP_LABELS = { confirmed:'Confirmed ✅', pending:'Pending 🕐', declined:'Declined ❌' };
const DROP_OFF = { immediate:0.03, close:0.12, extended:0.25, colleagues:0.42, courtesy:0.60 };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getCheckedEvents(prefix = 'gEvents') {
  const wrap = document.getElementById(prefix);
  if (!wrap) return ['day1','day2','day3'];
  return Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
}

function setCheckedEvents(prefix, vals) {
  const wrap = document.getElementById(prefix);
  if (!wrap) return;
  wrap.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = (vals||[]).includes(c.value));
}

window.submitGuest = function() {
  const name = document.getElementById('gName')?.value.trim();
  if (!name) { toast('⚠️ Please enter a name'); return; }
  const data = {
    id: editingId || uid(),
    name,
    phone:    document.getElementById('gPhone')?.value.trim() || '',
    category: document.getElementById('gCategory')?.value || 'close',
    side:     document.getElementById('gSide')?.value || 'bride',
    rsvp:     document.getElementById('gRsvp')?.value || 'pending',
    note:     document.getElementById('gNote')?.value.trim() || '',
    events:   getCheckedEvents('gEvents'),
  };
  if (editingId) {
    const idx = guests.findIndex(g => g.id === editingId);
    if (idx !== -1) guests[idx] = data;
    toast(`✅ ${data.name} updated`);
    cancelGuestEdit();
  } else {
    guests.push(data);
    toast(`✅ ${data.name} added`);
    clearGuestForm();
  }
  cloudSaveGuest(data);
  renderGuests(); updateGuestStats(); updateTurnout();
};

window.cancelGuestEdit = function() {
  editingId = null;
  clearGuestForm();
  document.getElementById('addGuestBtn').textContent = '➕ Add Guest';
  document.getElementById('cancelEditBtn').style.display = 'none';
};

function clearGuestForm() {
  ['gName','gPhone','gNote'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  const cat = document.getElementById('gCategory'); if(cat) cat.value = 'close';
  const side = document.getElementById('gSide'); if(side) side.value = 'bride';
  const rsvp = document.getElementById('gRsvp'); if(rsvp) rsvp.value = 'pending';
  setCheckedEvents('gEvents', ['day1','day2','day3']);
}

window.editGuest = function(id) {
  const g = guests.find(g => g.id === id);
  if (!g) return;
  document.getElementById('mName').value  = g.name;
  document.getElementById('mPhone').value = g.phone || '';
  document.getElementById('mCategory').value = g.category;
  document.getElementById('mSide').value  = g.side;
  document.getElementById('mRsvp').value  = g.rsvp;
  document.getElementById('mNote').value  = g.note || '';
  setCheckedEvents('mEvents', g.events || ['day1','day2','day3']);
  editingId = id;
  openModal();
};

window.saveModalGuest = function() {
  const name = document.getElementById('mName').value.trim();
  if (!name) { toast('⚠️ Name required'); return; }
  const idx = guests.findIndex(g => g.id === editingId);
  if (idx === -1) return;
  guests[idx] = { ...guests[idx], name,
    phone: document.getElementById('mPhone').value.trim(),
    category: document.getElementById('mCategory').value,
    side:     document.getElementById('mSide').value,
    rsvp:     document.getElementById('mRsvp').value,
    note:     document.getElementById('mNote').value.trim(),
    events:   getCheckedEvents('mEvents'),
  };
  cloudSaveGuest(guests[idx]);
  closeModal();
  renderGuests(); updateGuestStats(); updateTurnout();
  toast(`✅ ${name} updated`);
};

window.deleteGuest = function(id) {
  const g = guests.find(g => g.id === id);
  if (!g || !confirm(`Remove "${g.name}"?`)) return;
  guests = guests.filter(g => g.id !== id);
  cloudDeleteGuest(id);
  renderGuests(); updateGuestStats(); updateTurnout();
  toast('🗑️ Removed');
};

window.cycleRsvp = function(id) {
  const g = guests.find(g => g.id === id);
  if (!g) return;
  const cyc = { pending:'confirmed', confirmed:'declined', declined:'pending' };
  g.rsvp = cyc[g.rsvp] || 'pending';
  cloudSaveGuest(g);
  renderGuests(); updateGuestStats(); updateTurnout();
  toast(`RSVP → ${RSVP_LABELS[g.rsvp]}`);
};

window.sortBy = function(key) {
  if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
  renderGuests();
};

window.clearFilters = function() {
  ['gSearch','fCat','fRsvp','fSide'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  renderGuests();
};

window.clearAllGuests = function() {
  if (!guests.length) return;
  if (!confirm(`Clear all ${guests.length} guests? This cannot be undone.`)) return;
  guests = [];
  cloudSaveAllGuests();
  renderGuests(); updateGuestStats(); updateTurnout();
  toast('🗑️ All guests cleared');
};

window.exportCSV = function() {
  if (!guests.length) { toast('⚠️ No guests to export'); return; }
  const hdr = ['Name','Phone','Category','Side','RSVP','Events','Notes'];
  const rows = guests.map(g => [
    g.name, g.phone||'', CAT_LABELS[g.category]||g.category,
    SIDE_LABELS[g.side]||g.side, g.rsvp,
    (g.events||[]).join(' | '), g.note||'',
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = [hdr.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:'wedding_guests.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  toast('📥 Guest list exported!');
};

window.toggleAddForm = function() {
  const body = document.getElementById('addFormBody');
  const btn  = document.getElementById('formToggleBtn');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '▲ Hide' : '▼ Show';
};

function getFilteredGuests() {
  const q    = (document.getElementById('gSearch')?.value||'').toLowerCase();
  const fCat = document.getElementById('fCat')?.value||'';
  const fRsvp= document.getElementById('fRsvp')?.value||'';
  const fSide= document.getElementById('fSide')?.value||'';
  return [...guests]
    .filter(g => {
      if (q && !g.name.toLowerCase().includes(q) && !(g.phone||'').includes(q) && !(g.note||'').toLowerCase().includes(q)) return false;
      if (fCat  && g.category !== fCat)  return false;
      if (fRsvp && g.rsvp     !== fRsvp) return false;
      if (fSide && g.side     !== fSide) return false;
      return true;
    })
    .sort((a, b) => {
      const av = (a[sortKey]||'').toString().toLowerCase();
      const bv = (b[sortKey]||'').toString().toLowerCase();
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
}

window.renderGuests = function() {
  const tbody = document.getElementById('guestBody');
  const empty = document.getElementById('tableEmpty');
  if (!tbody) return;
  const list = getFilteredGuests();
  tbody.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  list.forEach(g => {
    const tr = document.createElement('tr');
    const dots = ['day1','day2','day3'].map(d =>
      `<div class="edot ${d}" title="${d}" style="opacity:${(g.events||[]).includes(d)?1:0.18}"></div>`).join('');
    tr.innerHTML = `
      <td>${esc(g.name)}</td>
      <td class="hide-xs">${g.phone||'<span style="color:var(--text-l)">—</span>'}</td>
      <td class="hide-sm" style="font-size:0.78rem">${CAT_LABELS[g.category]||g.category}</td>
      <td class="hide-md" style="font-size:0.78rem">${SIDE_LABELS[g.side]||g.side}</td>
      <td><span class="rsvp-pill ${g.rsvp}" onclick="cycleRsvp('${g.id}')" title="Click to cycle">${RSVP_LABELS[g.rsvp]}</span></td>
      <td class="hide-sm"><div class="events-dots">${dots}</div></td>
      <td class="hide-md" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem" title="${esc(g.note||'')}">
        ${g.note||'<span style="color:var(--text-l)">—</span>'}
      </td>
      <td><div class="tbl-actions">
        <button class="btn-tbl btn-tbl-edit" onclick="editGuest('${g.id}')">✏️</button>
        <button class="btn-tbl btn-tbl-del"  onclick="deleteGuest('${g.id}')">🗑️</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });
};

function updateGuestStats() {
  const total = guests.length;
  const confirmed = guests.filter(g => g.rsvp === 'confirmed').length;
  const pending   = guests.filter(g => g.rsvp === 'pending').length;
  const declined  = guests.filter(g => g.rsvp === 'declined').length;
  const catering  = Math.round(confirmed * 1.15);
  animNum('stTotal', total); animNum('stConfirmed', confirmed);
  animNum('stPending', pending); animNum('stDeclined', declined);
  animNum('stCatering', catering);
}

function updateTurnout() {
  const byCat = {};
  guests.forEach(g => { byCat[g.category] = (byCat[g.category]||0) + 1; });
  const rows = Object.entries(CAT_LABELS).map(([k,l]) => ({ k, l, count:byCat[k]||0, est:Math.round((byCat[k]||0)*(1-DROP_OFF[k])) })).filter(r => r.count > 0);
  const wrap = document.getElementById('turnoutRows');
  if (wrap) {
    wrap.innerHTML = rows.length ? rows.map(r =>
      `<div class="turnout-row"><span class="tc-label">${r.l}</span><span class="tc-val">${r.count} invited → ~${r.est} attending</span></div>`
    ).join('') : '<p style="color:var(--text-l);font-size:0.85rem">Add guests above to see projections.</p>';
  }
  const total = guests.length;
  const est   = rows.reduce((s,r) => s+r.est, 0);
  animNum('trTotal', total); animNum('trEst', est); animNum('trCatering', Math.round(est*1.15));
}

/* ════════════════════════════════
   VENUE CHECKLIST
════════════════════════════════ */
const VENUE_QS = [
  { t:'Electricity & Generator Backup', b:'"Is electricity charged per unit? Is DG backup included or billed per hour?"' },
  { t:'Catering Royalty / Outside Caterer', b:'"If we bring our own caterer, is there a royalty per plate? Any restrictions on live counters or cooking on premises?"' },
  { t:'Event Timing & Overtime Penalties', b:'"What are the official event start/end times? What is the per-hour overtime charge? Any local noise curfews?"' },
  { t:'Parking Capacity & Valet', b:'"How many cars can be parked? Is valet included? Is there overflow parking nearby?"' },
  { t:'Exclusive Use vs. Shared Venue', b:'"Are there simultaneous events in adjacent halls? Could there be noise bleed or shared entrances?"' },
  { t:'Vendor Setup & Breakdown Access', b:'"When can decorators and caterers enter for setup? When must breakdown be completed? Are overnight storage rooms available?"' },
  { t:'Security Deposit & Cancellation Policy', b:'"What is the deposit amount? What are the deduction conditions? What is the cancellation refund timeline and penalty?"' },
];

let venueCount = 0;
function buildVenueChecklist() {
  const saved = LS.get('venueChecked', {});
  venueCount = Object.values(saved).filter(Boolean).length;
  const el = document.getElementById('venueChecklist');
  if (!el) return;
  el.innerHTML = '';
  VENUE_QS.forEach((q, i) => {
    const checked = saved[i]||false;
    const lbl = document.createElement('label');
    lbl.className = 'vc-item' + (checked?' done':'');
    lbl.innerHTML = `
      <input type="checkbox" ${checked?'checked':''} onchange="toggleVq(${i},this)" />
      <div class="vc-body"><strong>${q.t}</strong><p>${q.b}</p></div>
    `;
    el.appendChild(lbl);
  });
  updateVenueProgress();
}

window.toggleVq = function(i, cb) {
  const saved = LS.get('venueChecked', {});
  saved[i] = cb.checked;
  cloudSet('venueChecked', saved);
  cb.closest('.vc-item').classList.toggle('done', cb.checked);
  venueCount = Object.values(saved).filter(Boolean).length;
  updateVenueProgress();
};

function updateVenueProgress() {
  const pct = (venueCount / VENUE_QS.length) * 100;
  const fill = document.getElementById('cpFill');
  const text = document.getElementById('cpText');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${venueCount} / ${VENUE_QS.length} answered`;
}

/* ════════════════════════════════
   ITINERARY
════════════════════════════════ */
const DEFAULT_ITINERARY = {
  day1: {
    events: [
      { time:'9:00 AM',  accent:false, title:'Venue Setup', body:'Decorators and caterers access the venue. Flowers, lighting, and table arrangements finalised.', tags:[] },
      { time:'11:00 AM', accent:true,  title:'🌿 Henna Night / Pre-Wedding Celebration', body:'Henna artists set up. Comfortable seating arranged. Background music — acoustic or curated playlist.', tags:['4–6 Artists','3–5 Hrs'] },
      { time:'1:00 PM',  accent:false, title:'Lunch', body:'Light buffet — wraps, chaats, fresh juices. Keep it relaxed.', tags:[] },
      { time:'7:00 PM',  accent:true,  title:'Pre-Wedding Dinner', body:'Semi-formal dinner for family and close friends. Live food stations recommended.', tags:['Live Counters','Semi-Formal'] },
      { time:'9:30 PM',  accent:false, title:'Wrap & Bridal Rest', body:'Bride to bridal suite. Green room prepped with essentials.', tags:[] },
    ],
    essentials: [
      'Bridal suite ready: full-length mirror, good lighting, AC, private bathroom',
      'Dedicated bridal attendant on duty all day',
      'Henna artist rest area with water and refreshments',
      'Roving photographer active from arrival',
    ],
  },
  day2: {
    events: [
      { time:'3:00 PM',  accent:false, title:'Stage & Sound Setup', body:'DJ, anchor, and lighting rig setup. Minimum 2–3 hours required before guests arrive.', tags:['2–3 Hr Setup'] },
      { time:'5:30 PM',  accent:true,  title:'⚡ Sound Check — Hard Deadline', body:'All microphones, DJ monitors, and lights must be tested before any guest arrives.', tags:['Non-Negotiable'] },
      { time:'6:30 PM',  accent:false, title:'Guests Arrive', body:'Welcome drinks station: mocktails and starters. Roving photographer active.', tags:[] },
      { time:'7:00 PM',  accent:true,  title:'🎭 Evening Celebration Begins', body:'Family and friends performances, music, dancing. Anchor on stage.', tags:['Anchor on Mic','Performer Backstage'] },
      { time:'9:00 PM',  accent:false, title:'Dinner Service Opens', body:'Full buffet and live food counters. Food coordinator checks every 20 minutes.', tags:[] },
      { time:'11:00 PM', accent:false, title:'Event Close', body:'Phased wrap-up. Transport coordinator starts callouts 45 minutes before close.', tags:[] },
    ],
    essentials: [
      'Sound check done by 5:30 PM — enforce this strictly with the DJ',
      'Backstage/changing area for performers',
      'Lighting designer on-site — not just setup crew',
      'Food coordinator with walkie-talkie',
    ],
  },
  day3: {
    events: [
      { time:'7:00 AM',  accent:false, title:'Bridal Preparation Begins', body:'Makeup artist, hairstylist, and photographer in bridal suite. Keep this space calm.', tags:[] },
      { time:'9:00 AM',  accent:false, title:'Officiant / Clergy Arrives', body:'Confirm requirements list 48 hrs in advance. Ceremony area must be ready before arrival.', tags:['Requirements Verified'] },
      { time:'10:00 AM', accent:true,  title:'🤍 Groom\'s Arrival / Procession', body:'Groom arrives with family. Coordinated entrance. Music cue planned.', tags:['Music Cue','Photographer Positions'] },
      { time:'10:30 AM', accent:true,  title:'💍 Wedding Ceremony (Nikah / Nuptials)', body:'Officiant leads the ceremony. Estimated 45–90 minutes. Seating for core family.', tags:['45–90 Mins','Family Seating'] },
      { time:'12:30 PM', accent:true,  title:'🕊️ Bride\'s Send-Off / Rukhsati', body:'An emotional milestone. Dedicated videographer. Bridal car: decorated, fuelled, driver briefed.', tags:['Emotional Moment','Dedicated Videographer'] },
      { time:'2:00 PM',  accent:false, title:'Post-Ceremony Lunch', body:'Full buffet for remaining guests. Caterer confirms replenishment.', tags:[] },
      { time:'7:00 PM',  accent:true,  title:'🌟 Reception / Walima Doors Open', body:'Grand entrance for the couple. Welcome arch, high table, open floor.', tags:['Grand Entry','Couple Table'] },
      { time:'10:30 PM', accent:false, title:'Final Wrap', body:'Gift and cash custodian final handover. Transport callouts. Vendor clearances.', tags:[] },
    ],
    essentials: [
      'Emergency kit: safety pins, stitch kit, dupatta pins — with bridal coordinator',
      "Officiant's requirement list verified 48 hrs in advance",
      'Dedicated bridal car: decorated, full fuel, driver briefed and waiting',
      'Water and light refreshments for seated ceremony guests',
      'Reception couple high table positioned for easy guest photos',
    ],
  },
};

let itinerary = {};

function loadItinerary() {
  itinerary = LS.get('itinerary', JSON.parse(JSON.stringify(DEFAULT_ITINERARY)));
}

function saveItinerary() { cloudSet('itinerary', itinerary); }

function renderItinerary() {
  ['day1','day2','day3'].forEach(day => {
    const tl  = document.getElementById('tl-' + day);
    const ess = document.getElementById('ess-' + day);
    if (!tl || !ess) return;
    tl.innerHTML = '';
    (itinerary[day]?.events||[]).forEach((ev, i) => {
      const row = document.createElement('div');
      row.className = 'tl-row';
      const tagsHtml = (ev.tags||[]).length ?
        `<div class="tl-tags">${ev.tags.map(t => `<span class="tl-tag${t.toLowerCase().includes('non-neg')||t.toLowerCase().includes('emotional')?' urgent':''}">${esc(t)}</span>`).join('')}</div>` : '';
      row.innerHTML = `
        <div class="tl-time editable-text" contenteditable="true" onblur="saveTl('${day}',${i},'time',this)">${esc(ev.time)}</div>
        <div class="tl-dot${ev.accent?' accent':''}"></div>
        <div class="tl-card">
          <strong class="editable-text" contenteditable="true" onblur="saveTl('${day}',${i},'title',this)">${esc(ev.title)}</strong>
          <p class="editable-text" contenteditable="true" onblur="saveTl('${day}',${i},'body',this)">${esc(ev.body)}</p>
          ${tagsHtml}
        </div>
        <div class="tl-del-wrap"><button class="btn-del-tl" onclick="delTl('${day}',${i})" title="Remove">✕</button></div>
      `;
      tl.appendChild(row);
    });

    const essArr = itinerary[day]?.essentials || [];
    ess.innerHTML = `<h4>⚡ Essential Arrangements</h4>
      <ul>${essArr.map((e,i) => `
        <li>
          <span class="editable-text" contenteditable="true" onblur="saveEss('${day}',${i},this)">${esc(e)}</span>
          <button onclick="delEss('${day}',${i})" style="background:none;border:none;color:var(--rose);cursor:pointer;font-size:0.82rem;margin-left:6px;opacity:0.4" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4">✕</button>
        </li>`).join('')}
      </ul>
      <button class="btn-add-ess" onclick="addEss('${day}')">+ Add item</button>`;
  });
}

window.saveTl = function(day, i, field, el) {
  itinerary[day].events[i][field] = el.textContent.trim();
  saveItinerary(); toast('✅ Saved');
};
window.delTl = function(day, i) {
  itinerary[day].events.splice(i, 1); saveItinerary(); renderItinerary(); toast('Removed');
};
window.addEvent = function(day) {
  itinerary[day].events.push({ time:'12:00 PM', accent:false, title:'New Event — click to edit', body:'Describe what happens…', tags:[] });
  saveItinerary(); renderItinerary(); toast('➕ Event added');
};
window.saveEss = function(day, i, el) { itinerary[day].essentials[i] = el.textContent.trim(); saveItinerary(); toast('✅ Saved'); };
window.delEss  = function(day, i)     { itinerary[day].essentials.splice(i,1); saveItinerary(); renderItinerary(); };
window.addEss  = function(day)        { itinerary[day].essentials.push('New item — click to edit'); saveItinerary(); renderItinerary(); };

window.switchDay = function(day, btn) {
  document.querySelectorAll('.day-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + day).classList.add('active');
  btn.classList.add('active');
};

/* ════════════════════════════════
   VENDORS
════════════════════════════════ */
const DEFAULT_VENDORS = [
  { emoji:'🍽️', name:'Caterer', clauses:[
    { t:'Plate Count Validation', b:'Specify minimum guaranteed plates, price per extra plate, and who does the physical count. Insist on a tasting session 4–6 weeks before the wedding.' },
    { t:'Live Counter Commitment', b:'List every live station in the contract with dedicated staff per counter. "As discussed" is not acceptable — attach the list.' },
    { t:'Leftovers & Wastage Policy', b:'Clarify who owns surplus food. Negotiate packaging for family or an NGO. Confirm post-event cleanup timing and responsibility.' },
  ], notes:'' },
  { emoji:'📸', name:'Photographer / Videographer', clauses:[
    { t:'Delivery Timelines in Writing', b:'Full gallery: 4–6 weeks. Highlight reel: 72 hours. Full film: 8–12 weeks. These must be in the contract — not verbally agreed.' },
    { t:'Raw Footage Ownership', b:'"All raw footage and unedited files are the property of the client upon full payment." Insist on this clause in writing.' },
    { t:'Backup Equipment & Second Shooter', b:'Backup camera body on site. Second shooter present for the main ceremony and reception. Nightly cloud backup of footage during the wedding days.' },
  ], notes:'' },
  { emoji:'🌸', name:'Decorator', clauses:[
    { t:'Visual Reference Sign-Off', b:'Every element must be agreed via a reference image or mood board and signed off. Attach photos to the contract as exhibits.' },
    { t:'Weather / Outdoor Contingency', b:'"If outdoor elements are unusable due to weather, [specific indoor alternative] will be executed at no additional cost within [X] hours."' },
    { t:'Breakdown Deadline & Delay Penalty', b:'Specify the exact time by which all décor must be removed. Include a per-hour penalty if venue charges you for decorator delays.' },
  ], notes:'' },
];

let vendors = [];
function loadVendors() { vendors = LS.get('vendors', JSON.parse(JSON.stringify(DEFAULT_VENDORS))); }
function saveVendors() { cloudSet('vendors', vendors); }

function renderVendors() {
  const grid = document.getElementById('vendorGrid');
  if (!grid) return;
  grid.innerHTML = '';
  vendors.forEach((v, vi) => {
    const el = document.createElement('div');
    el.className = 'vendor-card card reveal';
    el.innerHTML = `
      <span class="vendor-emoji">${v.emoji}</span>
      <h3 class="editable-text" contenteditable="true" onblur="saveVendorName(${vi},this)">${esc(v.name)}</h3>
      ${v.clauses.map((c,ci) => `
        <div class="vc-clause">
          <div class="vc-clause-num">Clause ${ci+1}</div>
          <strong class="editable-text" contenteditable="true" onblur="saveVClause(${vi},${ci},'t',this)">${esc(c.t)}</strong>
          <p class="editable-text" contenteditable="true" onblur="saveVClause(${vi},${ci},'b',this)">${esc(c.b)}</p>
        </div>`).join('')}
      <div class="vendor-notes-wrap">
        <label>📝 Your Notes / Vendor Contact</label>
        <textarea placeholder="e.g. Vendor: Al-Noor Catering | Phone: 98765 43210 | Quote: ₹950/plate…" onblur="saveVNotes(${vi},this)">${esc(v.notes||'')}</textarea>
      </div>
    `;
    grid.appendChild(el);
  });
}

window.saveVendorName = function(vi,el) { vendors[vi].name=el.textContent.trim(); saveVendors(); toast('✅ Saved'); };
window.saveVClause = function(vi,ci,f,el) { vendors[vi].clauses[ci][f]=el.textContent.trim(); saveVendors(); toast('✅ Saved'); };
window.saveVNotes  = function(vi,el)      { vendors[vi].notes=el.value; saveVendors(); toast('✅ Notes saved'); };

/* ════════════════════════════════
   DELEGATION
════════════════════════════════ */
const DEFAULT_DELEGATION = [
  { emoji:'🍽️', title:'Food & Catering Monitor',     suggest:'Best: Trusted Uncle or Detail-Oriented Cousin', assigned:'', authority:'🔑 Can escalate directly to you', tasks:['Monitor all food stations every 20 minutes','Confirm replenishment timing with caterer head','Taste-check key dishes before buffet opens','Report any quality gaps immediately','Communicate directly with caterer — not through you'] },
  { emoji:'💰', title:'Gift & Cash Custodian',         suggest:'Best: One Aunt + One Close Cousin (PAIR)',      assigned:'', authority:'🔑 Dual custody — zero solo handling', tasks:['Receive all envelopes and gifts at entry','Log names + amounts in real-time on a shared sheet','Lock cash in a designated bag — aunt holds it','Never handle alone — two people always','Final sealed handover at event close'] },
  { emoji:'🚗', title:'Transport & Guest Logistics',   suggest:'Best: Energetic, Smartphone-Savvy Cousin',      assigned:'', authority:'🔑 Has all driver contacts', tasks:['Manage all pickup/drop calls with drivers','Coordinate parking and overflow','Handle late arrivals and emergency pickups','Transport callouts 45 mins before close'] },
  { emoji:'🤍', title:'Ceremony In-Charge',             suggest:'Best: Responsible Family Elder',               assigned:'', authority:'🔑 Direct liaison with officiant', tasks:['Confirm officiant arrival time the evening before','Verify all ceremony requirements 48 hrs in advance','Ensure ceremony area is ready before officiant arrives','Coordinate ceremony timing with photographer'] },
  { emoji:'👰', title:'Bridal Coordinator',             suggest:"Best: Bride's Best Friend / Maid of Honour",   assigned:'', authority:"🔑 Bride's needs come FIRST, always", tasks:['Stay with bride at ALL times','Manage MUA timing and outfit changes','Ensure bride eats, drinks water, stays calm','Carry emergency kit: pins, stitch kit, touch-up items','Zero other responsibilities on this day'] },
  { emoji:'🎯', title:'Vendor Point-of-Contact',        suggest:'Best: You (or a Designated Sibling)',           assigned:'', authority:'🔑 Final authority on all vendor matters', tasks:['Single point of contact for ALL vendors','Pre-brief all vendors 24 hrs before each event','No conflicting instructions from multiple people','Resolve any vendor issue within 10 minutes'] },
];

let delegation = [];
function loadDelegation() { delegation = LS.get('delegation', JSON.parse(JSON.stringify(DEFAULT_DELEGATION))); }
function saveDelegation() { cloudSet('delegation', delegation); }

function renderDelegation() {
  const grid = document.getElementById('delegationGrid');
  if (!grid) return;
  grid.innerHTML = '';
  delegation.forEach((r, ri) => {
    const el = document.createElement('div');
    el.className = 'del-card card';
    el.id = `delcard-${ri}`;
    el.innerHTML = `
      <div class="del-hd" onclick="toggleDel(${ri})">
        <span class="del-emoji">${r.emoji}</span>
        <div class="del-hd-text">
          <h4 class="editable-text" contenteditable="true" onclick="event.stopPropagation()" onblur="saveDelField(${ri},'title',this)">${esc(r.title)}</h4>
          <span class="del-suggest">${esc(r.suggest)}</span>
        </div>
        <span class="del-expand">+</span>
      </div>
      <div class="del-body">
        <div class="del-body-inner">
          <div class="del-assign-wrap">
            <label>Assigned To</label>
            <input class="del-assign-input" type="text" placeholder="Enter person's name…" value="${esc(r.assigned||'')}" onchange="saveDelAssigned(${ri},this)" />
          </div>
          <ul class="del-tasks">${r.tasks.map((t,ti) => `
            <li><span class="editable-text" contenteditable="true" onblur="saveDelTask(${ri},${ti},this)">${esc(t)}</span></li>
          `).join('')}</ul>
          <div class="del-authority editable-text" contenteditable="true" onblur="saveDelField(${ri},'authority',this)">${esc(r.authority)}</div>
          <button class="btn-add-del-task" onclick="addDelTask(${ri})">+ Add responsibility</button>
        </div>
      </div>
    `;
    grid.appendChild(el);
  });
}

window.toggleDel = function(ri) { document.getElementById(`delcard-${ri}`)?.classList.toggle('open'); };
window.saveDelField    = function(ri,f,el) { delegation[ri][f]=el.textContent.trim(); saveDelegation(); toast('✅ Saved'); };
window.saveDelAssigned = function(ri,el)   { delegation[ri].assigned=el.value.trim(); saveDelegation(); toast('✅ Saved'); };
window.saveDelTask     = function(ri,ti,el){ delegation[ri].tasks[ti]=el.textContent.trim(); saveDelegation(); toast('✅ Saved'); };
window.addDelTask = function(ri) {
  delegation[ri].tasks.push('New responsibility — click to edit');
  saveDelegation(); renderDelegation();
  const card = document.getElementById(`delcard-${ri}`);
  if (card && !card.classList.contains('open')) card.classList.add('open');
};

/* ════════════════════════════════
   COUNTDOWN MONTHS
════════════════════════════════ */
const MONTHS = [
  { label:'🔴 6 Months Out — June 2026', urg:'u-critical', urgLbl:'🚨 ACT NOW', tasks:['Lock the venue — top priority this week','Shortlist photographers (check their Dec availability now)','Set total budget ceiling — get full family alignment','Finalise 2-day vs. 3-day event format','Get a rough headcount (±50 accuracy)'] },
  { label:'🟠 5 Months Out — July 2026', urg:'u-high', urgLbl:'⚡ URGENT', tasks:['Sign venue contract and pay advance deposit','Book photographer and videographer','Shortlist and meet 3 caterers for initial tastings','Begin bridal outfit shopping (alterations take 8–12 weeks)','Book makeup artist & hair stylist — December books fast'] },
  { label:'🟡 4 Months Out — August 2026', urg:'u-high', urgLbl:'⚡ HIGH', tasks:['Finalise and sign caterer contract with all SLA clauses','Book decorator — sign off on mood board references','Book DJ / live music / entertainment','Confirm officiant and ceremony date/time','Start invitation design (digital and physical)'] },
  { label:'🟡 3 Months Out — September 2026', urg:'u-medium', urgLbl:'📋 PLAN', tasks:['Send Save-the-Date to full guest list','Confirm accommodation for outstation guests (block-book hotels)','Book all transport — bridal cars, guest coaches','Finalise bridal jewellery and accessories','Begin trousseau / wedding shopping'] },
  { label:'🟢 2 Months Out — October 2026', urg:'u-medium', urgLbl:'📋 EXECUTE', tasks:['Send physical invitations to elders and VIPs','Send digital invites to full list','Build and share RSVP tracking spreadsheet','Confirm venue logistics in writing (electricity, catering royalty, timings)','Conduct a check-in call with every booked vendor','Order return gifts / favours'] },
  { label:'🟢 1 Month Out — November 2026', urg:'u-low', urgLbl:'✅ FINALISE', tasks:['Caterer tasting session — lock the final menu','Confirm final headcount with venue and caterer','Collect all vendor final payment schedules','Bridal outfit final fitting','Build the delegation chart and brief your team','Print ceremony requirements list for officiant'] },
  { label:'💛 Wedding Week — December 2026', urg:'u-critical', urgLbl:'🎊 GAME DAY', tasks:['Day −3: Confirm all vendor arrival times by call or message','Day −2: Decorator walk-through at venue; check bridal suite','Day −2: Full team briefing — WhatsApp group pinned','Day −1: Emergency kit packed (pins, kit, spare dupatta)','Day −1: All transport confirmed and fuelled','Morning of wedding: 7:00 AM team roll call','YOU: Let go. Trust your team. Be present for your family. 💛'] },
];

function buildMonths() {
  const container = document.getElementById('monthTimeline');
  if (!container) return;
  container.innerHTML = '';
  const savedTasks = LS.get('ctTasks', {});
  const customTasks = LS.get('ctCustom', {});

  MONTHS.forEach((m, mi) => {
    const all = [...m.tasks, ...(customTasks[mi]||[])];
    const el = document.createElement('div');
    el.className = 'month-card reveal';
    const open = mi === 0;
    const tasksHtml = all.map((t, ti) => {
      const key = `${mi}-${ti}`;
      const done = savedTasks[key]||false;
      return `<label class="ct-item${done?' done':''}">
        <input type="checkbox" ${done?'checked':''} onchange="saveCtTask('${key}',this)" />
        <span>${esc(t)}</span>
      </label>`;
    }).join('');
    el.innerHTML = `
      <div class="month-hd" onclick="toggleMonth(this)">
        <span class="month-label">${m.label}</span>
        <span class="urgency-badge ${m.urg}">${m.urgLbl}</span>
      </div>
      <div class="month-body" style="display:${open?'grid':'none'}">
        ${tasksHtml}
        <div class="ct-add-row">
          <input type="text" placeholder="Add your own task…" id="ctinput-${mi}" onkeydown="if(event.key==='Enter')addCtTask(${mi})" />
          <button class="btn-ct-add" onclick="addCtTask(${mi})">+ Add</button>
        </div>
      </div>
    `;
    container.appendChild(el);
  });
}

window.toggleMonth = function(hd) {
  const body = hd.nextElementSibling;
  body.style.display = body.style.display === 'none' ? 'grid' : 'none';
};
window.saveCtTask = function(key, cb) {
  const saved = LS.get('ctTasks', {});
  saved[key] = cb.checked;
  cloudSet('ctTasks', saved);
  cb.closest('.ct-item').classList.toggle('done', cb.checked);
};
window.addCtTask = function(mi) {
  const inp = document.getElementById(`ctinput-${mi}`);
  const text = inp?.value.trim();
  if (!text) return;
  const custom = LS.get('ctCustom', {});
  if (!custom[mi]) custom[mi] = [];
  custom[mi].push(text);
  cloudSet('ctCustom', custom);
  if (inp) inp.value = '';
  buildMonths();
  toast('✅ Task added');
};

/* ════════════════════════════════
   MODAL
════════════════════════════════ */
function openModal() {
  document.getElementById('editModal').classList.add('open');
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('mName')?.focus();
}
function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  document.getElementById('modalBackdrop').classList.remove('open');
  editingId = null;
}
window.openModal = openModal;
window.closeModal = closeModal;

/* ════════════════════════════════
   SCROLL REVEAL
════════════════════════════════ */
function initReveal() {
  const obs = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
  }), { threshold:0.06 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ════════════════════════════════
   NAV SCROLL
════════════════════════════════ */
function initNavScroll() {
  let last = 0;
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('topNav');
    if (!nav) return;
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 40);
    last = y;
  }, { passive:true });
}

/* ════════════════════════════════
   ANIMATION HELPER
════════════════════════════════ */
function animNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent)||0;
  if (start === target) { el.textContent = target; return; }
  const dur = 500, t0 = performance.now();
  const run = now => {
    const p = Math.min((now-t0)/dur, 1);
    const e = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(start + (target-start)*e);
    if (p < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
async function init() {
  // Set cloud status initial
  setCloudStatus(FIREBASE_READY ? 'saving' : 'local');

  // Load data
  loadBudget();
  loadItinerary();
  loadVendors();
  loadDelegation();

  // Load guests from cloud
  guests = await cloudGetGuests();

  // Render everything
  renderBudget();
  renderGuests();
  updateGuestStats();
  updateTurnout();
  buildVenueChecklist();
  renderItinerary();
  renderVendors();
  renderDelegation();
  buildMonths();

  // Init UI
  initEditableTexts();
  getWeddingDate();
  updateAllCountdowns();
  initReveal();
  initNavScroll();

  // Live countdown
  setInterval(updateAllCountdowns, 1000);

  // Global clicks
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

  // Cloud status final
  if (FIREBASE_READY) {
    setCloudStatus('online');
  } else {
    setCloudStatus('local');
  }

  // Hide loading screen
  setTimeout(() => {
    const ls = document.getElementById('loadingScreen');
    if (ls) ls.classList.add('hidden');
  }, 600);

  // Re-run reveal for dynamically rendered cards
  setTimeout(initReveal, 800);
}

document.addEventListener('DOMContentLoaded', init);
