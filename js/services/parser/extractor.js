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
        // [FIX 2026-07-30] Trim at boundary keywords to prevent "สมชาย โทร"
        let name = nm[0].trim();
        const stopWords = [' โทร', ' เบอร์', ' พิกัด', ' ที่อยู่', ' ราคา', ' ล้อ', ' เวลา', ' นัด', ' หมายเหตุ'];
        for (const w of stopWords) {
          const idx = name.indexOf(w);
          if (idx >= 2) {
            name = name.substring(0, idx).trim();
            break;
          }
        }
        job.customer_name = name;
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
    const chatLoc = block.match(/(?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท|location|พิกัด(?:จาก)?(?:ช่อง)?แชท|ส่งพิกัด|ตำแหน่งจากแชท)/i);
    if (chatLoc) {
      // กรณีที่ 1: ข้อความพิกัดอยู่ข้างหน้าวงเล็บ → "บ้านแพ้ว... (โลเคชั่นทางช่องแชท)"
      // [FIX 2026-07-28] รองรับ "โลเคชั่นช่องแชท" (ไม่มีคำว่า ทาง) และ } เป็นวงเล็บปิด
      const parenMatch = block.match(/([^()[\]\n{}]{3,100})\s*[\[({](?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท)[\])}]/iu);
      // กรณีที่ 2: ข้อความพิกัดอยู่ต่อท้ายคำแชท → "โลเคชั่นทางแชท หน้าร้านวัลลภ"
      const rawMatch = block.match(/(?:โลเคชั่น(?:ทาง)?(?:ช่อง)?แชท|location)[^\n]*?([\p{L}\d\s./,-]{3,60})/iu);
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
  // Pattern 1: standard "185/65R15" (with R) - allow space before R
  // [FIX 2026-07-30] space before/after R (185/65 R15 → now matched)
  const tyreRegex = /(\d{1,3})\/[-]?(\d{1,3})\s*R\s*(\d{1,3})/g;
  let match;
  const sizes = [];
  while ((match = tyreRegex.exec(block)) !== null) {
    const width = parseInt(match[1], 10);
    const profile = parseInt(match[2], 10);
    const rim = parseInt(match[3], 10);
    sizes.push({ width, profile, rim });
  }

  // Pattern 2 (teacher): "18/4 วงราคา", "2 วงพร้อมยาง", "2ชุดราคา"
  // [FIX 2026-07-26] require วง/ชุด/ล้อ keyword; add g flag for multiple wheels (e.g. "17/1ชุด+18/1ชุด")
  // [FIX 2026-07-26 v2] capture unit (วง/ชุด/ล้อ) for accurate wheel count calculation
  if (sizes.length === 0) {
    const teacherRegex = /(?:^|[^\/\d])(\d{1,2})\/(\d{1,2})\s*(วง|ชุด|ล้อ)/g;
    let tw;
    while ((tw = teacherRegex.exec(block)) !== null) {
      sizes.push({
        width: parseInt(tw[1], 10),
        profile: parseInt(tw[2], 10),
        rim: 0,
        unit: tw[3],
      });
    }

    // Still no wheel size? Try quantity-only format
    if (sizes.length === 0) {
      // "2 วงพร้อมยาง", "2ชุดราคา" — no size given, just quantity
      // [FIX 2026-07-19] ใช้ (?<![\d]) กันจับท้ายเบอร์โทร
      // [FIX 2026-07-19] 1 ชุด = 4 วง → แปลงชุดเป็นวงก่อนนับ
      const qm = block.match(/(?<![\d])[ \t]*\d{1,3}\s*(?:วง|ชุด)(?:\s*พร้อมยาง|\s*ราคา)?/);
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
      // [FIX 2026-07-19] ใช้ (?<!\d) กันจับท้ายเบอร์โทร (เช่น ...456 วง)
      // [FIX 2026-07-26] Strip wheel size patterns, then find first standalone number ≠ price
      // "18/1วง 1 800" → strip "18/1วง" → " 1 800" → qty=1 (first num ≠ price=800)
      // "17/1ชุด+18/1ชุด 2 ราคา6000" → strip both → " 2 ราคา6000" → qty=2 (≠ 6000)
      const qtyClean = block.replace(
        /(?<!\d)\d{1,2}\/\d{1,2}\s*(?:วง|ชุด|ล้อ|พร้อมยาง)(?:\s*\+\s*(?:\s*\d{1,2}\/\d{1,2}\s*(?:วง|ชุด|ล้อ|พร้อมยาง)))*/g,
        ' '
      );
      const allNums = qtyClean.match(/(?<!\d)\d{1,3}(?:\s|$)/g);
      if (allNums) {
        const p = job.price || 0;
        for (const n of allNums) {
          const parsed = parseInt(n, 10);
          if (parsed !== p && parsed <= 99) {
            job.quantity = parsed;
            break;
          }
        }
      }
      // [FIX 2026-07-30] When wheelSizes have unit info, calculate quantity from profile
      // (รองรับ order 7: 15/4วง(4)+17/4วง(4)+18/12วง(12) = 20)
      // ทำหลังจาก regex fallback เพื่อ override ค่าที่ผิด
      if (!job.quantity && sizes[0].unit) {
        job.quantity = sizes.reduce((sum, s) => {
          const count = s.profile || 1;
          return sum + (s.unit === 'ชุด' ? count * 4 : count);
        }, 0);
      }
    }

  // ---- PRICE ----
  // [FIX 2026-07-30] Sum ALL price lines (รองรับ order 7: 1,600+2,000+8,100 = 11,700)
  const priceRegex = /ราคา\s*[:：]?\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?/gi;
  const priceMatches = [...block.matchAll(priceRegex)];
  if (priceMatches.length > 0) {
    job.price = priceMatches.reduce((sum, m) => {
      return sum + parseInt(m[1].replace(/,/g, ''), 10);
    }, 0);
  } else {
    // fallback: number near "บาท"/"บ."
    m = block.match(/([\d,]+)\s*(?:บาท|บ\.?|฿)/i);
    if (m) job.price = parseInt(m[1].replace(/,/g, ''), 10);
  }
  // [FIX 2026-07-26] fallback: standalone 3-5 digit number at end of block
  // (e.g. "15/2วง 2 800" — 800 at end, no "ราคา" prefix)
  if (!job.price) {
    m = block.match(/(?<!\d)(\d{3,5})\s*$/);
    if (m) job.price = parseInt(m[1], 10);
  }
  // [FIX 2026-07-30] Check for "รวมเป็นเงิน" or "รวมเป็นเงิน" total
  // (e.g. "รวมเป็นเงิน11,700บาท" — ใช้เป็นราคาจริงถ้ามากกว่าที่ยกมา)
  const totalMatch = block.match(/รวม(?:เป็น)?เงิน\s*([\d,]+)\s*(?:บาท|บ\.?|฿)?/i);
  if (totalMatch) {
    const totalPrice = parseInt(totalMatch[1].replace(/,/g, ''), 10);
    if (totalPrice > job.price) {
      job.price = totalPrice;
    }
  }

  // ---- QUANTITY (explicit) ----
  if (!job.quantity) {
    m = block.match(/จำนวน\s*[:：]?\s*(\d+)/);
    if (m) job.quantity = parseInt(m[1], 10);
  }
  // [FIX 2026-07-26] fallback: first standalone number ≠ price (when no wheel sizes)
  // e.g. "ตาหนู่ย" → "5 ราคา2500" → qty=5 (≠ price=2500, ≤ 99)
  if (!job.quantity) {
    const fallbackNums = block.match(/(?<!\d)\d{1,3}(?!\s*\d)/g);
    if (fallbackNums) {
      const p = job.price || 0;
      for (const n of fallbackNums) {
        const parsed = parseInt(n, 10);
        if (parsed !== p && parsed <= 99) {
          job.quantity = parsed;
          break;
        }
      }
    }
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
