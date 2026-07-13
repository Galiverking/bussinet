import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  default: { warn: vi.fn() },
}));

const storage = {};
global.localStorage = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
};

async function getStore() {
  return (await import('./store.js')).default;
}

describe('Store', () => {
  let Store;
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.resetModules();
    Store = await getStore();
  });

  describe('get() / set()', () => {
    it('returns undefined for unknown key', () => {
      expect(Store.get('nonexistent')).toBeUndefined();
    });
    it('stores and retrieves values', () => {
      Store.set('jobs', [{ id: 1 }]);
      expect(Store.get('jobs')).toEqual([{ id: 1 }]);
    });
    it('overwrites existing values', () => {
      Store.set('jobs', [{ id: 1 }]);
      Store.set('jobs', [{ id: 2 }]);
      expect(Store.get('jobs')).toEqual([{ id: 2 }]);
    });
  });

  describe('getAll()', () => {
    it('returns a shallow copy of all state', () => {
      const all = Store.getAll();
      expect(all).toHaveProperty('jobs');
      expect(all.currentTab).toBe('summary');
    });
    it('is not affected by mutations on returned object', () => {
      const all = Store.getAll();
      all.jobs = ['hacked'];
      expect(Store.get('jobs')).toEqual([]);
    });
  });

  describe('subscribe()', () => {
    it('notifies listener on set()', () => {
      const fn = vi.fn();
      Store.subscribe(fn);
      Store.set('currentTab', 'jobs');
      expect(fn).toHaveBeenCalledWith('currentTab', 'jobs', 'summary');
    });
    it('returns unsubscribe function', () => {
      const fn = vi.fn();
      const unsub = Store.subscribe(fn);
      unsub();
      Store.set('currentTab', 'jobs');
      expect(fn).not.toHaveBeenCalled();
    });
    it('supports multiple listeners', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      Store.subscribe(fn1);
      Store.subscribe(fn2);
      Store.set('userLoc', { lat: 13 });
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('initFromStorage()', () => {
    it('loads userLoc from localStorage', () => {
      storage['logis_loc'] = JSON.stringify({ lat: 13.75, lng: 100.5 });
      Store.initFromStorage();
      expect(Store.get('userLoc')).toEqual({ lat: 13.75, lng: 100.5 });
    });
    it('loads isManualSort from localStorage', () => {
      storage['logis_manualSort'] = 'true';
      Store.initFromStorage();
      expect(Store.get('isManualSort')).toBe(true);
    });
    it('handles missing localStorage gracefully', () => {
      Store.initFromStorage();
      expect(Store.get('userLoc')).toBeNull();
    });
    it('handles corrupt JSON gracefully', () => {
      storage['logis_loc'] = '{bad-json}';
      expect(() => Store.initFromStorage()).not.toThrow();
      expect(Store.get('userLoc')).toBeNull();
    });
  });

  describe('helper getters', () => {
    it('getJobs() returns jobs array', () => {
      Store.set('jobs', [{ id: 'a' }]);
      expect(Store.getJobs()).toEqual([{ id: 'a' }]);
    });
    it('getExpenses() returns expenses array', () => {
      Store.set('expenses', [{ id: 'b' }]);
      expect(Store.getExpenses()).toEqual([{ id: 'b' }]);
    });
    it('getUserLoc() returns user location', () => {
      Store.set('userLoc', { lat: 13 });
      expect(Store.getUserLoc()).toEqual({ lat: 13 });
    });
    it('getCurrentTab() returns current tab', () => {
      expect(Store.getCurrentTab()).toBe('summary');
    });
  });
});
