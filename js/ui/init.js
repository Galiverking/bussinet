// ==================== INIT MODULE ====================
import Store from '../core/store.js';
import * as Renderer from './renderer.js';
import * as Actions from './actions.js';
import * as Theme from './theme.js';
import * as Modals from './modals.js';
import * as Location from '../services/location.js';
import * as Supabase from '../services/supabase.js';
import { Logger } from '../utils/logger.js';
import * as Formatters from '../utils/formatters.js';

// Module-scoped element refs (shared across init functions)
let sortToggle = null;

// ==================== EVENT BINDINGS ====================
function initEventBindings() {
  // Theme toggle
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', Theme.toggleTheme);

  // Add job button
  const btnAddJob = document.getElementById('btnAddJob');
  if (btnAddJob) btnAddJob.addEventListener('click', () => Modals.openAddModal());

  // Paste button
  const btnPaste = document.getElementById('btnPaste');
  if (btnPaste) btnPaste.addEventListener('click', () => Modals.openParserModal());

  // Search/filter input in manage tab
  const queueInput = document.getElementById('queueInput');
  if (queueInput) queueInput.addEventListener('input', () => Renderer.renderAll());

  // Sort toggle
  sortToggle = document.getElementById('sortToggle');
  if (sortToggle) sortToggle.addEventListener('click', () => {
    const mode = Store.get('sortMode') === 'manual' ? 'time' : 'manual';
    Store.set('sortMode', mode);
    Renderer.renderAll();
  });

  // Modal close on backdrop click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      Modals.closeAll();
    }
  });

  // ESC to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modals.closeAll();
  });

  // Expense tab inputs
  const btnAddExpense = document.getElementById('btnAddExpense');
  if (btnAddExpense) btnAddExpense.addEventListener('click', () => Modals.openExpenseModal());

  // Import/export backup
  const btnExport = document.getElementById('btnExport');
  if (btnExport) btnExport.addEventListener('click', () => Actions.exportBackup());
  const btnImport = document.getElementById('btnImport');
  if (btnImport) btnImport.addEventListener('click', () => Actions.importBackup());

  Logger.info('init', 'Event bindings initialized');
}

// ==================== INIT APP ====================
function initApp() {
  // Set default values
  if (!Store.get('currentTab')) Store.set('currentTab', 'summary');
  if (!Store.get('manFilter')) Store.set('manFilter', 'all');
  if (!Store.get('sortMode')) Store.set('sortMode', 'time');

  // Set initial tab
  switchTab(Store.get('currentTab') || 'summary');

  // Set initial filter
  setFilter(Store.get('manFilter') || 'all');

  // Initial render
  Renderer.renderAll();

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
  try {
    Supabase.loadJobs();
  } catch (err) {
    Logger.error('app', 'Error loading jobs:', err.message);
    Formatters.toast('⚠️ ไม่สามารถโหลดข้อมูลได้', 'err');
  }

  // Request location
  Location.requestLocation();
  Logger.info('app', 'initApp() done');
}

// ==================== EXPOSE TO WINDOW ====================
export function exposeToWindow() {
  // Actions
  window.completeJob = Actions.completeJob;
  window.undoJob = Actions.undoJob;
  window.moveJob = Actions.moveJob;
  window.deleteJob = Actions.deleteJob;
  window.openPostponeModal = Modals.openPostponeModal;
  window.undoPostpone = Modals.undoPostpone;
  window.closePostponeModal = Modals.closePostponeModal;
  window.doPostpone = Modals.doPostpone;
  window.openDetailById = Modals.openDetailModal;
  window.closeDetailModal = Modals.closeDetailModal;
  window.doConfirmDelete = Actions.doConfirmDelete;
  window.openEditById = Modals.openEditById;
  window.deleteExpense = Modals.deleteExpense;
  window.exportBackup = Actions.exportBackup;
  window.importBackup = Actions.importBackup;
  window.exportToCSV = Actions.exportToCSV;
  window.toggleSortMode = Actions.toggleSortMode;

  // Modals (needed by inline HTML handlers)
  window.openAddModal = Modals.openAddModal;
  window.openParserModal = Modals.openParserModal;
  window.closeParserModal = Modals.closeParserModal;
  window.runParser = Modals.runParser;
  window.saveFromParser = Modals.saveFromParser;
  window.saveJob = Modals.saveJob;
  window.closeEditModal = Modals.closeEditModal;
  window.openExpenseModal = Modals.openExpenseModal;
  window.saveExpense = Modals.saveExpense;
  window.closeExpenseModal = Modals.closeExpenseModal;
  window.openQueueParserModal = Modals.openQueueParserModal;
  window.runQueueParser = Modals.runQueueParser;
  window.saveFromQueueParser = Modals.saveFromQueueParser;
  window.closeQueueParserModal = Modals.closeQueueParserModal;
  window.updateParsedLoc = Modals.updateParsedLoc;
  window.updateLocTypeHint = Modals.updateLocTypeHint;
  window.closeAll = Modals.closeAll;

  // Theme
  window.toggleTheme = Theme.toggleTheme;

  // Rendering (needed by inline HTML handlers)
  window.renderManage = Renderer.renderAll;

  // Other
  window.setFilter = setFilter;
  window.switchTab = switchTab;

  Logger.info('init', 'All functions exposed to window');
}

// ==================== TAB NAVIGATION ====================
function switchTab(tab) {
  Store.set('currentTab', tab);

  document.querySelectorAll('.tab-item').forEach((btn) => {
    btn.classList.toggle('active', btn.id === ('tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1)));
  });

  ['tabSummary', 'tabManage', 'tabExpense'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const map = { summary: 'tabSummary', today: 'tabSummary', manage: 'tabManage', expense: 'tabExpense' };
  const target = document.getElementById(map[tab]);
  if (target) target.style.display = 'block';

  Renderer.renderAll();
}

function setFilter(filter) {
  Store.set('manFilter', filter);
  document.querySelectorAll('.pill').forEach((btn) => {
    btn.classList.toggle('on', btn.id === ('p' + filter.charAt(0).toUpperCase() + filter.slice(1)));
    btn.classList.toggle('off', btn.id !== ('p' + filter.charAt(0).toUpperCase() + filter.slice(1)));
  });
  Renderer.renderAll();
}

// ==================== STORE SUBSCRIPTION ====================
Store.subscribe((key, value) => {
  if (key === 'jobs' || key === 'expenses') {
    Renderer.renderAll();
  }
});

// ==================== MAIN BOOT ===================
export async function boot() {
  Logger.info('app', 'Booting Logis Master...');
  Theme.initTheme();
  initEventBindings();
  Supabase.initSupabaseService();
  await Supabase.signInAnonymously();
  initApp();
  exposeToWindow();
  Logger.info('app', 'Boot complete');
}

// NOTE: boot() is invoked by js/app.js — do NOT auto-run here
// (auto-running caused double-boot in the browser + broke test imports)