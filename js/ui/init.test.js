import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ui/theme.js', () => ({ toggleTheme: vi.fn() }));

const store = {};
vi.mock('../core/store.js', () => ({
  default: {
    get: vi.fn((key) => {
      if (key === 'currentTab') return store.currentTab ?? 'today';
      if (key === 'manFilter') return store.manFilter ?? 'all';
      if (key === 'jobs') return store.jobs ?? [];
      if (key === 'expenses') return store.expenses ?? [];
      return null;
    }),
    set: vi.fn((key, val) => { store[key] = val; }),
    subscribe: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach(k => delete store[k]);
  store.currentTab = 'today';
  document.body.innerHTML = `
    <div id="tabSummary"></div>
    <div id="tabManage" style="display:none"></div>
    <div id="tabExpense" style="display:none"></div>
    <div class="tab-item" id="tabBtnSummary">Summary</div>
    <div class="tab-item" id="tabBtnManage">Manage</div>
    <div class="tab-item" id="tabBtnExpense">Expense</div>
    <div class="pill" id="pAll">All</div>
    <div class="pill" id="pPending">Pending</div>
    <div id="renderTarget"></div>
    <div id="parserModal" class="hidden"></div>
    <div id="parserInput"></div>
    <div id="parserPreview" style="display:none"></div>
    <div id="editModal" class="hidden"></div>
    <div id="detailModal" class="hidden"></div>
    <div id="postponeModal" class="hidden"></div>
    <div id="queueParserModal" class="hidden"></div>
    <div id="expenseModal" class="hidden"></div>
    <div id="confirmDlg" class="hidden"></div>
    <div id="cfCancel"></div>
    <div id="cfOk"></div>
    <div id="cfTitle"></div>
    <div id="cfMsg"></div>
    <div id="sortToggle"></div>
    <div id="sortLabel"></div>
  `;
});

describe('exposeToWindow()', () => {
  it('exposes core workflow functions to window', async () => {
    const mod = await import('./init.js');
    mod.exposeToWindow();
    expect(window.openAddModal).toBeDefined();
    expect(window.openParserModal).toBeDefined();
    expect(window.closeParserModal).toBeDefined();
    expect(window.runParser).toBeDefined();
    expect(window.saveJob).toBeDefined();
    expect(window.completeJob).toBeDefined();
    expect(window.exportToCSV).toBeDefined();
    expect(window.switchTab).toBeDefined();
    expect(window.setFilter).toBeDefined();
  });

  it('exposes sort and action functions', async () => {
    const mod = await import('./init.js');
    mod.exposeToWindow();
    expect(window.toggleSortMode).toBeDefined();
    expect(window.moveJob).toBeDefined();
    expect(window.doConfirmDelete).toBeDefined();
  });
});

describe('switchTab (via window)', () => {
  it('shows the target section and hides others', async () => {
    const mod = await import('./init.js');
    mod.exposeToWindow();
    window.switchTab('manage');

    expect(document.getElementById('tabSummary').style.display).toBe('none');
    expect(document.getElementById('tabManage').style.display).toBe('block');
    expect(document.getElementById('tabExpense').style.display).toBe('none');
  });

  it('activates the correct tab button', async () => {
    const mod = await import('./init.js');
    mod.exposeToWindow();
    window.switchTab('expense');

    const btns = document.querySelectorAll('.tab-item');
    expect(btns[0].classList.contains('active')).toBe(false);
    expect(btns[1].classList.contains('active')).toBe(false);
    expect(btns[2].classList.contains('active')).toBe(true);
  });

  it('stores currentTab in store', async () => {
    const Store = (await import('../core/store.js')).default;
    const mod = await import('./init.js');
    mod.exposeToWindow();
    window.switchTab('manage');
    expect(Store.set).toHaveBeenCalledWith('currentTab', 'manage');
  });
});

describe('setFilter (via window)', () => {
  it('stores filter and activates correct button', async () => {
    const mod = await import('./init.js');
    mod.exposeToWindow();
    window.setFilter('pending');

    const Store = (await import('../core/store.js')).default;
    expect(Store.set).toHaveBeenCalledWith('manFilter', 'pending');
    const btns = document.querySelectorAll('.pill');
    expect(btns[0].classList.contains('on')).toBe(false);
    expect(btns[1].classList.contains('on')).toBe(true);
  });
});
