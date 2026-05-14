'use strict';

console.log('[app.js] Starting...');

// ==================== IMPORTS ====================
import Store from './core/store.js';
import * as Constants from './core/constants.js';
import * as Formatters from './utils/formatters.js';
import * as Validators from './utils/validators.js';
import * as Supabase from './services/supabase.js';
import * as Location from './services/location.js';
import * as Parser from './services/parser/index.js';

// ==================== STATE ====================
let supabaseClient = null;
let isManualSort = false;

// ==================== INITIALIZATION ====================
async function initApp() {
  // Initialize store from localStorage
  Store.initFromStorage();

  // Load manual sort preference
  const savedSort = localStorage.getItem('logis_manualSort');
  if (savedSort !== null) {
    isManualSort = savedSort === 'true';
    const toggle = document.getElementById('sortToggle');
    if (toggle) {
      toggle.checked = isManualSort;
      const label = document.getElementById('sortLabel');
      if (label) {
        label.textContent = isManualSort ? 'MANUAL' : 'AUTO';
        label.style.color = isManualSort ? '#60a5fa' : '#7a8ba0';
      }
    }
  }

  // Initialize Supabase
  const supabaseInitialized = Supabase.initSupabaseService();
  if (supabaseInitialized) {
    supabaseClient = Supabase.getSupabase();
    console.log('[app.js] Supabase initialized');

    // Load data
    Supabase.loadJobs();
    Location.refreshDistances();
    renderAll();
    Formatters.updateClock();

    // Set up intervals
    setInterval(Formatters.updateClock, 15000);
    setInterval(() => {
      const userLoc = Store.get('userLoc');
      if (userLoc) {
        Location.refreshDistances();
        renderAll();
      }
    }, 60000);

    // Auto cleanup
    setTimeout(Supabase.runAutoCleanup, 3000);
    setInterval(Supabase.runAutoCleanup, 5 * 60000);

    // Request GPS on first visit
    const userLoc = Store.get('userLoc');
    if (!userLoc) setTimeout(Location.requestLocation, 1200);
  } else {
    // Poll for Supabase
    let retries = 30;
    const poll = setInterval(() => {
      const initialized = Supabase.initSupabaseService();
      if (initialized || retries-- <= 0) {
        clearInterval(poll);
        if (initialized) {
          initApp();
        }
      }
    }, 100);
  }

  console.log('[app.js] App initialized successfully ✅');
}

// ==================== RENDER HELPERS ====================
function getSorted() {
  const jobs = Store.get('jobs') || [];
  const pending = jobs.filter(j => j.status === 'pending' && !j.postponed).sort((a, b) => {
    if (isManualSort) {
      return (a.priority || 0) - (b.priority || 0);
    }
    if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
    if (a.distance_km != null) return -1;
    if (b.distance_km != null) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const postponed = jobs
    .filter(j => j.status === 'pending' && j.postponed)
    .sort((a, b) => new Date(a.postpone_date || '9999') - new Date(b.postpone_date || '9999'));
  const done = jobs
    .filter(j => j.status === 'done')
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
  return { pending, postponed, done };
}

// ==================== RENDER FUNCTIONS ====================
function renderKPIs() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];
  const { pending, done } = getSorted();
  const tod = Formatters.todayStr();
  const todJobs = jobs.filter(j => j.date === tod && !j.postponed);
  const todExpenses = expenses.filter(e => e.date === tod);

  const totalExpense =
    todJobs.reduce((s, j) => s + (j.price || 0), 0) +
    todExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  const totalWheels = todJobs.reduce((s, j) => s + (j.quantity || 0), 0);

  const kpiPending = document.getElementById('kpiPending');
  const kpiDone = document.getElementById('kpiDone');
  const kpiTotalExpense = document.getElementById('kpiTotalExpense');
  const kpiWheels = document.getElementById('kpiWheels');

  if (kpiPending) kpiPending.textContent = pending.length;
  if (kpiDone) kpiDone.textContent = done.length;
  if (kpiTotalExpense) kpiTotalExpense.textContent = totalExpense.toLocaleString('th-TH');
  if (kpiWheels) kpiWheels.textContent = totalWheels.toLocaleString('th-TH');
}

function renderAll() {
  renderKPIs();
  renderPending();
  renderPostponed();
  renderDone();
  const currentTab = Store.get('currentTab');
  if (currentTab === 'manage') renderManage();
  if (currentTab === 'expense') renderExpense();
}

function renderPending() {
  const { pending } = getSorted();
  const etaList = Location.calcETAClocks(pending);
  const el = document.getElementById('pendingSec');
  if (!el) return;

  if (!pending.length) {
    el.innerHTML = `
      <div class="empty">
        <div style="font-size:44px;margin-bottom:10px;">🎉</div>
        <div style="font-size:15px;font-weight:600;color:#334155;margin-bottom:4px;">ยังไม่มีงาน</div>
        <div style="font-size:12px;">เพิ่มงานใหม่หรือวางข้อความจากแชทด้านบน</div>
      </div>`;
    return;
  }

  el.innerHTML =
    `<div class="sec-h">งานค้าง (${pending.length})</div>` +
    pending.map((j, i) => cardPending(j, i + 1, etaList[i])).join('');
}

