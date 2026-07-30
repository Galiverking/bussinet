'use strict';

import Store from '../core/store.js';
import * as Constants from '../core/constants.js';
import * as Formatters from '../utils/formatters.js';
import * as Validators from '../utils/validators.js';
import * as Supabase from '../services/supabase.js';
import * as Location from '../services/location.js';
import * as Parser from '../services/parser/index.js';
import Logger from '../utils/logger.js';
import { renderAll } from './renderer.js';

// ==================== PARSER MODAL ====================
export function openParserModal() {
  document.getElementById('parserModal').classList.remove('hidden');
  document.getElementById('parserInput').value = '';
  document.getElementById('parserPreview').style.display = 'none';
  Store.set('parsedBuf', []);
  setTimeout(() => document.getElementById('parserInput').focus(), 80);
}

export function closeParserModal() {
  document.getElementById('parserModal').classList.add('hidden');
  Store.set('parsedBuf', []);
}

export function runParser() {
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
      .map((j, i) => {
        const wheelBadges =
          j.wheelSizes && j.wheelSizes.length > 0
            ? j.wheelSizes
                .map((ws) => {
                  const label = ws.rim
                    ? `${ws.width}/${ws.profile}R${ws.rim}`
                    : `${ws.width}/${ws.profile}`;
                  const qty = j.quantity ? ` × ${j.quantity}วง` : '';
                  return `<span style="color:#c4b5fd;background:rgba(196,181,253,0.12);padding:1px 6px;border-radius:5px;border:1px solid rgba(196,181,253,0.25);">🔵 ${label}${qty}</span>`;
                })
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
      })
      .join('');
}

export function updateParsedLoc(idx, val) {
  const parsedBuf = Store.get('parsedBuf');
  if (parsedBuf[idx]) {
    parsedBuf[idx].location_raw = val;
    parsedBuf[idx].location_type = Location.classifyLoc(val);
    const userLoc = Store.get('userLoc');
    if (parsedBuf[idx].location_type === 'coords' && userLoc) {
      const c = Location.parseCoords(val);
      if (c)
        parsedBuf[idx].distance_km = Location.haversine(
          userLoc.lat,
          userLoc.lng,
          c.lat,
          c.lng
        );
    }
  }
}

export async function saveFromParser() {
  const parsedBuf = Store.get('parsedBuf');
  if (!parsedBuf.length) return;

  const jobs = Store.get('jobs') || [];
  let added = 0;
  let failed = 0;
  const savedJobs = []; // [FIX 2026-07-30] เก็บ jobs ที่บันทึกสำเร็จ
  Logger.info('Parser', 'Saving', parsedBuf.length, 'jobs');

  for (const j of parsedBuf) {
    const dup =
      j.phone &&
      jobs.some((x) => x.phone === j.phone && x.status === 'pending');
    if (!dup) {
      try {
        const res = await Supabase.insertJob(Supabase.mapJobToDb(j));
        if (res?.error) throw res.error;
        savedJobs.push(j); // [FIX] เก็บไว้ใช้ใน Store
        added++;
      } catch (err) {
        Logger.error(
          'Parser',
          'Error inserting job:',
          j.customer_name,
          err.message
        );
        failed++;
      }
    }
  }

  closeParserModal();

  // [FIX 2026-07-30] อัปเดต Local Store + re-render
  if (savedJobs.length > 0) {
    Store.set('jobs', [...jobs, ...savedJobs]);
    renderAll();
  }

  if (failed > 0) {
    Formatters.toast(`⚠️ บันทึก ${added} งาน, ล้มเหลว ${failed} งาน`, 'warn');
  } else {
    Formatters.toast(`✅ บันทึก ${added} งานแล้ว (Cloud Sync)`, 'ok');
  }
}

