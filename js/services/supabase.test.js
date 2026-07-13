import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../core/constants.js', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  COLLECTION_JOBS: 'jobs',
  COLLECTION_EXPENSES: 'expenses',
  SYNC_STATUS: {
    synced: { bg: '#22c55e', label: 'SYNCED', color: '#22c55e' },
    pending: { bg: '#f97316', label: 'SYNCING…', color: '#f97316' },
    offline: { bg: '#ef4444', label: 'OFFLINE', color: '#ef4444' },
    error: { bg: '#ef4444', label: 'ERROR', color: '#ef4444' },
  },
}));

vi.mock('../core/store.js', () => ({
  default: { get: vi.fn(() => []), set: vi.fn() },
}));

vi.mock('../utils/formatters.js', () => ({
  toast: vi.fn(),
  genId: () => 'mock-uuid',
  todayStr: () => '2026-06-28',
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

let mod;
let mockSupabaseClient;

beforeEach(async () => {
  vi.resetModules();
  // Build mock supabase client
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((cb) => cb({ data: [], error: null })),
  };

  mockSupabaseClient = {
    from: vi.fn(() => mockQueryBuilder),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    auth: {
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: { expires_at: 9999999999 } },
        error: null,
      }),
    },
  };

  global.window = { supabase: { createClient: vi.fn(() => mockSupabaseClient) } };

  mod = await import('./supabase.js');
});

describe('initSupabaseService()', () => {
  it('initializes client from window.supabase', () => {
    const result = mod.initSupabaseService();
    expect(result).toBe(true);
    expect(window.supabase.createClient).toHaveBeenCalled();
  });

  it('returns false if window.supabase is missing', () => {
    delete global.window.supabase;
    vi.resetModules();
    const result = mod.initSupabaseService();
    expect(result).toBe(false);
  });
});

describe('CRUD operations', () => {
  beforeEach(async () => {
    mod.initSupabaseService();
    vi.clearAllMocks();
  });

  it('insertJob() inserts with defaults', async () => {
    await mod.insertJob({ customer_name: 'สมชาย' });
    const insertCall = mockSupabaseClient.from('jobs').insert;
    expect(insertCall).toHaveBeenCalled();
    const args = insertCall.mock.calls[0][0][0];
    expect(args.customer_name).toBe('สมชาย');
    expect(args.status).toBe('pending');
    expect(args.date).toBe('2026-06-28');
  });

  it('updateJob() calls update with eq', async () => {
    mockSupabaseClient.from('jobs').update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await mod.updateJob('abc', { status: 'done' });
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('jobs');
  });

  it('deleteJob() calls delete with eq', async () => {
    await mod.deleteJob('123');
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('jobs');
  });

  it('completeJob() sets status to done', async () => {
    const updateMock = vi.fn().mockReturnThis();
    mockSupabaseClient.from = vi.fn(() => ({
      update: updateMock,
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    await mod.completeJob('xyz');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
    );
  });

  it('undoJob() sets status back to pending', async () => {
    const updateMock = vi.fn().mockReturnThis();
    mockSupabaseClient.from = vi.fn(() => ({
      update: updateMock,
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    await mod.undoJob('xyz');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', completed_at: null })
    );
  });
});

describe('mapJobToDb()', () => {
  beforeEach(async () => { /* mod already loaded */ });

  it('maps camelCase to snake_case', () => {
    const result = mod.mapJobToDb({
      customerName: 'สมชาย',
      locationRaw: '123 ถนน',
      wheelSizes: [{ width: 185 }],
    });
    expect(result.customer_name).toBe('สมชาย');
    expect(result.location_raw).toBe('123 ถนน');
    expect(result.wheel_sizes).toBe('[{"width":185}]');
  });

  it('preserves snake_case keys', () => {
    const result = mod.mapJobToDb({
      customer_name: 'สมชาย',
      wheel_str: '185/65R15',
    });
    expect(result.customer_name).toBe('สมชาย');
    expect(result.wheel_str).toBe('185/65R15');
  });
});
