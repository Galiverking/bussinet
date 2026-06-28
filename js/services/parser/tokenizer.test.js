import { describe, it, expect } from 'vitest';
import { tokenize } from './tokenizer.js';

describe('tokenize()', () => {
  it('splits by emoji separator (3+ emoji)', () => {
    const blocks = tokenize(
      'job A first line\njob A second\n🔧🔧🔧🔧\njob B first\njob B second\n🔧🔧🔧🔧\njob C team\n',
    );
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('job A');
    expect(blocks[1]).toContain('job B');
    expect(blocks[2]).toContain('job C');
  });

  it('splits by repeated symbols (3+ ---/===/***)', () => {
    const blocks = tokenize(
      'job alpha\n---\njob beta\n***\njob gamma\n===\njob delta',
    );
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks[0]).toContain('job alpha');
  });

  it('falls back to triple newline when no emoji/symbol separator', () => {
    const blocks = tokenize('block 1\n\n\nblock 2\n\n\nblock 3');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe('block 1');
    expect(blocks[1]).toBe('block 2');
    expect(blocks[2]).toBe('block 3');
  });

  it('returns single block for plain text without separators', () => {
    const blocks = tokenize('just a single block of text\nwith multiple lines');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('single block');
  });

  it('removes นัดรับวัน... lines', () => {
    const blocks = tokenize(
      'นัดรับวันอังคารที่ 30 มิ.ย.\nลูกค้า: สมชาย\nเบอร์: 0812345678\n\n\nลูกค้า: สมหญิง\nเบอร์: 0898765432',
    );
    // First block should have the นัดรับวัน line removed
    expect(blocks[0]).not.toContain('นัดรับวัน');
    expect(blocks).toHaveLength(2);
  });

  it('filters out blocks shorter than 5 chars', () => {
    const blocks = tokenize('hi\n\n\na\n\n\nhello world');
    expect(blocks).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('trims whitespace from blocks', () => {
    const blocks = tokenize('  block A  \n\n\n  block B  ');
    blocks.forEach((b) => {
      expect(b).not.toMatch(/^\s|\s$/);
    });
  });

  it('processes realistic Thai job data', () => {
    const input = [
      'นัดรับวันอังคารที่ 30 มิ.ย.',
      '',
      '',
      'ลูกค้า: ร้านสมชายยางรถยนต์',
      'เบอร์: 081-234-5678',
      '',
      '',
      'นัดรับวันพุธที่ 1 ก.ค.',
      '',
      '',
      'ลูกค้า: บริษัทไทยเจริญกิจ',
      'เบอร์: 089-876-5432',
    ].join('\n');

    const blocks = tokenize(input);
    // Each block should have a customer line
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });
});
