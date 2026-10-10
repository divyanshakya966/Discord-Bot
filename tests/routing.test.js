const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMentionCommand, parsePrefixCommand } = require('../src/discord/routing');

test('bare mention commands route to embeds, not LLM', () => {
  assert.deepEqual(parseMentionCommand('help'), { command: 'help', prompt: '' });
  assert.deepEqual(parseMentionCommand('/help'), { command: 'help', prompt: '' });
  assert.deepEqual(parseMentionCommand('PING'), { command: 'ping', prompt: '' });
  assert.deepEqual(parseMentionCommand('clear'), { command: 'clear', prompt: '' });
  assert.deepEqual(parseMentionCommand('stats'), { command: 'stats', prompt: '' });
});

test('mention with args parses prompt', () => {
  assert.deepEqual(parseMentionCommand('ask what is AI?'), { command: 'ask', prompt: 'what is AI?' });
  assert.deepEqual(parseMentionCommand('model list'), { command: 'model', prompt: 'list' });
  assert.deepEqual(parseMentionCommand('personality set tutor'), { command: 'personality', prompt: 'set tutor' });
  assert.deepEqual(parseMentionCommand('code console.log(1)'), { command: 'code', prompt: 'console.log(1)' });
});

test('free chat does not route', () => {
  assert.equal(parseMentionCommand('hello how are you?'), null);
  assert.equal(parseMentionCommand('help me with homework'), null); // starts with help but has extra words -> still ask? first word 'help' but not bare
  assert.equal(parseMentionCommand(''), null);
});

test('prefix requires ! or /', () => {
  assert.deepEqual(parsePrefixCommand('!help'), { command: 'help', prompt: '' });
  assert.deepEqual(parsePrefixCommand('/model list'), { command: 'model', prompt: 'list' });
  assert.equal(parsePrefixCommand('help'), null);
  assert.equal(parsePrefixCommand('hello'), null);
});
