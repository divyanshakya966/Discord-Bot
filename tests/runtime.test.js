// Runtime tests for the bot's command/button/chat wiring with mocked Discord
// objects. No network calls are made: LLM paths are exercised only in
// degraded mode (blanked API key) or via validation/cooldown guards.
//
// IMPORTANT: env isolation must happen BEFORE requiring ../bot.js — it calls
// validateOrExit (exits without DISCORD_TOKEN) and binds DATA_DIR at load.
// node --test runs each file in its own process, so this is CI-safe.
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'test-token-0123456789abcdef';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botruntime-'));

const { MessageFlags } = require('discord.js');
const bot = require('../bot.js');
const { CONFIG } = require('../src/config');

function src(uid = 'u1') {
  return { author: { id: uid, bot: false }, guildId: null };
}

function fakeMessage() {
  const sent = [];
  const message = {
    reply: async (d) => { sent.push({ kind: 'reply', ...d }); return { id: 'm1' }; },
    channel: { send: async (d) => { sent.push({ kind: 'send', ...d }); } },
  };
  return { message, sent };
}

const chan = () => ({ sendTyping: async () => {} });
const mode = (message) => ({ kind: 'message', message });
const firstReply = (sent) => sent.find(s => s.kind === 'reply');

function buttonInteraction(uid, customId) {
  const calls = [];
  const interaction = {
    customId,
    user: { id: uid },
    guildId: null,
    channelId: 'c1',
    channel: {},
    reply: async (d) => { calls.push({ kind: 'reply', ...d }); },
    deferUpdate: async () => { calls.push({ kind: 'deferUpdate' }); },
    update: async (d) => { calls.push({ kind: 'update', ...d }); },
    followUp: async (d) => { calls.push({ kind: 'followUp', ...d }); },
  };
  return { interaction, calls };
}

// Blank the API key without network: every LLM path must fail fast with the
// setup reminder instead of attempting requests.
async function withBlankedKey(fn) {
  const saved = CONFIG.OPENROUTER_API_KEY;
  CONFIG.OPENROUTER_API_KEY = '';
  try {
    await fn();
  } finally {
    CONFIG.OPENROUTER_API_KEY = saved;
  }
}

// Validation paths run before any LLM call but after the configured check, so
// pin a dummy key to reach them deterministically with or without a .env file.
async function withDummyKey(fn) {
  const saved = CONFIG.OPENROUTER_API_KEY;
  CONFIG.OPENROUTER_API_KEY = 'test-key-for-validation-paths';
  try {
    await fn();
  } finally {
    CONFIG.OPENROUTER_API_KEY = saved;
  }
}

test('help replies with a commands embed', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src(), chan(), 'help', '', mode(message));
  const r = firstReply(sent);
  assert.ok(r.embeds?.length === 1);
  assert.match(r.embeds[0].toJSON().title, /Commands/);
});

test('ping replies without throwing when gateway ping is NaN', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src(), chan(), 'ping', '', mode(message));
  const r = firstReply(sent);
  assert.ok(r.embeds?.length === 1);
});

test('stats shows current model and personality', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-stats'), chan(), 'stats', '', mode(message));
  const desc = firstReply(sent).embeds[0].toJSON().description;
  assert.match(desc, /Model:/);
  assert.match(desc, /Personality:/);
});

test('clear wipes history and confirms', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-clear'), chan(), 'clear', '', mode(message));
  assert.match(firstReply(sent).embeds[0].toJSON().title, /Cleared/);
});

test('unknown command hints at help', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src(), chan(), 'nope', '', mode(message));
  assert.match(firstReply(sent).content, /Unknown command/);
});

test('ask with empty prompt shows usage hint, no LLM call', async () => {
  await withDummyKey(async () => {
    const { message, sent } = fakeMessage();
    await bot.handleCommand(src(), chan(), 'ask', '   ', mode(message));
    assert.match(firstReply(sent).content, /ask question/);
  });
});

test('ask over the length cap is rejected without LLM call', async () => {
  await withDummyKey(async () => {
    const { message, sent } = fakeMessage();
    await bot.handleCommand(src(), chan(), 'ask', 'x'.repeat(CONFIG.MAX_PROMPT_CHARS + 10), mode(message));
    assert.match(firstReply(sent).content, /too long/);
  });
});

test('model set rejects garbage, accepts valid IDs', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-model'), chan(), 'model', 'set !!!bad id!!!', mode(message));
  assert.match(firstReply(sent).content, /Unknown model/);

  const m2 = fakeMessage();
  await bot.handleCommand(src('u-model'), chan(), 'model', 'set test/custom-model', mode(m2.message));
  assert.match(firstReply(m2.sent).embeds[0].toJSON().title, /Model Switched/);

  const m3 = fakeMessage();
  await bot.handleCommand(src('u-model'), chan(), 'model', 'current', mode(m3.message));
  assert.match(firstReply(m3.sent).embeds[0].toJSON().description, /test\/custom-model/);
});

