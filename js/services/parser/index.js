// Parser Service - Main entry point
// [LOG 2026-07-19] เพิ่ม console.log trace การทำงาน pipeline

import { tokenize } from './tokenizer.js';
import { extract } from './extractor.js';
import { validate, validateBatch } from './validator.js';
import { format, isDuplicate } from './formatter.js';
import Store from '../../core/store.js';
import { normalizeThaiNumber } from '../location.js';

export function parseText(text) {
  console.log('[PARSER] parseText() called');
  const tokens = tokenize(text);
  const extracted = tokens.map((block) => extract(block));
  const validated = validateBatch(extracted);

  const valid = validated.filter((v) => v.isValid).map((v) => v.job);
  const invalid = validated.filter((v) => !v.isValid);
  console.log(`[PARSER] extracted=${extracted.length} valid=${valid.length} invalid=${invalid.length}`);
  invalid.forEach((v, i) => {
    console.warn(`[PARSER] ⚠ invalid job#${i + 1}: ${v.errors?.join(', ') || 'unknown'}`);
  });

  // Filter only valid jobs
  return valid;
}

export function parseBlocks(blocks) {
  console.log(`[PARSER] parseBlocks() called with ${blocks.length} block(s)`);
  const extracted = blocks.map((block) => extract(block));
  const validated = validateBatch(extracted);
  const valid = validated.filter((v) => v.isValid).map((v) => v.job);
  console.log(`[PARSER] → valid=${valid.length}`);
  return valid;
}

// Queue parser - match text lines to existing jobs
export function parseQueue(text, existingJobs) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const pendingJobs = existingJobs.filter((j) => j.status === 'pending');
  const matchedJobs = [];
  const usedIds = new Set();

  for (const line of lines) {
    if (/^นัดรับวัน/i.test(line)) continue;
    if (line.length < 2) continue;

    const searchStr = normalizeThaiNumber(line);
    let bestMatch = null;
    let bestScore = 0;

    for (const j of pendingJobs) {
      if (usedIds.has(j.id)) continue;

      const locStr = normalizeThaiNumber(j.location_raw);
      const nameStr = normalizeThaiNumber(j.customer_name);
      const noteStr = normalizeThaiNumber(j.rawNote);

      let score = 0;
      if (
        locStr.includes(searchStr) ||
        (searchStr.includes(locStr) && locStr.length > 3)
      ) {
        score = 10;
      } else if (
        nameStr.includes(searchStr) ||
        (searchStr.includes(nameStr) && nameStr.length > 2)
      ) {
        score = 8;
      } else if (noteStr.includes(searchStr)) {
        score = 7;
      }

      if (score === 0) {
        for (let i = 0; i < searchStr.length - 4; i++) {
          const chunk = searchStr.substring(i, i + 5);
          if (locStr.includes(chunk) || noteStr.includes(chunk)) {
            score = Math.max(score, 5);
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch) {
      matchedJobs.push(bestMatch);
      usedIds.add(bestMatch.id);
    }
  }

  // Add remaining unmatched jobs at the end
  for (const j of pendingJobs) {
    if (!usedIds.has(j.id)) matchedJobs.push(j);
  }

  return matchedJobs;
}

// Export all functions
export default {
  parseText,
  parseBlocks,
  parseQueue,
};
