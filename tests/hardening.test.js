const { test } = require('node:test');
const assert = require('node:assert/strict');

test('safety guardrails appended', () => {
  const { buildSystemPrompt, SAFETY_GUARDRAILS } = require('../src/ai/systemPrompt');
  const out = buildSystemPrompt('Be helpful.');
  assert.ok(out.startsWith('Be helpful.'));
  assert.ok(out.includes('@everyone') || out.includes('everyone'));
  assert.ok(SAFETY_GUARDRAILS.length > 50);
});

test('permission check passes in DM, detects missing in guild', () => {
  const { getMissingPermissions } = require('../src/discord/permissions');
  assert.deepEqual(getMissingPermissions({ isDMBased: () => true }), []);
  // Mock channel without permissionsFor -> [] (fail-open, never crash)
  assert.deepEqual(getMissingPermissions({ isDMBased: () => false }), []);
  // Mock with EmbedLinks missing
  const { PermissionsBitField } = require('discord.js');
  const fake = {
    isDMBased: () => false,
    guild: { members: { me: {} } },
    permissionsFor: () => ({ has: (f) => f !== PermissionsBitField.Flags.EmbedLinks }),
  };
  const missing = getMissingPermissions(fake, {});
  assert.equal(missing.length, 1);
});

test('attachment type detection', () => {
  const { isTextAttachment } = require('../src/discord/attachments');
  assert.equal(isTextAttachment({ name: 'a.txt', size: 100 }), true);
  assert.equal(isTextAttachment({ name: 'b.png', size: 100, contentType: 'image/png' }), false);
  assert.equal(isTextAttachment({ name: 'big.txt', size: 10 * 1024 * 1024 }), false);
});

test('safeReply splits via mocks', async () => {
  const { safeReplyToMessage, safeEditReply } = require('../src/utils/safeReply');
  const sent = [];
  const message = {
    reply: async (d) => { sent.push({ kind: 'reply', ...d }); return {}; },
    channel: { send: async (d) => { sent.push({ kind: 'send', ...d }); } },
  };
  await safeReplyToMessage(message, 'z'.repeat(5000));
  assert.ok(sent.length >= 3);
  assert.ok(sent.every(s => s.content.length <= 2000));
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });

  const edits = [];
  const interaction = {
    editReply: async (d) => { edits.push({ kind: 'edit', ...d }); },
    followUp: async (d) => { edits.push({ kind: 'follow', ...d }); },
  };
  await safeEditReply(interaction, 'y'.repeat(4000));
  assert.ok(edits.length >= 2);
});

test('embeds build without throw', () => {
  const { helpEmbed, errorEmbed, infoEmbed, modelListEmbed, actionRowForReply } = require('../src/discord/embeds');
  assert.ok(helpEmbed('/').toJSON().title.length > 0);
  assert.ok(errorEmbed('x').toJSON().title.length > 0);
  assert.ok(infoEmbed('t', 'b').toJSON().title === 't');
  assert.ok(modelListEmbed([{ id: 'a', name: 'A' }]).toJSON().description.includes('a'));
  assert.equal(actionRowForReply().components.length, 3);
});
