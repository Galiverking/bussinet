'use strict';

import Store from '../core/store.js';
import * as Formatters from '../utils/formatters.js';
import * as Constants from '../core/constants.js';
import * as Supabase from '../services/supabase.js';
import Logger from '../utils/logger.js';
import { renderAll, getSorted, calcActualWheels } from './renderer.js';

// [FIX 2026-07-19] Optimistic update: แก้ Store local ทันทีแล้ว render
// ไม่ต้องรอ Supabase Realtime → UI อัปเดตทันทีหลังกดเสร็จ/ลบ/เลื่อน
function updateLocalJob(id, patch) {
  const jobs = Store.get('jobs') || [];
  const idx = jobs.findIndex((x) => x.id === id);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...patch };
  Store.set('jobs', jobs);
  renderAll();
}

// ==================== JOB ACTIONS ====================
export async function completeJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  // [FIX 2026-07-19] Optimistic update ทันที
  updateLocalJob(id, { status: 'done', completed_at: new Date().toISOString() });

  await Supabase.completeJob(id);
  Formatters.toast(`✅ "${j.customer_name}" เสร็จแล้ว`, 'ok');
}

export async function undoJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  // [FIX 2026-07-19] Optimistic update ทันที
  updateLocalJob(id, { status: 'pending', completed_at: null });

  await Supabase.undoJob(id).catch((err) => {
    Logger.error('Supabase', 'Error undo job:', err.message);
    Formatters.toast('❌ ไม่สามารถย้ายกลับได้: ' + err.message, 'err');
  });
  Formatters.toast(`↩️ ย้าย "${j.customer_name}" กลับ`, 'info');
}

export function doConfirmDelete(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  Store.set('delTargetId', id);
  document.getElementById('cfTitle').textContent = 'ลบงาน?';
  document.getElementById('cfMsg').textContent =
    `ลบ "${j.customer_name}" ออกจากรายการ ไม่สามารถกู้คืนได้`;
  document.getElementById('confirmDlg').classList.remove('hidden');
}

async function deleteJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  // [FIX 2026-07-19] Optimistic update ทันที (ลบออกจาก Store local)
  const filtered = jobs.filter((x) => x.id !== id);
  Store.set('jobs', filtered);
  renderAll();

  await Supabase.deleteJob(id).catch((err) => {
    Logger.error('Supabase', 'Error deleting job:', err.message);
    Formatters.toast('❌ ไม่สามารถลบงานได้: ' + err.message, 'err');
  });
  Formatters.toast(`🗑️ ลบ "${j.customer_name}" แล้ว`, 'err');
}

export async function toggleSortMode(val) {
  window.isManualSort = val;
  Store.set('isManualSort', val);
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
  Formatters.toast(
    val ? '🔧 เข้าสู่โหมดจัดลำดับเอง' : '📍 กลับสู่โหมดเรียงตามระยะทาง',
    'info'
  );
}

export async function moveJob(id, dir) {
  const jobs = Store.get('jobs') || [];
  const pending = jobs
    .filter((j) => j.status === 'pending' && !j.postponed)
    .sort((a, b) =>
      window.isManualSort ? (a.priority || 0) - (b.priority || 0) : 0
    );
  const idx = pending.findIndex((j) => j.id === id);
  if (idx === -1) return;

  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= pending.length) return;

  const current = pending[idx];
  const target = pending[targetIdx];

  await Supabase.updateJobPriority(current.id, target.priority);
  await Supabase.updateJobPriority(target.id, current.priority);
  renderAll();
}

