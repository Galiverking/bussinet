// Core constants for Logis Master

export const SUPABASE_URL = 'https://ybmowexttijibnjsonhu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibW93ZXh0dGlqaWJuanNvbmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTE0MDAsImV4cCI6MjA5NDIyNzQwMH0.p5fGmjbMTc7xGat_trpAH_cIg6PZE90XvavhdbQs5Dg';

export const AVG_SPEED_KMH = 40;
export const AVG_WORK_MINS = 30;

export const LS_LOC = 'logis_loc';
export const COLLECTION_JOBS = 'jobs';
export const COLLECTION_EXPENSES = 'expenses';

export const STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  POSTPONED: 'postponed'
};

export const LOC_TYPE = {
  COORDS: 'coords',
  URL: 'url',
  PLACE: 'place',
  PLACEHOLDER: 'placeholder'
};

export const LOC_ICON = {
  coords: '🗺️',
  url: '🔗',
  place: '📍',
  placeholder: '💬'
};

export const LOC_LABEL = {
  coords: 'GPS พิกัด',
  url: 'ลิ้งค์ Maps',
  place: 'ชื่อสถานที่',
  placeholder: 'รอลิ้งค์ในแชท'
};

export const LOC_COLOR = {
  coords: '#93c5fd',
  url: '#86efac',
  place: '#fcd34d',
  placeholder: '#a78bfa'
};

export const TOAST_TYPES = {
  ok: 'rgba(34,197,94,0.35)',
  err: 'rgba(239,68,68,0.35)',
  info: 'rgba(59,130,246,0.35)',
  warn: 'rgba(249,115,22,0.35)'
};

export const SYNC_STATUS = {
  synced: { bg: '#22c55e', label: 'SYNCED', color: '#22c55e' },
  pending: { bg: '#f97316', label: 'SYNCING…', color: '#f97316' },
  offline: { bg: '#ef4444', label: 'OFFLINE', color: '#ef4444' },
  error: { bg: '#ef4444', label: 'ERROR', color: '#ef4444' }
};

export const THAI_NUMBERS = {
  หนึ่ง: '1',
  เอ็ด: '1',
  สอง: '2',
  สาม: '3',
  สี่: '4',
  ห้า: '5',
  หก: '6',
  เจ็ด: '7',
  แปด: '8',
  เก้า: '9'
};