const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractProviderErrorMessage, isRetryableError, toUserFacingProviderError } = require('../src/ai/errors');

test('extracts nested messages', () => {
  assert.equal(extractProviderErrorMessage({ error: { message: 'boom' } }), 'boom');
  assert.equal(extractProviderErrorMessage({ response: { data: { error: { message: 'x' } } } }), 'x');
  assert.equal(extractProviderErrorMessage(new Error('plain')), 'plain');
});

test('detects retryable', () => {
  assert.equal(isRetryableError({ status: 429 }), true);
  assert.equal(isRetryableError(new Error('rate limit exceeded, try again')) , true);
  assert.equal(isRetryableError(new Error('invalid api key')), false);
});

test('user-facing hides billing internals', () => {
  const msg = toUserFacingProviderError(new Error('insufficient credits: balance 0.001'), 'm1');
  assert.match(msg, /out of credits/);
  assert.doesNotMatch(msg, /0\.001/);
});

test('withRetry retries then succeeds', async () => {
  const { withRetry } = require('../src/ai/retry');
  let n = 0;
  const out = await withRetry(() => {
    n++;
    if (n < 3) throw Object.assign(new Error('service unavailable, try again'), { status: 503 });
    return 'ok';
  }, { retries: 3, baseDelayMs: 1, timeoutMs: 5000 });
  assert.equal(out, 'ok');
  assert.equal(n, 3);
});

test('withRetry gives up on non-retryable', async () => {
  const { withRetry } = require('../src/ai/retry');
  let n = 0;
  await assert.rejects(() => withRetry(() => { n++; throw new Error('invalid api key'); }, { retries: 3, baseDelayMs: 1 }));
  assert.equal(n, 1);
});
