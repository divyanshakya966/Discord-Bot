const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createLogger, _scrubString } = require('../src/logger');

test('scrubs secrets inside message strings', () => {
  const out = _scrubString('key sk-or-v1-abc123XYZ and more');
  assert.doesNotMatch(out, /sk-or-v1/);
  assert.match(out, /\[REDACTED\]/);
});

test('redacts secret keys in meta objects', () => {
  const lines = [];
  const log = createLogger({ level: 'debug', format: 'json', sink: l => lines.push(l) });
  log.info('hello', { apiKey: 'sk-or-v1-secret', nested: { token: 'abc' }, ok: 1 });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.apiKey, '[REDACTED]');
  assert.equal(entry.nested.token, '[REDACTED]');
  assert.equal(entry.ok, 1);
});

test('keeps plural token-count objects visible', () => {
  const lines = [];
  const log = createLogger({ format: 'json', sink: l => lines.push(l) });
  log.info('AI reply', { tokens: { in: 10, out: 20, total: 30 }, access_token: 'hide-me' });
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(entry.tokens, { in: 10, out: 20, total: 30 });
  assert.equal(entry.access_token, '[REDACTED]');
});

test('level filtering drops debug by default', () => {
  const lines = [];
  const log = createLogger({ format: 'json', sink: l => lines.push(l) });
  log.debug('quiet');
  log.info('loud');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /loud/);
});

test('pretty format renders level and message', () => {
  const lines = [];
  const log = createLogger({ level: 'debug', format: 'pretty', color: false, sink: l => lines.push(l) });
  log.warn('careful', { session: 's1' });
  assert.match(lines[0], /WARN/);
  assert.match(lines[0], /careful/);
  assert.match(lines[0], /session=s1/);
});

test('child merges bindings into every line', () => {
  const lines = [];
  const log = createLogger({ format: 'json', sink: l => lines.push(l) });
  const child = log.child({ session: 'abc', command: 'chat' });
  child.info('done', { ms: 5 });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.session, 'abc');
  assert.equal(entry.command, 'chat');
  assert.equal(entry.ms, 5);
});

test('file transport rotates and caps files', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bot-log-'));
  const file = path.join(dir, 'bot.log');
  const log = createLogger({ format: 'json', file, maxBytes: 300, maxFiles: 2, sink: () => {} });
  for (let i = 0; i < 30; i++) log.info('rotation-probe-message-number-' + i, { i });
  await log.close();
  const files = (await fs.promises.readdir(dir)).filter(f => f.startsWith('bot.log')).sort();
  assert.ok(files.length <= 3, `expected <=3 files, got ${files}`);
  const content = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(content.includes('rotation-probe'), 'rotated files must keep log lines');
  await fs.promises.rm(dir, { recursive: true, force: true });
});
