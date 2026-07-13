import { describe, it, expect, vi } from 'vitest';
import { VALIDATOR, showValidationErrors } from './validators.js';

// ─── VALIDATOR.customerName ───────────────────────────────────────
describe('VALIDATOR.customerName()', () => {
  it('requires non-empty name', () => {
    expect(VALIDATOR.customerName('')).toBe('กรุณากรอกชื่อลูกค้า');
    expect(VALIDATOR.customerName('   ')).toBe('กรุณากรอกชื่อลูกค้า');
    expect(VALIDATOR.customerName(null)).toBe('กรุณากรอกชื่อลูกค้า');
    expect(VALIDATOR.customerName(undefined)).toBe('กรุณากรอกชื่อลูกค้า');
  });

  it('rejects name over 100 chars', () => {
    expect(VALIDATOR.customerName('ก'.repeat(101))).toBe(
      'ชื่อต้องไม่เกิน 100 ตัวอักษร',
    );
  });

  it('accepts valid name', () => {
    expect(VALIDATOR.customerName('สมชาย')).toBeNull();
    expect(VALIDATOR.customerName('John Doe')).toBeNull();
    expect(VALIDATOR.customerName('ก'.repeat(100))).toBeNull();
  });
});

// ─── VALIDATOR.phone ──────────────────────────────────────────────
describe('VALIDATOR.phone()', () => {
  it('accepts empty phone', () => {
    expect(VALIDATOR.phone('')).toBeNull();
    expect(VALIDATOR.phone(null)).toBeNull();
  });

  it('rejects too short phone', () => {
    expect(VALIDATOR.phone('0812')).toBe('เบอร์โทรไม่ถูกต้อง');
    expect(VALIDATOR.phone('0'.repeat(8))).toBe('เบอร์โทรไม่ถูกต้อง');
  });

  it('rejects too long phone', () => {
    expect(VALIDATOR.phone('0'.repeat(13))).toBe('เบอร์โทรยาวเกินไป');
  });

  it('accepts valid phone with non-digits', () => {
    expect(VALIDATOR.phone('081-234-5678')).toBeNull();
    expect(VALIDATOR.phone('089 876 5432')).toBeNull();
  });

  it('accepts 10-digit phone', () => {
    expect(VALIDATOR.phone('0812345678')).toBeNull();
  });

  // ── Multi-phone (Scenario 4) ─────────────────────────────────────
  it('accepts multi-phone comma separated', () => {
    expect(VALIDATOR.phone('0812345678, 0898765432')).toBeNull();
  });

  it('accepts multi-phone slash separated', () => {
    expect(VALIDATOR.phone('0812345678 / 0898765432')).toBeNull();
  });

  it('accepts multi-phone with mixed format', () => {
    expect(VALIDATOR.phone('081-234-5678, 089-876-5432')).toBeNull();
  });

  it('rejects if any part is too short', () => {
    expect(VALIDATOR.phone('0812345678, 123')).toBe('เบอร์โทรไม่ถูกต้อง');
  });

  it('rejects if any part is too long', () => {
    expect(VALIDATOR.phone('0812345678, 1234567890123')).toBe('เบอร์โทรยาวเกินไป');
  });

  it('accepts separators-only string as empty', () => {
    expect(VALIDATOR.phone(', / ;')).toBeNull();
  });
});

// ─── VALIDATOR.price ──────────────────────────────────────────────
describe('VALIDATOR.price()', () => {
  it('accepts empty price', () => {
    expect(VALIDATOR.price('')).toBeNull();
    expect(VALIDATOR.price(null)).toBeNull();
    expect(VALIDATOR.price(undefined)).toBeNull();
  });

  it('rejects non-numeric', () => {
    expect(VALIDATOR.price('abc')).toBe('ราคาต้องเป็นตัวเลข');
  });

  it('rejects negative', () => {
    expect(VALIDATOR.price('-100')).toBe('ราคาต้องไม่ติดลบ');
  });

  it('rejects over 1,000,000', () => {
    expect(VALIDATOR.price('1000001')).toBe('ราคาต้องไม่เกิน 1,000,000 บาท');
  });

  it('accepts valid price', () => {
    expect(VALIDATOR.price('0')).toBeNull();
    expect(VALIDATOR.price('500')).toBeNull();
    expect(VALIDATOR.price('1000000')).toBeNull();
  });
});

// ─── VALIDATOR.quantity ───────────────────────────────────────────
describe('VALIDATOR.quantity()', () => {
  it('accepts empty quantity', () => {
    expect(VALIDATOR.quantity('')).toBeNull();
    expect(VALIDATOR.quantity(null)).toBeNull();
  });

  it('rejects non-numeric', () => {
    expect(VALIDATOR.quantity('abc')).toBe('จำนวนต้องเป็นตัวเลข');
  });

  it('rejects negative', () => {
    expect(VALIDATOR.quantity('-1')).toBe('จำนวนต้องไม่ติดลบ');
  });

  it('rejects over 1000', () => {
    expect(VALIDATOR.quantity('1001')).toBe('จำนวนต้องไม่เกิน 1,000');
  });

  it('accepts valid quantity', () => {
    expect(VALIDATOR.quantity('0')).toBeNull();
    expect(VALIDATOR.quantity('4')).toBeNull();
    expect(VALIDATOR.quantity('1000')).toBeNull();
  });
});

// ─── VALIDATOR.tags ───────────────────────────────────────────────
describe('VALIDATOR.tags()', () => {
  it('accepts empty tags', () => {
    expect(VALIDATOR.tags('')).toBeNull();
    expect(VALIDATOR.tags(null)).toBeNull();
  });

  it('rejects tags over 200 chars', () => {
    expect(VALIDATOR.tags('x'.repeat(201))).toBe('แท็กยาวเกินไป');
  });

  it('accepts valid tags', () => {
    expect(VALIDATOR.tags('ยาง, ล้อ')).toBeNull();
  });
});

// ─── VALIDATOR.location ───────────────────────────────────────────
describe('VALIDATOR.location()', () => {
  it('accepts empty location', () => {
    expect(VALIDATOR.location('')).toBeNull();
    expect(VALIDATOR.location(null)).toBeNull();
  });

  it('rejects location over 500 chars', () => {
    expect(VALIDATOR.location('x'.repeat(501))).toBe('ที่อยู่ยาวเกินไป');
  });

  it('accepts valid location', () => {
    expect(VALIDATOR.location('123 ถ.สุขุมวิท กรุงเทพฯ')).toBeNull();
  });
});

// ─── showValidationErrors ─────────────────────────────────────────
describe('showValidationErrors()', () => {
  it('returns true when errors exist', () => {
    expect(showValidationErrors(['error'])).toBe(true);
  });

  it('returns false when no errors', () => {
    expect(showValidationErrors([])).toBe(false);
  });
});
