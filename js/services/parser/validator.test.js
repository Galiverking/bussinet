import { describe, it, expect } from 'vitest';
import { validate, validateBatch } from './validator.js';

describe('validate()', () => {
  it('returns isValid:true when job has customer_name', () => {
    const result = validate({ customer_name: 'สมชาย' });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns isValid:false when customer_name is missing', () => {
    const result = validate({});
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('ไม่พบชื่อลูกค้า');
  });

  it('returns error for phone shorter than 9 digits', () => {
    const result = validate({ customer_name: 'สมชาย', phone: '0812' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('เบอร์โทรไม่ถูกต้อง');
  });

  it('accepts phone >= 9 digits', () => {
    const result = validate({ customer_name: 'สมชาย', phone: '0812345678' });
    expect(result.isValid).toBe(true);
  });

  it('accepts empty phone', () => {
    const result = validate({ customer_name: 'สมชาย', phone: '' });
    expect(result.isValid).toBe(true);
  });

  it('returns error for negative price', () => {
    const result = validate({ customer_name: 'a', price: -100 });
    expect(result.errors).toContain('ราคาติดลบ');
  });

  it('accepts positive price', () => {
    const result = validate({ customer_name: 'a', price: 500 });
    expect(result.isValid).toBe(true);
  });

  it('returns error for negative quantity', () => {
    const result = validate({ customer_name: 'a', quantity: -5 });
    expect(result.errors).toContain('จำนวนติดลบ');
  });

  it('accepts positive quantity', () => {
    const result = validate({ customer_name: 'a', quantity: 10 });
    expect(result.isValid).toBe(true);
  });

  it('preserves job data in result', () => {
    const job = { customer_name: 'ร้านสมชาย', phone: '0812345678', quantity: 4 };
    const result = validate(job);
    expect(result.job).toEqual(job);
  });
});

describe('validateBatch()', () => {
  it('validates multiple jobs', () => {
    const jobs = [
      { customer_name: 'สมชาย' },
      {},
      { customer_name: 'สมหญิง', phone: '0898765432' },
    ];
    const results = validateBatch(jobs);
    expect(results).toHaveLength(3);
    expect(results[0].isValid).toBe(true);
    expect(results[1].isValid).toBe(false);
    expect(results[2].isValid).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(validateBatch([])).toEqual([]);
  });
});
