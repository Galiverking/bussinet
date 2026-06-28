// Supabase service — Database operations + Anonymous Auth
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  COLLECTION_JOBS,
  COLLECTION_EXPENSES,
  SYNC_STATUS,
} from '../core/constants.js';
import Store from '../core/store.js';
import { toast, genId, todayStr } from '../utils/formatters.js';
import Logger from '../utils/logger.js';

let supabase = null;

export function initSupabaseService() {
  if (window.supabase && !supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true },
    });
    Logger.info('Supabase', 'Client initialized');
    return true;
  }
  return false;
}

export function getSupabase() {
  return supabase;
}

/** Sign in anonymously — required for RLS (authenticated-only policies) */
export async function signInAnonymously() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    Logger.info('Auth', 'Anonymous session:', data?.session?.expires_at);
    return data;
  } catch (err) {
    Logger.error('Auth', 'Anonymous sign-in failed:', err.message);
    toast('⚠️ Auth failed, some features may not work', 'warn');
    return null;
  }
}

export function loadJobs() {
  if (!supabase) return;

  const jobChannel = supabase
    .channel('jobs-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      () => {
        fetchJobs();
      }
    )
    .subscribe();

  const expChannel = supabase
    .channel('expenses-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses' },
      () => {
        fetchExpenses();
      }
    )
    .subscribe();

  fetchJobs();
  fetchExpenses();
  Logger.info('Supabase', 'Realtime subscriptions active');
}

export async function fetchJobs() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from(COLLECTION_JOBS)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    Logger.error(
      'Supabase',
      'Error fetching jobs:',
      error.message,
      error.details
    );
    updateSyncStatus('error');
    toast('❌ ไม่สามารถโหลดงานได้: ' + error.message, 'err');
    return;
  }

  Store.set('jobs', data || []);
  Logger.info('Supabase', 'Jobs loaded:', (data || []).length);
  updateSyncStatus('synced');
}

export async function fetchExpenses() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from(COLLECTION_EXPENSES)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    Logger.error(
      'Supabase',
      'Error fetching expenses:',
      error.message,
      error.details
    );
    toast('❌ ไม่สามารถโหลดรายจ่ายได้: ' + error.message, 'err');
    return;
  }

  Store.set('expenses', data || []);
}

export function updateSyncStatus(state) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  if (!dot || !text) return;

  const s = SYNC_STATUS[state] || SYNC_STATUS.offline;
  dot.style.background = s.bg;
  text.textContent = s.label;
  text.style.color = s.color;
}

// ==================== JOB CRUD ====================

export async function insertJob(data) {
  if (!supabase) return;

  const maxPri =
    Store.get('jobs').length > 0
      ? Math.max(...Store.get('jobs').map((j) => j.priority || 0))
      : 0;

  const jobData = {
    ...data,
    status: 'pending',
    created_at: new Date().toISOString(),
    completed_at: null,
    date: todayStr(),
    priority: maxPri + 1,
  };

  return supabase.from(COLLECTION_JOBS).insert([jobData]);
}

export async function updateJob(id, data) {
  if (!supabase) return;
  return supabase.from(COLLECTION_JOBS).update(data).eq('id', id);
}

export async function deleteJob(id) {
  if (!supabase) return;
  return supabase.from(COLLECTION_JOBS).delete().eq('id', id);
}

export async function completeJob(id) {
  if (!supabase) return;
  return supabase
    .from(COLLECTION_JOBS)
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function undoJob(id) {
  if (!supabase) return;
  return supabase
    .from(COLLECTION_JOBS)
    .update({
      status: 'pending',
      completed_at: null,
    })
    .eq('id', id);
}

export async function postponeJob(id, postponeDate) {
  if (!supabase) return;
  return supabase
    .from(COLLECTION_JOBS)
    .update({
      postponed: true,
      postpone_date: postponeDate || null,
    })
    .eq('id', id);
}

export async function undoPostpone(id) {
  if (!supabase) return;
  return supabase
    .from(COLLECTION_JOBS)
    .update({
      postponed: false,
      postpone_date: null,
    })
    .eq('id', id);
}

export async function updateJobPriority(id, priority) {
  if (!supabase) return;
  return supabase.from(COLLECTION_JOBS).update({ priority }).eq('id', id);
}

export async function updateJobDistance(id, distanceKm) {
  if (!supabase) return;
  return supabase
    .from(COLLECTION_JOBS)
    .update({ distance_km: distanceKm })
    .eq('id', id);
}

// ==================== EXPENSE CRUD ====================

export async function insertExpense(data) {
  if (!supabase) return;
  return supabase.from(COLLECTION_EXPENSES).insert([
    {
      id: genId(),
      ...data,
      created_at: new Date().toISOString(),
      date: todayStr(),
    },
  ]);
}

export async function deleteExpense(id) {
  if (!supabase) return;
  return supabase.from(COLLECTION_EXPENSES).delete().eq('id', id);
}

// ==================== AUTO CLEANUP ====================

export function runAutoCleanup() {
  if (!supabase) return;

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  Logger.info(
    'AutoCleanup',
    'Running... cutoff:',
    new Date(cutoff).toISOString()
  );

  const jobs = Store.get('jobs') || [];
  const expenses = Store.get('expenses') || [];

  jobs.forEach((j) => {
    if (j.status === 'done' && new Date(j.created_at).getTime() < cutoff) {
      supabase
        .from(COLLECTION_JOBS)
        .delete()
        .eq('id', j.id)
        .then(() => Logger.info('AutoCleanup', 'Deleted job:', j.id))
        .catch((err) =>
          Logger.error('AutoCleanup', 'Failed to delete job:', j.id, err)
        );
    }
  });

  expenses.forEach((e) => {
    if (new Date(e.created_at).getTime() < cutoff) {
      supabase
        .from(COLLECTION_EXPENSES)
        .delete()
        .eq('id', e.id)
        .then(() => Logger.info('AutoCleanup', 'Deleted expense:', e.id))
        .catch((err) =>
          Logger.error('AutoCleanup', 'Failed to delete expense:', e.id, err)
        );
    }
  });

  Logger.info('AutoCleanup', 'Complete');
}

// ==================== HELPERS ====================

export function mapJobToDb(job) {
  return {
    id: job.id,
    status: job.status,
    customer_name: job.customer_name || job.customerName,
    phone: job.phone,
    location_raw: job.location_raw || job.locationRaw,
    location_type: job.location_type || job.locationType,
    price: job.price,
    wheel_str: job.wheel_str || job.wheelStr,
    wheel_sizes: job.wheelSizes ? JSON.stringify(job.wheelSizes) : null,
    tags: job.tags,
    quantity: job.quantity,
    time_note: job.time_note || job.timeNote,
    raw_note: job.raw_note || job.rawNote,
    distance_km: job.distance_km || job.distanceKm,
    created_at: job.created_at || job.createdAt,
    completed_at: job.completed_at || job.completedAt,
    date: job.date,
    priority: job.priority,
    postponed: job.postponed,
    postpone_date: job.postpone_date || job.postponeDate,
  };
}
