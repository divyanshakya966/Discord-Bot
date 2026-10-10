const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PERSONALITIES, HIDDEN_PERSONALITY_KEYS } = require('../src/../bot-data');

test('Girl mode exists as single canonical key', () => {
  assert.ok(DEFAULT_PERSONALITIES.girl, 'girl key must exist');
  assert.equal(DEFAULT_PERSONALITIES.girl.name, 'Girl');
  const prompt = DEFAULT_PERSONALITIES.girl.prompt.toLowerCase();
  assert.ok(prompt.includes('loving'), 'should be loving by default');
  assert.ok(prompt.includes('seductive') || prompt.includes('flirty') || prompt.includes('romantic'), 'should be seductive/romantic by default');
  assert.ok(prompt.includes('passion') || prompt.includes('affection') || prompt.includes('devoted'), 'should be passionate by default');
});

test('Girl mode has tasteful boundary', () => {
  const prompt = DEFAULT_PERSONALITIES.girl.prompt.toLowerCase();
  assert.ok(prompt.includes('non-explicit') || prompt.includes('pg-13') || prompt.includes('tasteful'), 'must stay tasteful');
  assert.ok(prompt.includes('decline') || prompt.includes('instead'), 'must decline explicit requests');
});

test('legacy aliases resolve to same Girl prompt', () => {
  assert.equal(DEFAULT_PERSONALITIES['girl-text'].prompt, DEFAULT_PERSONALITIES.girl.prompt);
  assert.equal(DEFAULT_PERSONALITIES.casual.prompt, DEFAULT_PERSONALITIES.girl.prompt);
  assert.ok(HIDDEN_PERSONALITY_KEYS.has('girl-text'));
  assert.ok(HIDDEN_PERSONALITY_KEYS.has('casual'));
  assert.ok(!HIDDEN_PERSONALITY_KEYS.has('girl'));
});

test('personality list hides aliases, shows Girl once', () => {
  const { personalityListEmbed } = require('../src/discord/embeds');
  const embed = personalityListEmbed(DEFAULT_PERSONALITIES, HIDDEN_PERSONALITY_KEYS).toJSON();
  const desc = embed.description || '';
  assert.ok(desc.includes('`girl`'), 'list must show girl');
  assert.ok(!desc.includes('`girl-text`'), 'list must hide girl-text alias');
  // 'casual' key hidden; name Girl appears for girl entry (aliases hidden so exactly once)
  const girlKeyCount = (desc.match(/`girl`/g) || []).length;
  assert.equal(girlKeyCount, 1);
});

test('default model is free-tier', () => {
  // Unset env-driven default check: config module default literal
  const fs = require('node:fs');
  const src = fs.readFileSync(__dirname + '/../src/config.js', 'utf-8');
  assert.ok(src.includes('google/gemma-4-26b-a4b-it:free'), 'default model should be free Gemma');
});

test('retired model IDs migrate to live replacements', () => {
  const { RETIRED_MODEL_IDS, AVAILABLE_MODELS } = require('../bot-data');
  for (const [oldId, newId] of Object.entries(RETIRED_MODEL_IDS)) {
    assert.ok(!AVAILABLE_MODELS.some(m => m.id === oldId), `${oldId} must not be listed`);
    assert.ok(AVAILABLE_MODELS.some(m => m.id === newId), `${newId} must be listed`);
  }
});

test('systemd service file exists and is valid-ish', () => {
  const fs = require('node:fs');
  const p = __dirname + '/../systemd/discord-bot.service';
  assert.ok(fs.existsSync(p), 'systemd unit must exist');
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.includes('ExecStart=') && content.includes('bot.js'));
  assert.ok(content.includes('Restart=on-failure'));
});