test('personality set rejects unknown, accepts girl', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-pers'), chan(), 'personality', 'set nosuch', mode(message));
  assert.match(firstReply(sent).content, /not found/);

  const m2 = fakeMessage();
  await bot.handleCommand(src('u-pers'), chan(), 'personality', 'set girl', mode(m2.message));
  assert.match(firstReply(m2.sent).embeds[0].toJSON().title, /Personality Switched/);
});

test('export json replies with a file attachment', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-exp'), chan(), 'export', 'json', mode(message));
  const r = firstReply(sent);
  assert.ok(r.files?.length === 1);
  assert.equal(r.files[0].name, 'history.json');
});

test('export md with empty history says so', async () => {
  const { message, sent } = fakeMessage();
  await bot.handleCommand(src('u-expempty'), chan(), 'export', 'md', mode(message));
  assert.match(firstReply(sent).content, /No history/);
});

test('degraded mode: chat/code/research fail fast with setup reminder', async () => {
  await withBlankedKey(async () => {
    const c1 = fakeMessage();
    await bot.runChat({ source: src('u-deg'), channel: chan(), userPrompt: 'hello?', replyMode: mode(c1.message) });
    assert.match(firstReply(c1.sent).content, /not configured/);

    const c2 = fakeMessage();
    await bot.handleCommand(src('u-deg'), chan(), 'code', 'x = 1', mode(c2.message));
    assert.match(firstReply(c2.sent).content, /not configured/);

    const c3 = fakeMessage();
    await bot.handleCommand(src('u-deg'), chan(), 'research', 'cats', mode(c3.message));
    assert.match(firstReply(c3.sent).content, /not configured/);
  });
});

test('button clear wipes memory with an ephemeral confirm', async () => {
  const { interaction, calls } = buttonInteraction('u-btn', 'clear');
  await bot.handleButton(interaction);
  const r = calls.find(c => c.kind === 'reply');
  assert.equal(r.flags, MessageFlags.Ephemeral);
  assert.match(r.embeds[0].toJSON().title, /Cleared/);
});

test('button retry with no recent prompt tells the user', async () => {
  const { interaction, calls } = buttonInteraction('u-fresh-' + Date.now(), 'retry');
  await bot.handleButton(interaction);
  const r = calls.find(c => c.kind === 'reply');
  assert.match(r.content, /No recent prompt/);
  assert.equal(r.flags, MessageFlags.Ephemeral);
});

test('button retry in degraded mode fails fast without deferring', async () => {
  await withBlankedKey(async () => {
    bot.lastPromptBySession.set('dm:u-btndeg', 'console.log("seed")');
    const { interaction, calls } = buttonInteraction('u-btndeg', 'retry');
    await bot.handleButton(interaction);
    const r = calls.find(k => k.kind === 'reply');
    assert.match(r.content, /not configured/);
    assert.ok(!calls.some(k => k.kind === 'deferUpdate'), 'must not defer when refusing fast');
    bot.lastPromptBySession.delete('dm:u-btndeg');
  });
});

// ---------- Slash-command wiring ----------

function slashInteraction({ command, options = {}, subcommand = null, uid = 'u1' }) {
  const calls = [];
  const interaction = {
    commandName: command,
    deferred: false,
    replied: false,
    user: { id: uid },
    guildId: null,
    channelId: 'c1',
    channel: { sendTyping: async () => {} },
    options: {
      getString: (name) => options[name] ?? null,
      getSubcommand: () => subcommand,
      getFocused: () => ({ name: options.focusedName, value: options.focusedValue }),
    },
    deferReply: async () => { calls.push({ kind: 'deferReply' }); },
    editReply: async (d) => { calls.push({ kind: 'editReply', ...d }); },
    followUp: async (d) => { calls.push({ kind: 'followUp', ...d }); },
    reply: async (d) => { calls.push({ kind: 'reply', ...d }); },
    respond: async (list) => { calls.push({ kind: 'respond', list }); },
  };
  return { interaction, calls };
}

test('slash defers first, then answers (help/ping/stats/clear)', async () => {
  for (const command of ['help', 'ping', 'clear', 'stats']) {
    const { interaction, calls } = slashInteraction({ command, uid: 'u-slash-' + command });
    await bot.handleSlashCommand(interaction);
    assert.equal(calls[0].kind, 'deferReply', `${command} must defer first`);
    assert.ok(calls.some(c => c.kind === 'editReply'), `${command} must edit the deferred reply`);
  }
});

test('slash model/personality list branches work', async () => {
  const m = slashInteraction({ command: 'model', subcommand: 'list', uid: 'u-slash-ml' });
  await bot.handleSlashCommand(m.interaction);
  assert.ok(m.calls.some(c => c.kind === 'editReply' && c.embeds?.length === 1));

  const p = slashInteraction({ command: 'personality', subcommand: 'list', uid: 'u-slash-pl' });
  await bot.handleSlashCommand(p.interaction);
  assert.ok(p.calls.some(c => c.kind === 'editReply' && c.embeds?.length === 1));
});

