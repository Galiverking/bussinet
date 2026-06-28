'use strict';

import Store from '../core/store.js';
import * as Constants from '../core/constants.js';
import * as Formatters from '../utils/formatters.js';
import * as Location from '../services/location.js';

// ==================== SORTING ====================
export function getSorted() {
  const jobs = Store.get('jobs') || [];
  const pending = jobs
    .filter((j) => j.status === 'pending' && !j.postponed)
    .sort((a, b) => {
      if (window.isManualSort) {
        return (a.priority || 0) - (b.priority || 0);
      }
      if (a.distance_km != null && b.distance_km != null)
        return a.distance_km - b.distance_km;
      if (a.distance_km != null) return -1;
      if (b.distance_km != null) return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  const postponed = jobs
    .filter((j) => j.status === 'pending' && j.postponed)
    .sort(
      (a, b) =>
        new Date(a.postpone_date || '9999') -
        new Date(b.postpone_date || '9999')
    );
  const done = jobs
    .filter((j) => j.status === 'done')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at) -
        new Date(a.completed_at || a.created_at)
    );
  return { pending, postponed, done };
}

// ==================== RENDER KPI ====================
function renderKPIs() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];
  const { pending, done } = getSorted();
  const tod = Formatters.todayStr();
  const todJobs = jobs.filter((j) => j.date === tod && !j.postponed);
  const todExpenses = expenses.filter((e) => e.date === tod);

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
  if (kpiTotalExpense)
    kpiTotalExpense.textContent = totalExpense.toLocaleString('th-TH');
  if (kpiWheels) kpiWheels.textContent = totalWheels.toLocaleString('th-TH');
}

// ==================== RENDER PENDING ====================
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
    j.distance_km != null
      ? `<span class="dist-badge">${j.distance_km.toFixed(1)} กม.</span>`
      : '';
  const timeBadge = j.time_note
    ? `<span class="time-tag">⏰ ${Formatters.esc(j.time_note)}</span>`
    : '';
  const locIcon = Constants.LOC_ICON[j.locationType] || '📍';
  const locLabel = Constants.LOC_LABEL[j.locationType] || '';
  const etaBadge = etaInfo
    ? `<span class="eta-badge">🕐 ${Formatters.formatETAClock(etaInfo.etaTime)}</span>`
    : '';

  const moveControls = window.isManualSort
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
            (
              p
            ) => `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#334155;">
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
                    (ws) =>
                      `<span style="font-size:11px;color:#c4b5fd;background:rgba(196,181,253,0.1);padding:2px 7px;border-radius:5px;border:1px solid rgba(196,181,253,0.2);">🔵 ${ws.size}" ×${ws.qty}</span>`
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
            (
              p
            ) => `<a href="tel:${p}" class="btn-call" style="flex:1;min-width:70px;">
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

// ==================== RENDER POSTPONED ====================
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
      .map((j) => {
        const dateLabel = j.postpone_date
          ? new Date(j.postpone_date).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: '2-digit',
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

// ==================== RENDER DONE ====================
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
        (j) => `
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

// ==================== RENDER MANAGE ====================
function renderManage() {
  const jobs = Store.get('jobs') || [];
  const tod = Formatters.todayStr();
  const manFilter = Store.get('manFilter') || 'all';
  let list = [...jobs];

  if (manFilter === 'pending')
    list = list.filter((j) => j.status === 'pending');
  else if (manFilter === 'done') list = list.filter((j) => j.status === 'done');
  else if (manFilter === 'today') list = list.filter((j) => j.date === tod);

  const searchInput = document.getElementById('manSearch');
  const searchQuery = searchInput?.value?.toLowerCase().trim() || '';
  if (searchQuery) {
    list = list.filter((j) => {
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
        (j) => `
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
        ${j.phone ? `<span>📞 ${j.phone}</span>` : ''}
        ${
          j.price
            ? `<span style="color:#ef4444;">จ่าย ฿ ${j.price.toLocaleString('th-TH')}</span>`
            : ''
        }
        ${j.wheel_str ? `<span>🔵 ${Formatters.esc(j.wheel_str)}</span>` : ''}
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
          minute: '2-digit',
        })}
        ${j.status === 'done' ? ' • ✓ เสร็จแล้ว' : ''}
      </div>
    </div>`
      )
      .join('');
}

// ==================== RENDER EXPENSE ====================
function renderExpense() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];
  const tod = Formatters.todayStr();
  const todJobs = jobs.filter((j) => j.date === tod && (j.price || 0) > 0);
  const todExpenses = expenses.filter((e) => e.date === tod);

  const list = [];
  todJobs.forEach((j) => {
    list.push({
      isJob: true,
      title: `ค่าล้อ: ${j.customer_name}`,
      amount: j.price,
      time: j.created_at,
    });
  });
  todExpenses.forEach((e) => {
    list.push({
      isJob: false,
      id: e.id,
      title: e.name,
      amount: e.amount,
      tags: e.tags,
      time: e.created_at,
    });
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
        (e) => `
    <div class="man-item mb-2" style="background:${
      e.isJob ? 'rgba(255,255,255,0.9)' : 'rgba(254,226,226,0.5)'
    };border-color:${e.isJob ? 'rgba(0,0,0,0.05)' : 'rgba(239,68,68,0.15)'};">
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
          <div style="font-size:10px;color:#334155;margin-top:6px;">${new Date(
            e.time
          ).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          })}</div>
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

// ==================== RENDER ALL ====================
export function renderAll() {
  renderKPIs();
  renderPending();
  renderPostponed();
  renderDone();
  const currentTab = Store.get('currentTab');
  if (currentTab === 'manage') renderManage();
  if (currentTab === 'expense') renderExpense();
}
