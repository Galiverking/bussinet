import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/store.js', () => ({
  default: {
    get: vi.fn((key) => {
      if (key === 'userLoc') return { lat: 13.7563, lng: 100.5018 };
      return null;
    }),
  },
}));

vi.mock('../../utils/formatters.js', () => ({ toast: vi.fn() }));
vi.mock('./supabase.js', () => ({ updateJobDistance: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('haversine()', () => {
  let haversine;
  beforeEach(async () => { vi.resetModules(); haversine = (await import('./location.js')).haversine; });

  it('returns 0 for same coordinates', () => {
    expect(haversine(13.7563, 100.5018, 13.7563, 100.5018)).toBe(0);
  });
  it('calculates ~1km for ~0.01 degree lat', () => {
    const dist = haversine(13.7563, 100.5018, 13.7663, 100.5018);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(2);
  });
  it('calculates ~110km for ~1 degree lat', () => {
    const dist = haversine(13.7563, 100.5018, 14.7563, 100.5018);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });
  it('is symmetric', () => {
    expect(haversine(0, 0, 10, 10)).toBeCloseTo(haversine(10, 10, 0, 0), 5);
  });
});

describe('parseCoords()', () => {
  let parseCoords;
  beforeEach(async () => { vi.resetModules(); parseCoords = (await import('./location.js')).parseCoords; });

  it('parses standard format', () => {
    expect(parseCoords('13.7563, 100.5018')).toEqual({ lat: 13.7563, lng: 100.5018 });
  });
  it('handles negative coordinates', () => {
    expect(parseCoords('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
  it('returns null for empty input', () => {
    expect(parseCoords('')).toBeNull();
    expect(parseCoords(null)).toBeNull();
  });
  it('returns null for invalid input', () => {
    expect(parseCoords('not coords')).toBeNull();
  });
});

describe('classifyLoc()', () => {
  let classifyLoc;
  beforeEach(async () => { vi.resetModules(); classifyLoc = (await import('./location.js')).classifyLoc; });

  it('classifies GPS coordinates', () => expect(classifyLoc('13.7563, 100.5018').type).toBe('coords'));
  it('classifies Google Maps URL', () => expect(classifyLoc('https://maps.google.com/?q=13.75,100.5').type).toBe('url'));
  it('classifies maps.app.goo.gl', () => expect(classifyLoc('https://maps.app.goo.gl/abc123').type).toBe('url'));
  it('classifies chat placeholder', () => expect(classifyLoc('ช่องแชท').type).toBe('placeholder'));
  it('classifies ทางไลน์ as placeholder', () => expect(classifyLoc('ทางไลน์').type).toBe('placeholder'));
  it('classifies plain text as place', () => expect(classifyLoc('123 ถ.สุขุมวิท').type).toBe('place'));
  it('returns place for empty/null', () => {
    expect(classifyLoc('').type).toBe('place');
    expect(classifyLoc(null).type).toBe('place');
  });
});

describe('buildMapsUrl()', () => {
  let buildMapsUrl;
  beforeEach(async () => { vi.resetModules(); buildMapsUrl = (await import('./location.js')).buildMapsUrl; });

  it('builds coords URL', () => {
    expect(buildMapsUrl({ location_raw: '13.7563, 100.5018', locationType: 'coords' }))
      .toBe('https://maps.google.com/?q=13.7563,100.5018');
  });
  it('passes through URL type', () => {
    expect(buildMapsUrl({ location_raw: 'https://maps.app.goo.gl/abc', locationType: 'url' }))
      .toBe('https://maps.app.goo.gl/abc');
  });
  it('encodes place name', () => {
    const url = buildMapsUrl({ location_raw: 'ตึกเจริญภัณฑ์', locationType: 'place' });
    expect(url).toContain(encodeURIComponent('ตึกเจริญภัณฑ์'));
  });
  it('returns null for placeholder', () => {
    expect(buildMapsUrl({ location_raw: 'ช่องแชท', locationType: 'placeholder' })).toBeNull();
  });
  it('returns null for empty location', () => {
    expect(buildMapsUrl({ location_raw: '', locationType: 'place' })).toBeNull();
  });
  it('rejects non-https URLs', () => {
    expect(buildMapsUrl({ location_raw: 'http://evil.com', locationType: 'url' })).toBeNull();
  });
});

describe('getETAText()', () => {
  let getETAText;
  beforeEach(async () => { vi.resetModules(); getETAText = (await import('./location.js')).getETAText; });

  it('returns empty for null', () => expect(getETAText(null)).toBe(''));
  it('returns "อีก 1 นาที" for tiny distance (ceil rounds to 1)', () => expect(getETAText(0.1)).toBe('อีก 1 นาที'));
  it('returns minutes for <60 min', () => expect(getETAText(10)).toBe('อีก 15 นาที'));
  it('returns hours for >=60 min', () => expect(getETAText(80)).toContain('ชม.'));
});

describe('normalizeThaiNumber()', () => {
  let normalizeThaiNumber;
  beforeEach(async () => { vi.resetModules(); normalizeThaiNumber = (await import('./location.js')).normalizeThaiNumber; });

  it('replaces Thai number words with Arabic digits', () => {
    expect(normalizeThaiNumber('หนึ่งสองสาม')).toBe('123');
  });
  it('lowercases and strips whitespace/parens', () => {
    expect(normalizeThaiNumber('ABC (DEF)')).toBe('abcdef');
  });
});
