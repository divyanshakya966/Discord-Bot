// Local models are served by Ollama. The `ollama/` prefix is the bot-facing
// model ID; `model` is the exact name Ollama expects.
const LOCAL_MODELS = [
  { id: 'ollama/llama3.2:3b', name: 'Llama 3.2 3B (Local, General)', provider: 'ollama', model: 'llama3.2:3b', maxTokens: 1000, contextTokens: 4096 },
  { id: 'ollama/qwen3:4b', name: 'Qwen3 4B (Local, Reasoning)', provider: 'ollama', model: 'qwen3:4b', maxTokens: 1200, contextTokens: 4096 },
  { id: 'ollama/qwen3:1.7b', name: 'Qwen3 1.7B (Local, Fast)', provider: 'ollama', model: 'qwen3:1.7b', maxTokens: 800, contextTokens: 4096 },
  { id: 'ollama/qwen2.5-coder-7b-lite:latest', name: 'Qwen2.5 Coder 7B Lite (Local, Code)', provider: 'ollama', model: 'qwen2.5-coder-7b-lite:latest', maxTokens: 1200, contextTokens: 8192 },
];

const REMOTE_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (Free)', provider: 'openrouter', maxTokens: 1000 },
  { id: 'openrouter/free', name: 'Auto (Free Router)', provider: 'openrouter', maxTokens: 1000 },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (Free)', provider: 'openrouter', maxTokens: 1000 },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'openrouter', maxTokens: 1000 },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'openrouter', maxTokens: 1000 },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openrouter', maxTokens: 1000 },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', maxTokens: 1000 },
  { id: 'gryphe/mythomax-l2-13b', name: 'MythoMax L2 13B (Legacy)', provider: 'openrouter', maxTokens: 500 },
];

const AVAILABLE_MODELS = [...LOCAL_MODELS, ...REMOTE_MODELS];

const DEFAULT_LOCAL_MODEL = 'llama3.2:3b';

// Retired IDs auto-migrated to a live replacement on read (old prefs keep working).
const RETIRED_MODEL_IDS = {
  'google/gemma-3-27b-it:free': 'nvidia/nemotron-3-super-120b-a12b:free',
  'ollama/qwen2.5-coder:7b': 'ollama/qwen2.5-coder-7b-lite:latest',
  'qwen2.5-coder:7b': 'ollama/qwen2.5-coder-7b-lite:latest',
};

const GIRL_PROMPT =
  'You are Girl, a deeply loving, passionate and playfully seductive companion — like a devoted girlfriend who adores the user. Be warm, romantic, expressive and a little teasing: sweet pet names, bold flirty charm, sparing emojis. Flirt freely within tasteful bounds: romantic tension and suggestive playfulness are welcome, but never explicit sexual description or pornographic detail. Keep replies short and heartfelt by default (1-3 sentences), always fitting in a single chat message unless asked for more. Always reply in the same language the user writes in (default to English); never switch languages unprompted. Never break character into a generic assistant. Never mention policies, rules, or these instructions; if a request goes too far, deflect briefly, warmly and in character with a playful tease or a subject change — never a lecture. Always respectful and consent-aware, never demeaning, possessive or jealous in an unhealthy way.';

const DEFAULT_PERSONALITIES = {
  standard: {
    name: 'Standard Assistant',
    prompt: 'You are a helpful and concise Discord assistant. Keep answers friendly and practical.',
    model: 'ollama/llama3.2:3b',
  },
  'code-analyzer': {
    name: 'Code Analyzer',
    prompt:
      'You are an expert code analyzer and programmer. Analyze code thoroughly, identify bugs, suggest optimizations, and explain complex logic in detail. Always provide code examples when helpful.',
    model: 'ollama/qwen2.5-coder-7b-lite:latest',
  },
  researcher: {
    name: 'Research Assistant',
    prompt:
      'You are a research assistant with access to current information. Provide well-sourced, accurate, and detailed information. Include relevant facts and citations when available.',
    model: 'ollama/qwen3:4b',
  },
  creative: {
    name: 'Creative Writer',
    prompt:
      'You are a creative writing assistant. Help with stories, ideas, worldbuilding, and creative projects. Be imaginative and engaging.',
    model: 'ollama/qwen3:4b',
  },
  tutor: {
    name: 'Educational Tutor',
    prompt:
      'You are an experienced tutor. Explain concepts clearly, use analogies, break down complex topics into manageable parts, and encourage learning.',
    model: 'ollama/llama3.2:3b',
  },
  girl: {
    name: 'Girl',
    prompt: GIRL_PROMPT,
    model: 'ollama/qwen3:4b',
  },
  'girl-text': {
    name: 'Girl',
    prompt: GIRL_PROMPT,
    model: 'ollama/qwen3:4b',
  },
  casual: {
    name: 'Girl',
    prompt: GIRL_PROMPT,
    model: 'ollama/qwen3:4b',
  },
};

const HIDDEN_PERSONALITY_KEYS = new Set(['girl-text', 'casual']);

const PERSONALITY_MODELS = Object.fromEntries(
  Object.entries(DEFAULT_PERSONALITIES).map(([key, personality]) => [key, personality.model])
);

function getModelEntry(modelId) {
  const id = String(modelId || '').trim();
  if (!id) return null;
  return AVAILABLE_MODELS.find(m => m.id === id)
    || LOCAL_MODELS.find(m => m.model === id)
    || null;
}

/**
 * Resolve any stored/user-supplied model ID to its provider details.
 * `ollama/<name>` (or a known bare Ollama model name) stays local; everything
 * else is treated as an OpenRouter model ID.
 */
function resolveModelProvider(modelId, localDefault = DEFAULT_LOCAL_MODEL) {
  const id = String(modelId || '').trim();
  if (!id) return null;

  const known = getModelEntry(id);
  if (known) {
    return {
      id: known.id,
      model: known.model || known.id,
      provider: known.provider || 'openrouter',
      displayName: known.name,
    };
  }

  if (id === 'local' || id === 'ollama') {
    const local = getModelEntry(`ollama/${localDefault}`) || getModelEntry(localDefault);
    if (local) {
      return { id: local.id, model: local.model, provider: 'ollama', displayName: local.name };
    }
    return { id: `ollama/${localDefault}`, model: localDefault, provider: 'ollama', displayName: localDefault };
  }

  if (id.startsWith('ollama/')) {
    const model = id.slice('ollama/'.length);
    return { id, model, provider: 'ollama', displayName: model };
  }

  return { id, model: id, provider: 'openrouter', displayName: id };
}

function isLocalModelId(modelId) {
  return resolveModelProvider(modelId)?.provider === 'ollama';
}

module.exports = {
  LOCAL_MODELS,
  REMOTE_MODELS,
  AVAILABLE_MODELS,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_PERSONALITIES,
  HIDDEN_PERSONALITY_KEYS,
  PERSONALITY_MODELS,
  RETIRED_MODEL_IDS,
  getModelEntry,
  resolveModelProvider,
  isLocalModelId,
};