function cardPending(j, pri, etaInfo) {
  const mapsUrl = Location.buildMapsUrl(j);
  const distBadge =
    j.distance_km != null ? `<span class="dist-badge">${j.distance_km.toFixed(1)} กม.</span>` : '';
  const timeBadge = j.time_note ? `<span class="time-tag">⏰ ${Formatters.esc(j.time_note)}</span>` : '';
  const locIcon = Constants.LOC_ICON[j.locationType] || '📍';
  const locLabel = Constants.LOC_LABEL[j.locationType] || '';
  const etaBadge = etaInfo
    ? `<span class="eta-badge">🕐 ${Formatters.formatETAClock(etaInfo.etaTime)}</span>`
    : '';

  const moveControls = isManualSort
    ? `
    <div style="display:flex;gap:6px;margin-left:10px;">
      <button class="move-btn" onclick="event.stopPropagation();moveJob('${j.id}', -1)" title="เลื่อนขึ้น" ${
          pri === 1 ? 'disabled' : ''
        }>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="move-btn" onclick="event.stopPropagation();moveJob('${j.id}', 1)" title="เลื่อนลง">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
  `
    : '';

  return `
  <div class="job-pending mb-3 fade-up" style="animation-delay:${(pri - 1) * 0.04}s" onclick="openDetailModal('${j.id}')">
    <div style="padding:15px 16px;">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <span class="badge${pri === 1 ? ' p1' : ''}">#${pri}</span>
        <span style="font-size:16px;font-weight:700;color:#0f172a;flex:1;line-height:1.3;">${Formatters.esc(
          j.customer_name || 'ไม่ระบุชื่อ'
        )}</span>
        <div style="display:flex;align-items:flex-end;gap:8px;">
           <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
             ${distBadge}
             ${etaBadge}
           </div>
           ${moveControls}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
        ${Formatters.getPhones(j.phone)
          .map(
            p => `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#334155;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8899b0" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>
          ${Formatters.esc(p)}</div>`
          )
          .join('')}
        ${
          j.location_raw
            ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;">
          <span>${locIcon}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Formatters.esc(
            j.location_raw
          )}</span>
          <span style="font-size:10px;background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;color:#334155;flex-shrink:0;">${locLabel}</span>
        </div>`
            : ''
        }
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${
            j.price
              ? `<span style="font-size:13px;color:#f87171;font-weight:600;">จ่าย ฿${j.price.toLocaleString(
                  'th-TH'
                )}</span>`
              : ''
          }
          ${
            j.wheelSizes && j.wheelSizes.length > 0
              ? j.wheelSizes
                  .map(
                    ws => `<span style="font-size:11px;color:#c4b5fd;background:rgba(196,181,253,0.1);padding:2px 7px;border-radius:5px;border:1px solid rgba(196,181,253,0.2);">🔵 ${ws.size}" ×${ws.qty}</span>`
                  )
                  .join('')
              : j.wheel_str
                ? `<span style="font-size:12px;color:#334155;">${Formatters.esc(j.wheel_str)}</span>`
                : ''
          }
          ${
            j.quantity
              ? `<span style="font-size:12px;color:#c4b5fd;font-weight:600;">(รวม ${j.quantity} วง)</span>`
              : ''
          }
          ${
            j.tags
              ? `<span style="font-size:11px;background:rgba(255,255,255,0.08);color:#334155;padding:2px 6px;border-radius:6px;">🏷️ ${Formatters.esc(
                  j.tags
                )}</span>`
              : ''
          }
          ${timeBadge}
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;" onclick="event.stopPropagation()">
        ${Formatters.getPhones(j.phone)
          .map(
            p => `<a href="tel:${p}" class="btn-call" style="flex:1;min-width:70px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.96h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 18Z"/></svg>โทร</a>`
          )
          .join('')}
        ${
          mapsUrl
            ? `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:1.5;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>นำทาง</a>`
            : ''
        }
        <button onclick="openPostponeModal('${j.id}')" class="btn-postpone" style="flex:1;">🔄 เลื่อน</button>
        <button onclick="completeJob('${j.id}')" class="btn-done" style="flex:1;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg>เสร็จ</button>
      </div>
    </div>
  </div>`;
}

function renderPostponed() {
  const { postponed } = getSorted();
  const el = document.getElementById('postponedSec');
  if (!el) return;
  if (!postponed.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    `<div class="sec-h">เลื่อนนัด (${postponed.length})</div>` +
    postponed
      .map(j => {
        const dateLabel = j.postpone_date
          ? new Date(j.postpone_date).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: '2-digit'
            })
          : 'ไม่มีกำหนด';
        return `
      <div class="job-postponed mb-2" onclick="openDetailModal('${j.id}')">
        <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;">
          <div style="width:20px;height:20px;background:rgba(251,191,36,0.13);border:1px solid rgba(251,191,36,0.28);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:10px;">🔄</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#334155;">${Formatters.esc(
              j.customer_name || 'ไม่ระบุชื่อ'
            )}</div>
            <div style="font-size:11px;color:#334155;">📅 ${dateLabel}</div>
          </div>
          <button onclick="event.stopPropagation();undoPostpone('${j.id}')" style="font-size:11px;color:#fbbf24;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:4px 9px;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">คืนคิว</button>
        </div>
      </div>`;
      })
      .join('');
}

function renderDone() {
  const { done } = getSorted();
  const el = document.getElementById('doneSec');
  if (!el) return;
  if (!done.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    `<div class="sec-h" style="margin-top:20px;">เสร็จแล้ว (${done.length})</div>` +
    done
      .map(
        j => `
    <div class="job-done mb-2">
      <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;">
        <div style="width:20px;height:20px;background:rgba(74,222,128,0.13);border:1px solid rgba(74,222,128,0.28);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#6b7f99;text-decoration:line-through;">${Formatters.esc(
            j.customer_name || 'ไม่ระบุชื่อ'
          )}</div>
          ${
            j.price
              ? `<div style="font-size:11px;color:#5a6d84;">${j.price.toLocaleString('th-TH')} ฿</div>`
              : ''
          }
        </div>
        <button onclick="undoJob('${j.id}')" style="font-size:11px;color:#334155;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 9px;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">ย้อน</button>
      </div>
    </div>`
      )
      .join('');
}

function renderManage() {
  const jobs = Store.get('jobs') || [];
  const tod = Formatters.todayStr();
  const manFilter = Store.get('manFilter') || 'all';
  let list = [...jobs];

  if (manFilter === 'pending') list = list.filter(j => j.status === 'pending');
  else if (manFilter === 'done') list = list.filter(j => j.status === 'done');
  else if (manFilter === 'today') list = list.filter(j => j.date === tod);

  const searchInput = document.getElementById('manSearch');
  const searchQuery = searchInput?.value?.toLowerCase().trim() || '';
  if (searchQuery) {
    list = list.filter(j => {
      const name = (j.customer_name || '').toLowerCase();
      const phone = (j.phone || '').toLowerCase();
      const location = (j.location_raw || '').toLowerCase();
      const tags = (j.tags || '').toLowerCase();
      const wheelStr = (j.wheel_str || '').toLowerCase();
      return (
        name.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        location.includes(searchQuery) ||
        tags.includes(searchQuery) ||
        wheelStr.includes(searchQuery)
      );
    });
  }

  list.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const manCount = document.getElementById('manCount');
  const el = document.getElementById('manList');
  if (manCount) manCount.textContent = `${list.length} รายการ`;

  if (!list.length) {
    if (el)
      el.innerHTML = `<div class="empty"><div style="font-size:36px;margin-bottom:8px;">📭</div><div style="font-size:14px;">ไม่พบรายการ</div></div>`;
    return;
  }

  if (el)
    el.innerHTML = list
      .map(
        j => `
    <div class="man-item mb-3 ${j.status === 'done' ? 'done-item' : ''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:7px;flex:1;">
          <span style="width:8px;height:8px;border-radius:50%;background:${
            j.status === 'pending' ? '#3b82f6' : '#22c55e'
          };flex-shrink:0;"></span>
          <span style="font-size:14px;font-weight:600;color:${
            j.status === 'pending' ? '#f1f5f9' : '#6b7280'
          };">${Formatters.esc(j.customer_name || 'ไม่ระบุชื่อ')}</span>
          ${
            j.postponed
              ? `<span style="font-size:10px;background:rgba(251,191,36,0.1);color:#fbbf24;padding:1px 6px;border:1px solid rgba(251,191,36,0.2);border-radius:4px;margin-left:4px;font-weight:700;">เลื่อนนัด</span>`
              : ''
          }
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
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#334155;margin-bottom:5px;">
        ${
          j.phone
            ? `<span>📞 ${j.phone}</span>`
            : ''
        }
        ${
          j.price
            ? `<span style="color:#ef4444;">จ่าย ฿ ${j.price.toLocaleString('th-TH')}</span>`
            : ''
        }
        ${
          j.wheel_str
            ? `<span>🔵 ${Formatters.esc(j.wheel_str)}</span>`
            : ''
        }
        ${
          j.quantity
            ? `<span style="color:#c4b5fd;">( ${j.quantity} วง )</span>`
            : ''
        }
        ${
          j.distance_km != null
            ? `<span style="color:#93c5fd;">📏 ${j.distance_km.toFixed(1)} กม.</span>`
            : ''
        }
        ${
          j.time_note
            ? `<span style="color:#fca5a5;">⏰ ${Formatters.esc(j.time_note)}</span>`
            : ''
        }
        ${
          j.tags
            ? `<span style="color:#94a3b8;background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:4px;">🏷️ ${Formatters.esc(
                j.tags
              )}</span>`
            : ''
        }
      </div>
      ${
        j.location_raw
          ? `<div style="font-size:11px;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${Constants.LOC_ICON[j.locationType] || '📍'} ${Formatters.esc(j.location_raw)}</div>`
          : ''
      }
      <div style="margin-top:6px;font-size:10px;color:#374151;">
        ${new Date(j.created_at).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })}
        ${j.status === 'done' ? ' • ✓ เสร็จแล้ว' : ''}
      </div>
    </div>`
      )
      .join('');
}

function renderExpense() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];
  const tod = Formatters.todayStr();
  const todJobs = jobs.filter(j => j.date === tod && (j.price || 0) > 0);
  const todExpenses = expenses.filter(e => e.date === tod);

  const list = [];
  todJobs.forEach(j => {
    list.push({ isJob: true, title: `ค่าล้อ: ${j.customer_name}`, amount: j.price, time: j.created_at });
  });
  todExpenses.forEach(e => {
    list.push({ isJob: false, id: e.id, title: e.name, amount: e.amount, tags: e.tags, time: e.created_at });
  });

  list.sort((a, b) => new Date(b.time) - new Date(a.time));

  const el = document.getElementById('expenseList');
  if (!list.length) {
    if (el)
      el.innerHTML = `<div class="empty"><div style="font-size:36px;margin-bottom:8px;">💸</div><div style="font-size:14px;">ยังไม่มีรายจ่ายวันนี้</div></div>`;
    return;
  }

  if (el)
    el.innerHTML = list
      .map(
        e => `
    <div class="man-item mb-2" style="background:${
      e.isJob ? 'rgba(255,255,255,0.9)' : 'rgba(254,226,226,0.5)'
    };border-color:${
      e.isJob ? 'rgba(0,0,0,0.05)' : 'rgba(239,68,68,0.15)'
    };">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:4px;">
            ${e.isJob ? '🚚 ' : '💸 '}${Formatters.esc(e.title)}
          </div>
          ${
            e.tags
              ? `<span style="font-size:10px;background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;color:#94a3b8;">${Formatters.esc(
                  e.tags
                )}</span>`
              : ''
          }
          <div style="font-size:10px;color:#334155;margin-top:6px;">${new Date(e.time).toLocaleTimeString(
            'th-TH',
            { hour: '2-digit', minute: '2-digit' }
          )}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#ef4444;">- ${e.amount.toLocaleString(
            'th-TH'
          )} ฿</div>
          ${
            !e.isJob
              ? `<button onclick="deleteExpense('${e.id}')" style="margin-top:5px;font-size:10px;color:#94a3b8;background:transparent;border:1px solid #475569;border-radius:4px;padding:2px 6px;">ลบ</button>`
              : `<span style="font-size:10px;color:#334155;">(อัตโนมัติ)</span>`
          }
        </div>
      </div>
    </div>`
      )
      .join('');
}

// ==================== ACTION FUNCTIONS ====================
async function completeJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  await Supabase.completeJob(id);
  Formatters.toast(`✅ "${j.customer_name}" เสร็จแล้ว`, 'ok');
}

async function undoJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  await Supabase.undoJob(id).catch(err => {
    console.error('[Supabase] Error undo job:', err.message);
    Formatters.toast('❌ ไม่สามารถย้ายกลับได้: ' + err.message, 'err');
  });
  Formatters.toast(`↩️ ย้าย "${j.customer_name}" กลับ`, 'info');
}

function doConfirmDelete(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  Store.set('delTargetId', id);
  document.getElementById('cfTitle').textContent = 'ลบงาน?';
  document.getElementById('cfMsg').textContent = `ลบ "${j.customer_name}" ออกจากรายการ ไม่สามารถกู้คืนได้`;
  document.getElementById('confirmDlg').classList.remove('hidden');
}

async function deleteJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  await Supabase.deleteJob(id).catch(err => {
    console.error('[Supabase] Error deleting job:', err.message);
    Formatters.toast('❌ ไม่สามารถลบงานได้: ' + err.message, 'err');
  });
  Formatters.toast(`🗑️ ลบ "${j.customer_name}" แล้ว`, 'err');
}

async function toggleSortMode(val) {
  isManualSort = val;
  localStorage.setItem('logis_manualSort', val);
  const sortLabel = document.getElementById('sortLabel');
  if (sortLabel) {
    sortLabel.textContent = val ? 'MANUAL' : 'AUTO';
    sortLabel.style.color = val ? '#3b82f6' : '#475569';
  }

  if (val) {
    const { pending } = getSorted();
    for (let i = 0; i < pending.length; i++) {
      await Supabase.updateJobPriority(pending[i].id, i);
    }
  }
  renderAll();
  Formatters.toast(val ? '🔧 เข้าสู่โหมดจัดลำดับเอง' : '📍 กลับสู่โหมดเรียงตามระยะทาง', 'info');
}

async function moveJob(id, dir) {
  const { pending } = getSorted();
  const idx = pending.findIndex(j => j.id === id);
  if (idx === -1) return;

  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= pending.length) return;

  const current = pending[idx];
  const target = pending[targetIdx];

  await Supabase.updateJobPriority(current.id, target.priority);
  await Supabase.updateJobPriority(target.id, current.priority);
  renderAll();
}

// ==================== PARSER MODAL ====================
function openParserModal() {
  document.getElementById('parserModal').classList.remove('hidden');
  document.getElementById('parserInput').value = '';
  document.getElementById('parserPreview').style.display = 'none';
  Store.set('parsedBuf', []);
  setTimeout(() => document.getElementById('parserInput').focus(), 80);
}

function closeParserModal() {
  document.getElementById('parserModal').classList.add('hidden');
  Store.set('parsedBuf', []);
}

function runParser() {
  const raw = document.getElementById('parserInput').value.trim();
  if (!raw) {
    Formatters.toast('กรุณาวางข้อความก่อน', 'err');
    return;
  }

  const parsedBuf = Parser.parseText(raw);
  Store.set('parsedBuf', parsedBuf);
  showPreview(parsedBuf);
  document.getElementById('parserPreview').style.display = 'block';
}

function showPreview(list) {
  const el = document.getElementById('previewList');
  const btn = document.getElementById('btnSaveParser');
  if (!list.length) {
    if (el)
      el.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;">ไม่พบข้อมูลงาน — ลองตรวจสอบรูปแบบข้อความ</div>`;
    if (btn) btn.style.display = 'none';
    return;
  }
  if (btn) {
    btn.style.display = 'block';
    btn.textContent = `💾 บันทึก ${list.length} งาน`;
  }
  if (el)
    el.innerHTML = list
      .map(
        (j, i) => {
          const wheelBadges =
            j.wheelSizes && j.wheelSizes.length > 0
              ? j.wheelSizes
                  .map(
                    ws => `<span style="color:#c4b5fd;background:rgba(196,181,253,0.12);padding:1px 6px;border-radius:5px;border:1px solid rgba(196,181,253,0.25);">🔵 ${ws.size}" × ${ws.qty}วง</span>`
                  )
                  .join(' ')
              : j.quantity
                ? `<span style="color:#a5b4fc;">× ${j.quantity} วง</span>`
                : '';
          return `
      <div class="parse-card ${j.customer_name ? 'ok' : 'warn'}">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:7px;">งานที่ ${i + 1}: ${Formatters.esc(
            j.customer_name || '⚠️ ไม่พบชื่อ'
          )}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;">
          ${
            j.phone
              ? `<span style="color:#86efac;">📞 ${Formatters.esc(j.phone)}</span>`
              : `<span style="color:#f87171;">📞 ไม่พบ</span>`
          }
          ${
            j.location_raw
              ? `<span style="color:${Constants.LOC_COLOR[j.locationType]}">${
                  Constants.LOC_ICON[j.locationType]
                } ${Constants.LOC_LABEL[j.locationType]}: ${Formatters.esc(
                    j.location_raw.slice(0, 35)
                  )}${j.location_raw.length > 35 ? '…' : ''}</span>`
              : `<span style="color:#f87171;">📍 ไม่พบพิกัด</span>`
          }
          ${
            j.location_raw && j.location_raw.includes('(โลเคชั่นทางแชท)')
              ? `<div style="width:100%;margin-top:5px;"><input type="text" class="form-input loc-override" placeholder="วางลิงก์พิกัดที่นี่..." style="font-size:11px;padding:6px;width:100%;" onchange="updateParsedLoc(${i}, this.value)"></div>`
              : ''
          }
          ${
            j.price
              ? `<span style="color:#34d399;">฿ ${j.price.toLocaleString('th-TH')}</span>`
              : `<span style="color:#f87171;">฿ ไม่พบ</span>`
          }
          ${wheelBadges}
          ${
            j.time_note
              ? `<span style="color:#fca5a5;">⏰ ${Formatters.esc(j.time_note)}</span>`
              : ''
          }
          ${
            j.distance_km != null
              ? `<span style="color:#93c5fd;">📏 ${j.distance_km.toFixed(1)} กม.</span>`
              : ''
          }
        </div>
      </div>`;
        }
      )
      .join('');
}

