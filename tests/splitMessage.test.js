const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitMessage, splitCodeSafe } = require('../src/utils/splitMessage');

test('short message returns single chunk', () => {
  assert.deepEqual(splitMessage('hello'), ['hello']);
});

test('empty returns placeholder', () => {
  assert.equal(splitMessage('')[0].length > 0, true);
});

test('long message splits within limit', () => {
  const long = 'a'.repeat(5000);
  const chunks = splitMessage(long, 1900);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 1900, `chunk len ${c.length}`);
  assert.equal(chunks.join('').length, 5000);
});

test('prefers newline boundaries', () => {
  const content = 'line1\n'.repeat(1000); // 6000 chars
  const chunks = splitMessage(content, 1900);
  for (const c of chunks) assert.ok(c.length <= 1900);
});

test('caps chunk count at 11 with truncation note', () => {
  const huge = 'x'.repeat(50000);
  const chunks = splitMessage(huge, 1900);
  assert.ok(chunks.length <= 11);
  assert.match(chunks[chunks.length - 1], /truncated/);
});

test('code-safe split keeps fences balanced-ish', () => {
  const code = '```js\n' + 'console.log(1);\n'.repeat(300) + '```';
  const chunks = splitCodeSafe(code, 1900);
  for (const c of chunks) assert.ok(c.length <= 2100);
});

test('code-safe continuation pages reopen the fence with language', () => {
  const code = '```js\n' + 'console.log(1);\n'.repeat(300) + '```';
  const chunks = splitCodeSafe(code, 1900);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    const fences = (c.match(/```/g) || []).length;
    assert.equal(fences % 2, 0, 'every page must have balanced fences');
  }
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].startsWith('```js'), `page ${i} must reopen with language`);
  }
});
