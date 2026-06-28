// Logger utility — structured logging with levels + timestamps
// Usage: Logger.info('Supabase', 'Jobs loaded:', count);
//        Logger.error('Supabase', 'Error fetching jobs:', err.message);

const PREFIX = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  debug: '🐛',
};

const COLORS = {
  info: 'color: #3b82f6',
  warn: 'color: #f97316',
  error: 'color: #ef4444; font-weight: bold',
  debug: 'color: #8b5cf6',
};

const LEVEL = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel = LEVEL.info;

export function setLevel(level) {
  currentLevel = LEVEL[level] ?? LEVEL.info;
}

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function logFn(level, ...args) {
  if (LEVEL[level] < currentLevel) return;
  const prefix = PREFIX[level] || '';
  const ts = `[${timestamp()}]`;
  console.log(`%c${prefix} ${ts}`, COLORS[level] || '', ...args);
}

export const Logger = {
  info: (...args) => logFn('info', ...args),
  warn: (...args) => logFn('warn', ...args),
  error: (...args) => logFn('error', ...args),
  debug: (...args) => logFn('debug', ...args),
};

export default Logger;