window.updateParsedLoc = function (idx, val) {
  const parsedBuf = Store.get('parsedBuf');
  if (parsedBuf[idx]) {
    parsedBuf[idx].location_raw = val;
    parsedBuf[idx].location_type = Location.classifyLoc(val);
    const userLoc = Store.get('userLoc');
    if (parsedBuf[idx].location_type === 'coords' && userLoc) {
      const c = Location.parseCoords(val);
      if (c) parsedBuf[idx].distance_km = Location.haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
    }
  }
};

async function saveFromParser() {
  const parsedBuf = Store.get('parsedBuf');
  if (!parsedBuf.length) return;

  const jobs = Store.get('jobs') || [];
  let added = 0;
  let failed = 0;
  console.log('[Parser] Saving', parsedBuf.length, 'jobs');

  for (const j of parsedBuf) {
    const dup = j.phone && jobs.some(x => x.phone === j.phone && x.status === 'pending');
    if (!dup) {
      try {
        await Supabase.insertJob(Supabase.mapJobToDb(j));
        added++;
      } catch (err) {
        console.error('[Parser] Error inserting job:', j.customer_name, err.message);
        failed++;
      }
    }
  }

  closeParserModal();
  if (failed > 0) {
    Formatters.toast(`⚠️ บันทึก ${added} งาน, ล้มเหลว ${failed} งาน`, 'warn');
  } else {
    Formatters.toast(`✅ บันทึก ${added} งานแล้ว (Cloud Sync)`, 'ok');
  }
}

