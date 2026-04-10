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
let currentTab   = 'summary';
let userLoc      = null;    // { lat, lng }
let selWheel     = 0;
let editingId    = null;
let parsedBuf    = [];
let manFilter    = 'all';
let delTargetId  = null;
let isManualSort = false;
const AVG_SPEED_KMH = 40; // ความเร็วเฉลี่ยกม./ชม.

// ── Storage ──────────────────────────────────────────────────
const LS_LOC  = 'logis_loc';
const COLLECTION = 'jobs';

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
  const pending = jobs.filter(j=>j.status==='pending').sort((a,b)=>{
    if (isManualSort) {
      return (a.priority || 0) - (b.priority || 0);
    }
    if (a.distanceKm!=null && b.distanceKm!=null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm!=null) return -1;
    if (b.distanceKm!=null) return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  const done = jobs.filter(j=>j.status==='done').sort((a,b)=>
    new Date(b.completedAt||b.createdAt) - new Date(a.completedAt||a.createdAt)
  );
  return { pending, done };
}


// ── KPI ───────────────────────────────────────────────────────
function renderKPIs() {
  const { pending, done } = getSorted();
  const tod = todayStr();
  const todJobs = jobs.filter(j=>j.date===tod);
  const revenue = todJobs.reduce((s,j)=>s+(j.price||0),0);

  const dists = pending.filter(j=>j.distanceKm!=null);
  const totalDist = dists.reduce((s,j)=>s+j.distanceKm,0);

  document.getElementById('kpiPending').textContent = pending.length;
  document.getElementById('kpiDone').textContent    = done.length;
  document.getElementById('kpiRevenue').textContent = revenue.toLocaleString('th-TH');

  if (dists.length) {
    document.getElementById('kpiDist').textContent     = totalDist.toFixed(1);
    document.getElementById('kpiDistUnit').textContent = 'กม.';
  } else {
    document.getElementById('kpiDist').textContent     = '—';
    document.getElementById('kpiDistUnit').textContent = '';
  }
}

// ── Render All ────────────────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderPending();
  renderDone();
  if (currentTab === 'manage') renderManage();
}

// ── Pending section ───────────────────────────────────────────
function renderPending() {
  const { pending } = getSorted();
  const el = document.getElementById('pendingSec');
  if (!pending.length) {
    el.innerHTML = `
      <div class="empty">
        <div style="font-size:44px;margin-bottom:10px;">🎉</div>
        <div style="font-size:15px;font-weight:600;color:#94a3b8;margin-bottom:4px;">ยังไม่มีงาน</div>
        <div style="font-size:12px;">เพิ่มงานใหม่หรือวางข้อความจากแชทด้านบน</div>
      </div>`;
    return;
  }
  el.innerHTML = `<div class="sec-h">งานค้าง (${pending.length})</div>` +
    pending.map((j,i)=>cardPending(j,i+1)).join('');
}

