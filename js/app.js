'use strict';

// ── Firebase Config ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBq8MxJ6HU_eMthWR3U17LAmh4qiwkwDE",
  authDomain: "bussi-cae1d.firebaseapp.com",
  projectId: "bussi-cae1d",
  storageBucket: "bussi-cae1d.firebasestorage.app",
  messagingSenderId: "1036146222343",
  appId: "1:1036146222343:web:f0c1b5b1906861e14051a2",
  measurementId: "G-PFTS6MRPZN"
};

// Initialize Firebase (Compat mode for simple usage)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence().catch((err) => {
  if (err.code == 'failed-precondition') console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  else if (err.code == 'unimplemented') console.warn('The current browser does not support all of the features required to enable persistence.');
});

// ── State ────────────────────────────────────────────────────
let jobs         = [];
let expenses     = [];
let currentTab   = 'summary';
let userLoc      = null;    // { lat, lng }
let editingId    = null;
let parsedBuf    = [];
let queueParsedBuf = [];
let manFilter    = 'all';
let delTargetId  = null;
let isManualSort = false;
const AVG_SPEED_KMH = 40; // ความเร็วเฉลี่ยกม./ชม.

// ── Storage ──────────────────────────────────────────────────
const LS_LOC  = 'logis_loc';
const COLLECTION = 'jobs';
const EXP_COLLECTION = 'expenses';

function loadJobs() {
  // Use Firestore onSnapshot with metadata to track real sync status
  db.collection(COLLECTION).onSnapshot(
    { includeMetadataChanges: true },
    (snapshot) => {
      const updatedJobs = [];
      snapshot.forEach(doc => {
        updatedJobs.push({ id: doc.id, ...doc.data() });
      });
      jobs = updatedJobs;

      // Check if data is from server or local cache
      const hasPending = snapshot.metadata.hasPendingWrites;
      const fromCache = snapshot.metadata.fromCache;

      if (!fromCache && !hasPending) {
        updateSyncStatus('synced');
      } else if (hasPending) {
        updateSyncStatus('pending');
      } else if (fromCache) {
        updateSyncStatus('offline');
      }

      renderAll();
    },
    (error) => {
      console.error("Error fetching jobs: ", error);
      updateSyncStatus('error');
    }
  );

  db.collection(EXP_COLLECTION).onSnapshot((snapshot) => {
    const updated = [];
    snapshot.forEach(doc => updated.push({ id: doc.id, ...doc.data() }));
    expenses = updated;
    renderAll();
  });
}

function updateSyncStatus(state) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  const wrap = document.getElementById('syncStatus');
  if (!dot || !text) return;

  const states = {
    synced:  { bg: '#22c55e', label: 'SYNCED',  color: '#22c55e' },
    pending: { bg: '#f97316', label: 'SYNCING…', color: '#f97316' },
    offline: { bg: '#ef4444', label: 'OFFLINE',  color: '#ef4444' },
    error:   { bg: '#ef4444', label: 'ERROR',    color: '#ef4444' }
  };
  const s = states[state] || states.offline;
  dot.style.background = s.bg;
  text.textContent = s.label;
  text.style.color = s.color;
}

function genId() { return db.collection(COLLECTION).doc().id; }
function todayStr() { return new Date().toISOString().split('T')[0]; }


