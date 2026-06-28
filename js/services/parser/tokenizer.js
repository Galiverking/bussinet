// Parser Tokenizer - Split text into blocks

export function tokenize(text) {
  // Split by lines of repeated emojis (any emoji 3+), or repeated symbols
  let blocks = text.split(
    // eslint-disable-next-line no-misleading-character-class -- intentional emoji/ZWJ ranges used with /u flag
    /\n\s*(?:(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]){3,}|[-*=]{3,})\s*\n/u
  );

  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n\s*\n/);
  }

  // Remove date prefix like "นัดรับวัน..."
  blocks = blocks
    .map((b) => b.replace(/^นัดรับวัน.+$/m, '').trim())
    .filter((b) => b.length > 5);

  return blocks;
}
