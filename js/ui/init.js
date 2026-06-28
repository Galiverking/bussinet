'use strict';

import Store from '../core/store.js';
import * as Supabase from '../services/supabase.js';
import * as Location from '../services/location.js';
import * as Formatters from '../utils/formatters.js';
import * as Constants from '../core/constants.js';
import * as Actions from './actions.js';
import * as Modals from './modals.js';
import * as Theme from './theme.js';
import * as Renderer from './renderer.js';
import Logger from '../utils/logger.js';

// ==================== EVENT BINDINGS ====================
export function initEventBindings() {
  // Confirm dialog — cancel
  document.getElementById('cfCancel').onclick = () => {
    document.getElementById('confirmDlg').classList.add('hidden');
    Store.set('delTargetId', null);
  };

  // Confirm dialog — ok
  document.getElementById('cfOk').onclick = () => {
    const delTargetId = Store.get('delTargetId');
    if (delTargetId) {
      if (delTargetId.startsWith('__exp__')) {
        const id = delTargetId.slice(7);
        Supabase.deleteExpense(id).then(() =>
          Formatters.toast('🗑️ ลบแล้ว', 'ok')
        );
      } else if (delTargetId === '__import__') {
        Actions.doImportBackup();
      } else {
        Actions.deleteJob(delTargetId);
      }
      Store.set('delTargetId', null);
    }
    document.getElementById('confirmDlg').classList.add('hidden');
  };

  // Modal close on overlay click
  mapOverlayClick('parserModal', Modals.closeParserModal);
  mapOverlayClick('editModal', Modals.closeEditModal);
  mapOverlayClick('detailModal', Modals.closeDetailModal);
  mapOverlayClick('postponeModal', Modals.closePostponeModal);
  mapOverlayClick('queueParserModal', Modals.closeQueueParserModal);
}

function mapOverlayClick(modalId, closeFn) {
  const el = document.getElementById(modalId);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeFn();
    });
  }
}

// ==================== INIT APP ====================
function initApp() {
  Logger.info('app', 'initApp() started');

  // Init store
  Store.set('jobs', []);
  Store.set('expenses', []);
  Store.set('currentTab', 'today');

  // Load sort mode from localStorage
  if (localStorage.getItem('logis_manualSort') === 'true') {
    window.isManualSort = true;
  }

  // Init sort toggle
  const sortToggle = document.getElementById('sortToggle');
  if (sortToggle) {
    sortToggle.checked = !!window.isManualSort;
  }
  const sortLabel = document.getElementById('sortLabel');
  if (sortLabel) {
    sortLabel.textContent = window.isManualSort ? 'MANUAL' : 'AUTO';
    sortLabel.style.color = window.isManualSort ? '#3b82f6' : '#475569';
  }

  // Paste listener for parser
  const parserInput = document.getElementById('parserInput');
  if (parserInput) {
    parserInput.addEventListener('paste', () =>
      setTimeout(() => {
        if (typeof Modals.runParser === 'function') {
          Modals.runParser();
        }
      }, 80)
    );
  }

  // Sort toggle change
  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      Actions.toggleSortMode(sortToggle.checked);
    });
  }

  // Load data (includes realtime subscription setup)
  Supabase.loadJobs().catch((err) => {
    Logger.error('app', 'Error loading jobs:', err.message);
    Formatters.toast('⚠️ ไม่สามารถโหลดข้อมูลได้', 'err');
  });

  // Request location
  Location.requestLocation();

  Logger.info('app', 'initApp() done');
}

// ==================== EXPOSE TO WINDOW ====================
export function exposeToWindow() {
  // Theme
  window.toggleTheme = Theme.toggleTheme;

  // Location
  window.requestLocation = Location.requestLocation;

  // Modals
  window.openAddModal = Modals.openAddModal;
  window.openParserModal = Modals.openParserModal;
  window.openQueueParserModal = Modals.openQueueParserModal;
  window.closeQueueParserModal = Modals.closeQueueParserModal;
  window.runQueueParser = Modals.runQueueParser;
  window.saveFromQueueParser = Modals.saveFromQueueParser;
  window.openExpenseModal = Modals.openExpenseModal;
  window.closeExpenseModal = Modals.closeExpenseModal;
  window.saveExpense = Modals.saveExpense;
  window.closeParserModal = Modals.closeParserModal;
  window.runParser = Modals.runParser;
  window.saveFromParser = Modals.saveFromParser;
  window.closeEditModal = Modals.closeEditModal;
  window.saveJob = Modals.saveJob;
  window.closeDetailModal = Modals.closeDetailModal;
  window.closePostponeModal = Modals.closePostponeModal;
  window.doPostpone = Modals.doPostpone;
  window.openDetailModal = Modals.openDetailModal;
  window.openPostponeModal = Modals.openPostponeModal;
  window.undoPostpone = Modals.undoPostpone;
  window.openEditById = Modals.openEditById;
  window.updateParsedLoc = Modals.updateParsedLoc;
  window.updateLocTypeHint = Modals.updateLocTypeHint;

  // Actions
  window.completeJob = Actions.completeJob;
  window.undoJob = Actions.undoJob;
  window.doConfirmDelete = Actions.doConfirmDelete;
  window.deleteExpense = Modals.deleteExpense;
  window.toggleSortMode = Actions.toggleSortMode;
  window.moveJob = Actions.moveJob;
  window.exportToCSV = Actions.exportToCSV;
  window.exportBackup = Actions.exportBackup;
  window.importBackup = Actions.importBackup;

  // Other
  window.setFilter = setFilter;
  window.switchTab = switchTab;

  Logger.info('init', 'All functions exposed to window');
}

// ==================== TAB NAVIGATION ====================
function switchTab(tab) {
  Store.set('currentTab', tab);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  ['todaySec', 'manageSec', 'expenseSec'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const map = { today: 'todaySec', manage: 'manageSec', expense: 'expenseSec' };
  const target = document.getElementById(map[tab]);
  if (target) target.style.display = 'block';

  if (tab === 'manage') Renderer.renderAll();
  if (tab === 'expense') Renderer.renderAll();
}

function setFilter(filter) {
  Store.set('manFilter', filter);
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  Renderer.renderAll();
}

// ==================== STORE SUBSCRIPTION ====================
Store.subscribe((key, value) => {
  if (key === 'jobs' || key === 'expenses') {
    Renderer.renderAll();
  }
});

// ==================== MAIN BOOT ====================
export async function boot() {
  // 1. Theme first (avoid flash)
  Theme.initTheme();

  // 2. Wire up DOM event bindings
  initEventBindings();

  // 3. Sign in anonymously (for RLS — authenticated-only policies)
  Supabase.initSupabaseService();
  await Supabase.signInAnonymously();

  // 4. Load data and init
  initApp();

  // 5. Expose globals for legacy onclick
  exposeToWindow();

  Logger.info('app', 'Boot complete');
}