// ── Location Classifier ───────────────────────────────────────
function classifyLoc(raw) {
  if (!raw) return 'place';
  const t = raw.trim();
  // URL check
  if (/^https?:\/\//i.test(t) || /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.com\/maps/i.test(t))
    return 'url';
  // GPS coords: two decimal numbers separated by comma
  if (/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(t))
    return 'coords';
  return 'place';
}

const LOC_ICON = { coords:'🗺️', url:'🔗', place:'📍' };
const LOC_LABEL = { coords:'GPS พิกัด', url:'ลิ้งค์ Maps', place:'ชื่อสถานที่' };
const LOC_COLOR = { coords:'#93c5fd', url:'#86efac', place:'#fcd34d' };

function buildMapsUrl(job) {
  if (!job.locationRaw) return null;
  switch(job.locationType) {
    case 'url':    return job.locationRaw;
    case 'coords': return `https://maps.google.com/?q=${job.locationRaw.replace(/\s/g,'')}`;
    case 'place':  return `https://maps.google.com/?q=${encodeURIComponent(job.locationRaw)}`;
    default:       return `https://maps.google.com/?q=${encodeURIComponent(job.locationRaw)}`;
  }
}

// ── Distance ──────────────────────────────────────────────────
function haversine(lat1,lon1,lat2,lon2) {
  const R = 6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function parseCoords(raw) {
  if (!raw) return null;
  const m = raw.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}

function calcDist(job) {
  if (!userLoc || job.locationType !== 'coords') return null;
  const c = parseCoords(job.locationRaw);
  return c ? haversine(userLoc.lat, userLoc.lng, c.lat, c.lng) : null;
}

function refreshDistances() {
  const batch = db.batch();
  let hasChanges = false;
  jobs.forEach(j => {
    const newDist = calcDist(j);
    if (newDist !== j.distanceKm) {
      j.distanceKm = newDist;
      if (j.id) {
        batch.update(db.collection(COLLECTION).doc(j.id), { distanceKm: newDist });
        hasChanges = true;
      }
    }
  });
  if (hasChanges) {
    batch.commit().catch(err => console.warn('Distance sync error:', err));
  }
}

// ── GPS ────────────────────────────────────────────────────────
function requestLocation() {
  if (!navigator.geolocation) { toast('อุปกรณ์นี้ไม่รองรับ GPS','err'); return; }
  const btn = document.getElementById('gpsBtn');
  btn.style.borderColor = 'rgba(249,115,22,0.5)';
  toast('กำลังหาตำแหน่ง…','info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      localStorage.setItem(LS_LOC, JSON.stringify(userLoc));
      refreshDistances();
      renderAll();
      btn.style.borderColor = 'rgba(34,197,94,0.5)';
      toast('✓ อัปเดตตำแหน่งแล้ว','ok');
    },
    () => { btn.style.borderColor='rgba(255,255,255,0.08)'; toast('ไม่สามารถเข้าถึง GPS','err'); },
    { enableHighAccuracy:true, timeout:10000 }
  );
}

function getETAText(distKm) {
  if (distKm == null) return '';
  const mins = Math.ceil((distKm / AVG_SPEED_KMH) * 60);
  if (mins < 1) return 'อีกไม่กี่อึดใจ';
  if (mins < 60) return `อีก ${mins} นาที`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return `อีก ${hrs} ชม. ${m} นาที`;
}

// ── Sorted jobs ───────────────────────────────────────────────
function getSorted() {
  const pending = jobs.filter(j=>j.status==='pending' && !j.postponed).sort((a,b)=>{
    if (isManualSort) {
      return (a.priority || 0) - (b.priority || 0);
    }
    if (a.distanceKm!=null && b.distanceKm!=null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm!=null) return -1;
    if (b.distanceKm!=null) return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  const postponed = jobs.filter(j=>j.status==='pending' && j.postponed).sort((a,b)=>
    new Date(a.postponeDate||'9999') - new Date(b.postponeDate||'9999')
  );
  const done = jobs.filter(j=>j.status==='done').sort((a,b)=>
    new Date(b.completedAt||b.createdAt) - new Date(a.completedAt||a.createdAt)
  );
  return { pending, postponed, done };
}

// ── ETA Clock ─────────────────────────────────────────────────
const AVG_WORK_MINS = 30;

function calcETAClocks(pendingJobs) {
  const now = new Date();
  let cumMins = 0;
  return pendingJobs.map((j, i) => {
    if (i > 0) {
      const prev = pendingJobs[i-1];
      if (prev.distanceKm != null && j.distanceKm != null) {
        const distBetween = Math.abs(j.distanceKm - prev.distanceKm) || j.distanceKm;
        cumMins += Math.ceil((distBetween / AVG_SPEED_KMH) * 60);
      } else if (j.distanceKm != null) {
        cumMins += Math.ceil((j.distanceKm / AVG_SPEED_KMH) * 60);
      } else {
        cumMins += 15;
      }
      cumMins += AVG_WORK_MINS;
    } else {
      if (j.distanceKm != null) {
        cumMins += Math.ceil((j.distanceKm / AVG_SPEED_KMH) * 60);
      }
    }
    const eta = new Date(now.getTime() + cumMins * 60000);
    return { jobId: j.id, etaMins: cumMins, etaTime: eta };
  });
}

function formatETAClock(etaTime) {
  return `~${String(etaTime.getHours()).padStart(2,'0')}:${String(etaTime.getMinutes()).padStart(2,'0')} น.`;
}


// ── KPI ───────────────────────────────────────────────────────
function renderKPIs() {
  const { pending, done } = getSorted();
  const tod = todayStr();
  const todJobs = jobs.filter(j=>j.date===tod && !j.postponed);
  const todExpenses = expenses.filter(e=>e.date===tod);

  const jobExp = todJobs.reduce((s,j)=>s+(j.price||0),0);
  const otherExp = todExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalExpense = jobExp + otherExp;

  const totalWheels = todJobs.reduce((s,j)=>s+(j.quantity||0),0);

  if(document.getElementById('kpiPending')) document.getElementById('kpiPending').textContent = pending.length;
  if(document.getElementById('kpiDone')) document.getElementById('kpiDone').textContent    = done.length;
  
  if(document.getElementById('kpiExpense')) document.getElementById('kpiExpense').textContent = totalExpense.toLocaleString('th-TH');
  if(document.getElementById('kpiWheels')) document.getElementById('kpiWheels').textContent = totalWheels.toLocaleString('th-TH');
}

// ── Render All ────────────────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderPending();
  renderPostponed();
  renderDone();
  if (currentTab === 'manage') renderManage();
  if (currentTab === 'expense') renderExpense();
}

// ── Pending section ───────────────────────────────────────────
function renderPending() {
  const { pending } = getSorted();
  const etaList = calcETAClocks(pending);
  const el = document.getElementById('pendingSec');
  if (!pending.length) {
    el.innerHTML = `
      <div class="empty">
        <div style="font-size:44px;margin-bottom:10px;">🎉</div>
        <div style="font-size:15px;font-weight:600;color:#a8b8cc;margin-bottom:4px;">ยังไม่มีงาน</div>
        <div style="font-size:12px;">เพิ่มงานใหม่หรือวางข้อความจากแชทด้านบน</div>
      </div>`;
    return;
  }
  el.innerHTML = `<div class="sec-h">งานค้าง (${pending.length})</div>` +
    pending.map((j,i)=>cardPending(j,i+1,etaList[i])).join('');
}

function cardPending(j, pri, etaInfo) {
  const mapsUrl = buildMapsUrl(j);
  const distBadge = j.distanceKm!=null
    ? `<span class="dist-badge">${j.distanceKm.toFixed(1)} กม.</span>` : '';
  const timeBadge = j.timeNote
    ? `<span class="time-tag">⏰ ${esc(j.timeNote)}</span>` : '';
  const locIcon  = LOC_ICON[j.locationType]  || '📍';
  const locLabel = LOC_LABEL[j.locationType] || '';
  const etaBadge = etaInfo ? `<span class="eta-badge">🕐 ${formatETAClock(etaInfo.etaTime)}</span>` : '';

  const moveControls = isManualSort ? `
    <div style="display:flex;gap:6px;margin-left:10px;">
      <button class="move-btn" onclick="event.stopPropagation();moveJob('${j.id}', -1)" title="เลื่อนขึ้น" ${pri===1?'disabled':''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="move-btn" onclick="event.stopPropagation();moveJob('${j.id}', 1)" title="เลื่อนลง">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
  ` : '';

  return `
  <div class="job-pending mb-3 fade-up" style="animation-delay:${(pri-1)*0.04}s" onclick="openDetailModal('${j.id}')">
    <div style="padding:15px 16px;">

      <!-- Row 1: priority + name + dist + ETA -->
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <span class="badge${pri===1?' p1':''}">#${pri}</span>
        <span style="font-size:16px;font-weight:700;color:#f1f5f9;flex:1;line-height:1.3;">${esc(j.customerName||'ไม่ระบุชื่อ')}</span>
        <div style="display:flex;align-items:flex-end;gap:8px;">
           <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
             ${distBadge}
             ${etaBadge}
           </div>
           ${moveControls}
        </div>
      </div>

      <!-- Details -->
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
        ${getPhones(j.phone).map(p => `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#a8b8cc;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8899b0" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>
          ${esc(p)}</div>`).join('')}

        ${j.locationRaw ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8899b0;">
          <span>${locIcon}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(j.locationRaw)}</span>
          <span style="font-size:10px;background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;color:#8899b0;flex-shrink:0;">${locLabel}</span>
        </div>` : ''}

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${j.price ? `<span style="font-size:13px;color:#f87171;font-weight:600;">จ่าย ฿${j.price.toLocaleString('th-TH')}</span>` : ''}
          ${j.wheelStr ? `<span style="font-size:12px;color:#8899b0;">${esc(j.wheelStr)}</span>` : ''}
          ${j.quantity ? `<span style="font-size:12px;color:#c4b5fd;font-weight:600;">(รวม ${j.quantity} วง)</span>` : ''}
          ${j.tags ? `<span style="font-size:11px;background:rgba(255,255,255,0.08);color:#a8b8cc;padding:2px 6px;border-radius:6px;">🏷️ ${esc(j.tags)}</span>` : ''}
          ${timeBadge}
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:7px;flex-wrap:wrap;" onclick="event.stopPropagation()">
        ${getPhones(j.phone).map(p => `<a href="tel:${p}" class="btn-call" style="flex:1;min-width:70px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>โทร</a>`).join('')}
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:1.5;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>นำทาง</a>` : ''}
        <button onclick="openPostponeModal('${j.id}')" class="btn-postpone" style="flex:1;">🔄 เลื่อน</button>
        <button onclick="completeJob('${j.id}')" class="btn-done" style="flex:1;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg>เสร็จ</button>
      </div>

    </div>
  </div>`;
}

// ── Postponed section ─────────────────────────────────────────
function renderPostponed() {
  const { postponed } = getSorted();
  const el = document.getElementById('postponedSec');
  if (!el) return;
  if (!postponed.length) { el.innerHTML=''; return; }
  el.innerHTML = `<div class="sec-h">เลื่อนนัด (${postponed.length})</div>` +
    postponed.map(j=>{
      const dateLabel = j.postponeDate 
        ? new Date(j.postponeDate).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})
        : 'ไม่มีกำหนด';
      return `
      <div class="job-postponed mb-2" onclick="openDetailModal('${j.id}')">
        <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;">
          <div style="width:20px;height:20px;background:rgba(251,191,36,0.13);border:1px solid rgba(251,191,36,0.28);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:10px;">🔄</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#e2e8f0;">${esc(j.customerName||'ไม่ระบุชื่อ')}</div>
            <div style="font-size:11px;color:#8899b0;">📅 ${dateLabel}</div>
          </div>
          <button onclick="event.stopPropagation();undoPostpone('${j.id}')" style="font-size:11px;color:#fbbf24;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:4px 9px;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">คืนคิว</button>
        </div>
      </div>`;
    }).join('');
}

