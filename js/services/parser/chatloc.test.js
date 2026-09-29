import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/formatters.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, esc: (s) => s, toast: vi.fn() };
});
vi.mock('../../utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn() } }));

const { extract } = await import('./extractor.js');
const { isChatLocPending, buildMapsUrl } = await import('../location.js');

describe('chat location detection', () => {
  it('detects โลเคชั่นทางแชท as placeholder', () => {
    const j = extract('ลูกค้า ก 0812345678 โลเคชั่นทางแชท หน้าร้านวัลลภ 18/4 2 ชุด ราคา 2600');
    expect(j.locationType).toBe('placeholder');
    expect(j.location_raw).toContain('(โลเคชั่นทางแชท)');
    expect(isChatLocPending(j)).toBe(true);
  });

  it('detects พิกัดจากแชท as placeholder', () => {
    const j = extract('ลูกค้า ข 0899998888 พิกัดจากแชท ใกล้บิ๊กซี 18/4 6 ชุด ราคา 7800');
    expect(j.locationType).toBe('placeholder');
  });

  it('detects โลเคชั่นทางช่องแชท (with ช่อง) as placeholder', () => {
    const j = extract('ลูกค้า ค 0811112222 โลเคชั่นทางช่องแชท หน้าวัดกลาง 18/4 1 ชุด ราคา 1300');
    expect(j.locationType).toBe('placeholder');
    expect(j.location_raw).toContain('(โลเคชั่นทางแชท)');
    expect(isChatLocPending(j)).toBe(true);
  });

  it('detects พิกัดจากช่องแชท (with ช่อง) as placeholder', () => {
    const j = extract('ลูกค้า ง 0833334444 พิกัดจากช่องแชท ตลาดนัดหลังบ้าน 18/4 4 ชุด ราคา 5200');
    expect(j.locationType).toBe('placeholder');
  });

  it('extracts address BEFORE paren for "พิกัด : X (โลเคชั่นทางช่องแชท)"', () => {
    const text = `3.พิกัด : บ้านแพ้ว อำเภอบ้านแพ้ว สมุทรสาคร(โลเคชั่นทางช่องแชท)

โทร :0910422412 

ล้อ :2 วงพร้อมยางราคา1,400บ.

ชื่อเฟส : Pai`;
    const j = extract(text);
    expect(j.locationType).toBe('placeholder');
    expect(j.location_raw).toBe('บ้านแพ้ว อำเภอบ้านแพ้ว สมุทรสาคร (โลเคชั่นทางแชท)');
    expect(isChatLocPending(j)).toBe(true);
    expect(j.customer_name).toBe('Pai');
    expect(j.phone).toBe('0910422412');
    expect(j.price).toBe(1400);
  });

  // The old test asserted buildMapsUrl() read job.loc_override, but that column
  // was never in the schema. Commit bcbf9ef replaced it deliberately: a
  // resolved chat location is stored as location_raw = the https URL together
  // with location_type = 'url' (see modals.js:560, saveMapsLink). These two
  // cases cover the design that actually shipped.
  it('buildMapsUrl returns null for placeholder', () => {
    const j = { locationType: 'placeholder', location_raw: 'x (โลเคชั่นทางแชท)' };
    expect(buildMapsUrl(j)).toBeNull();
  });

  it('buildMapsUrl returns the stored URL when locationType is url', () => {
    const j = { locationType: 'url', location_raw: 'https://maps.google.com/?q=1,2' };
    expect(buildMapsUrl(j)).toBe('https://maps.google.com/?q=1,2');
  });

  it('buildMapsUrl rejects a non-https URL even when locationType is url', () => {
    const j = { locationType: 'url', location_raw: 'javascript:alert(1)' };
    expect(buildMapsUrl(j)).toBeNull();
  });
});
