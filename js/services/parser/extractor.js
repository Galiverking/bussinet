// Parser Extractor — Extract data from a block
// TEMP PATCH (2026-07-19): added พิกัด (coords) and ชื่อเฟส (customer) capture
// to handle teacher data where records are 1-blank-line separated and use
// "พิกัด ..." / "ชื่อเฟส ..." instead of "ที่อยู่"/"ชื่อ".

import { genId, todayStr } from '../../utils/formatters.js';
import { classifyLoc, parseCoords, haversine } from '../location.js';
import Store from '../../core/store.js';

/**
 * Thai address/order block → structured job object.
 * Handles multiple formats: phone, name, address, time, coords, tyres, notes.
 */
export function extract(block) {
  const job = {
    id: genId(),
    status: 'pending',
    created_at: new Date().toISOString(),
    date: todayStr(),
    distance_km: null,
    priority: 0,
    quantity: 0,
    wheelSizes: [],
  };
  let m;

  // ---- PHONE ----
  // แก้บัค: จับเบอร์โทรได้ทั้งมีคำนำ (เบอร์/โทร) และแบบติดชื่อเลย (ลูกค้า ก 0812345678)
  // Pattern 1: มีคำนำ เบอร์/โทร/Tel/Phone
  m = block.match(/(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s-]{9,15})/i);
  if (m) {
    job.phone = m[1].replace(/[^\d]/g, '').slice(0, 10);
  } else {
    // Pattern 2: เบอร์โทรไทย 0xxxxxxxxx (9-10 ตัว) แบบไม่มีคำนำ
    // ต้องขึ้นต้นด้วย 0 และอยู่หลังช่องว่าง หรือขึ้นต้นบล็อก
    const pm = block.match(/(?:^|\s)(0\d{8,9})(?:\s|$)/);
    if (pm) {
      job.phone = pm[1];
    }
  }

  // ---- CUSTOMER NAME ----
  // Accept patterns: ชื่อเฟส/ลูกค้า/คุณ/ชื่อ/เฟส + name
  // (TEMP) handles "ชื่อเฟสมานี" (no space) and "ชื่อเฟส มานี".
  // \p{M} included for Thai combining vowels (ี ู ์ etc.)
  m = block.match(
    /(?:ชื่อเฟส|ลูกค้า|คุณ|ชื่อ|เฟส)\s*[:：]?\s*([\p{L}\p{M}\d .'-]{1,30}?)\s*(?=\d{9,10}|พิกัด|ที่อยู่|โทร|เบอร์|$)/mu
  );
  if (!m) {
    m = block.match(/^([\p{L}\p{M}\d .'-]{2,30})$/mu);
  }
  if (m) job.customer_name = (m[1] || m[2] || '').trim();

  // [FIX 2026-07-19] Fallback: ถ้าไม่มีคำนำ ให้จับชื่อจากข้อความแรกที่มีอักษรไทย
  // (รองรับ "ร้านวรรณา 0822223333 ..." แบบไม่มีคำนำ ลูกค้า/ชื่อ)
  if (!job.customer_name) {
    // แก้บัค: ตัดเบอร์โทรออกก่อนเช็คชื่อ (รองรับ "ร้านวรรณา 0822223333 ...")
    const cleaned = block.replace(/0\d{8,9}/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of cleaned) {
      if (/^(?:เบอร์|โทร|พิกัด|ที่อยู่|ราคา|ล้อ|ชื่อเฟส|เวลา|นัด)/i.test(line)) continue;
      const nm = line.match(/^[\p{L}\p{M}][\p{L}\p{M}\d .'-]{1,30}/u);
      if (nm && nm[0].trim().length >= 2) {
        job.customer_name = nm[0].trim();
        break;
      }
    }
  }

  // ---- COORDS (พิกัด) ----
  // (TEMP) capture "พิกัด 13.7563, 100.5018" before the address heuristic
  m = block.match(
    /(?:พิกัด|coord|gps|location)\s*[:：]?\s*(-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+)/i
  );
  if (m) {
    const c = m[1].replace(/\s+/g, ''); // "13.7563,100.5018"
    const pc = parseCoords(c);
    if (pc) {
      job.location_raw = c;
      job.locationType = 'coords';
      job.coords = pc;
    }
  }

  // [FEAT 2026-07-19] ตรวจจับพิกัดจากแชท/ไลน์ ("โลเคชั่นทางแชท")
  if (!job.location_raw) {
    const chatLoc = block.match(/(?:โลเคชั่นทาง(?:ช่อง)?แชท|location|พิกัด(?:จาก)?(?:ช่อง)?แชท|ส่งพิกัด|ตำแหน่งจากแชท)/i);
    if (chatLoc) {
      // กรณีที่ 1: ข้อความพิกัดอยู่ข้างหน้าวงเล็บ → "บ้านแพ้ว... (โลเคชั่นทางช่องแชท)"
      const parenMatch = block.match(/([^()\n]{3,100})\s*\((?:โลเคชั่นทาง(?:ช่อง)?แชท)\)/iu);
      // กรณีที่ 2: ข้อความพิกัดอยู่ต่อท้ายคำแชท → "โลเคชั่นทางแชท หน้าร้านวัลลภ"
      const rawMatch = block.match(/(?:โลเคชั่นทาง(?:ช่อง)?แชท|location)[^\n]*?([\p{L}\d\s./,-]{3,60})/iu);
      let raw = parenMatch
        ? parenMatch[1].trim()
        : rawMatch
          ? rawMatch[1].trim()
          : 'พิกัดจากแชท';
      // ตัดคำนำ "พิกัด :" / "พิกัด:" ออกให้เหลือแค่ชื่อสถานที่
      raw = raw.replace(/^(?:\d*\.?\s*)?พิกัด\s*[:：]\s*/i, '').trim();
      job.location_raw = raw + ' (โลเคชั่นทางแชท)';
      job.locationType = 'placeholder';
      job.coords = null;
    }
  }

  // ---- ADDRESS / LOCATION ----
  // Find address lines: typically after name/phone, containing Thai chars + digits
  // (skip entirely if Case B already resolved a location)
  if (!job.location_raw) {

  // Case B (teacher): "พิกัด : <text address>" or "1.พิกัด : <addr>"
  if (!job.locationType || job.locationType !== 'coords') {
    const pm = block.match(
      /\d*\.?\s*พิกัด\s*[:：]\s*([^\n]+(?:\n(?!โทร|ล้อ|ชื่อเฟส|ชื่อ)[^\n]+)*)/i
    );
    if (pm) {
      const loc = classifyLoc(pm[1].trim());
      job.location_raw = loc.raw;
      job.locationType = loc.type;
      job.coords = loc.coords || null;
    }
  }

  if (!job.location_raw) {
    m = block.match(
      /(?:ที่อยู่|地址|Loc|l\.)[ ]*[:：]?\s*(.+?)[\n]|(?:[\p{L}].*?[ตอ].+?\d{2,})/i
    );
    if (m) {
      const addr = (m[1] || m[0]).trim();
      const loc = classifyLoc(addr);
      job.location_raw = loc.raw;
      job.locationType = loc.type;
      job.coords = loc.coords || null;
    } else {
      // fallback: anything that looks like a location
      const fallback = block.match(/(.+?)\s*\d{5,}/);
      if (fallback) {
        const loc = classifyLoc(fallback[1].trim());
        job.location_raw = loc.raw;
        job.locationType = loc.type;
        job.coords = loc.coords || null;
      }
    }
  }
}

  // ---- TIME NOTE ----
  // เวลา/นัด/ถึง/ส่ง/after/before + time pattern
  m = block.match(
    /(?:เวลา|นัด|ถึง|ส่ง|after|before)\s*[:：]?\s*(\d{1,2}[.:]\d{2}(?:\s*[AP]M)?)/i
  );
  if (m) job.time_note = m[1];

  // ---- TYRE/WHEEL SIZES ----
  // Pattern 1: standard "185/65R15" (with R)
  const tyreRegex = /(\d{1,3})\/[-]?(\d{1,3})R?(\d{1,3})/g;
  let match;
  const sizes = [];
  while ((match = tyreRegex.exec(block)) !== null) {
    const width = parseInt(match[1], 10);
    const profile = parseInt(match[2], 10);
    const rim = parseInt(match[3], 10);
    sizes.push({ width, profile, rim });
  }

  // Pattern 2 (teacher): "18/4 วงราคา", "2 วงพร้อมยาง", "2ชุดราคา"
  if (sizes.length === 0) {
    const tw = block.match(/(\d{1,2})\/(\d{1,2})(?:\s*(?:วง|ชุด|ล้อ))?/);
    if (tw) {
      sizes.push({
        width: parseInt(tw[1], 10),
        profile: parseInt(tw[2], 10),
        rim: 0,
      });
    } else {
      // "2 วงพร้อมยาง", "2ชุดราคา" — no size given, just quantity
      // [FIX 2026-07-19] ใช้ (?<![\d]) กันจับท้ายเบอร์โทร
      // [FIX 2026-07-19] 1 ชุด = 4 วง → แปลงชุดเป็นวงก่อนนับ
      const qm = block.match(/(?<![\d])\d{1,3}\s*(?:วง|ชุด)(?:\s*พร้อมยาง|\s*ราคา)?/);
      if (qm) {
        const num = parseInt(qm[0].replace(/\D/g, ''), 10);
        const isSet = /ชุด/.test(qm[0]);
        job.quantity = isSet ? num * 4 : num;
        job.wheel_str = `${job.quantity} วง`;
      }
    }
  }
  if (sizes.length) {
    job.wheelSizes = sizes;
    // Build human-readable wheel string: "18/4 วง" etc.
    job.wheel_str = sizes
      .map((s) => (s.rim ? `${s.width}/${s.profile}R${s.rim}` : `${s.width}/${s.profile}`))
      .join(', ');
    // Attempt to determine quantity: "4 เส้น", "2 ชุด", "6 ล้อ", "2 วง"
    // [FIX 2026-07-19] ใช้ (?<![\d]) กันจับท้ายเบอร์โทร (เช่น ...456 วง)
    const qtyMatch = block.match(/(?<![\d])\d{1,3}\s*(?:เส้น|ชุด|ล้อ|วง)/);
    if (qtyMatch) {
      const num = parseInt(qtyMatch[0].replace(/\D/g, ''), 10);
      // [FIX 2026-07-19] 1 ชุด = 4 วง
      job.quantity = /ชุด/.test(qtyMatch[0]) ? num * 4 : num;
    }
  }

  // ---- PRICE ----
  // "ราคา 2,600บาท", "1,400บ.", "5,000 บาท"
  m = block.match(/ราคา\s*[:：]?\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?/i);
  if (m) {
    job.price = parseInt(m[1].replace(/,/g, ''), 10);
  } else {
    // fallback: number near "บาท"/"บ."
    m = block.match(/([\d,]+)\s*(?:บาท|บ\.?|฿)/i);
    if (m) job.price = parseInt(m[1].replace(/,/g, ''), 10);
  }

  // ---- QUANTITY (explicit) ----
  if (!job.quantity) {
    m = block.match(/จำนวน\s*[:：]?\s*(\d+)/);
    if (m) job.quantity = parseInt(m[1], 10);
  }

  // ---- PRIORITY ----
  m = block.match(/(?:ด่วน|รีบ|เร่ง|priority)\s*[:：]?\s*(\d+)/i);
  if (m) job.priority = Math.min(5, Math.max(0, parseInt(m[1], 10)));

  // ---- NOTE / REMARK ----
  m = block.match(/(?:หมายเหตุ|note|remark)\s*[:：]?\s*(.+)/i);
  if (m) job.note = m[1].trim().slice(0, 200);

  // ---- TIME NOTE (alt pattern) ----
  if (!job.time_note) {
    m = block.match(/(\d{1,2}[.:]\d{2})\s*(?:น\.|น|โมง)/);
    if (m) job.time_note = m[1].replace(/[*]+/g, '').trim().slice(0, 50);
  }

  job.raw_note = block;

  // ---- DISTANCE (if coords + user location available) ----
  if (job.locationType === 'coords') {
    const userLoc = Store.get('userLoc');
    if (userLoc) {
      const c = parseCoords(job.location_raw);
      if (c)
        job.distance_km = haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
    }
  }

  // [LOG 2026-07-19] รายงาน field ที่ได้ vs หาย (debug วิเคราะห์เพี้ยน)
  const REQUIRED = ['phone', 'customer_name', 'location_raw', 'wheel_str', 'price'];
  const missing = REQUIRED.filter((k) => !job[k]);
  console.log(
    `[EXTRACT] ${job.customer_name || '?(no-name)'} | ` +
      `phone=${job.phone || '❌'} name=${job.customer_name || '❌'} ` +
      `loc=${job.location_raw ? '✓' : '❌'} wheel=${job.wheel_str || '❌'} ` +
      `qty=${job.quantity ?? '❌'} price=${job.price ?? '❌'}`
  );
  if (missing.length) {
    console.warn(`[EXTRACT] ⚠ block missing: ${missing.join(', ')} | raw="${block.slice(0, 50).replace(/\n/g, '⏎')}…"`);
  }

  return job;
}