// ── Done section ──────────────────────────────────────────────
function renderDone() {
  const { done } = getSorted();
  const el = document.getElementById('doneSec');
  if (!done.length) { el.innerHTML=''; return; }
  el.innerHTML = `<div class="sec-h" style="margin-top:20px;">เสร็จแล้ว (${done.length})</div>` +
    done.map(j=>`
    <div class="job-done mb-2">
      <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;">
        <div style="width:20px;height:20px;background:rgba(74,222,128,0.13);border:1px solid rgba(74,222,128,0.28);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#6b7f99;text-decoration:line-through;">${esc(j.customerName||'ไม่ระบุชื่อ')}</div>
          ${j.price?`<div style="font-size:11px;color:#5a6d84;">${j.price.toLocaleString('th-TH')} ฿</div>`:''}
        </div>
        <button onclick="undoJob('${j.id}')" style="font-size:11px;color:#8899b0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 9px;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">ย้อน</button>
      </div>
    </div>`).join('');
}

// ── Manage tab ────────────────────────────────────────────────
function renderManage() {
  const tod = todayStr();
  let list = [...jobs];
  if (manFilter==='pending') list = list.filter(j=>j.status==='pending');
  else if (manFilter==='done') list = list.filter(j=>j.status==='done');
  else if (manFilter==='today') list = list.filter(j=>j.date===tod);

  list.sort((a,b)=>{
    if (a.status!==b.status) return a.status==='pending'?-1:1;
    return new Date(b.createdAt)-new Date(a.createdAt);
  });

  document.getElementById('manCount').textContent = `${list.length} รายการ`;
  const el = document.getElementById('manList');

  if (!list.length) {
    el.innerHTML=`<div class="empty"><div style="font-size:36px;margin-bottom:8px;">📭</div><div style="font-size:14px;">ไม่พบรายการ</div></div>`;
    return;
  }

  el.innerHTML = list.map(j=>`
    <div class="man-item mb-3 ${j.status==='done'?'done-item':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:7px;flex:1;">
          <span style="width:8px;height:8px;border-radius:50%;background:${j.status==='pending'?'#3b82f6':'#22c55e'};flex-shrink:0;"></span>
          <span style="font-size:14px;font-weight:600;color:${j.status==='pending'?'#f1f5f9':'#6b7280'};">${esc(j.customerName||'ไม่ระบุชื่อ')}</span>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="icon-btn" onclick="openEditById('${j.id}')" style="background:rgba(99,102,241,0.1);color:#818cf8;" title="แก้ไข">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn" onclick="doConfirmDelete('${j.id}')" style="background:rgba(239,68,68,0.1);color:#f87171;" title="ลบ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#64748b;margin-bottom:5px;">
        ${j.phone?`<span>📞 ${j.phone}</span>`:''}
        ${j.price?`<span style="color:#ef4444;">จ่าย ฿ ${j.price.toLocaleString('th-TH')}</span>`:''}
        ${j.wheelStr?`<span>🔵 ${esc(j.wheelStr)}</span>`:''}
        ${j.quantity?`<span style="color:#c4b5fd;">( ${j.quantity} วง )</span>`:''}
        ${j.distanceKm!=null?`<span style="color:#93c5fd;">📏 ${j.distanceKm.toFixed(1)} กม.</span>`:''}
        ${j.timeNote?`<span style="color:#fca5a5;">⏰ ${esc(j.timeNote)}</span>`:''}
        ${j.tags?`<span style="color:#94a3b8;background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:4px;">🏷️ ${esc(j.tags)}</span>`:''}
      </div>

      ${j.locationRaw?`<div style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${LOC_ICON[j.locationType]||'📍'} ${esc(j.locationRaw)}</div>`:''}

      <div style="margin-top:6px;font-size:10px;color:#374151;">
        ${new Date(j.createdAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        ${j.status==='done'?' • ✓ เสร็จแล้ว':''}
      </div>
    </div>`).join('');
}

