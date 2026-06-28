import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  esc,
  getPhones,
  todayStr,
  genId,
  debounce,
  formatETAClock,
  formatThaiDate,
  formatThaiDateTime,
} from './formatters.js';

// ─── esc ──────────────────────────────────────────────────────────
describe('esc()', () => {
  it('escapes HTML special chars', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('returns empty string for falsy input', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });

  it('preserves normal text', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

// ─── getPhones ────────────────────────────────────────────────────
describe('getPhones()', () => {
  it('extracts valid phone numbers from comma-separated string', () => {
    const result = getPhones('0812345678, 0898765432');
    expect(result).toEqual(['0812345678', '0898765432']);
  });

  it('filters out short numbers (< 9 digits)', () => {
    const result = getPhones('1234, 0812345678');
    expect(result).toEqual(['0812345678']);
  });

  it('handles various separators', () => {
    const result = getPhones('0812345678 / 0898765432');
    expect(result).toContain('0812345678');
    expect(result).toContain('0898765432');
  });

  it('returns empty array for empty input', () => {
    expect(getPhones('')).toEqual([]);
    expect(getPhones(null)).toEqual([]);
    expect(getPhones(undefined)).toEqual([]);
  });
});

// ─── todayStr ─────────────────────────────────────────────────────
describe('todayStr()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ISO date string for today', () => {
    vi.setSystemTime(new Date('2026-06-28T12:00:00Z'));
    expect(todayStr()).toBe('2026-06-28');
  });
});

// ─── genId ────────────────────────────────────────────────────────
describe('genId()', () => {
  it('returns a UUID string', () => {
    const id = genId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });
});

// ─── debounce ─────────────────────────────────────────────────────
describe('debounce()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces function calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserves arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a', 1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 1);
  });
});

// ─── formatETAClock ───────────────────────────────────────────────
describe('formatETAClock()', () => {
  it('formats Date as HH:MM น.', () => {
    const d = new Date('2026-06-28T15:30:00');
    expect(formatETAClock(d)).toBe('~15:30 น.');
  });

  it('zero-pads hours and minutes', () => {
    const d = new Date('2026-06-28T09:05:00');
    expect(formatETAClock(d)).toBe('~09:05 น.');
  });
});

// ─── formatThaiDate ───────────────────────────────────────────────
describe('formatThaiDate()', () => {
  it('formats date in Thai short format', () => {
    // 28 Jun 2026 -> Thai locale (expected shape: "28 มิ.ย. 69")
    const result = formatThaiDate('2026-06-28');
    expect(result).toContain('28');
    expect(result).toContain('มิ.ย.');
  });
});

// ─── formatThaiDateTime ───────────────────────────────────────────
describe('formatThaiDateTime()', () => {
  it('formats datetime in Thai long format', () => {
    const result = formatThaiDateTime('2026-06-28T15:30:00');
    expect(result).toContain('28');
    expect(result).toContain('มิถุนายน');
  });
});
