const { isRetryableError } = require('./errors');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function withTimeout(promise, ms, label = 'operation') {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function withRetry(fn, { retries = 2, baseDelayMs = 800, timeoutMs = 60000, onRetry } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = fn(attempt);
      return timeoutMs ? await withTimeout(Promise.resolve(p), timeoutMs, 'LLM request') : await p;
    } catch (err) {
      last = err;
      const retryable = isRetryableError(err) || /timed out/.test(err?.message || '');
      if (attempt >= retries || !retryable) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250);
      if (onRetry) try { onRetry(attempt, err, delay); } catch {}
      await sleep(delay);
    }
  }
  throw last;
}

module.exports = { withRetry, withTimeout, sleep };
