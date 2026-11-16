const { test } = require('node:test');
const assert = require('node:assert/strict');
const { truncateHistory, estimateTokens, contextHistoryBudget } = require('../src/ai/tokens');
const { CooldownManager } = require('../src/discord/cooldown');
const { withLock } = require('../src/store/mutex');

test('estimateTokens ~ len/4', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('a'.repeat(100)), 25);
});

test('truncateHistory respects turns and budget', () => {
  const h = [];
  for (let i = 0; i < 30; i++) h.push({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(200) });
  const t = truncateHistory(h, 8, 6000);
  assert.ok(t.length <= 16);
});

test('truncateHistory never keeps history above the token budget', () => {
  const h = [
    { role: 'user', content: 'x'.repeat(20000) },
    { role: 'assistant', content: 'x'.repeat(20000) },
  ];
  const t = truncateHistory(h, 8, 1000);
  assert.ok(t.length < h.length);
  assert.ok(t.reduce((n, m) => n + estimateTokens(m.content) + 4, 0) <= 1000);
  assert.equal(h[0].content.length, 20000);
});

test('context budget reserves prompt, output, and safety room', () => {
  const budget = contextHistoryBudget({
    contextTokens: 4096,
    systemTokens: 500,
    promptTokens: 1000,
    outputTokens: 1000,
    safetyTokens: 256,
    maxHistoryTokens: 6000,
  });
  assert.equal(budget, 1340);
  assert.equal(contextHistoryBudget({ contextTokens: 4096, systemTokens: 3000, promptTokens: 1000, outputTokens: 1000 }), 0);
  assert.equal(contextHistoryBudget({ contextTokens: 8192, systemTokens: 500, promptTokens: 1000, outputTokens: 2400, maxHistoryTokens: 2000 }), 2000);
});

test('cooldown blocks rapid repeats', () => {
  const c = new CooldownManager(4000);
  assert.equal(c.check('u1', 1000).allowed, true);
  const r = c.check('u1', 2000);
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs > 0);
  assert.equal(c.check('u1', 6000).allowed, true);
});

test('mutex serializes per key', async () => {
  const order = [];
  await Promise.all([1, 2, 3].map(i => withLock('k', async () => {
    order.push('start' + i);
    await new Promise(r => setTimeout(r, 10));
    order.push('end' + i);
  })));
  // serialized: each start immediately followed by its end
  assert.deepEqual(order, ['start1', 'end1', 'start2', 'end2', 'start3', 'end3']);
});

test('mutex evicts idle keys instead of leaking', async () => {
  const { _chains } = require('../src/store/mutex');
  await withLock('tmp-leak-check-1', async () => 1);
  await withLock('tmp-leak-check-2', async () => { throw new Error('boom'); }).catch(() => {});
  await new Promise(r => setTimeout(r, 20));
  assert.equal(_chains.has('tmp-leak-check-1'), false);
  assert.equal(_chains.has('tmp-leak-check-2'), false);
});

test('config validation', () => {
  const { validateConfig } = require('../src/config');
  const errs = validateConfig({ DISCORD_TOKEN: '', OPENROUTER_API_KEY: '' });
  assert.ok(errs.some(e => e.includes('DISCORD_TOKEN')));
});
