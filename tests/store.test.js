const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHistoryStore, createJsonStore } = require('../src/store/historyStore');

async function tmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'bot-test-'));
}

test('history append + load round-trips and trims', async () => {
  const dir = await tmpDir();
  const store = createHistoryStore({ dataDir: dir, maxHistory: 2, maxTokens: 100000 });
  await store.append('guild:g1:user:u1', 'hello', 'hi there');
  await store.append('guild:g1:user:u1', 'how are you?', 'good');
  await store.append('guild:g1:user:u1', 'third?', 'third answer');
  const h = await store.load('guild:g1:user:u1');
  assert.ok(h.length <= 4); // maxHistory=2 turns = 4 entries
  const files = await fs.readdir(dir);
  assert.equal(files.length, 1);
});

test('concurrent appends do not lose data (serialized)', async () => {
  const dir = await tmpDir();
  const store = createHistoryStore({ dataDir: dir, maxHistory: 50, maxTokens: 1000000 });
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.append('dm:u9', `q${i}`, `a${i}`)));
  const h = await store.load('dm:u9');
  assert.equal(h.length, 20);
});

test('json prefs store persists', async () => {
  const dir = await tmpDir();
  const prefs = createJsonStore('model_preferences.json', { dataDir: dir });
  await prefs.set('guild:g1:user:u1', 'openai/gpt-4-turbo');
  assert.equal(await prefs.get('guild:g1:user:u1'), 'openai/gpt-4-turbo');
});

test('history cache is bounded and reloads evicted sessions from disk', async () => {
  const dir = await tmpDir();
  const store = createHistoryStore({ dataDir: dir, maxHistory: 2, maxTokens: 100000, maxCachedSessions: 5 });
  for (let i = 0; i < 10; i++) await store.append(`dm:cap${i}`, `q${i}`, `a${i}`);
  assert.ok(store._cache.size <= 5, `cache size ${store._cache.size}`);
  const h = await store.load('dm:cap0');
  assert.deepEqual(h, [{ role: 'user', content: 'q0' }, { role: 'assistant', content: 'a0' }]);
});

test('appendUser stores a lone observer entry and trims', async () => {
  const dir = await tmpDir();
  const store = createHistoryStore({ dataDir: dir, maxHistory: 2, maxTokens: 100000 });
  await store.append('group:c1', 'alice: hi all', 'Hello Alice!');
  await store.appendUser('group:c1', 'bob: hey there');
  const h = await store.load('group:c1');
  assert.deepEqual(h[h.length - 1], { role: 'user', content: 'bob: hey there' });
  assert.ok(h.length <= 4);
});

test('safeReply splits long content', async () => {
  const { splitCodeSafe } = require('../src/utils/splitMessage');
  const chunks = splitCodeSafe('y'.repeat(5000));
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 2000);
});