// ── Expense Tab ───────────────────────────────────────────────
function renderExpense() {
  const tod = todayStr();
  const todJobs = jobs.filter(j=>j.date===tod && (j.price||0)>0);
  const todExpenses = expenses.filter(e=>e.date===tod);

  let list = [];
  todJobs.forEach(j => {
    list.push({ isJob: true, title: `ค่าล้อ: ${j.customerName}`, amount: j.price, time: j.createdAt });
  });
  todExpenses.forEach(e => {
    list.push({ isJob: false, id: e.id, title: e.name, amount: e.amount, tags: e.tags, time: e.createdAt });
  });

  list.sort((a,b)=> new Date(b.time) - new Date(a.time));

  const el = document.getElementById('expenseList');
  if(!list.length) {
    el.innerHTML=`<div class="empty"><div style="font-size:36px;margin-bottom:8px;">💸</div><div style="font-size:14px;">ยังไม่มีรายจ่ายวันนี้</div></div>`;
    return;
  }

  el.innerHTML = list.map(e=>`
    <div class="man-item mb-2" style="background:${e.isJob?'rgba(15,23,42,0.4)':'rgba(239,68,68,0.06)'};border-color:${e.isJob?'rgba(255,255,255,0.05)':'rgba(239,68,68,0.15)'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:4px;">
            ${e.isJob?'🚚 ':'💸 '}${esc(e.title)}
          </div>
          ${e.tags ? `<span style="font-size:10px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:#94a3b8;">${esc(e.tags)}</span>` : ''}
          <div style="font-size:10px;color:#64748b;margin-top:6px;">${new Date(e.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#ef4444;">- ${e.amount.toLocaleString('th-TH')} ฿</div>
          ${!e.isJob ? `<button onclick="deleteExpense('${e.id}')" style="margin-top:5px;font-size:10px;color:#94a3b8;background:transparent;border:1px solid #475569;border-radius:4px;padding:2px 6px;">ลบ</button>` : `<span style="font-size:10px;color:#64748b;">(อัตโนมัติ)</span>`}
        </div>
      </div>
    </div>`).join('');
}

// ── Actions ───────────────────────────────────────────────────
function completeJob(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  db.collection(COLLECTION).doc(id).update({
    status: 'done',
    completedAt: new Date().toISOString()
  }).then(() => {
    toast(`✅ "${j.customerName}" เสร็จแล้ว`, 'ok');
  });
}
function undoJob(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  db.collection(COLLECTION).doc(id).update({
    status: 'pending',
    completedAt: null
  }).then(() => {
    toast(`↩️ ย้าย "${j.customerName}" กลับ`, 'info');
  });
}
function doConfirmDelete(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  delTargetId=id;
  document.getElementById('cfTitle').textContent='ลบงาน?';
  document.getElementById('cfMsg').textContent=`ลบ "${j.customerName}" ออกจากรายการ ไม่สามารถกู้คืนได้`;
  document.getElementById('confirmDlg').classList.remove('hidden');
}
function deleteJob(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  db.collection(COLLECTION).doc(id).delete().then(() => {
    toast(`🗑️ ลบ "${j.customerName}" แล้ว`, 'err');
  });
}

function toggleSortMode(val) {
  isManualSort = val;
  localStorage.setItem('logis_manualSort', val);
  document.getElementById('sortLabel').textContent = val ? 'MANUAL' : 'AUTO';
  document.getElementById('sortLabel').style.color = val ? '#3b82f6' : '#475569';
  
  if (val) {
    // Initialize priorities in Firestore
    const { pending } = getSorted(); 
    const batch = db.batch();
    pending.forEach((j, i) => { 
      const ref = db.collection(COLLECTION).doc(j.id);
      batch.update(ref, { priority: i });
    });
    batch.commit();
  }
  renderAll();
  toast(val ? '🔧 เข้าสู่โหมดจัดลำดับเอง' : '📍 กลับสู่โหมดเรียงตามระยะทาง', 'info');
}

function moveJob(id, dir) {
  const { pending } = getSorted();
  const idx = pending.findIndex(j => j.id === id);
  if (idx === -1) return;
  
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= pending.length) return;
  
  const current = pending[idx];
  const target = pending[targetIdx];
  
  // Swap priorities in Firestore
  const batch = db.batch();
  batch.update(db.collection(COLLECTION).doc(current.id), { priority: target.priority });
  batch.update(db.collection(COLLECTION).doc(target.id), { priority: current.priority });
  batch.commit().then(() => renderAll());
}



// ── Smart Parser ──────────────────────────────────────────────
function openParserModal() {
  document.getElementById('parserModal').classList.remove('hidden');
  document.getElementById('parserInput').value='';
  document.getElementById('parserPreview').style.display='none';
  parsedBuf=[];
  setTimeout(()=>document.getElementById('parserInput').focus(),80);
}
function closeParserModal() {
  document.getElementById('parserModal').classList.add('hidden');
  parsedBuf=[];
}

function runParser() {
  const raw = document.getElementById('parserInput').value.trim();
  if (!raw) { toast('กรุณาวางข้อความก่อน','err'); return; }
  parsedBuf = parseText(raw);
  showPreview(parsedBuf);
  document.getElementById('parserPreview').style.display='block';
}

function parseText(text) {
  // Split by lines of repeated emojis (any emoji 3+), or repeated symbols
  let blocks = text.split(/\n\s*(?:(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF]){3,}|[\-\*=]{3,})\s*\n/u);
  if (blocks.length <= 1) blocks = text.split(/\n\s*\n\s*\n/);
  
  blocks = blocks.map(b => b.replace(/^นัดรับวัน.+$/m, '').trim()).filter(b => b.length > 5);
  return blocks.map(parseBlock).filter(j => j.customerName || j.phone || j.locationRaw);
}

