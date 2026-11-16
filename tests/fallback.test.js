// Cross-provider fallback against a local mock HTTP server. No real Ollama or
// OpenRouter traffic: the same mock answers both OpenAI-compatible endpoints.
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'test-token-0123456789abcdef';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botfallback-'));

const { CONFIG } = require('../src/config');
const { normalizeUsage } = require('../src/ai/completion');
const bot = require('../bot.js');

function sendSse(res, model, content) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const base = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model };
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}

function mockProvider(req, res) {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    let model = '';
    try { model = JSON.parse(raw).model || ''; } catch {}
    if (model.endsWith('fail')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'mock auth failure', code: 401 } }));
      return;
    }
    if (model === 'local-ok') return sendSse(res, model, 'local answer');
    if (model === 'remote-ok') return sendSse(res, model, 'remote answer');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `unknown mock model ${model}` } }));
  });
}

test('query falls back across providers in both directions', async (t) => {
  const server = http.createServer(mockProvider);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const saved = { ...CONFIG };
  Object.assign(CONFIG, {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_BASE_URL: baseUrl,
    OPENROUTER_MODEL: 'remote-ok',
    LOCAL_MODEL: 'local-ok',
    LOCAL_BASE_URL: baseUrl,
    LOCAL_API_KEY: 'test',
    LLM_MAX_RETRIES: 0,
    LLM_TIMEOUT_MS: 5000,
    MAX_TOKENS: 50,
  });
  t.after(() => Object.assign(CONFIG, saved));

  const messages = [{ role: 'user', content: 'hello' }];

  const local = await bot.queryOpenRouter(messages, 'remote-fail');
  assert.equal(local.model, 'ollama/local-ok');
  assert.match(local.text, /local answer/);
  assert.equal(normalizeUsage(local.usage).total, 7);

  const remote = await bot.queryOpenRouter(messages, 'ollama/local-fail');
  assert.equal(remote.model, 'remote-ok');
  assert.match(remote.text, /remote answer/);
  assert.equal(normalizeUsage(remote.usage).total, 7);
});
