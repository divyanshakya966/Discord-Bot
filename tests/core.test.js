const { test } = require('node:test');
const assert = require('node:assert/strict');
const { truncateHistory, estimateTokens } = require('../src/ai/tokens');
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

test('config validation', () => {
  const { validateConfig } = require('../src/config');
  const errs = validateConfig({ DISCORD_TOKEN: '', OPENROUTER_API_KEY: '' });
  assert.ok(errs.some(e => e.includes('DISCORD_TOKEN')));
});
