/**
 * Minimal OpenAI-compatible client for a local Ollama server.
 *
 * Ollama exposes /v1/chat/completions, so the bot can stream local models
 * without the OpenRouter SDK (and without any remote credits).
 */

function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim() || 'http://127.0.0.1:11434/v1';
  return raw.replace(/\/+$/, '');
}

function makeHttpError(status, bodyText) {
  let data = null;
  try { data = JSON.parse(bodyText); } catch {}
  const detail = data?.error?.message || data?.error || data?.message || bodyText;
  const error = new Error(`Local AI error (HTTP ${status}): ${String(detail || 'request failed').slice(0, 300)}`);
  error.status = status;
  error.response = { status, data };
  return error;
}

async function* iterateBody(body) {
  if (!body) throw new Error('Local AI returned an empty response body.');
  if (typeof body[Symbol.asyncIterator] === 'function') {
    yield* body;
    return;
  }
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return;
  }
  throw new Error('Local AI response body is not readable.');
}

async function* parseSseStream(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  function* linesFrom(chunkText) {
    buffer += chunkText;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      yield line;
    }
  }

  function* parseLine(line) {
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      yield JSON.parse(data);
    } catch {}
  }

  for await (const chunk of iterateBody(body)) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    for (const line of linesFrom(text)) {
      yield* parseLine(line);
    }
  }

  buffer += decoder.decode();
  const tail = buffer.replace(/\r$/, '');
  if (tail) yield* parseLine(tail);
}

/**
 * Open a streaming chat completion against Ollama's OpenAI-compatible API.
 * Returns an async iterable of parsed chunks shaped like OpenRouter SSE chunks.
 */
async function openLocalChatStream({
  baseUrl,
  apiKey,
  model,
  messages,
  maxTokens,
  temperature,
  topP,
  frequencyPenalty,
  presencePenalty,
  think,
  reasoningEffort,
  timeoutMs,
} = {}) {
  if (!model) throw new Error('No local model was specified.');
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const payload = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (Number.isFinite(maxTokens)) payload.max_tokens = maxTokens;
  if (Number.isFinite(temperature)) payload.temperature = temperature;
  if (Number.isFinite(topP)) payload.top_p = topP;
  if (Number.isFinite(frequencyPenalty)) payload.frequency_penalty = frequencyPenalty;
  if (Number.isFinite(presencePenalty)) payload.presence_penalty = presencePenalty;
  if (typeof think === 'boolean') payload.think = think;
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    throw makeHttpError(res.status, await res.text());
  }

  const contentType = String(res.headers?.get?.('content-type') || '');
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return (async function* () { yield data; })();
  }

  return parseSseStream(res.body);
}

const healthCache = new Map();

/**
 * Check whether the local Ollama OpenAI-compatible endpoint is reachable and
 * return the model IDs it advertises. Cached briefly so /ping spam stays cheap.
 */
async function checkLocalHealth({ baseUrl, timeoutMs = 1500, cacheMs = 5000 } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const now = Date.now();
  const cached = healthCache.get(base);
  if (cacheMs > 0 && cached && cached.expires > now) return cached.value;

  let value;
  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      value = { ok: false, baseUrl: base, status: res.status, error: `HTTP ${res.status}`, models: [] };
    } else {
      const data = await res.json().catch(() => null);
      const models = (Array.isArray(data?.data) ? data.data : [])
        .map(m => String(m?.id || m?.name || ''))
        .filter(Boolean);
      value = { ok: true, baseUrl: base, status: res.status, models };
    }
  } catch (error) {
    value = { ok: false, baseUrl: base, error: String(error?.message || error), models: [] };
  }

  if (cacheMs > 0) healthCache.set(base, { expires: now + cacheMs, value });
  return value;
}

function isLocalConnectionError(error) {
  const msg = String(error?.message || error || '');
  return /fetch failed|econnrefused|econnreset|socket hang up|network|connect|failed to fetch/i.test(msg);
}

function localUnavailableMessage(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  return `Local AI is not reachable at ${base}. Start Ollama (\`ollama serve\`) and make sure the model is pulled.`;
}

module.exports = {
  normalizeBaseUrl,
  parseSseStream,
  openLocalChatStream,
  checkLocalHealth,
  isLocalConnectionError,
  localUnavailableMessage,
};