function cardPending(j, pri) {
  const mapsUrl = buildMapsUrl(j);
  const distBadge = j.distanceKm!=null
    ? `<span class="dist-badge">${j.distanceKm.toFixed(1)} กม.</span>` : '';
  const timeBadge = j.timeNote
    ? `<span class="time-tag">⏰ ${esc(j.timeNote)}</span>` : '';
  const locIcon  = LOC_ICON[j.locationType]  || '📍';
  const locLabel = LOC_LABEL[j.locationType] || '';

  const moveControls = isManualSort ? `
    <div style="display:flex;gap:6px;margin-left:10px;">
      <button class="move-btn" onclick="moveJob('${j.id}', -1)" title="เลื่อนขึ้น" ${pri===1?'disabled':''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="move-btn" onclick="moveJob('${j.id}', 1)" title="เลื่อนลง">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
  ` : '';

  return `
  <div class="job-pending mb-3 fade-up" style="animation-delay:${(pri-1)*0.04}s">
    <div style="padding:15px 16px;">

      <!-- Row 1: priority + name + dist -->
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <span class="badge${pri===1?' p1':''}">#${pri}</span>
        <span style="font-size:16px;font-weight:700;color:#f1f5f9;flex:1;line-height:1.3;">${esc(j.customerName||'ไม่ระบุชื่อ')}</span>
        <div style="display:flex;align-items:flex-end;gap:8px;">
           <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
             ${distBadge}
             ${j.distanceKm!=null ? `<span style="font-size:10px;color:#64748b;font-weight:700;">${getETAText(j.distanceKm)}</span>` : ''}
           </div>
           ${moveControls}
        </div>
      </div>


      <!-- Details -->
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
        ${j.phone ? `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#94a3b8;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>
          ${esc(j.phone)}</div>` : ''}

        ${j.locationRaw ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;">
          <span>${locIcon}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(j.locationRaw)}</span>
          <span style="font-size:10px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;color:#64748b;flex-shrink:0;">${locLabel}</span>
        </div>` : ''}

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${j.price ? `<span style="font-size:13px;color:#34d399;font-weight:600;">฿${j.price.toLocaleString('th-TH')}</span>` : ''}
          ${j.wheelSize ? `<span style="font-size:12px;color:#475569;">ล้อ ${j.wheelSize}"</span>` : ''}
          ${j.quantity ? `<span style="font-size:12px;color:#c4b5fd;font-weight:600;">× ${j.quantity} วง</span>` : ''}
          ${timeBadge}
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:7px;">
        ${j.phone ? `<a href="tel:${j.phone}" class="btn-call" style="flex:1;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>โทร</a>` : ''}
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:${j.phone?'1':'2'};">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>นำทาง</a>` : ''}
        <button onclick="completeJob('${j.id}')" class="btn-done" style="flex:1;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg>เสร็จ</button>
      </div>

    </div>
  </div>`;
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
          <div style="font-size:13px;font-weight:600;color:#4b5563;text-decoration:line-through;">${esc(j.customerName||'ไม่ระบุชื่อ')}</div>
          ${j.price?`<div style="font-size:11px;color:#374151;">${j.price.toLocaleString('th-TH')} ฿</div>`:''}
        </div>
        <button onclick="undoJob('${j.id}')" style="font-size:11px;color:#64748b;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:4px 9px;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">ย้อน</button>
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
        ${j.price?`<span style="color:#34d399;">฿ ${j.price.toLocaleString('th-TH')}</span>`:''}
        ${j.wheelSize?`<span>🔵 ล้อ ${j.wheelSize}"</span>`:''}
        ${j.quantity?`<span style="color:#c4b5fd;">× ${j.quantity} วง</span>`:''}
        ${j.distanceKm!=null?`<span style="color:#93c5fd;">📏 ${j.distanceKm.toFixed(1)} กม.</span>`:''}
        ${j.timeNote?`<span style="color:#fca5a5;">⏰ ${esc(j.timeNote)}</span>`:''}
      </div>

      ${j.locationRaw?`<div style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${LOC_ICON[j.locationType]||'📍'} ${esc(j.locationRaw)}</div>`:''}

      <div style="margin-top:6px;font-size:10px;color:#374151;">
        ${new Date(j.createdAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        ${j.status==='done'?' • ✓ เสร็จแล้ว':''}
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
  // Enhanced splitting: handle sun emojis, lines of symbols, or multiple newlines
  let blocks = text.split(/\n\s*[☀️🌞\-\*=\?]{3,}\s*\n/);
  if (blocks.length <= 1) blocks = text.split(/\n\s*\n\s*\n/);
  
  blocks = blocks.map(b => b.trim()).filter(b => b.length > 5);
  return blocks.map(parseBlock).filter(j => j.customerName || j.phone || j.locationRaw);
}

function parseBlock(block) {
  const job = { id: genId(), status: 'pending', createdAt: new Date().toISOString(), date: todayStr(), distanceKm: null, priority: 0, quantity: 0 };

  // Customer name: handle "ชื่อเฟส : Thanut" or similar
  let m = block.match(/ชื่อ(?:เฟส)?\s*[:：]\s*(.+)/i);
  if (m) job.customerName = m[1].trim().split('\n')[0].trim();
  
  if (!job.customerName) {
    // fallback: first line that doesn't start with digits. or keyword
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!/^\d+\.พิกัด|โทร|ล้อ|ราคา|ชื่อ|ไม่เกิน/i.test(line)) {
        job.customerName = line.replace(/^[☀️🌞🌟\-\s#*0-9.]+/,'').trim().split('\n')[0].trim();
        if (job.customerName) break;
      }
    }
  }

  // Phone: handle hyphens and spaces
  m = block.match(/(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s\-]{9,15})/i) ||
      block.match(/(0[\d\s\-]{8,12})/);
  if (m) job.phone = m[1].replace(/\D/g, '').slice(0, 10);

  // Location: handle numbered prefix like "1.พิกัด :"
  m = block.match(/(?:\d+\.)?พิกัด\s*[:：]\s*(.+)/i) || 
      block.match(/(?:ที่อยู่|สถานที่|Location|Maps?)\s*[:：]\s*(.+)/i);
  if (m) {
    job.locationRaw = m[1].trim().split('\n')[0].trim();
    job.locationType = classifyLoc(job.locationRaw);
  } else if (!job.customerName) {
     // If we still don't have location, check first line if it looks like GPS
     const first = block.split('\n')[0];
     if (classifyLoc(first) !== 'place') {
        job.locationRaw = first.trim();
        job.locationType = classifyLoc(job.locationRaw);
     }
  }

  // Price: handle "ราคา 3,000 บ." or "ราคา:3,000"
  m = block.match(/ราคา\s*[:：]?\s*([\d,]+)/i);
  if (m) job.price = parseInt(m[1].replace(/,/g, ''));

  // Wheel size: handle "ล้อ :19/4วง"
  m = block.match(/ล้อ\s*[:：]\s*(\d+)/i) || 
      block.match(/(?:ล้อ|วง|ขนาด)\s*(15|17|18|19|20|22)\s*(?:นิ้ว|")?|(?:^|\s)(15|17|18|19|20|22)\s*(?:นิ้ว)/m);
  if (m) job.wheelSize = parseInt(m[1] || m[2]);

  // Quantity: handle "4 วง", "จำนวน: 4", "x4", "/4วง"
  m = block.match(/จำนวน\s*[:：]?\s*(\d+)/i) ||
      block.match(/(\d+)\s*(?:วง|ชิ้น|เส้น|ลูก|ชุด)/i) ||
      block.match(/[x×\/](\d+)\s*(?:วง|ชิ้น|เส้น)?/i);
  if (m) job.quantity = parseInt(m[1]);

  // Time note: handle "**ไม่เกิน17.00น.**"
  m = block.match(/(?:ไม่เกิน|ก่อน|ภายใน|by|deadline)\s*([^* \n]+)/i);
  if (m) job.timeNote = m[0].replace(/\*/g, '').trim().slice(0, 40);

  job.rawNote = block;

  // Calc distance
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
  editingId=null; selWheel=0;
  document.getElementById('editTitle').textContent='➕ เพิ่มงานใหม่';
  document.getElementById('editId').value='';
  ['fName','fPhone','fLocation','fPrice','fQty','fTime','fNote'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('locTypeHint').textContent='';
  document.querySelectorAll('.w-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('editModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('fName').focus(),80);
}

function openEditById(id) {
  const j = jobs.find(x=>x.id===id); if(!j) return;
  editingId=id; selWheel=j.wheelSize||0;
  document.getElementById('editTitle').textContent='✏️ แก้ไขงาน';
  document.getElementById('editId').value=id;
  document.getElementById('fName').value=j.customerName||'';
  document.getElementById('fPhone').value=j.phone||'';
  document.getElementById('fLocation').value=j.locationRaw||'';
  document.getElementById('fPrice').value=j.price||'';
  document.getElementById('fQty').value=j.quantity||'';
  document.getElementById('fTime').value=j.timeNote||'';
  document.getElementById('fNote').value=j.rawNote||'';
  updateLocTypeHint();
  document.querySelectorAll('.w-btn').forEach(b=>b.classList.toggle('sel',parseInt(b.dataset.sz)===selWheel));
  document.getElementById('editModal').classList.remove('hidden');
  // Switch to manage-accessible view
  if (currentTab==='manage') setTimeout(()=>document.getElementById('editModal').classList.remove('hidden'),10);
}

function closeEditModal() { document.getElementById('editModal').classList.add('hidden'); editingId=null; }

function pickWheel(sz) {
  selWheel = selWheel===sz ? 0 : sz;
  document.querySelectorAll('.w-btn').forEach(b=>b.classList.toggle('sel',parseInt(b.dataset.sz)===selWheel));
}

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
    wheelSize:   selWheel,
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


// ── Tab navigation ────────────────────────────────────────────
function switchTab(tab) {
  currentTab=tab;
  document.getElementById('tabSummary').style.display = tab==='summary'?'block':'none';
  document.getElementById('tabManage').style.display  = tab==='manage' ?'block':'none';
  document.getElementById('tabBtnSummary').classList.toggle('active', tab==='summary');
  document.getElementById('tabBtnManage').classList.toggle('active',  tab==='manage');
  if (tab==='manage') renderManage();
}

function setFilter(f, el) {
  manFilter=f;
  document.querySelectorAll('.pill').forEach(p=>{ p.classList.toggle('on',p===el); p.classList.toggle('off',p!==el); });
  renderManage();
}

// ── Utils ─────────────────────────────────────────────────────
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

// Close modals on overlay click
document.getElementById('parserModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeParserModal(); });
document.getElementById('editModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeEditModal(); });

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
        document.getElementById('sortLabel').style.color = isManualSort ? '#3b82f6' : '#475569';
      }
    }
  } catch{}
  loadJobs();
  refreshDistances();
  renderAll();
  updateClock();
  setInterval(updateClock, 15000);
  // Auto-request GPS on first visit
  if (!userLoc) setTimeout(requestLocation, 1200);
})();