test('slash LLM commands degrade fast with setup reminder', async () => {
  await withBlankedKey(async () => {
    const a = slashInteraction({ command: 'ask', options: { question: 'hi?' }, uid: 'u-slash-a' });
    await bot.handleSlashCommand(a.interaction);
    assert.match(a.calls.find(c => c.kind === 'editReply').content, /not configured/);

    const c = slashInteraction({ command: 'code', options: { code: 'x=1' }, uid: 'u-slash-c' });
    await bot.handleSlashCommand(c.interaction);
    assert.match(c.calls.find(k => k.kind === 'editReply').content, /not configured/);

    const r = slashInteraction({ command: 'research', options: { query: 'cats' }, uid: 'u-slash-r' });
    await bot.handleSlashCommand(r.interaction);
    assert.match(r.calls.find(k => k.kind === 'editReply').content, /not configured/);
  });
});

test('slash export json replies with a file', async () => {
  const { interaction, calls } = slashInteraction({ command: 'export', options: {}, uid: 'u-slash-e' });
  await bot.handleSlashCommand(interaction);
  const edit = calls.find(c => c.kind === 'editReply');
  assert.ok(edit.files?.length === 1);
});

test('unknown slash command answers instead of hanging deferred', async () => {
  const { interaction, calls } = slashInteraction({ command: 'ghost', uid: 'u-slash-g' });
  await bot.handleSlashCommand(interaction);
  const edit = calls.find(c => c.kind === 'editReply');
  assert.match(edit.content, /Unknown command/);
});

test('prune removes stale histories, tmp orphans, and over-cap files', async () => {
  const fs = require('fs/promises');
  const dir = process.env.DATA_DIR;
  await fs.writeFile(path.join(dir, 'old_session.json'), '{}');
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  await fs.utimes(path.join(dir, 'old_session.json'), old, old);
  await fs.writeFile(path.join(dir, 'fresh_session.json'), '[]');
  await fs.writeFile(path.join(dir, 'crash.123.abcd.tmp'), 'partial');
  await fs.writeFile(path.join(dir, 'model_preferences.json'), '{}');
  await bot.pruneOldHistories(30, 2000, dir);
  const left = await fs.readdir(dir);
  assert.ok(!left.includes('old_session.json'), 'stale history removed');
  assert.ok(!left.includes('crash.123.abcd.tmp'), 'tmp orphan removed');
  assert.ok(left.includes('fresh_session.json'), 'fresh history kept');
  assert.ok(left.includes('model_preferences.json'), 'prefs never pruned');
});

test('autocomplete responds for model and personality, silent otherwise', async () => {
  const m = slashInteraction({ command: 'model', options: { focusedName: 'model', focusedValue: '' } });
  await bot.handleAutocomplete(m.interaction);
  const rm = m.calls.find(c => c.kind === 'respond');
  assert.ok(rm.list.length > 0);
  assert.ok(rm.list.every(e => typeof e.name === 'string' && typeof e.value === 'string'));

  const p = slashInteraction({ command: 'personality', options: { focusedName: 'name', focusedValue: 'gir' } });
  await bot.handleAutocomplete(p.interaction);
  const rp = p.calls.find(c => c.kind === 'respond');
  assert.ok(rp.list.some(e => e.value === 'girl'));

  const x = slashInteraction({ command: 'ask', options: { focusedName: 'nope', focusedValue: '' } });
  await bot.handleAutocomplete(x.interaction);
  assert.ok(!x.calls.some(c => c.kind === 'respond'));
});

test('slash definitions match what the handlers read', async () => {
  const { slashCommands } = require('../commands.js');
  const byName = Object.fromEntries(slashCommands.map(c => [c.name, c]));
  const opt = (cmd, name) => (byName[cmd].options || []).find(o => o.name === name);

  assert.equal(opt('ask', 'question')?.required, true);
  assert.equal(opt('code', 'code')?.required, true);
  assert.equal(opt('research', 'query')?.required, true);
  assert.equal(opt('export', 'format')?.required ?? false, false);
  assert.deepEqual(opt('export', 'format')?.choices?.map(c => c.value).sort(), ['json', 'md']);

  for (const cmd of ['model', 'personality']) {
    const subs = (byName[cmd].options || []).filter(o => o.type === 1).map(o => o.name).sort();
    assert.deepEqual(subs, ['current', 'list', 'set']);
  }
  const modelSet = byName.model.options.find(o => o.name === 'set');
  assert.ok(modelSet.options.some(o => o.name === 'model' && o.autocomplete));
  const persSet = byName.personality.options.find(o => o.name === 'set');
  assert.ok(persSet.options.some(o => o.name === 'name' && o.autocomplete));
});
