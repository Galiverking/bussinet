'use strict';

import Store from '../core/store.js';
import * as Formatters from '../utils/formatters.js';
import * as Constants from '../core/constants.js';
import * as Supabase from '../services/supabase.js';
import Logger from '../utils/logger.js';
import { renderAll, getSorted } from './renderer.js';

// ==================== JOB ACTIONS ====================
export async function completeJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

  await Supabase.completeJob(id);
  Formatters.toast(`✅ "${j.customer_name}" เสร็จแล้ว`, 'ok');
}

export async function undoJob(id) {
  const jobs = Store.get('jobs') || [];
  const j = jobs.find((x) => x.id === id);
  if (!j) return;

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

  await Supabase.deleteJob(id).catch((err) => {
    Logger.error('Supabase', 'Error deleting job:', err.message);
    Formatters.toast('❌ ไม่สามารถลบงานได้: ' + err.message, 'err');
  });
  Formatters.toast(`🗑️ ลบ "${j.customer_name}" แล้ว`, 'err');
}

export async function toggleSortMode(val) {
  window.isManualSort = val;
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

  let csvContent = '\uFEFF';
  csvContent +=
    'Type,Date,Time,Status,Completed_At,Customer_Name,Phone,Location,Price_Amount,Wheel_Sizes,Quantity,Note,Tags\n';

  let totalMoney = 0;
  let totalWheels = 0;

  jobs.forEach((j) => {
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
          cd.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          });
      } catch (_) {
        completedStr = j.completed_at;
      }
    }
    const wheelSizesStr =
      j.wheelSizes && j.wheelSizes.length > 0
        ? j.wheelSizes.map((ws) => `${ws.size}"×${ws.qty}วง`).join(', ')
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
      j.tags,
    ]
      .map((v) => '"' + (v || '').toString().replace(/"/g, '""') + '"')
      .join(',');
    csvContent += row + '\n';
  });

  expenses.forEach((e) => {
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
      e.tags,
    ]
      .map((v) => '"' + (v || '').toString().replace(/"/g, '""') + '"')
      .join(',');
    csvContent += row + '\n';
  });

  csvContent += `\n"Summary","","","","","","","รวมจำนวนเงินบาท",${totalMoney},"จำนวนล้อวง",${totalWheels},"","",""\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
