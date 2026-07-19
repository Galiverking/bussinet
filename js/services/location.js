// Location service - GPS, distance calculation, location classification

import {
  AVG_SPEED_KMH,
  LS_LOC,
  LOC_TYPE,
  AVG_WORK_MINS,
  THAI_NUMBERS,
} from '../core/constants.js';
import Store from '../core/store.js';
import { toast } from '../utils/formatters.js';
import { updateJobDistance } from './supabase.js';
import Logger from '../utils/logger.js';

let gpsLoading = false;
let lastGpsRequest = 0;

// Haversine formula for distance calculation
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse coordinates from string (e.g., "13.7563, 100.5018")
export function parseCoords(raw) {
  if (!raw) return null;
  const m = raw.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}

// Calculate distance for a job
export function calcDist(job) {
  const userLoc = Store.get('userLoc');
  if (!userLoc || job.locationType !== LOC_TYPE.COORDS) return null;

  const c = parseCoords(job.location_raw);
  return c ? haversine(userLoc.lat, userLoc.lng, c.lat, c.lng) : null;
}

// Refresh all distances
export async function refreshDistances() {
  const jobs = Store.get('jobs') || [];
  const userLoc = Store.get('userLoc');
  if (!userLoc) return;

  for (const j of jobs) {
    const newDist = calcDist(j);
    if (newDist !== j.distance_km) {
      j.distance_km = newDist;
      if (j.id) {
        await updateJobDistance(j.id, newDist);
      }
    }
  }
}

// Calculate ETA text
export function getETAText(distKm) {
  if (distKm == null) return '';
  const mins = Math.ceil((distKm / AVG_SPEED_KMH) * 60);
  if (mins < 1) return 'อีกไม่กี่อึดใจ';
  if (mins < 60) return `อีก ${mins} นาที`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return `อีก ${hrs} ชม. ${m} นาที`;
}

// Location type classifier
export function classifyLoc(raw) {
  const t = (raw || '').trim();
  if (!t) return { raw: '', type: LOC_TYPE.PLACE, coords: null };

  // Placeholder check (Thai phrases)
  if (/(?:ช่องแชท|ทางไลน์|ทักแชท|ส่งให้ในแชท|ทางข้อความ|ส่งในแชท)/i.test(t)) {
    return { raw: t, type: LOC_TYPE.PLACEHOLDER, coords: null };
  }

  // URL check
  if (
    /^https?:\/\//i.test(t) ||
    /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.com\/maps/i.test(t)
  ) {
    return { raw: t, type: LOC_TYPE.URL, coords: null };
  }

  // GPS coords: two decimal numbers separated by comma
  const cm = t.match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (cm) {
    const c = parseCoords(`${cm[1]},${cm[2]}`);
    return { raw: t, type: LOC_TYPE.COORDS, coords: c };
  }

  return { raw: t, type: LOC_TYPE.PLACE, coords: null };
}

// Build Google Maps URL
export function buildMapsUrl(job) {
  if (!job.location_raw || job.locationType === LOC_TYPE.PLACEHOLDER)
    return null;

  let url;
  switch (job.locationType) {
    case LOC_TYPE.URL:
      url = job.location_raw;
      break;
    case LOC_TYPE.COORDS:
      url = `https://maps.google.com/?q=${job.location_raw.replace(/\s/g, '')}`;
      break;
    case LOC_TYPE.PLACE:
    default:
      url = `https://maps.google.com/?q=${encodeURIComponent(job.location_raw)}`;
      break;
  }

  // Security: only allow https:// URLs
  if (!url || !/^https:\/\//i.test(url)) return null;
  return url;
}

// Request GPS location
export function requestLocation() {
  const now = Date.now();
  if (gpsLoading) {
    toast('⏳ กำลังค้นหาตำแหน่งอยู่...', 'warn');
    return;
  }
  if (now - lastGpsRequest < 5000) {
    toast('⏱️ รอสักครู่ก่อนค้นหาใหม่ (5วินาที)', 'warn');
    return;
  }
  if (!navigator.geolocation) {
    toast('อุปกรณ์นี้ไม่รองรับ GPS', 'err');
    return;
  }

  lastGpsRequest = now;
  gpsLoading = true;

  const btn = document.getElementById('gpsBtn');
  if (btn) btn.style.borderColor = 'rgba(249,115,22,0.5)';

  toast('กำลังหาตำแหน่ง…', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      Store.set('userLoc', userLoc);
      localStorage.setItem(LS_LOC, JSON.stringify(userLoc));
      Logger.info('GPS', 'Location updated:', userLoc);

      refreshDistances();
      if (btn) btn.style.borderColor = 'rgba(34,197,94,0.5)';
      toast('✓ อัปเดตตำแหน่งแล้ว', 'ok');
      gpsLoading = false;
    },
    (err) => {
      Logger.error('GPS', 'Error:', err.code, err.message);
      if (btn) btn.style.borderColor = 'rgba(255,255,255,0.08)';
      toast(
        'ไม่สามารถเข้าถึง GPS: ' +
          (err.code === 1 ? 'ถูกปฏิเสธ' : 'ไม่พบตำแหน่ง'),
        'err'
      );
      gpsLoading = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Calculate ETA clocks for pending jobs
export function calcETAClocks(pendingJobs) {
  const now = new Date();
  let cumMins = 0;

  return pendingJobs.map((j, i) => {
    if (i > 0) {
      const prev = pendingJobs[i - 1];
      if (prev.distance_km != null && j.distance_km != null) {
        const distBetween =
          Math.abs(j.distance_km - prev.distance_km) || j.distance_km;
        cumMins += Math.ceil((distBetween / AVG_SPEED_KMH) * 60);
      } else if (j.distance_km != null) {
        cumMins += Math.ceil((j.distance_km / AVG_SPEED_KMH) * 60);
      } else {
        cumMins += 15;
      }
      cumMins += AVG_WORK_MINS;
    } else {
      if (j.distance_km != null) {
        cumMins += Math.ceil((j.distance_km / AVG_SPEED_KMH) * 60);
      }
    }

    const eta = new Date(now.getTime() + cumMins * 60000);
    return { jobId: j.id, etaMins: cumMins, etaTime: eta };
  });
}

// Normalize Thai numbers to Arabic
export function normalizeThaiNumber(str) {
  let result = (str || '').toLowerCase().replace(/[\s()]+/g, '');
  for (const k in THAI_NUMBERS) {
    result = result.replace(new RegExp(k, 'g'), THAI_NUMBERS[k]);
  }
  return result;
}