// ==================== ADD/EDIT MODAL ====================
export function openAddModal() {
  Store.set('editingId', null);
  document.getElementById('editTitle').textContent = '➕ เพิ่มงานใหม่';
  document.getElementById('editId').value = '';
  [
    'fName',
    'fPhone',
    'fLocation',
    'fPrice',
    'fQty',
    'fTime',
    'fNote',
    'fWheelStr',
    'fTags',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('locTypeHint').textContent = '';
  document.getElementById('editModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}

export function openEditById(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
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
  if (document.getElementById('fTags'))
    document.getElementById('fTags').value = j.tags || '';
  document.getElementById('fQty').value = j.quantity || '';
  document.getElementById('fTime').value = j.time_note || '';
  document.getElementById('fNote').value = j.raw_note || '';
  updateLocTypeHint();
  document.getElementById('editModal').classList.remove('hidden');
}

export function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  Store.set('editingId', null);
}

export function updateLocTypeHint() {
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

export function saveJob() {
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
    price: parseInt((document.getElementById('fPrice').value || '').replace(/,/g, '')) || 0,
    wheel_str: document.getElementById('fWheelStr')
      ? document.getElementById('fWheelStr').value.trim()
      : '',
    tags: document.getElementById('fTags')
      ? document.getElementById('fTags').value.trim()
      : '',
    quantity: parseInt(document.getElementById('fQty').value) || 0,
    time_note: document.getElementById('fTime').value.trim(),
    raw_note: document.getElementById('fNote').value.trim(),
    distance_km: distKm,
  };

  const editingId = Store.get('editingId');
  if (editingId) {
    // [FIX 2026-07-19] Optimistic update ทันที
    const jobs = Store.get('jobs') || [];
    const idx = jobs.findIndex((x) => x.id === editingId);
    if (idx !== -1) {
      jobs[idx] = { ...jobs[idx], ...data };
      Store.set('jobs', jobs);
      renderAll();
    }
    Supabase.updateJob(editingId, data)
      .then(() => {
        Formatters.toast(`✅ แก้ไข "${name}" แล้ว (Cloud Sync)`, 'ok');
      })
      .catch((err) => {
        Logger.error(
          'Supabase',
          'Error updating job:',
          err.message,
          err.details
        );
        Formatters.toast('❌ ไม่สามารถแก้ไขงานได้: ' + err.message, 'err');
      });
  } else {
    // [FIX 2026-07-19] Optimistic insert ทันที (id ชั่วคราว รอ realtime แทนที่)
    const tmpId = 'tmp_' + Date.now();
    const jobs = Store.get('jobs') || [];
    jobs.unshift({ ...data, id: tmpId, status: 'pending', postponed: false });
    Store.set('jobs', jobs);
    renderAll();
    Supabase.insertJob(data)
      .then(() => {
        Formatters.toast(`✅ เพิ่ม "${name}" แล้ว (Cloud Sync)`, 'ok');
      })
      .catch((err) => {
        Logger.error(
          'Supabase',
          'Error inserting job:',
          err.message,
          err.details
        );
        Formatters.toast('❌ ไม่สามารถเพิ่มงานได้: ' + err.message, 'err');
      });
  }
  closeEditModal();
}

// ==================== EXPENSE MODAL ====================
export function openExpenseModal() {
  document.getElementById('eName').value = '';
  document.getElementById('eAmount').value = '';
  document.getElementById('eTags').value = '';
  document.getElementById('expenseModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('eName').focus(), 80);
}

export function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

export function saveExpense() {
  const name = document.getElementById('eName').value.trim();
  const amount = parseInt(document.getElementById('eAmount').value);
  const validationErrors = Validators.validateExpenseForm();
  if (Validators.showValidationErrors(validationErrors)) return;

  Supabase.insertExpense({
    name,
    amount,
    tags: document.getElementById('eTags').value.trim(),
  })
    .then(() => {
      closeExpenseModal();
      Formatters.toast('✅ บันทึกรายจ่ายแล้ว', 'ok');
    })
    .catch((err) => {
      Logger.error(
        'Supabase',
        'Error inserting expense:',
        err.message,
        err.details
      );
      Formatters.toast('❌ ไม่สามารถบันทึกรายจ่ายได้: ' + err.message, 'err');
    });
}

export function deleteExpense(id) {
  Store.set('delTargetId', '__exp__' + id);
  document.getElementById('cfTitle').textContent = 'ลบรายจ่าย?';
  document.getElementById('cfMsg').textContent =
    'ลบรายจ่ายนี้ออกจากระบบ ไม่สามารถกู้คืนได้';
  document.getElementById('confirmDlg').classList.remove('hidden');
}

// ==================== DETAIL MODAL ====================
export function openDetailModal(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
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
      .map(
        (p) =>
          `<a href="tel:${p}" style="color:#60a5fa;text-decoration:none;">${Formatters.esc(p)}</a>`
      )
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
          year: '2-digit',
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
    minute: '2-digit',
  })}</div></div>`;

  document.getElementById('detailContent').innerHTML = rows;

  let actions = '';
  if (j.status === 'pending' && !j.postponed) {
    Formatters.getPhones(j.phone).forEach((p) => {
      actions += `<a href="tel:${p}" class="btn-call" style="flex:1;">📞 โทร</a>`;
    });
    if (mapsUrl)
      actions += Location.isChatLocPending(j)
        ? `<button onclick="promptNavigate('${j.id}')" class="btn-nav" style="flex:1.5;cursor:pointer;">📍 นำทาง</button>`
        : `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn-nav" style="flex:1.5;">📍 นำทาง</a>`;
    else
      actions += `<button onclick="var url=prompt('🔗 วางลิงก์ Google Maps จากแชท/ไลน์:');if(url)saveLocOverride('${j.id}',url)" class="btn-nav" style="flex:1.5;cursor:pointer;">🔗 ลิ้งค์</button>`;
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

export function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

// ==================== CHAT LOCATION OVERRIDE ====================
// [FEAT 2026-07-19] พิกัดจากแชท/ไลน์ ที่ยังไม่มีลิงก์ → กดนำทางแล้วเตือนเลือก 2 ทาง
export function promptNavigate(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  // ถ้ามีลิงก์ที่บันทึกไว้แล้ว → เปิดเลย
  if (j.location_type === 'url' && j.location_raw && /^https?:\/\//i.test(j.location_raw)) {
    window.open(j.location_raw, '_blank', 'noopener');
    return;
  }

  // เตือนเลือก 2 ทาง
  Store.set('navTargetId', id);
  document.getElementById('cfTitle').textContent = '📍 นำทางพิกัดจากแชท';
  document.getElementById('cfMsg').innerHTML =
    `พบพิกัดแบบ "โลเคชั่นทางแชท/ไลน์" ที่ยังไม่มีลิงก์แผนที่<br><br>` +
    `เลือกวิธีนำทาง:`;
  // เปลี่ยนปุ่มให้เป็น 2 ทาง
  const ok = document.getElementById('cfOk');
  const cancel = document.getElementById('cfCancel');
  if (ok) {
    ok.textContent = 'มีลิงก์แชท/ไลน์';
    ok.onclick = () => {
      closeChatNavDialog();
      // โฟกัสช่องใส่ลิงก์ในการ์ด
      const inp = document.getElementById('locOv_' + id);
      if (inp) {
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inp.focus();
      } else {
        openEditById(id); // เปิดแก้ไขถ้าไม่เจอช่องในการ์ด
      }
    };
  }
  if (cancel) {
    cancel.textContent = 'กดต่อไป (ใช้ข้อมูลดิบ)';
    cancel.onclick = () => {
      closeChatNavDialog();
      // นำทางโดยใช้ location_raw ดิบแบบ place search
      const raw = (j.location_raw || '').replace(/\(โลเคชั่นทางแชท\)/g, '').trim();
      const url = `https://maps.google.com/?q=${encodeURIComponent(raw)}`;
      window.open(url, '_blank', 'noopener');
    };
  }
  document.getElementById('confirmDlg').classList.remove('hidden');
}

function closeChatNavDialog() {
  document.getElementById('confirmDlg').classList.add('hidden');
  document.getElementById('cfOk').textContent = 'ลบเลย';
  document.getElementById('cfCancel').textContent = 'ยกเลิก';
  // คืน onclick ให้ทำงานเหมือนเดิม (ผูกใหม่ผ่าน init)
  delete document.getElementById('cfOk').onclick;
  delete document.getElementById('cfCancel').onclick;
  Store.set('navTargetId', null);
  // trigger re-bind ผ่าน custom event
  document.dispatchEvent(new Event('chatNavClosed'));
}

export function saveLocOverride(id, url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    Formatters.toast('❌ กรุณาใส่ลิงก์ที่ถูกต้อง (http/https)', 'err');
    return;
  }
  const jobs = Store.get('jobs') || [];
  const idx = jobs.findIndex((x) => x.id === id);
  if (idx === -1) return;

  // [FIX 2026-07-30] เก็บลิงก์ใน location_raw + location_type: 'url' (ไม่ใช้ loc_override เพราะไม่มี column ใน DB)
  jobs[idx] = { ...jobs[idx], location_raw: url, location_type: 'url' };
  Store.set('jobs', jobs);
  renderAll();

  Supabase.updateJob(id, { location_raw: url, location_type: 'url' })
    .then(() => Formatters.toast('✅ บันทึกลิงก์พิกัดแล้ว', 'ok'))
    .catch((err) => {
      Logger.error('Supabase', 'Error saving map link:', err.message);
      Formatters.toast('❌ บันทึกลิงก์ไม่สำเร็จ: ' + err.message, 'err');
    });
}

