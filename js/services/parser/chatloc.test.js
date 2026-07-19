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

  it('buildMapsUrl returns null for placeholder without override', () => {
    const j = { locationType: 'placeholder', location_raw: 'x (โลเคชั่นทางแชท)', loc_override: null };
    expect(buildMapsUrl(j)).toBeNull();
  });

  it('buildMapsUrl uses loc_override when present', () => {
    const j = { locationType: 'placeholder', location_raw: 'x (โลเคชั่นทางแชท)', loc_override: 'https://maps.google.com/?q=1,2' };
    expect(buildMapsUrl(j)).toBe('https://maps.google.com/?q=1,2');
  });
});
