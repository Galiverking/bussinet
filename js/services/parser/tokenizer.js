// Parser Tokenizer - Split text into blocks
// TEMP PATCH (2026-07-19): added numbered-record + single-blank-line separators
// to fix data where records are separated by only ONE blank line and prefixed
// with "1." / "2)" etc. Previously only 3+ repeated emoji, ---/===, or triple
// newline were recognized, which merged all records into one block.

export function tokenize(text) {
  if (!text || !text.trim()) return [];

  // 1) Strong separators: a line of repeated emoji (3+) or dashes/equals/stars
  const strongSep =
    // eslint-disable-next-line no-misleading-character-class -- intentional emoji/ZWJ ranges used with /u flag
    /\n\s*(?:(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]){3,}|[-*=]{3,})\s*\n/u;
  let blocks = text.split(strongSep);

  // 2) Numbered-record separator: line starting with "1." "2)" "3 " followed by text
  //    e.g. "1.พิกัด 13.7...\nโทร...\nล้อ...\nชื่อเฟส..."  -> new record
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*(?=\d{1,3}[.)]\s*\p{L})/u);
  }

  // 3) Single blank-line separator (data like "พิกัด...\nโทร...\n\nพิกัด...")
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n/);
  }

  // 4) Triple newline fallback (original behavior)
  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n\s*\n/);
  }

  // Remove date prefix like "นัดรับวัน..."
  blocks = blocks
    .map((b) => b.replace(/^นัดรับวัน.+$/m, '').trim())
    .filter((b) => b.length > 5);

  return blocks;
}