// ==================== POSTPONE MODAL ====================
export function openPostponeModal(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  document.getElementById('postponeJobId').value = id;
  document.getElementById('postponeJobName').textContent =
    `เลื่อนนัด "${j.customer_name || 'ไม่ระบุ'}"`;
  document.getElementById('postponeDate').value = '';
  document.getElementById('postponeModal').classList.remove('hidden');
}

export function closePostponeModal() {
  document.getElementById('postponeModal').classList.add('hidden');
}

export async function doPostpone(noDate) {
  const id = document.getElementById('postponeJobId').value;
  if (!id) return;
  const dateVal = noDate ? null : document.getElementById('postponeDate').value;
  if (!noDate && !dateVal) {
    Formatters.toast('กรุณาเลือกวันที่', 'err');
    return;
  }
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);

  await Supabase.postponeJob(id, dateVal);
  closePostponeModal();
  // [FIX 2026-07-19] Optimistic update ทันที
  const idx = jobs.findIndex((x) => x.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], postponed: true, postpone_until: dateVal };
    Store.set('jobs', jobs);
    renderAll();
  }
  const label = dateVal
    ? new Date(dateVal).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
      })
    : 'ไม่มีกำหนด';
  Formatters.toast(
    `🔄 เลื่อนนัด "${j ? j.customer_name : ''}" → ${label}`,
    'info'
  );
}

