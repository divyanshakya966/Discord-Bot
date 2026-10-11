const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function scrubString(s) {
  return String(s)
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/mfa\.[\w-]{60,}/g, '[REDACTED]')
    .replace(/[MN][\w-]{23}\.[\w-]{6}\.[\w-]{27}/g, '[REDACTED]');
}

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return scrubString(obj);
  if (typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    const flat = String(k).toLowerCase().replace(/[_-]/g, '');
    const looksSecret = /api[_-]?key|secret|authorization|password/i.test(k)
      || (/token$/.test(flat) && !/tokens$/.test(flat));
    if (looksSecret) out[k] = '[REDACTED]';
    else out[k] = redact(out[k]);
  }
  return out;
}

function formatJson(entry) {
  return JSON.stringify(entry);
}

function formatPretty(entry, color) {
  const colors = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
  const reset = '\x1b[0m';
  const { t, level, msg, ...rest } = entry;
  const head = `${t} ${String(level).toUpperCase().padEnd(5)} ${msg}`;
  const ctx = Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
  const line = ctx ? `${head} ${ctx}` : head;
  return color && colors[level] ? `${colors[level]}${line}${reset}` : line;
}

function createLogger(opts = {}) {
  const levelName = String(opts.level ?? process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const minLevel = LEVELS[levelName] ?? LEVELS.info;
  const format = String(opts.format ?? process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')).toLowerCase();
  const file = opts.file ?? process.env.LOG_FILE ?? '';
  const maxBytes = Number(opts.maxBytes ?? process.env.LOG_MAX_BYTES ?? 5 * 1024 * 1024);
  const maxFiles = Number(opts.maxFiles ?? process.env.LOG_MAX_FILES ?? 5);
  const sink = opts.sink || null;
  const color = opts.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);

  let stream = null;
  let bytesWritten = 0;

  function openStream() {
    if (!file || stream) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      bytesWritten = fs.existsSync(file) ? fs.statSync(file).size : 0;
      stream = fs.createWriteStream(file, { flags: 'a' });
      stream.on('error', () => { stream = null; });
    } catch {
      stream = null;
    }
  }

  function rotate() {
    try {
      if (stream) { stream.end(); stream = null; }
    } catch {}
    try {
      for (let i = maxFiles - 1; i >= 1; i--) {
        const from = `${file}.${i}`;
        if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i + 1}`);
      }
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
      const overflow = `${file}.${maxFiles + 1}`;
      if (fs.existsSync(overflow)) fs.unlinkSync(overflow);
    } catch {}
    bytesWritten = 0;
    openStream();
  }

  function emit(level, msg, meta, bindings) {
    if (LEVELS[level] < minLevel) return;
    const entry = { t: new Date().toISOString(), level, msg: scrubString(msg), ...redact({ ...(bindings || {}), ...(meta || {}) }) };
    const line = format === 'json' ? formatJson(entry) : formatPretty(entry, color);
    try {
      if (sink) sink(line, entry);
      else if (level === 'error') console.error(line);
      else console.log(line);
    } catch {}
    if (file) {
      try {
        if (!stream) openStream();
        if (stream) {
          const buf = line + os.EOL;
          if (bytesWritten + Buffer.byteLength(buf) > maxBytes) rotate();
          if (stream) {
            stream.write(buf);
            bytesWritten += Buffer.byteLength(buf);
          }
        }
      } catch {}
    }
  }

  function make(bindings) {
    return {
      debug: (msg, meta) => emit('debug', msg, meta, bindings),
      info: (msg, meta) => emit('info', msg, meta, bindings),
      warn: (msg, meta) => emit('warn', msg, meta, bindings),
      error: (msg, meta) => emit('error', msg, meta, bindings),
      child: (extra) => make({ ...(bindings || {}), ...(extra || {}) }),
    };
  }

  const api = make(null);
  api.close = async () => {
    if (stream) {
      await new Promise(resolve => { try { stream.end(resolve); } catch { resolve(); } });
      stream = null;
    }
  };
  return api;
}

const defaultLogger = createLogger();

module.exports = defaultLogger;
module.exports.createLogger = createLogger;
module.exports._scrubString = scrubString;
module.exports._redact = redact;
