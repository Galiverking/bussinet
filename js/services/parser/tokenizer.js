// Parser Tokenizer - Split text into blocks
// TEMP PATCH (2026-07-19): added numbered-record + single-blank-line separators
// to fix data where records are separated by only ONE blank line and prefixed
// with "1." / "2)" etc. Previously only 3+ repeated emoji, ---/===, or triple
// newline were recognized, which merged all records into one block.
// [LOG 2026-07-19] เพิ่ม console.log ระบุ block ที่แยกได้

export function tokenize(text) {
  if (!text || !text.trim()) {
    console.log('[TOKENIZER] empty input → return []');
    return [];
  }

  let sepUsed = 'none';
  // 1) Strong separators: a line of repeated emoji (3+) or dashes/equals/stars
  const strongSep =
    // eslint-disable-next-line no-misleading-character-class -- intentional emoji/ZWJ ranges used with /u flag
    /\n\s*(?:(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]){3,}|[-*=]{3,})\s*\n/u;
  let blocks = text.split(strongSep);
  if (blocks.length > 1) sepUsed = 'strong-separator';

  // 2) Numbered-record separator: line starting with "1." "2)" "3 " followed by text
  //    e.g. "1.พิกัด 13.7...\nโทร...\nล้อ...\nชื่อเฟส..."  -> new record
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*(?=\d{1,3}[.)]\s*\p{L})/u);
    if (blocks.length > 1) sepUsed = 'numbered-record';
  }

  // 3) Single blank-line separator (data like "พิกัด...\nโทร...\n\nพิกัด...")
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n/);
    if (blocks.length > 1) {
      sepUsed = 'single-blank-line';
      // [FIX 2026-07-28] Merge blocks that are continuation of the same order
      // (field lines like โทร/เบอร์/ล้อ/ชื่อเฟส after blank line → merge into previous)
      const FIELD_NEXT = /^\s*(?:โทร|เบอร์|ล้อ|ชื่อเฟส|ชื่อ)\s*[:：]/i;
      const merged = [];
      for (const b of blocks) {
        const trimmed = b.trim();
        if (!trimmed) continue;
        if (merged.length > 0 && FIELD_NEXT.test(trimmed)) {
          merged[merged.length - 1] += '\n\n' + trimmed;
        } else {
          merged.push(trimmed);
        }
      }
      blocks = merged;
    }
  }

  // 4) Triple newline fallback (original behavior)
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n\s*\n/);
    if (blocks.length > 1) sepUsed = 'triple-newline';
  }

  // Remove date prefix like "นัดรับวัน..."
  blocks = blocks
    .map((b) => b.replace(/^นัดรับ(?:วัน)?\s*.+$/m, '').trim())
    .filter((b) => b.length > 5);

  console.log(`[TOKENIZER] separator="${sepUsed}" → ${blocks.length} block(s)`);
  blocks.forEach((b, i) => {
    console.log(`[TOKENIZER] block#${i + 1} (${b.length} chars): ${b.slice(0, 80).replace(/\n/g, '⏎')}${b.length > 80 ? '…' : ''}`);
  });

  return blocks;
}
