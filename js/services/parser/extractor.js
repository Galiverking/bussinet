// Parser Extractor — Extract data from a block

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
  // เบอร์/โทร/Tel/Phone + optional separator + 9-15 digits/spaces/dashes
  m = block.match(/(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s-]{9,15})/i);
  if (m) {
    job.phone = m[1].replace(/[^\d]/g, '').slice(0, 10);
  }

  // ---- CUSTOMER NAME ----
  // Accept patterns: ชื่อ/ลูกค้า/คุณ + name (2+ chars up to : or space-delimited)
  m = block.match(
    /(?:ชื่อ|ลูกค้า|คุณ)\s+([\p{L} .-]+?)[:\n]|^([\p{L} .-]{2,30})$/mu
  );
  if (m) job.customer_name = (m[1] || m[2] || '').trim();

  // ---- ADDRESS / LOCATION ----
  // Find address lines: typically after name/phone, containing Thai chars + digits
  m = block.match(
    /(?:ที่อยู่|地址|Loc|l\.)\s*[:：]?\s*(.+?)[\n]|(?:[\p{L}].*?[ตอ].+?\d{2,})/i
  );
  if (m) {
    const addr = (m[1] || m[0]).trim();
    const loc = classifyLoc(addr);
    job.location_raw = loc.raw;
    job.location_type = loc.type;
    job.coords = loc.coords || null;
  } else {
    // fallback: anything that looks like a location
    const fallback = block.match(/(.+?)\s*\d{5,}/);
    if (fallback) {
      const loc = classifyLoc(fallback[1].trim());
      job.location_raw = loc.raw;
      job.location_type = loc.type;
      job.coords = loc.coords || null;
    }
  }

  // ---- TIME NOTE ----
  // เวลา/นัด/ถึง/ส่ง/after/before + time pattern
  m = block.match(
    /(?:เวลา|นัด|ถึง|ส่ง|after|before)\s*[:：]?\s*(\d{1,2}[.:]\d{2}(?:\s*[AP]M)?)/i
  );
  if (m) job.time_note = m[1];

  // ---- TYRE/WHEEL SIZES ----
  // Match patterns like "ยาง 185/65R15", "265/70R16", "4 เส้น 195/60R15"
  const tyreRegex = /(\d{3})\/[-]?(\d{2,3})R?(\d{2,3})/g;
  let match;
  const sizes = [];
  while ((match = tyreRegex.exec(block)) !== null) {
    const width = parseInt(match[1], 10);
    const profile = parseInt(match[2], 10);
    const rim = parseInt(match[3], 10);
    sizes.push({ width, profile, rim });
  }
  if (sizes.length) {
    job.wheelSizes = sizes;
    // Attempt to determine quantity: "4 เส้น", "2 ชุด", "6 ล้อ"
    const qtyMatch = block.match(/(\d+)\s*(?:เส้น|ชุด|ล้อ)/);
    if (qtyMatch) job.quantity = parseInt(qtyMatch[1], 10);
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
  if (job.location_type === 'coords') {
    const userLoc = Store.get('userLoc');
    if (userLoc) {
      const c = parseCoords(job.location_raw);
      if (c)
        job.distance_km = haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
    }
  }

  return job;
}
