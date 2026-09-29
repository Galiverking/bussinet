import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extract } from './extractor.js';

// Mock genId to return deterministic value
vi.mock('../../utils/formatters.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    genId: () => 'test-uuid-0000',
    todayStr: () => '2026-06-28',
  };
});

// Mock Store - userLoc not set by default
vi.mock('../../core/store.js', () => ({
  default: {
    get: vi.fn((key) => {
      if (key === 'userLoc') return null;
      return null;
    }),
  },
}));

describe('extract()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts phone number from block', () => {
    const job = extract('เบอร์: 0812345678');
    expect(job.phone).toBe('0812345678');
  });

  it('extracts customer name', () => {
    const job = extract('ลูกค้า สมชาย\n');
    expect(job.customer_name).toBe('สมชาย');
  });

  it('extracts name from ชื่อ prefix', () => {
    const job = extract('ชื่อ John Doe\n');
    expect(job.customer_name).toBe('John Doe');
  });

  it('detects time note', () => {
    const job = extract('เวลา: 14.30');
    expect(job.time_note).toBe('14.30');
  });

  it('detects time with AM/PM', () => {
    const job = extract('ส่ง 2:30 PM');
    expect(job.time_note).toBe('2:30 PM');
  });

  it('extracts tyre sizes', () => {
    const job = extract('ยาง 185/65R15');
    expect(job.wheelSizes).toHaveLength(1);
    expect(job.wheelSizes[0]).toEqual({
      width: 185,
      profile: 65,
      rim: 15,
    });
  });

  it('extracts multiple tyre sizes', () => {
    const job = extract('185/65R15, 265/70R16');
    expect(job.wheelSizes).toHaveLength(2);
  });

  it('extracts quantity from เส้น/ชุด/ล้อ pattern', () => {
    const job = extract('4 เส้น 185/65R15');
    expect(job.quantity).toBe(4);
  });

  it('extracts explicit quantity via จำนวน', () => {
    const job = extract('จำนวน: 10');
    expect(job.quantity).toBe(10);
  });

  it('extracts priority', () => {
    const job = extract('priority: 3');
    expect(job.priority).toBe(3);
  });

  it('clamps priority to 0-5', () => {
    const job = extract('priority: 10');
    expect(job.priority).toBe(5);
  });

  it('extracts note/remark', () => {
    const job = extract('หมายเหตุ: ส่งด่วน');
    expect(job.note).toBe('ส่งด่วน');
  });

  it('sets status, date, id defaults', () => {
    const job = extract('any text');
    expect(job.status).toBe('pending');
    expect(job.created_at).toBeDefined();
    expect(job.id).toBe('test-uuid-0000');
    expect(job.date).toBe('2026-06-28');
  });

  it('sets quantity=0 when none extracted', () => {
    const job = extract('just some text');
    expect(job.quantity).toBe(0);
  });

  it('sets wheelSizes=[] when none extracted', () => {
    const job = extract('just some text');
    expect(job.wheelSizes).toEqual([]);
  });
});

// [FIX 2026-09-29] จำนวนวงเคยจับเลขจากพิกัด/เบอร์โทร
// เช่น "คลองสอง27" → 27 วง, "63/60 หมู่ 10" → 12 วง
// เคสจริงจากแชทลูกค้า 7 ข้อความ (27 กย 69)
describe('extract() — จำนวนวงต้องมาจากคำวง/ชุด/ล้อเท่านั้น', () => {
  const REAL = [
    ['16/4วงราคา 2,000 บาท ใน 99/735 มบ.ชลลดา-สุวรรณภูมิ เลียบคลองสอง27', 4],
    ['18/4วง ราคา2,800บาท ถนน เลียบคลองสอง27 คลองสามวา', 4],
    ['18/4วงราคา 2,700 บาท นิรันดร์วิลล์12 63/60 หมู่ 10 ซอย3', 4],
    ['18/2วง ราคา 1,200 บาท วัดโสภณาราม', 2],
  ];

  it.each(REAL)('ไม่จับเลขจากพิกัด: %s', (block, want) => {
    expect(extract(block).quantity).toBe(want);
  });

  it('นับจากคำวงได้', () => {
    expect(extract('ยาง 18/4 4 วง ราคา 8,000').quantity).toBe(4);
  });

  it('1 ชุด = 4 วง', () => {
    expect(extract('ยาง 17/4 2 ชุด ราคา 6,000').quantity).toBe(8);
  });

  it('ไม่ใช้ profile เป็นจำนวนวง', () => {
    // profile = 4 หมายถึงหน้ายาง ไม่ใช่ 4 วง
    expect(extract('18/4วงราคา 2,000').quantity).toBe(4);
    expect(extract('18/12วงราคา 3,000').quantity).toBe(12);
  });

  it('ชื่อไลน์ถูกอ่านเป็นชื่อลูกค้า', () => {
    const job = extract('โทร:0824972259\n\nชื่อไลน์ : The Pooh');
    expect(job.customer_name).toBe('The Pooh');
  });

  it('ชื่อไลน์พร้อมหมายเหตุต่อบรรทัด', () => {
    const job = extract('โทร : 084706059\n\nชื่อไลน์ : Sompong\nหลังบ่าย2');
    expect(job.customer_name).toBe('Sompong');
  });
});

