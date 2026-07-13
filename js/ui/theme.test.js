import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = {};
global.localStorage = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storage).forEach(k => delete storage[k]);
  document.documentElement.classList.remove('dark');
  document.body.innerHTML = '';
});

describe('initTheme()', () => {
  it('adds dark class when saved theme is dark', async () => {
    localStorage.setItem('logis_theme', 'dark');
    const { initTheme } = await import('./theme.js');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when saved theme is light', async () => {
    localStorage.setItem('logis_theme', 'light');
    const { initTheme } = await import('./theme.js');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('uses prefers-color-scheme when no saved theme', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((q) => ({
        matches: q === '(prefers-color-scheme: dark)',
        media: q,
      })),
    });
    const { initTheme } = await import('./theme.js');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('renders sun icon when dark mode after initTheme', async () => {
    localStorage.setItem('logis_theme', 'dark');
    document.body.innerHTML = '<button id="themeBtn"></button>';
    const { initTheme } = await import('./theme.js');
    initTheme();
    const btn = document.getElementById('themeBtn');
    expect(btn.innerHTML).toContain('circle');
    expect(btn.innerHTML).toContain('fcd34d');
  });
});

describe('toggleTheme()', () => {
  it('toggles dark class on html element', async () => {
    document.documentElement.classList.add('dark');
    const { toggleTheme } = await import('./theme.js');
    toggleTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('saves new theme to localStorage', async () => {
    const { toggleTheme } = await import('./theme.js');
    toggleTheme();
    expect(localStorage.setItem).toHaveBeenCalledWith('logis_theme', 'dark');
  });

  it('toggles back to light', async () => {
    localStorage.setItem('logis_theme', 'dark');
    document.documentElement.classList.add('dark');
    const { toggleTheme } = await import('./theme.js');
    toggleTheme();
    expect(localStorage.setItem).toHaveBeenCalledWith('logis_theme', 'light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('updateThemeIcon()', () => {
  function setupBtn() {
    const btn = document.createElement('button');
    btn.id = 'themeBtn';
    document.body.appendChild(btn);
    return btn;
  }

  it('does nothing when no themeBtn exists', async () => {
    const { updateThemeIcon } = await import('./theme.js');
    expect(() => updateThemeIcon()).not.toThrow();
  });

  it('sets sun SVG when dark mode', async () => {
    document.documentElement.classList.add('dark');
    const btn = setupBtn();
    const { updateThemeIcon } = await import('./theme.js');
    updateThemeIcon();
    expect(btn.innerHTML).toContain('circle');
    expect(btn.innerHTML).toContain('fcd34d');
  });

  it('sets moon SVG when light mode', async () => {
    const btn = setupBtn();
    const { updateThemeIcon } = await import('./theme.js');
    updateThemeIcon();
    expect(btn.innerHTML).toContain('path');
    expect(btn.innerHTML).toContain('8899b0');
  });
});
