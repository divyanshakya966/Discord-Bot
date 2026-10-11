const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractProviderErrorMessage, isRetryableError, isModelUnavailableError, isAuthError, isLikelyParameterCompatibilityError, describeProviderError, toUserFacingProviderError } = require('../src/ai/errors');

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

test('user-facing errors never expose the model id', () => {
  const cases = [
    new Error('insufficient credits: balance 0.001'),
    new Error('rate limit exceeded, try again'),
    { response: { status: 404, data: { error: { message: 'This model is unavailable for free.' } } } },
    new Error('Provider returned error'),
  ];
  for (const err of cases) {
    const msg = toUserFacingProviderError(err, 'secret-model-id-123');
    assert.doesNotMatch(msg, /secret-model-id-123/);
  }
});

test('user-facing hides billing internals', () => {
  const msg = toUserFacingProviderError(new Error('insufficient credits: balance 0.001'), 'm1');
  assert.match(msg, /out of credits/);
  assert.doesNotMatch(msg, /0\.001/);
});

test('detects unavailable-model errors for fallback', () => {
  assert.equal(isModelUnavailableError({ response: { status: 404, data: { error: { message: 'This model is unavailable for free.' } } } }), true);
  assert.equal(isModelUnavailableError(new Error('rate limit exceeded')) , false);
});

test('auth errors are distinguished from model errors', () => {
  assert.equal(isAuthError(new Error('invalid api key')), true);
  assert.equal(isAuthError({ status: 401, message: 'Unauthorized' }), true);
  assert.equal(isAuthError(new Error('This model is unavailable for free.')), false);
  assert.equal(isAuthError(new Error('rate limit exceeded')), false);
});

test('auth errors get a configuration hint, not a retry prompt', () => {
  const msg = toUserFacingProviderError(new Error('invalid api key'), 'm1');
  assert.match(msg, /API key/);
});

test('temperature rejections qualify for reduced-params retry', () => {
  assert.equal(isLikelyParameterCompatibilityError('Unsupported parameter: temperature'), true);
  assert.equal(isLikelyParameterCompatibilityError('unrecognized field: top_p'), true);
  assert.equal(isLikelyParameterCompatibilityError('plain rate limit'), false);
});

test('describe includes status for logs, never leaks keys', () => {
  const d = describeProviderError({ status: 429, message: 'Provider returned error' });
  assert.match(d, /status=429/);
  assert.doesNotMatch(d, /sk-or/);
});

test('describe finds raw nested in sdk-style wrappers', () => {
  const d = describeProviderError({ error: { error: { metadata: { raw: 'upstream says no' } } } });
  assert.match(d, /raw=upstream says no/);
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
