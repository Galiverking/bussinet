import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabase.js', () => ({
  mapJobToDb: vi.fn((job) => ({ ...job, dbReady: true })),
}));

beforeEach(() => vi.clearAllMocks());

describe('format()', () => {
  it('calls mapJobToDb with the job', async () => {
    const { format, formatBatch, isDuplicate } = await import('./formatter.js');
    const { mapJobToDb } = await import('../supabase.js');

    const job = { customer_name: 'ทดสอบ', phone: '0812345678' };
    const result = format(job);

    expect(mapJobToDb).toHaveBeenCalledWith(job);
    expect(result).toEqual({ customer_name: 'ทดสอบ', phone: '0812345678', dbReady: true });
  });

  it('returns undefined for empty input', async () => {
    const { format } = await import('./formatter.js');
    const { mapJobToDb } = await import('../supabase.js');
    mapJobToDb.mockReturnValue(undefined);
    expect(format(null)).toBeUndefined();
  });
});

describe('formatBatch()', () => {
  it('returns array with same length as input', async () => {
    const { formatBatch } = await import('./formatter.js');
    const { mapJobToDb } = await import('../supabase.js');
    mapJobToDb.mockReturnValue({ dbReady: true });
    const result = formatBatch([{ customer_name: 'A' }, { customer_name: 'B' }]);
    expect(result).toHaveLength(2);
  });

  it('calls format (via mapJobToDb) for each job', async () => {
    const { formatBatch } = await import('./formatter.js');
    const { mapJobToDb } = await import('../supabase.js');
    mapJobToDb.mockReturnValue({ dbReady: true });
    formatBatch([{ customer_name: 'A' }, { customer_name: 'B' }]);
    expect(mapJobToDb).toHaveBeenCalledTimes(2);
    expect(mapJobToDb).toHaveBeenCalledWith({ customer_name: 'A' });
  });

  it('returns empty array for empty input', async () => {
    const { formatBatch } = await import('./formatter.js');
    expect(formatBatch([])).toEqual([]);
  });
});

describe('isDuplicate()', () => {
  it('returns false when job has no phone', async () => {
    const { isDuplicate } = await import('./formatter.js');
    expect(isDuplicate({ customer_name: 'A' }, [])).toBe(false);
  });

  it('returns false when no existing job matches phone and pending', async () => {
    const { isDuplicate } = await import('./formatter.js');
    const existing = [
      { phone: '0811111111', status: 'completed' },
      { phone: '0822222222', status: 'pending' },
    ];
    expect(isDuplicate({ phone: '0899999999' }, existing)).toBe(false);
  });

  it('returns true when phone matches a pending job', async () => {
    const { isDuplicate } = await import('./formatter.js');
    const existing = [
      { phone: '0812345678', status: 'pending' },
      { phone: '0899999999', status: 'completed' },
    ];
    expect(isDuplicate({ phone: '0812345678' }, existing)).toBe(true);
  });

  it('ignores non-pending status even if phone matches', async () => {
    const { isDuplicate } = await import('./formatter.js');
    const existing = [
      { phone: '0812345678', status: 'completed' },
      { phone: '0812345678', status: 'in_progress' },
    ];
    expect(isDuplicate({ phone: '0812345678' }, existing)).toBe(false);
  });

  it('handles empty existing jobs array', async () => {
    const { isDuplicate } = await import('./formatter.js');
    expect(isDuplicate({ phone: '0812345678' }, [])).toBe(false);
  });
});
