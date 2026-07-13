import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./tokenizer.js', () => ({
  tokenize: vi.fn((text) => {
    if (!text) return [];
    return text.split('\n').filter(Boolean);
  }),
}));

vi.mock('./extractor.js', () => ({
  extract: vi.fn((block) => {
    if (block.includes('ลูกค้า')) {
      const name = block.replace('ลูกค้า ', '');
      return { customer_name: name, phone: '0812345678', quantity: 1 };
    }
    return { customer_name: 'unknown', quantity: 0 };
  }),
}));

vi.mock('./validator.js', () => ({
  validate: vi.fn((job) => ({
    isValid: !!job.customer_name && job.customer_name !== 'unknown',
    errors: [],
    job,
  })),
  validateBatch: vi.fn((jobs) => jobs.map(j => ({
    isValid: !!j.customer_name && j.customer_name !== 'unknown',
    errors: [],
    job: j,
  }))),
}));

vi.mock('./formatter.js', () => ({
  format: vi.fn((j) => j),
  formatBatch: vi.fn((jobs) => jobs),
  isDuplicate: vi.fn(() => false),
}));

vi.mock('../../core/store.js', () => ({
  default: { get: vi.fn(() => []) },
}));

vi.mock('../location.js', () => ({
  normalizeThaiNumber: vi.fn((s) => s || ''),
}));

describe('parseText()', () => {
  let parseText;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./index.js');
    parseText = mod.parseText;
  });

  it('parses text into valid jobs', () => {
    const result = parseText('ลูกค้า สมชาย\nลูกค้า สมหญิง');
    expect(result).toHaveLength(2);
    expect(result[0].customer_name).toBe('สมชาย');
  });

  it('filters out invalid jobs', () => {
    const result = parseText('ลูกค้า สมชาย\ninvalid block');
    expect(result).toHaveLength(1);
    expect(result[0].customer_name).toBe('สมชาย');
  });

  it('returns empty array for empty text', () => {
    expect(parseText('')).toEqual([]);
  });
});

describe('parseBlocks()', () => {
  let parseBlocks;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./index.js');
    parseBlocks = mod.parseBlocks;
  });

  it('parses blocks into valid jobs', () => {
    const result = parseBlocks(['ลูกค้า สมชาย']);
    expect(result).toHaveLength(1);
    expect(result[0].customer_name).toBe('สมชาย');
  });

  it('filters invalid blocks', () => {
    const result = parseBlocks(['ลูกค้า valid', 'garbage']);
    expect(result).toHaveLength(1);
  });
});

describe('parseQueue()', () => {
  let parseQueue;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./index.js');
    parseQueue = mod.parseQueue;
  });

  it('returns all pending jobs when no text matches', () => {
    const existing = [
      { id: '1', customer_name: 'A', status: 'pending', location_raw: '' },
      { id: '2', customer_name: 'B', status: 'pending', location_raw: '' },
    ];
    const result = parseQueue('nothing matches', existing);
    expect(result).toHaveLength(2);
  });

  it('handles empty text', () => {
    const existing = [
      { id: '1', customer_name: 'A', status: 'pending', location_raw: '' }
    ];
    expect(parseQueue('', existing)).toHaveLength(1);
  });

  it('filters out non-pending jobs from ordering', () => {
    const existing = [
      { id: '1', customer_name: 'A', status: 'done', location_raw: '' },
      { id: '2', customer_name: 'B', status: 'pending', location_raw: '' },
    ];
    const result = parseQueue('line', existing);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
