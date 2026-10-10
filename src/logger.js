const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const levelName = (process.env.LOG_LEVEL || 'info').toLowerCase();
const minLevel = LEVELS[levelName] ?? LEVELS.info;

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (/token|api[_-]?key|secret|authorization/i.test(k)) out[k] = '[REDACTED]';
    else if (typeof out[k] === 'object') out[k] = redact(out[k]);
    else if (typeof out[k] === 'string' && out[k].length > 40 && /sk-or|MTQ|serper/i.test(out[k])) out[k] = '[REDACTED]';
  }
  return out;
}

function log(level, msg, meta) {
  if (LEVELS[level] < minLevel) return;
  const entry = { t: new Date().toISOString(), level, msg, ...(meta ? redact(meta) : {}) };
  if (level === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
