// Parser Extractor - Extract data from a block

import { genId, todayStr } from '../../utils/formatters.js';
import { classifyLoc, parseCoords, haversine } from '../location.js';

export function extract(block) {
  const job = {
    id: genId(),
    status: 'pending',
    created_at: new Date().toISOString(),
    date: todayStr(),
    distance_km: null,
    priority: 0,
    quantity: 0,
    wheelSizes: []
  };

  // Customer name
  let m = block.match(/ชื่อ(?:เฟส)?\s*[:：]\s*(.+)/i);
  if (m) {
    job.customer_name = m[1].trim().split('\n')[0].trim();
  }

  if (!job.customer_name) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (
        !/^\d+\.พิกัด|โทร|ล้อ|ราคา|ชื่อ|ไม่เกิน|ก่อน|หลัง|รวม|\*\*/i.test(line) &&
        !/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF]){2,}/u.test(line)
      ) {
        job.customer_name = line.replace(/^[☀️🌞🌟\-\s#*0-9.]+/, '').trim().split('\n')[0].trim();
        if (job.customer_name) break;
      }
    }
  }

  // Phone with multi-number support
  m = block.match(/(?:เบอร์|โทร|Tel|Phone)\s*[:：]?\s*([\d\s\-]{9,15})/i);
  if (m) {
    job.phone = m[1].replace(/\D/g, '').slice(0, 10);
    const phoneArea = block.substring(block.indexOf(m[0]));
    const lines = phoneArea.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const secondLine = lines[1].replace(/\D/g, '');
      if (/^0\d{8,9}$/.test(secondLine)) job.phone += '/' + secondLine;
    }
  } else {
    m = block.match(/(0[\d\s\-]{8,12})/);
    if (m) job.phone = m[1].replace(/\D/g, '').slice(0, 10);
  }

  // Location
  m =
    block.match(/(?:\d+\.)?พิกัด\s*[:：]\s*(.+)/i) ||
    block.match(/(?:ที่อยู่|สถานที่|Location|Maps?)\s*[:：]\s*(.+)/i);
  if (m) {
    job.location_raw = m[1].trim().split('\n')[0].trim();
    job.location_type = classifyLoc(job.location_raw);
  } else if (!job.customer_name) {
    const first = block.split('\n')[0];
    if (classifyLoc(first) !== 'place') {
      job.location_raw = first.trim();
      job.location_type = classifyLoc(job.location_raw);
    }
  }

  // Wheel string + price
  const wheelMatch = block.match(/ล้อ\s*[:：|]\s*(.+)/i);
  if (wheelMatch) {
    const wheelLine = wheelMatch[1].trim();
    job.wheel_str = wheelLine
      .replace(/ราคา[\s:]*[\d,]+(?:\s*(?:บ\.?|บาท))?/gi, '')
      .replace(/[\d,]+\s*(?:บ\.|บาท)/gi, '')
      .replace(/\*\*.+?\*\*/g, '')
      .trim();

    // Total price **รวมX,XXXบาท**
    const totalMatch = block.match(/\*\*\s*รวม\s*([\d,]+)\s*(?:บ\.?|บาท)?\s*\*\*/i);
    if (totalMatch) {
      job.price = parseInt(totalMatch[1].replace(/,/g, ''));
    } else {
      const priceM =
        wheelLine.match(/ราคา\s*[:：]?\s*([\d,]+)/i) ||
        wheelLine.match(/([\d,]+)\s*(?:บ\.|บาท)/i);
      if (priceM) job.price = parseInt(priceM[1].replace(/,/g, ''));
    }

    // Multi-size wheel: parse each size group e.g. "17/4วง, 18/2วง"
    const sizeGroups = wheelLine.matchAll(/(\d{2,3})\s*[x×\/\|\s]\s*(\d+)\s*วง/gi);
    job.wheelSizes = [];
    for (const sg of sizeGroups) {
      job.wheelSizes.push({ size: parseInt(sg[1]), qty: parseInt(sg[2]) });
    }

    // Fallback quantity from wheel if wheelSizes not found
    if (job.wheelSizes.length > 0) {
      job.quantity = job.wheelSizes.reduce((sum, ws) => sum + ws.qty, 0);
    } else {
      const qtyMatches = wheelLine.match(/[\/|](\d+)\s*วง/gi);
      if (qtyMatches) {
        job.quantity = qtyMatches.reduce((sum, q) => sum + parseInt(q.match(/(\d+)/)[1]), 0);
      }
    }
  }

  // Fallback price
  if (!job.price) {
    m = block.match(/ราคา\s*[:：]?\s*([\d,]+)/i) || block.match(/([\d,]+)\s*(?:บ\.|บาท)/i);
    if (m) job.price = parseInt(m[1].replace(/,/g, ''));
  }

  // Fallback quantity
  if (!job.quantity) {
    m = block.match(/(\d+)\s*(?:วง|ชิ้น|เส้น)/i) || block.match(/[x×\/|](\d+)\s*วง/i);
    if (m) job.quantity = parseInt(m[1]);
  }

  // Time note
  m = block.match(/\*\*\s*(.+?)\s*\*\*/i);
  if (m && !/^รวม/i.test(m[1])) {
    job.time_note = m[1].trim().slice(0, 50);
  }
  if (!job.time_note) {
    m = block.match(/((?:ก่อน|หลัง|ไม่เกิน|ภายใน|ตั้งแต่|ช่วง|เวลา|นัด|รอ|ประมาณ|ถึง).{2,40})/i);
    if (m) job.time_note = m[1].replace(/\*/g, '').trim().slice(0, 50);
  }

  job.raw_note = block;

  // Calculate distance if coords and user location available
  if (job.location_type === 'coords') {
    const userLoc = Store.get('userLoc');
    if (userLoc) {
      const c = parseCoords(job.location_raw);
      if (c) job.distance_km = haversine(userLoc.lat, userLoc.lng, c.lat, c.lng);
    }
  }

  return job;
}