function parseBlock(block) {
  const job = { id: genId(), status: 'pending', createdAt: new Date().toISOString(), date: todayStr(), distanceKm: null, priority: 0, quantity: 0 };

  // Customer name
  let m = block.match(/ชื่อ(?:เฟส)?\s*[:：]\s*(.+)/i);
  if (m) job.customerName = m[1].trim().split('\n')[0].trim();
  
  if (!job.customerName) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!/^\d+\.พิกัด|โทร|ล้อ|ราคา|ชื่อ|ไม่เกิน|ก่อน|หลัง|รวม|\*\*/i.test(line) &&
          !/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF]){2,}/u.test(line)) {
        job.customerName = line.replace(/^[☀️🌞🌟\-\s#*0-9.]+/,'').trim().split('\n')[0].trim();
        if (job.customerName) break;
      }
    }
  }

  // Phone with multi-number support
  m = block.match(/(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s\-]{9,15})/i);
  if (m) {
    job.phone = m[1].replace(/\D/g, '').slice(0, 10);
    const phoneArea = block.substring(block.indexOf(m[0]));
    const lines = phoneArea.split('\n').map(l=>l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const secondLine = lines[1].replace(/\D/g, '');
      if (/^0\d{8,9}$/.test(secondLine)) job.phone += '/' + secondLine;
    }
  } else {
    m = block.match(/(0[\d\s\-]{8,12})/);
    if (m) job.phone = m[1].replace(/\D/g, '').slice(0, 10);
  }

  // Location
  m = block.match(/(?:\d+\.)?พิกัด\s*[:：]\s*(.+)/i) || 
      block.match(/(?:ที่อยู่|สถานที่|Location|Maps?)\s*[:：]\s*(.+)/i);
  if (m) {
    job.locationRaw = m[1].trim().split('\n')[0].trim();
    job.locationType = classifyLoc(job.locationRaw);
  } else if (!job.customerName) {
    const first = block.split('\n')[0];
    if (classifyLoc(first) !== 'place') {
      job.locationRaw = first.trim();
      job.locationType = classifyLoc(job.locationRaw);
    }
  }

  // Wheel string + price: "ล้อ :17/4วงราคา2,000 บาท"
  const wheelMatch = block.match(/ล้อ\s*[:：|]\s*(.+)/i);
  if (wheelMatch) {
    const wheelLine = wheelMatch[1].trim();
    job.wheelStr = wheelLine.replace(/ราคา[\s:]*[\d,]+\s*(?:บ\.?|บาท)?/gi, '').replace(/\*\*.+?\*\*/g,'').trim();
    
    // Total price **รวมX,XXXบาท**
    const totalMatch = block.match(/\*\*\s*รวม\s*([\d,]+)\s*(?:บ\.?|บาท)?\s*\*\*/i);
    if (totalMatch) {
      job.price = parseInt(totalMatch[1].replace(/,/g, ''));
    } else {
      const priceM = wheelLine.match(/ราคา\s*[:：]?\s*([\d,]+)/i);
      if (priceM) job.price = parseInt(priceM[1].replace(/,/g, ''));
    }
    
    // Quantity from wheel
    const qtyMatches = wheelLine.match(/[\/|](\d+)\s*วง/gi);
    if (qtyMatches) {
      job.quantity = qtyMatches.reduce((sum, q) => sum + parseInt(q.match(/(\d+)/)[1]), 0);
    }
  }

  // Fallback price
  if (!job.price) {
    m = block.match(/ราคา\s*[:：]?\s*([\d,]+)/i);
    if (m) job.price = parseInt(m[1].replace(/,/g, ''));
  }

  // Fallback quantity
  if (!job.quantity) {
    m = block.match(/(\d+)\s*(?:วง|ชิ้น|เส้น)/i) || block.match(/[x×\/|](\d+)\s*วง/i);
    if (m) job.quantity = parseInt(m[1]);
  }

  // Time note: any text between ** ** markers, or common time keywords
  m = block.match(/\*\*\s*(.+?)\s*\*\*/i);
  if (m && !/^รวม/i.test(m[1])) {
    job.timeNote = m[1].trim().slice(0, 50);
  }
  if (!job.timeNote) {
    m = block.match(/((?:ก่อน|หลัง|ไม่เกิน|ภายใน|ตั้งแต่|ช่วง|เวลา|นัด|รอ|ประมาณ|ถึง).{2,40})/i);
    if (m) job.timeNote = m[1].replace(/\*/g, '').trim().slice(0, 50);
  }

  job.rawNote = block;

  if (job.locationType === 'coords' && userLoc) {
    const c = parseCoords(job.locationRaw);
    if (c) job.distanceKm = haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
  }
  return job;
}