// ==================== EXPORT/IMPORT ====================
export function exportToCSV() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];

  // รวบรวมรายการทั้งหมดเรียงตามเวลา
  const all = [];
  let totalJobMoney = 0,
      totalExpenseMoney = 0,
      totalWheels = 0;

  jobs.forEach((j) => {
    if (j.price) totalJobMoney += j.price;
    if (j.status !== 'done') totalWheels += calcActualWheels(j);
    const ws =
      j.wheelSizes && j.wheelSizes.length > 0
        ? j.wheelSizes
            .map((w) => (w.rim ? `${w.width}/${w.profile}R${w.rim}` : `${w.width}/${w.profile}`))
            .join(', ')
        : j.wheel_str || '';
    const stMap = { pending: 'รอ', done: 'เสร็จ', postponed: 'เลื่อน' };
    all.push({
      t: 1,
      dt: new Date(j.created_at),
      row: [
        'งาน',
        j.customer_name,
        j.phone,
        j.location_raw,
        ws,
        j.quantity || '',
        j.price || '',
        stMap[j.status] || j.status,
        j.time_note || '',
      ],
    });
  });

  expenses.forEach((e) => {
    totalExpenseMoney += e.amount || 0;
    all.push({
      t: 2,
      dt: new Date(e.created_at),
      row: [
        'รายจ่าย',
        e.name,
        '',
        '',
        '',
        '',
        e.amount || '',
        'ชำระแล้ว',
        e.tags || '',
      ],
    });
  });

  // เรียงตามเวลา
  all.sort((a, b) => a.dt - b.dt);

  const esc = (v) => '"' + (v || '').toString().replace(/"/g, '""') + '"';

  let csvContent = '\uFEFF';
  csvContent += 'ประเภท,วันที่,เวลา,ลูกค้า,เบอร์,ที่อยู่,ยาง,จำนวน,ราคา,สถานะ,โน๊ต\n';

  all.forEach((item) => {
    const d = item.dt;
    const dateStr = d.toLocaleDateString('th-TH');
    const timeStr = d.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    csvContent +=
      [esc(item.row[0]), esc(dateStr), esc(timeStr), ...item.row.slice(1).map(esc)].join(',') +
      '\n';
  });

  // สรุป
  const profit = totalJobMoney - totalExpenseMoney;
  csvContent += '\n';
  csvContent +=
    [esc('📊 สรุป'), '', '', '', '', '', '', '', '', '', ''].join(',') + '\n';
  csvContent +=
    [
      esc('รายได้'),
      esc(jobs.length + ' งาน'),
      '',
      '',
      '',
      '',
      '',
      esc('รวม'),
      esc(totalJobMoney.toLocaleString() + ' บาท'),
      '',
      esc(totalWheels + ' วง'),
    ].join(',') + '\n';
  csvContent +=
    [
      esc('รายจ่าย'),
      esc(expenses.length + ' รายการ'),
      '',
      '',
      '',
      '',
      '',
      esc('รวม'),
      esc(totalExpenseMoney.toLocaleString() + ' บาท'),
      '',
      '',
    ].join(',') + '\n';
  csvContent +=
    [
      esc('กำไร'),
      '',
      '',
      '',
      '',
      '',
      '',
      esc('สุทธิ'),
      esc(
        (profit < 0 ? 'ขาดทุน ' : '') +
          Math.abs(profit).toLocaleString() +
          ' บาท'
      ),
      '',
      '',
    ].join(',') + '\n';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    'logis_master_export_' + Formatters.todayStr() + '.csv'
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Formatters.toast('📥 ส่งออกไฟล์ CSV สำเร็จ', 'ok');
}

export function exportBackup() {
  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];

  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    jobs,
    expenses,
  };
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    'logis_backup_' + Formatters.todayStr() + '.json'
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Formatters.toast('💾 สำรองข้อมูลสำเร็จ', 'ok');
}

export function importBackup(input) {
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
      document.getElementById('cfMsg').textContent =
        `พบ ${data.jobs.length} งาน และ ${
          (data.expenses || []).length
        } รายจ่าย จะเขียนทับข้อมูลปัจจุบัน`;
      document.getElementById('confirmDlg').classList.remove('hidden');

      window.importData = data;
    } catch (err) {
      Formatters.toast('❌ ไฟล์ backup ไม่ถูกต้อง', 'err');
      Logger.error('Import', 'Backup parse error:', err);
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
    data.jobs.forEach(async (j) => {
      if (j.id) {
        await supabase
          .from(Constants.COLLECTION_JOBS)
          .upsert(j)
          .catch(() => {});
      }
    });
  }

  if (data.expenses && data.expenses.length > 0) {
    data.expenses.forEach(async (e) => {
      if (e.id) {
        await supabase
          .from(Constants.COLLECTION_EXPENSES)
          .upsert(e)
          .catch(() => {});
      }
    });
  }

  setTimeout(() => {
    Formatters.toast('✅ กู้คืนข้อมูลสำเร็จ', 'ok');
    window.importData = null;
    Supabase.loadJobs();
  }, 1000);
}

export { deleteJob, doImportBackup };
