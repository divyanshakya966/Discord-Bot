const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isCompleteResponse, trimToCompleteChars, findCompleteCut } = require('../src/ai/tokens');

test('complete sentences pass', () => {
  assert.equal(isCompleteResponse('Hello world.'), true);
  assert.equal(isCompleteResponse('Really?!'), true);
  assert.equal(isCompleteResponse('An emoji end 🎉'), true);
  assert.equal(isCompleteResponse('- bullet line'), true);
  assert.equal(isCompleteResponse('Yes'), true);
});

test('unclosed constructs and continuation chars fail', () => {
  assert.equal(isCompleteResponse('```js\ncode'), false);
  assert.equal(isCompleteResponse('use `code here'), false);
  assert.equal(isCompleteResponse('first item,'), false);
  assert.equal(isCompleteResponse('go to'), true); // plain words: only finish_reason can tell
});

test('closed code fence passes', () => {
  assert.equal(isCompleteResponse('```js\ncode\n```'), true);
});

test('trim keeps short text intact', () => {
  assert.equal(trimToCompleteChars('hi', 100), 'hi');
});

test('trim ends at word boundary, never mid-word', () => {
  const out = trimToCompleteChars('aaa bbb ccc ddd eee', 10);
  assert.ok(out.length <= 10);
  assert.ok(!/[A-Za-z]b$/.test(out) || out === 'aaa bbb');
  assert.equal(out, 'aaa bbb');
});

test('trim prefers sentence boundary when available', () => {
  const text = 'First ends here. Second is cut off mid wo';
  const out = trimToCompleteChars(`${text}rd and more`, 40);
  assert.match(out, /First ends here\./);
  assert.ok(out.length <= 40);
});

test('findCompleteCut returns full length when fitting', () => {
  assert.equal(findCompleteCut('abc', 10), 3);
});