function showPreview(list) {
  const el = document.getElementById('previewList');
  const btn = document.getElementById('btnSaveParser');
  if (!list.length) {
    el.innerHTML=`<div style="text-align:center;padding:16px;color:#f87171;">ไม่พบข้อมูลงาน — ลองตรวจสอบรูปแบบข้อความ</div>`;
    btn.style.display='none'; return;
  }
  btn.style.display='block';
  btn.textContent=`💾 บันทึก ${list.length} งาน`;
  el.innerHTML=list.map((j,i)=>`
    <div class="parse-card ${j.customerName?'ok':'warn'}">
      <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:7px;">งานที่ ${i+1}: ${esc(j.customerName||'⚠️ ไม่พบชื่อ')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;">
        ${j.phone?`<span style="color:#86efac;">📞 ${j.phone}</span>`:`<span style="color:#f87171;">📞 ไม่พบ</span>`}
        ${j.locationRaw
          ?`<span style="color:${LOC_COLOR[j.locationType]}">${LOC_ICON[j.locationType]} ${LOC_LABEL[j.locationType]}: ${esc(j.locationRaw.slice(0,35))}${j.locationRaw.length>35?'…':''}</span>`
          :`<span style="color:#f87171;">📍 ไม่พบพิกัด</span>`}
        ${j.price?`<span style="color:#34d399;">฿ ${j.price.toLocaleString('th-TH')}</span>`:`<span style="color:#f87171;">฿ ไม่พบ</span>`}
        ${j.wheelSize?`<span style="color:#c4b5fd;">ล้อ ${j.wheelSize}"</span>`:''}
        ${j.quantity?`<span style="color:#a5b4fc;">× ${j.quantity} วง</span>`:''}
        ${j.timeNote?`<span style="color:#fca5a5;">⏰ ${esc(j.timeNote)}</span>`:''}
        ${j.distanceKm!=null?`<span style="color:#93c5fd;">📏 ${j.distanceKm.toFixed(1)} กม.</span>`:''}
      </div>
    </div>`).join('');
}

function saveFromParser() {
  if (!parsedBuf.length) return;
  const batch = db.batch();
  let added = 0;
  parsedBuf.forEach(j => {
    const dup = j.phone && jobs.some(x => x.phone === j.phone && x.status === 'pending');
    if (!dup) {
      const ref = db.collection(COLLECTION).doc(j.id);
      batch.set(ref, j);
      added++;
    }
  });
  batch.commit().then(() => {
    closeParserModal();
    toast(`✅ บันทึก ${added} งานแล้ว (Cloud Sync)`, 'ok');
  });
}


// ── Add / Edit Modal ──────────────────────────────────────────
function openAddModal() {
  editingId=null;
  document.getElementById('editTitle').textContent='➕ เพิ่มงานใหม่';
  document.getElementById('editId').value='';
  ['fName','fPhone','fLocation','fPrice','fQty','fTime','fNote','fWheelStr','fTags'].forEach(id=>{
    let el = document.getElementById(id);
    if(el) el.value='';
  });
  document.getElementById('locTypeHint').textContent='';
  document.getElementById('editModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('fName').focus(),80);
}

function openEditById(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  editingId=id;
  document.getElementById('editTitle').textContent='✏️ แก้ไขงาน';
  document.getElementById('editId').value=id;
  document.getElementById('fName').value=j.customerName||'';
  document.getElementById('fPhone').value=j.phone||'';
  document.getElementById('fLocation').value=j.locationRaw||'';
  document.getElementById('fPrice').value=j.price||'';
  if(document.getElementById('fWheelStr')) document.getElementById('fWheelStr').value=j.wheelStr||'';
  if(document.getElementById('fTags')) document.getElementById('fTags').value=j.tags||'';
  document.getElementById('fQty').value=j.quantity||'';
  document.getElementById('fTime').value=j.timeNote||'';
  document.getElementById('fNote').value=j.rawNote||'';
  updateLocTypeHint();
  document.getElementById('editModal').classList.remove('hidden');
  // Switch to manage-accessible view
  if (currentTab==='manage') setTimeout(()=>document.getElementById('editModal').classList.remove('hidden'),10);
}

function closeEditModal() { document.getElementById('editModal').classList.add('hidden'); editingId=null; }

function updateLocTypeHint() {
  const raw = document.getElementById('fLocation').value;
  const hint = document.getElementById('locTypeHint');
  if (!raw) { hint.textContent=''; return; }
  const t = classifyLoc(raw);
  hint.textContent = `${LOC_ICON[t]} ${LOC_LABEL[t]}`;
  hint.style.color = LOC_COLOR[t];
}

function saveJob() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อลูกค้า','err'); document.getElementById('fName').focus(); return; }

  const locRaw = document.getElementById('fLocation').value.trim();
  const locType = classifyLoc(locRaw);
  let distKm = null;
  if (locType==='coords' && userLoc) {
    const c = parseCoords(locRaw);
    if (c) distKm = haversine(userLoc.lat,userLoc.lng,c.lat,c.lng);
  }

  const data = {
    customerName: name,
    phone:       document.getElementById('fPhone').value.trim(),
    locationRaw: locRaw,
    locationType: locType,
    price:       parseInt(document.getElementById('fPrice').value)||0,
    wheelStr:    document.getElementById('fWheelStr') ? document.getElementById('fWheelStr').value.trim() : '',
    tags:        document.getElementById('fTags') ? document.getElementById('fTags').value.trim() : '',
    quantity:    parseInt(document.getElementById('fQty').value)||0,
    timeNote:    document.getElementById('fTime').value.trim(),
    rawNote:     document.getElementById('fNote').value.trim(),
    distanceKm:  distKm,
  };

  if (editingId) {
    db.collection(COLLECTION).doc(editingId).update(data).then(() => {
      toast(`✅ แก้ไข "${name}" แล้ว (Cloud Sync)`, 'ok');
    });
  } else {
    const maxPri = jobs.length > 0 ? Math.max(...jobs.map(j => j.priority || 0)) : 0;
    const newId = genId();
    const fullData = { 
      status:'pending', 
      createdAt:new Date().toISOString(), 
      completedAt:null, 
      date:todayStr(), 
      priority: maxPri + 1, 
      ...data 
    };
    db.collection(COLLECTION).doc(newId).set(fullData).then(() => {
      toast(`✅ เพิ่ม "${name}" แล้ว (Cloud Sync)`, 'ok');
    });
  }
  closeEditModal();
}


// ── Expense Modal ─────────────────────────────────────────────
function openExpenseModal() {
  document.getElementById('eName').value='';
  document.getElementById('eAmount').value='';
  document.getElementById('eTags').value='';
  document.getElementById('expenseModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('eName').focus(),80);
}
function closeExpenseModal() { document.getElementById('expenseModal').classList.add('hidden'); }

function saveExpense() {
  const name = document.getElementById('eName').value.trim();
  const amount = parseInt(document.getElementById('eAmount').value);
  if(!name || isNaN(amount)){ toast('กรุณากรอกชื่อและจำนวนเงิน','err'); return; }

  const newId = db.collection(EXP_COLLECTION).doc().id;
  db.collection(EXP_COLLECTION).doc(newId).set({
    name,
    amount,
    tags: document.getElementById('eTags').value.trim(),
    createdAt: new Date().toISOString(),
    date: todayStr()
  }).then(()=>{
    closeExpenseModal();
    toast('✅ บันทึกรายจ่ายแล้ว','ok');
  });
}
function deleteExpense(id) {
  if(!confirm('ลบรายจ่ายนี้?')) return;
  db.collection(EXP_COLLECTION).doc(id).delete().then(()=>toast('🗑️ ลบแล้ว','ok'));
}

// ── Tab navigation ────────────────────────────────────────────
function switchTab(tab) {
  currentTab=tab;
  document.getElementById('tabSummary').style.display = tab==='summary'?'block':'none';
  document.getElementById('tabManage').style.display  = tab==='manage' ?'block':'none';
  document.getElementById('tabExpense').style.display = tab==='expense'?'block':'none';
  document.getElementById('tabBtnSummary').classList.toggle('active', tab==='summary');
  document.getElementById('tabBtnManage').classList.toggle('active',  tab==='manage');
  if(document.getElementById('tabBtnExpense')) document.getElementById('tabBtnExpense').classList.toggle('active',  tab==='expense');
  if (tab==='manage') renderManage();
  if (tab==='expense') renderExpense();
}

function setFilter(f, el) {
  manFilter=f;
  document.querySelectorAll('.pill').forEach(p=>{ p.classList.toggle('on',p===el); p.classList.toggle('off',p!==el); });
  renderManage();
}

// ── Utils ─────────────────────────────────────────────────────
function getPhones(str) {
  if(!str) return [];
  return str.split(/[\/, ]+/).filter(p=>p.replace(/\D/g,'').length>=9);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer=null;
function toast(msg, type='info') {
  const el=document.getElementById('toast');
  const bord={ok:'rgba(34,197,94,0.35)',err:'rgba(239,68,68,0.35)',info:'rgba(59,130,246,0.35)',warn:'rgba(249,115,22,0.35)'};
  el.style.borderColor=bord[type]||bord.info;
  el.textContent=msg;
  el.classList.remove('hide');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>el.classList.add('hide'),2600);
}

function updateClock() {
  const now=new Date();
  document.getElementById('clock').textContent=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── Confirm dialog wiring ─────────────────────────────────────
document.getElementById('cfCancel').onclick=()=>{ document.getElementById('confirmDlg').classList.add('hidden'); delTargetId=null; };
document.getElementById('cfOk').onclick=()=>{ if(delTargetId){deleteJob(delTargetId);delTargetId=null;} document.getElementById('confirmDlg').classList.add('hidden'); };

// ── Auto Cleanup & Export ─────────────────────────────────────
function runAutoCleanup() {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
  
  jobs.forEach(j => {
    if (new Date(j.createdAt).getTime() < cutoff) {
      db.collection(COLLECTION).doc(j.id).delete().catch(()=>{});
    }
  });

  expenses.forEach(e => {
    if (new Date(e.createdAt).getTime() < cutoff) {
      db.collection(EXP_COLLECTION).doc(e.id).delete().catch(()=>{});
    }
  });
}

function exportToCSV() {
  let csvContent = "\uFEFF"; // BOM for UTF-8
  csvContent += "Type,Date,Time,Status,Customer_Name,Phone,Location,Price_Amount,Wheel_Size,Quantity,Note,Tags\n";

  // Export Jobs
  jobs.forEach(j => {
    let dt = new Date(j.createdAt);
    let row = [
      "Job",
      dt.toLocaleDateString('th-TH'),
      dt.toLocaleTimeString('th-TH'),
      j.status,
      j.customerName,
      j.phone,
      j.locationRaw,
      j.price,
      j.wheelStr,
      j.quantity,
      (j.timeNote || '') + " " + (j.rawNote || '').replace(/\n/g, " "),
      j.tags
    ].map(v => '"' + (v || '').toString().replace(/"/g, '""') + '"').join(",");
    csvContent += row + "\n";
  });

  // Export Expenses
  expenses.forEach(e => {
    let dt = new Date(e.createdAt);
    let row = [
      "Expense",
      dt.toLocaleDateString('th-TH'),
      dt.toLocaleTimeString('th-TH'),
      "done",
      e.name,
      "",
      "",
      e.amount,
      "",
      "",
      "",
      e.tags
    ].map(v => '"' + (v || '').toString().replace(/"/g, '""') + '"').join(",");
    csvContent += row + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "logis_master_export_" + todayStr() + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('📥 ส่งออกไฟล์ CSV สำเร็จ', 'ok');
}

// Close modals on overlay click
document.getElementById('parserModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeParserModal(); });
document.getElementById('editModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeEditModal(); });
document.getElementById('detailModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeDetailModal(); });
document.getElementById('postponeModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closePostponeModal(); });
document.getElementById('queueParserModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeQueueParserModal(); });

// ── Detail Modal ──────────────────────────────────────────────
function openDetailModal(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  const mapsUrl = buildMapsUrl(j);
  const locIcon = LOC_ICON[j.locationType] || '📍';
  
  let rows = '';
  rows += `<div class="detail-row"><div class="detail-label">ชื่อ</div><div class="detail-value" style="font-weight:700;font-size:16px;">${esc(j.customerName||'ไม่ระบุ')}</div></div>`;
  if(j.phone) rows += `<div class="detail-row"><div class="detail-label">เบอร์โทร</div><div class="detail-value">${getPhones(j.phone).map(p=>`<a href="tel:${p}" style="color:#60a5fa;text-decoration:none;">${esc(p)}</a>`).join(', ')}</div></div>`;
  if(j.locationRaw) rows += `<div class="detail-row"><div class="detail-label">${locIcon} พิกัด</div><div class="detail-value">${esc(j.locationRaw)}</div></div>`;
  if(j.price) rows += `<div class="detail-row"><div class="detail-label">ราคา</div><div class="detail-value" style="color:#f87171;font-weight:600;">฿${j.price.toLocaleString('th-TH')}</div></div>`;
  if(j.wheelStr) rows += `<div class="detail-row"><div class="detail-label">ล้อ</div><div class="detail-value">${esc(j.wheelStr)}</div></div>`;
  if(j.quantity) rows += `<div class="detail-row"><div class="detail-label">จำนวน</div><div class="detail-value" style="color:#c4b5fd;font-weight:600;">${j.quantity} วง</div></div>`;
  if(j.tags) rows += `<div class="detail-row"><div class="detail-label">แท็ก</div><div class="detail-value">🏷️ ${esc(j.tags)}</div></div>`;
  if(j.timeNote) rows += `<div class="detail-row"><div class="detail-label">เงื่อนไข</div><div class="detail-value" style="color:#fca5a5;">⏰ ${esc(j.timeNote)}</div></div>`;
  if(j.distanceKm!=null) rows += `<div class="detail-row"><div class="detail-label">ระยะทาง</div><div class="detail-value" style="color:#93c5fd;">${j.distanceKm.toFixed(1)} กม. (${getETAText(j.distanceKm)})</div></div>`;
  if(j.postponed) {
    const dl = j.postponeDate ? new Date(j.postponeDate).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'2-digit'}) : 'ไม่มีกำหนด';
    rows += `<div class="detail-row"><div class="detail-label">เลื่อนนัด</div><div class="detail-value"><span class="postpone-tag">🔄 ${dl}</span></div></div>`;
  }
  if(j.rawNote) rows += `<div class="detail-row"><div class="detail-label">หมายเหตุ</div><div class="detail-value" style="font-size:12px;color:#8899b0;white-space:pre-wrap;">${esc(j.rawNote)}</div></div>`;
  rows += `<div class="detail-row"><div class="detail-label">สร้างเมื่อ</div><div class="detail-value" style="font-size:12px;color:#6b7f99;">${new Date(j.createdAt).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div>`;
  
  document.getElementById('detailContent').innerHTML = rows;
  
  // Action buttons
  let actions = '';
  if(j.status==='pending' && !j.postponed) {
    getPhones(j.phone).forEach(p => {
      actions += `<a href="tel:${p}" class="btn-call" style="flex:1;">📞 โทร</a>`;
    });
    if(mapsUrl) actions += `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:1.5;">📍 นำทาง</a>`;
    actions += `<button onclick="openPostponeModal('${j.id}');closeDetailModal();" class="btn-postpone" style="flex:1;">🔄 เลื่อน</button>`;
    actions += `<button onclick="completeJob('${j.id}');closeDetailModal();" class="btn-done" style="flex:1;">✅ เสร็จ</button>`;
  }
  if(j.postponed) {
    actions += `<button onclick="undoPostpone('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">↩️ คืนคิว</button>`;
  }
  actions += `<button onclick="openEditById('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">✏️ แก้ไข</button>`;
  actions += `<button onclick="doConfirmDelete('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">🗑️ ลบ</button>`;
  
  document.getElementById('detailActions').innerHTML = actions;
  document.getElementById('detailModal').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('detailModal').classList.add('hidden'); }

// ── Postpone Modal ────────────────────────────────────────────
function openPostponeModal(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  document.getElementById('postponeJobId').value = id;
  document.getElementById('postponeJobName').textContent = `เลื่อนนัด "${j.customerName||'ไม่ระบุ'}"`;
  document.getElementById('postponeDate').value = '';
  document.getElementById('postponeModal').classList.remove('hidden');
}
function closePostponeModal() { document.getElementById('postponeModal').classList.add('hidden'); }

function doPostpone(noDate) {
  const id = document.getElementById('postponeJobId').value;
  if (!id) return;
  const dateVal = noDate ? null : document.getElementById('postponeDate').value;
  if (!noDate && !dateVal) { toast('กรุณาเลือกวันที่','err'); return; }
  
  const j = jobs.find(x=>x.id===id);
  db.collection(COLLECTION).doc(id).update({
    postponed: true,
    postponeDate: dateVal || null
  }).then(() => {
    closePostponeModal();
    const label = dateVal ? new Date(dateVal).toLocaleDateString('th-TH',{day:'numeric',month:'short'}) : 'ไม่มีกำหนด';
    toast(`🔄 เลื่อนนัด "${j?j.customerName:''}" → ${label}`, 'info');
  });
}

function undoPostpone(id) {
  db.collection(COLLECTION).doc(id).update({
    postponed: false,
    postponeDate: null
  }).then(() => {
    toast('↩️ คืนกลับเข้าคิวแล้ว', 'ok');
  });
}

// ── Queue Parser (Auto Queue from text) ───────────────────────
function openQueueParserModal() {
  document.getElementById('queueParserModal').classList.remove('hidden');
  document.getElementById('queueInput').value = '';
  document.getElementById('queuePreview').style.display = 'none';
  queueParsedBuf = [];
  setTimeout(()=>document.getElementById('queueInput').focus(), 80);
}
function closeQueueParserModal() {
  document.getElementById('queueParserModal').classList.add('hidden');
  queueParsedBuf = [];
}

function runQueueParser() {
  const raw = document.getElementById('queueInput').value.trim();
  if (!raw) { toast('กรุณาวางข้อความก่อน','err'); return; }
  
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  let currentDate = todayStr();
  const result = [];
  
  for (const line of lines) {
    // Check if it's a date header
    const dateMatch = line.match(/นัดรับวัน.+?(?:ที่\s*)?(\d{1,2})\s*(?:เมษา?\.?|เมย\.?|มี\.?ค\.?|พ\.?ค\.?|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\s*(\d{2,4})?/i);
    if (dateMatch || /^นัดรับวัน/i.test(line)) {
      // We just note it's a new batch, keep using todayStr for now
      continue;
    }
    
    // Skip empty-like lines
    if (line.length < 2) continue;
    
    // This is a location/place name
    result.push({
      id: genId(),
      status: 'pending',
      customerName: line,
      locationRaw: line,
      locationType: 'place',
      createdAt: new Date().toISOString(),
      date: currentDate,
      distanceKm: null,
      priority: result.length,
      quantity: 0,
      price: 0,
      phone: '',
      wheelStr: '',
      tags: '',
      timeNote: '',
      rawNote: line
    });
  }
  
  queueParsedBuf = result;
  
  const el = document.getElementById('queuePreviewList');
  const btn = document.getElementById('btnSaveQueue');
  if (!result.length) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;">ไม่พบรายการ</div>`;
    btn.style.display = 'none';
    document.getElementById('queuePreview').style.display = 'block';
    return;
  }
  
  btn.style.display = 'block';
  btn.textContent = `💾 บันทึก ${result.length} รายการ`;
  el.innerHTML = result.map((j,i) => `
    <div class="parse-card ok">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge">#${i+1}</span>
        <span style="font-size:13px;font-weight:600;color:#f1f5f9;">${esc(j.customerName)}</span>
      </div>
    </div>
  `).join('');
  document.getElementById('queuePreview').style.display = 'block';
}

function saveFromQueueParser() {
  if (!queueParsedBuf.length) return;
  const batch = db.batch();
  queueParsedBuf.forEach(j => {
    const ref = db.collection(COLLECTION).doc(j.id);
    batch.set(ref, j);
  });
  batch.commit().then(() => {
    closeQueueParserModal();
    toast(`✅ จัดคิว ${queueParsedBuf.length} รายการแล้ว`, 'ok');
    // Switch to manual sort to preserve queue order
    if (!isManualSort) {
      isManualSort = true;
      localStorage.setItem('logis_manualSort', 'true');
      const toggle = document.getElementById('sortToggle');
      if (toggle) toggle.checked = true;
      document.getElementById('sortLabel').textContent = 'MANUAL';
      document.getElementById('sortLabel').style.color = '#60a5fa';
    }
  });
}

// ── Live timer (distance refresh every 60s) ───────────────────
setInterval(()=>{ if(userLoc){ refreshDistances(); renderAll(); } }, 60000);

// ── Init ───────────────────────────────────────────────────────
(function init(){
  try { const s=localStorage.getItem(LS_LOC); if(s) userLoc=JSON.parse(s); } catch{}
  try { 
    const m = localStorage.getItem('logis_manualSort'); 
    if (m !== null) {
      isManualSort = (m === 'true');
      const toggle = document.getElementById('sortToggle');
      if (toggle) {
        toggle.checked = isManualSort;
        document.getElementById('sortLabel').textContent = isManualSort ? 'MANUAL' : 'AUTO';
        document.getElementById('sortLabel').style.color = isManualSort ? '#60a5fa' : '#7a8ba0';
      }
    }
  } catch{}
  loadJobs();
  refreshDistances();
  renderAll();
  updateClock();
  
  setInterval(updateClock, 15000);
  setInterval(()=>{ if(userLoc){ refreshDistances(); renderAll(); } }, 60000);
  
  // Clean up old items every 5 mins
  setTimeout(runAutoCleanup, 3000);
  setInterval(runAutoCleanup, 5 * 60000);

  // Auto-request GPS on first visit
  if (!userLoc) setTimeout(requestLocation, 1200);
})();