export async function undoPostpone(id) {
  // [FIX 2026-07-19] Optimistic update ทันที
  const jobs = Store.get('jobs') || [];
  const idx = jobs.findIndex((x) => x.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], postponed: false, postpone_until: null };
    Store.set('jobs', jobs);
    renderAll();
  }
  await Supabase.undoPostpone(id);
  Formatters.toast('↩️ คืนกลับเข้าคิวแล้ว', 'ok');
}

// ==================== QUEUE PARSER MODAL ====================
export function openQueueParserModal() {
  document.getElementById('queueParserModal').classList.remove('hidden');
  document.getElementById('queueInput').value = '';
  document.getElementById('queuePreview').style.display = 'none';
  Store.set('queueParsedBuf', []);
  setTimeout(() => document.getElementById('queueInput').focus(), 80);
}

export function closeQueueParserModal() {
  document.getElementById('queueParserModal').classList.add('hidden');
  Store.set('queueParsedBuf', []);
}

// Close every modal at once (used by backdrop click + ESC)
export function closeAll() {
  ['parserModal', 'editModal', 'detailModal', 'postponeModal',
   'expenseModal', 'queueParserModal', 'confirmDlg'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

export function runQueueParser() {
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

export async function saveFromQueueParser() {
  const queueParsedBuf = Store.get('queueParsedBuf');
  if (!queueParsedBuf.length) return;
  Logger.info(
    'QueueParser',
    'Saving',
    queueParsedBuf.length,
    'jobs with new priorities'
  );

  let failed = 0;
  queueParsedBuf.forEach(async (j, i) => {
    try {
      await Supabase.updateJobPriority(j.id, i + 1);
    } catch (err) {
      Logger.error(
        'QueueParser',
        'Error updating priority:',
        j.id,
        err.message
      );
      failed++;
    }
  });

  setTimeout(() => {
    closeQueueParserModal();
    if (failed > 0) {
      Formatters.toast(
        `⚠️ จัดคิว ${queueParsedBuf.length - failed} รายการ, ล้มเหลว ${failed}`,
        'warn'
      );
    } else {
      Formatters.toast(`✅ จัดคิว ${queueParsedBuf.length} รายการแล้ว`, 'ok');
    }
    if (!window.isManualSort) {
      window.isManualSort = true;
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
