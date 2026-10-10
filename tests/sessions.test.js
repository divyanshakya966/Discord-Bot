const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSessionKey, getModelKey, getPersonalityKey } = require('../src/store/sessions');

test('guild keys are per-user, not guild-wide', () => {
  const a = { guildId: 'g1', author: { id: 'u1' } };
  const b = { guildId: 'g1', author: { id: 'u2' } };
  assert.notEqual(getSessionKey(a), getSessionKey(b));
  assert.notEqual(getModelKey(a), getModelKey(b));
  assert.notEqual(getPersonalityKey(a), getPersonalityKey(b));
  assert.equal(getModelKey(a), getSessionKey(a));
  assert.equal(getPersonalityKey(a), getSessionKey(a));
});

test('DM keys are per-user', () => {
  const a = { author: { id: 'u1' } };
  const b = { author: { id: 'u2' } };
  assert.notEqual(getSessionKey(a), getSessionKey(b));
});

test('interaction shape (user) works', () => {
  const i = { guildId: 'g9', user: { id: 'u7' } };
  assert.equal(getSessionKey(i), 'guild:g9:user:u7');
});