// ==================== ADD/EDIT MODAL ====================
function openAddModal() {
  Store.set('editingId', null);
  document.getElementById('editTitle').textContent = '➕ เพิ่มงานใหม่';
  document.getElementById('editId').value = '';
  ['fName', 'fPhone', 'fLocation', 'fPrice', 'fQty', 'fTime', 'fNote', 'fWheelStr', 'fTags'].forEach(
    id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    }
  );
  document.getElementById('locTypeHint').textContent = '';
  document.getElementById('editModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}

function openEditById(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  Store.set('editingId', id);
  document.getElementById('editTitle').textContent = '✏️ แก้ไขงาน';
  document.getElementById('editId').value = id;
  document.getElementById('fName').value = j.customer_name || '';
  document.getElementById('fPhone').value = j.phone || '';
  document.getElementById('fLocation').value = j.location_raw || '';
  document.getElementById('fPrice').value = j.price || '';
  if (document.getElementById('fWheelStr'))
    document.getElementById('fWheelStr').value = j.wheel_str || '';
  if (document.getElementById('fTags')) document.getElementById('fTags').value = j.tags || '';
  document.getElementById('fQty').value = j.quantity || '';
  document.getElementById('fTime').value = j.time_note || '';
  document.getElementById('fNote').value = j.raw_note || '';
  updateLocTypeHint();
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  Store.set('editingId', null);
}

function updateLocTypeHint() {
  const raw = document.getElementById('fLocation').value;
  const hint = document.getElementById('locTypeHint');
  if (!raw) {
    if (hint) hint.textContent = '';
    return;
  }
  const t = Location.classifyLoc(raw);
  if (hint) {
    hint.textContent = `${Constants.LOC_ICON[t]} ${Constants.LOC_LABEL[t]}`;
    hint.style.color = Constants.LOC_COLOR[t];
  }
}

function saveJob() {
  const name = document.getElementById('fName').value.trim();
  const validationErrors = Validators.validateJobForm();
  if (Validators.showValidationErrors(validationErrors)) {
    document.getElementById('fName').focus();
    return;
  }

  const locRaw = document.getElementById('fLocation').value.trim();
  const locType = Location.classifyLoc(locRaw);
  let distKm = null;
  const userLoc = Store.get('userLoc');
  if (locType === 'coords' && userLoc) {
    const c = Location.parseCoords(locRaw);
    if (c) distKm = Location.haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
  }

  const data = {
    customer_name: name,
    phone: document.getElementById('fPhone').value.trim(),
    location_raw: locRaw,
    location_type: locType,
    price: parseInt(document.getElementById('fPrice').value) || 0,
    wheel_str: document.getElementById('fWheelStr')
      ? document.getElementById('fWheelStr').value.trim()
      : '',
    tags: document.getElementById('fTags') ? document.getElementById('fTags').value.trim() : '',
    quantity: parseInt(document.getElementById('fQty').value) || 0,
    time_note: document.getElementById('fTime').value.trim(),
    raw_note: document.getElementById('fNote').value.trim(),
    distance_km: distKm
  };

  const editingId = Store.get('editingId');
  if (editingId) {
    Supabase.updateJob(editingId, data)
      .then(() => {
        Formatters.toast(`✅ แก้ไข "${name}" แล้ว (Cloud Sync)`, 'ok');
      })
      .catch(err => {
        console.error('[Supabase] Error updating job:', err.message, err.details);
        Formatters.toast('❌ ไม่สามารถแก้ไขงานได้: ' + err.message, 'err');
      });
  } else {
    Supabase.insertJob(data)
      .then(() => {
        Formatters.toast(`✅ เพิ่ม "${name}" แล้ว (Cloud Sync)`, 'ok');
      })
      .catch(err => {
        console.error('[Supabase] Error inserting job:', err.message, err.details);
        Formatters.toast('❌ ไม่สามารถเพิ่มงานได้: ' + err.message, 'err');
      });
  }
  closeEditModal();
}

// ==================== EXPENSE MODAL ====================
function openExpenseModal() {
  document.getElementById('eName').value = '';
  document.getElementById('eAmount').value = '';
  document.getElementById('eTags').value = '';
  document.getElementById('expenseModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('eName').focus(), 80);
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

function saveExpense() {
  const name = document.getElementById('eName').value.trim();
  const amount = parseInt(document.getElementById('eAmount').value);
  const validationErrors = Validators.validateExpenseForm();
  if (Validators.showValidationErrors(validationErrors)) return;

  Supabase.insertExpense({
    name,
    amount,
    tags: document.getElementById('eTags').value.trim()
  })
    .then(() => {
      closeExpenseModal();
      Formatters.toast('✅ บันทึกรายจ่ายแล้ว', 'ok');
    })
    .catch(err => {
      console.error('[Supabase] Error inserting expense:', err.message, err.details);
      Formatters.toast('❌ ไม่สามารถบันทึกรายจ่ายได้: ' + err.message, 'err');
    });
}

function deleteExpense(id) {
  Store.set('delTargetId', '__exp__' + id);
  document.getElementById('cfTitle').textContent = 'ลบรายจ่าย?';
  document.getElementById('cfMsg').textContent = 'ลบรายจ่ายนี้ออกจากระบบ ไม่สามารถกู้คืนได้';
  document.getElementById('confirmDlg').classList.remove('hidden');
}

// ==================== TAB NAVIGATION ====================
function switchTab(tab) {
  Store.set('currentTab', tab);
  document.getElementById('tabSummary').style.display = tab === 'summary' ? 'block' : 'none';
  document.getElementById('tabManage').style.display = tab === 'manage' ? 'block' : 'none';
  document.getElementById('tabExpense').style.display = tab === 'expense' ? 'block' : 'none';
  document.getElementById('tabBtnSummary').classList.toggle('active', tab === 'summary');
  document.getElementById('tabBtnManage').classList.toggle('active', tab === 'manage');
  if (document.getElementById('tabBtnExpense'))
    document.getElementById('tabBtnExpense').classList.toggle('active', tab === 'expense');
  if (tab === 'manage') renderManage();
  if (tab === 'expense') renderExpense();
}

function setFilter(f, el) {
  Store.set('manFilter', f);
  document.querySelectorAll('.pill').forEach(p => {
    p.classList.toggle('on', p === el);
    p.classList.toggle('off', p !== el);
  });
  renderManage();
}

// ==================== DETAIL MODAL ====================
function openDetailModal(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  const mapsUrl = Location.buildMapsUrl(j);
  const locIcon = Constants.LOC_ICON[j.locationType] || '📍';

  let rows = '';
  rows += `<div class="detail-row"><div class="detail-label">ชื่อ</div><div class="detail-value" style="font-weight:700;font-size:16px;">${Formatters.esc(
    j.customer_name || 'ไม่ระบุ'
  )}</div></div>`;
  if (j.phone)
    rows += `<div class="detail-row"><div class="detail-label">เบอร์โทร</div><div class="detail-value">${Formatters.getPhones(
      j.phone
    )
      .map(p => `<a href="tel:${p}" style="color:#60a5fa;text-decoration:none;">${Formatters.esc(p)}</a>`)
      .join(', ')}</div></div>`;
  if (j.location_raw)
    rows += `<div class="detail-row"><div class="detail-label">${locIcon} พิกัด</div><div class="detail-value">${Formatters.esc(
      j.location_raw
    )}</div></div>`;
  if (j.price)
    rows += `<div class="detail-row"><div class="detail-label">ราคา</div><div class="detail-value" style="color:#f87171;font-weight:600;">฿${j.price.toLocaleString(
      'th-TH'
    )}</div></div>`;
  if (j.wheel_str)
    rows += `<div class="detail-row"><div class="detail-label">ล้อ</div><div class="detail-value">${Formatters.esc(
      j.wheel_str
    )}</div></div>`;
  if (j.quantity)
    rows += `<div class="detail-row"><div class="detail-label">จำนวน</div><div class="detail-value" style="color:#c4b5fd;font-weight:600;">${j.quantity} วง</div></div>`;
  if (j.tags)
    rows += `<div class="detail-row"><div class="detail-label">แท็ก</div><div class="detail-value">🏷️ ${Formatters.esc(
      j.tags
    )}</div></div>`;
  if (j.time_note)
    rows += `<div class="detail-row"><div class="detail-label">เงื่อนไข</div><div class="detail-value" style="color:#fca5a5;">⏰ ${Formatters.esc(
      j.time_note
    )}</div></div>`;
  if (j.distance_km != null)
    rows += `<div class="detail-row"><div class="detail-label">ระยะทาง</div><div class="detail-value" style="color:#93c5fd;">${j.distance_km.toFixed(
      1
    )} กม. (${Location.getETAText(j.distance_km)})</div></div>`;
  if (j.postponed) {
    const dl = j.postpone_date
      ? new Date(j.postpone_date).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: '2-digit'
        })
      : 'ไม่มีกำหนด';
    rows += `<div class="detail-row"><div class="detail-label">เลื่อนนัด</div><div class="detail-value"><span class="postpone-tag">🔄 ${dl}</span></div></div>`;
  }
  if (j.raw_note)
    rows += `<div class="detail-row"><div class="detail-label">หมายเหตุ</div><div class="detail-value" style="font-size:12px;color:#334155;white-space:pre-wrap;">${Formatters.esc(
      j.raw_note
    )}</div></div>`;
  rows += `<div class="detail-row"><div class="detail-label">สร้างเมื่อ</div><div class="detail-value" style="font-size:12px;color:#6b7f99;">${new Date(
    j.created_at
  ).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })}</div></div>`;

  document.getElementById('detailContent').innerHTML = rows;

  let actions = '';
  if (j.status === 'pending' && !j.postponed) {
    Formatters.getPhones(j.phone).forEach(p => {
      actions += `<a href="tel:${p}" class="btn-call" style="flex:1;">📞 โทร</a>`;
    });
    if (mapsUrl)
      actions += `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:1.5;">📍 นำทาง</a>`;
    actions += `<button onclick="openPostponeModal('${j.id}');closeDetailModal();" class="btn-postpone" style="flex:1;">🔄 เลื่อน</button>`;
    actions += `<button onclick="completeJob('${j.id}');closeDetailModal();" class="btn-done" style="flex:1;">✅ เสร็จ</button>`;
  }
  if (j.postponed) {
    actions += `<button onclick="undoPostpone('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">↩️ คืนคิว</button>`;
  }
  actions += `<button onclick="openEditById('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">✏️ แก้ไข</button>`;
  actions += `<button onclick="doConfirmDelete('${j.id}');closeDetailModal();" style="flex:1;padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans Thai',sans-serif;">🗑️ ลบ</button>`;

  document.getElementById('detailActions').innerHTML = actions;
  document.getElementById('detailModal').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

// ==================== POSTPONE MODAL ====================
function openPostponeModal(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);
  if (!j) return;

  document.getElementById('postponeJobId').value = id;
  document.getElementById('postponeJobName').textContent = `เลื่อนนัด "${j.customer_name || 'ไม่ระบุ'}"`;
  document.getElementById('postponeDate').value = '';
  document.getElementById('postponeModal').classList.remove('hidden');
}

function closePostponeModal() {
  document.getElementById('postponeModal').classList.add('hidden');
}

async function doPostpone(noDate) {
  const id = document.getElementById('postponeJobId').value;
  if (!id) return;
  const dateVal = noDate ? null : document.getElementById('postponeDate').value;
  if (!noDate && !dateVal) {
    Formatters.toast('กรุณาเลือกวันที่', 'err');
    return;
  }

  const jobs = Store.get('jobs') || [];
  const j = jobs.find(x => x.id === id);

  await Supabase.postponeJob(id, dateVal);
  closePostponeModal();
  const label = dateVal
    ? new Date(dateVal).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    : 'ไม่มีกำหนด';
  Formatters.toast(`🔄 เลื่อนนัด "${j ? j.customer_name : ''}" → ${label}`, 'info');
}

async function undoPostpone(id) {
  await Supabase.undoPostpone(id);
  Formatters.toast('↩️ คืนกลับเข้าคิวแล้ว', 'ok');
}

// ==================== QUEUE PARSER ====================
function openQueueParserModal() {
  document.getElementById('queueParserModal').classList.remove('hidden');
  document.getElementById('queueInput').value = '';
  document.getElementById('queuePreview').style.display = 'none';
  Store.set('queueParsedBuf', []);
  setTimeout(() => document.getElementById('queueInput').focus(), 80);
}

function closeQueueParserModal() {
  document.getElementById('queueParserModal').classList.add('hidden');
  Store.set('queueParsedBuf', []);
}

function runQueueParser() {
  const raw = document.getElementById('queueInput').value.trim();
  if (!raw) {
    Formatters.toast('กรุณาวางข้อความก่อน', 'err');
    return;
  }

  const jobs = Store.get('jobs') || [];
  const matchedJobs = Parser.parseQueue(raw, jobs);
  Store.set('queueParsedBuf', matchedJobs);

  const el = document.getElementById('queuePreviewList');
  const btn = document.getElementById('btnSaveQueue');
  if (!matchedJobs.length) {
    if (el)
      el.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;">ไม่พบรายการที่จะจัดคิว</div>`;
    if (btn) btn.style.display = 'none';
    document.getElementById('queuePreview').style.display = 'block';
    return;
  }

  if (btn) {
    btn.style.display = 'block';
    btn.textContent = `💾 บันทึกคิว ${matchedJobs.length} งาน`;
  }
  if (el)
    el.innerHTML = matchedJobs
      .map(
        (j, i) => `
    <div class="parse-card ok">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge">#${i + 1}</span>
        <span style="font-size:13px;font-weight:600;color:#0f172a;">${Formatters.esc(j.customer_name)}</span>
        <span style="font-size:11px;color:#94a3b8;flex:1;text-align:right;">${Formatters.esc(
          (j.location_raw || '').slice(0, 20)
        )}</span>
      </div>
    </div>
  `
      )
      .join('');
  document.getElementById('queuePreview').style.display = 'block';
}

async function saveFromQueueParser() {
  const queueParsedBuf = Store.get('queueParsedBuf');
  if (!queueParsedBuf.length) return;
  console.log('[QueueParser] Saving', queueParsedBuf.length, 'jobs with new priorities');

  let failed = 0;
  queueParsedBuf.forEach(async (j, i) => {
    try {
      await Supabase.updateJobPriority(j.id, i + 1);
    } catch (err) {
      console.error('[QueueParser] Error updating priority:', j.id, err.message);
      failed++;
    }
  });

  setTimeout(() => {
    closeQueueParserModal();
    if (failed > 0) {
      Formatters.toast(`⚠️ จัดคิว ${queueParsedBuf.length - failed} รายการ, ล้มเหลว ${failed}`, 'warn');
    } else {
      Formatters.toast(`✅ จัดคิว ${queueParsedBuf.length} รายการแล้ว`, 'ok');
    }
    if (!isManualSort) {
      isManualSort = true;
      localStorage.setItem('logis_manualSort', 'true');
      const toggle = document.getElementById('sortToggle');
      if (toggle) toggle.checked = true;
      const label = document.getElementById('sortLabel');
      if (label) {
        label.textContent = 'MANUAL';
        label.style.color = '#60a5fa';
      }
    }
    renderAll();
  }, 500);
}

// ==================== EXPORT/IMPORT ====================
function exportToCSV() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];

  let csvContent = '\uFEFF';
  csvContent +=
    'Type,Date,Time,Status,Completed_At,Customer_Name,Phone,Location,Price_Amount,Wheel_Sizes,Quantity,Note,Tags\n';

  let totalMoney = 0;
  let totalWheels = 0;

  jobs.forEach(j => {
    if (j.price) totalMoney += j.price;
    if (j.quantity) totalWheels += j.quantity;
    const dt = new Date(j.created_at);
    let completedStr = '';
    if (j.completed_at) {
      try {
        const cd = new Date(j.completed_at);
        completedStr =
          cd.toLocaleDateString('th-TH') +
          ' ' +
          cd.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      } catch (_) {
        completedStr = j.completed_at;
      }
    }
    const wheelSizesStr =
      j.wheelSizes && j.wheelSizes.length > 0
        ? j.wheelSizes.map(ws => `${ws.size}"×${ws.qty}วง`).join(', ')
        : j.wheel_str || '';
    const row = [
      'Job',
      dt.toLocaleDateString('th-TH'),
      dt.toLocaleTimeString('th-TH'),
      j.status,
      completedStr,
      j.customer_name,
      j.phone,
      j.location_raw,
      j.price,
      wheelSizesStr,
      j.quantity,
      (j.time_note || '') + ' ' + (j.raw_note || '').replace(/\n/g, ' '),
      j.tags
    ]
      .map(v => '"' + (v || '').toString().replace(/"/g, '""') + '"')
      .join(',');
    csvContent += row + '\n';
  });

  expenses.forEach(e => {
    const dt = new Date(e.created_at);
    const row = [
      'Expense',
      dt.toLocaleDateString('th-TH'),
      dt.toLocaleTimeString('th-TH'),
      'done',
      '',
      e.name,
      '',
      '',
      e.amount,
      '',
      '',
      '',
      e.tags
    ]
      .map(v => '"' + (v || '').toString().replace(/"/g, '""') + '"')
      .join(',');
    csvContent += row + '\n';
  });

  csvContent += `\n"Summary","","","","","","","รวมจำนวนเงินบาท",${totalMoney},"จำนวนล้อวง",${totalWheels},"","",""\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'logis_master_export_' + Formatters.todayStr() + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Formatters.toast('📥 ส่งออกไฟล์ CSV สำเร็จ', 'ok');
}

function exportBackup() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];

  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    jobs,
    expenses
  };
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'logis_backup_' + Formatters.todayStr() + '.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Formatters.toast('💾 สำรองข้อมูลสำเร็จ', 'ok');
}

function importBackup(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.jobs || !Array.isArray(data.jobs)) {
        throw new Error('Invalid backup format');
      }

      Store.set('delTargetId', '__import__');
      document.getElementById('cfTitle').textContent = 'กู้คืนข้อมูล?';
      document.getElementById('cfMsg').textContent = `พบ ${data.jobs.length} งาน และ ${(
        data.expenses || []
      ).length} รายจ่าย จะเขียนทับข้อมูลปัจจุบัน`;
      document.getElementById('confirmDlg').classList.remove('hidden');

      window.importData = data;
    } catch (err) {
      Formatters.toast('❌ ไฟล์ backup ไม่ถูกต้อง', 'err');
      console.error('Import error:', err);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function doImportBackup() {
  const data = window.importData;
  if (!data) return;

  const supabase = Supabase.getSupabase();
  if (!supabase) return;

  if (data.jobs && data.jobs.length > 0) {
    data.jobs.forEach(async j => {
      if (j.id) {
        await supabase.from(Constants.COLLECTION_JOBS).upsert(j).catch(() => {});
      }
    });
  }

  if (data.expenses && data.expenses.length > 0) {
    data.expenses.forEach(async e => {
      if (e.id) {
        await supabase.from(Constants.COLLECTION_EXPENSES).upsert(e).catch(() => {});
      }
    });
  }

  setTimeout(() => {
    Formatters.toast('✅ กู้คืนข้อมูลสำเร็จ', 'ok');
    window.importData = null;
    Supabase.loadJobs();
  }, 1000);
}

// ==================== THEME ====================
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('logis_theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.innerHTML = isDark
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8899b0" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

function initTheme() {
  const saved = localStorage.getItem('logis_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
  updateThemeIcon();
}

// ==================== EVENT BINDINGS ====================
function initEventBindings() {
  // Confirm dialog
  document.getElementById('cfCancel').onclick = () => {
    document.getElementById('confirmDlg').classList.add('hidden');
    Store.set('delTargetId', null);
  };
  document.getElementById('cfOk').onclick = () => {
    const delTargetId = Store.get('delTargetId');
    if (delTargetId) {
      if (delTargetId.startsWith('__exp__')) {
        Supabase.deleteExpense(delTargetId.slice(7)).then(() =>
          Formatters.toast('🗑️ ลบแล้ว', 'ok')
        );
      } else if (delTargetId === '__import__') {
        doImportBackup();
      } else {
        deleteJob(delTargetId);
      }
      Store.set('delTargetId', null);
    }
    document.getElementById('confirmDlg').classList.add('hidden');
  };

  // Modal close on overlay click
  document.getElementById('parserModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeParserModal();
  });
  document.getElementById('editModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document.getElementById('detailModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.getElementById('postponeModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePostponeModal();
  });
  document.getElementById('queueParserModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeQueueParserModal();
  });
}

// ==================== EXPOSE TO WINDOW ====================
function exposeToWindow() {
  window.toggleTheme = toggleTheme;
  window.requestLocation = Location.requestLocation;
  window.openAddModal = openAddModal;
  window.openParserModal = openParserModal;
  window.openQueueParserModal = openQueueParserModal;
  window.closeQueueParserModal = closeQueueParserModal;
  window.runQueueParser = runQueueParser;
  window.saveFromQueueParser = saveFromQueueParser;
  window.exportToCSV = exportToCSV;
  window.exportBackup = exportBackup;
  window.setFilter = setFilter;
  window.openExpenseModal = openExpenseModal;
  window.switchTab = switchTab;
  window.closeParserModal = closeParserModal;
  window.runParser = runParser;
  window.saveFromParser = saveFromParser;
  window.closeEditModal = closeEditModal;
  window.saveJob = saveJob;
  window.closeExpenseModal = closeExpenseModal;
  window.saveExpense = saveExpense;
  window.closeDetailModal = closeDetailModal;
  window.closePostponeModal = closePostponeModal;
  window.doPostpone = doPostpone;
  window.moveJob = moveJob;
  window.openDetailModal = openDetailModal;
  window.openPostponeModal = openPostponeModal;
  window.completeJob = completeJob;
  window.undoJob = undoJob;
  window.undoPostpone = undoPostpone;
  window.doConfirmDelete = doConfirmDelete;
  window.openEditById = openEditById;
  window.deleteExpense = deleteExpense;
  window.updateLocTypeHint = updateLocTypeHint;
  window.updateParsedLoc = window.updateParsedLoc;
  window.toggleSortMode = toggleSortMode;
  window.importBackup = importBackup;

  console.log('[app.js] All functions exposed to window');
}

// ==================== SUBSCRIBE TO STORE ====================
Store.subscribe((key, value) => {
  if (key === 'jobs' || key === 'expenses') {
    renderAll();
  }
});

// ==================== MAIN INIT ====================
initTheme();
initEventBindings();
initApp();
exposeToWindow();

console.log('[app.js] Module loaded successfully');