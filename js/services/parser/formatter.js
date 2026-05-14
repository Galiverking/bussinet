// Parser Formatter - Format validated job for saving

import { mapJobToDb } from '../supabase.js';

export function format(job) {
  return mapJobToDb(job);
}

export function formatBatch(jobs) {
  return jobs.map(job => format(job));
}

// Helper to check if job is a duplicate
export function isDuplicate(job, existingJobs) {
  if (!job.phone) return false;
  return existingJobs.some(x => x.phone === job.phone && x.status === 'pending');
}