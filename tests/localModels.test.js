const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  LOCAL_MODELS,
  AVAILABLE_MODELS,
  DEFAULT_PERSONALITIES,
  PERSONALITY_MODELS,
  getModelEntry,
  resolveModelProvider,
  isLocalModelId,
} = require('../bot-data');
const { parseSseStream, normalizeBaseUrl, checkLocalHealth } = require('../src/ai/localProvider');
const { fitMessagesToContext, getModelContextTokens, getOutputReserveTokens } = require('../bot');

test('local Ollama models are exposed in the model list', () => {
  assert.ok(LOCAL_MODELS.length >= 3);
  for (const model of LOCAL_MODELS) {
    assert.equal(model.provider, 'ollama');
    assert.ok(AVAILABLE_MODELS.some(m => m.id === model.id));
    assert.ok(getModelEntry(model.id));
  }
});

test('each personality is wired to a known local model', () => {
  for (const [key, personality] of Object.entries(DEFAULT_PERSONALITIES)) {
    assert.ok(PERSONALITY_MODELS[key], `${key} must have a personality model mapping`);
    const target = resolveModelProvider(personality.model);
    assert.equal(target.provider, 'ollama', `${key} should use a local model`);
    assert.ok(getModelEntry(target.id), `${key} model ${personality.model} must be listed`);
  }
});

test('code analyzer defaults to the lite coder model', () => {
  assert.equal(DEFAULT_PERSONALITIES['code-analyzer'].model, 'ollama/qwen2.5-coder-7b-lite:latest');
  const target = getModelEntry('ollama/qwen2.5-coder-7b-lite:latest');
  assert.equal(target.contextTokens, 8192);
  assert.ok(!getModelEntry('ollama/qwen2.5-coder:7b'));
});

test('model resolver keeps local and OpenRouter IDs separate', () => {
  const local = resolveModelProvider('ollama/qwen2.5-coder-7b-lite:latest');
  assert.equal(local.provider, 'ollama');
  assert.equal(local.model, 'qwen2.5-coder-7b-lite:latest');
  assert.equal(isLocalModelId(local.id), true);

  const bareLocal = resolveModelProvider('qwen3:4b');
  assert.equal(bareLocal.provider, 'ollama');
  assert.equal(bareLocal.id, 'ollama/qwen3:4b');

  const remote = resolveModelProvider('openrouter/free');
  assert.equal(remote.provider, 'openrouter');
  assert.equal(isLocalModelId(remote.id), false);
});

test('fallback message fitting trims history for a smaller context window', () => {
  const huge = 'x'.repeat(24000);
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: huge },
    { role: 'assistant', content: huge },
    { role: 'user', content: 'latest question' },
  ];
  const fitted = fitMessagesToContext(messages, 'ollama/llama3.2:3b');
  assert.ok(fitted.length < messages.length);
  assert.equal(fitted[0].role, 'system');
  assert.equal(fitted.at(-1).content, 'latest question');
  assert.equal(getModelContextTokens('ollama/qwen2.5-coder-7b-lite:latest'), 8192);
  assert.equal(getOutputReserveTokens('ollama/qwen2.5-coder-7b-lite:latest'), 2000);
});

test('Ollama base URLs are normalized', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(normalizeBaseUrl(''), 'http://127.0.0.1:11434/v1');
});

test('local health check reports reachable models', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'llama3.2:3b' }, { id: 'qwen3:4b' }] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const health = await checkLocalHealth({ baseUrl, cacheMs: 0 });
  assert.equal(health.ok, true);
  assert.deepEqual(health.models, ['llama3.2:3b', 'qwen3:4b']);
});

test('SSE stream parser tolerates chunk boundaries and [DONE]', async () => {
  async function* body() {
    yield Buffer.from('data: {"choices":[{"delta":{"content":"Hel');
    yield Buffer.from('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n');
    yield Buffer.from('data: [DONE]\n\n');
  }
  const chunks = [];
  for await (const chunk of parseSseStream(body())) chunks.push(chunk);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].choices[0].delta.content, 'Hello');
  assert.equal(chunks[1].choices[0].delta.content, '!');
});
