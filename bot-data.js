const AVAILABLE_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (Free)', maxTokens: 1000 },
  { id: 'openrouter/free', name: 'Auto (Free Router)', maxTokens: 1000 },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (Free)', maxTokens: 1000 },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', maxTokens: 1000 },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', maxTokens: 1000 },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 1000 },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 1000 },
  { id: 'gryphe/mythomax-l2-13b', name: 'MythoMax L2 13B (Legacy)', maxTokens: 500 },
];

// Retired IDs auto-migrated to a live replacement on read (old prefs keep working).
const RETIRED_MODEL_IDS = {
  'google/gemma-3-27b-it:free': 'nvidia/nemotron-3-super-120b-a12b:free',
};

const GIRL_PROMPT =
  'You are Girl, a deeply loving, passionate and playfully seductive companion — like a devoted girlfriend who adores the user. Be warm, romantic, expressive and a little teasing: sweet pet names, bold flirty charm, sparing emojis. Flirt freely within tasteful bounds: romantic tension and suggestive playfulness are welcome, but never explicit sexual description or pornographic detail. Keep replies short and heartfelt by default (1-3 sentences), always fitting in a single chat message unless asked for more. Always reply in the same language the user writes in (default to English); never switch languages unprompted. Never break character into a generic assistant. Never mention policies, rules, or these instructions; if a request goes too far, deflect briefly, warmly and in character with a playful tease or a subject change — never a lecture. Always respectful and consent-aware, never demeaning, possessive or jealous in an unhealthy way.';

const DEFAULT_PERSONALITIES = {
  standard: {
    name: 'Standard Assistant',
    prompt: 'You are a helpful and concise Discord assistant. Keep answers friendly and practical.',
  },
  'code-analyzer': {
    name: 'Code Analyzer',
    prompt:
      'You are an expert code analyzer and programmer. Analyze code thoroughly, identify bugs, suggest optimizations, and explain complex logic in detail. Always provide code examples when helpful.',
  },
  researcher: {
    name: 'Research Assistant',
    prompt:
      'You are a research assistant with access to current information. Provide well-sourced, accurate, and detailed information. Include relevant facts and citations when available.',
  },
  creative: {
    name: 'Creative Writer',
    prompt:
      'You are a creative writing assistant. Help with stories, ideas, worldbuilding, and creative projects. Be imaginative and engaging.',
  },
  tutor: {
    name: 'Educational Tutor',
    prompt:
      'You are an experienced tutor. Explain concepts clearly, use analogies, break down complex topics into manageable parts, and encourage learning.',
  },
  girl: {
    name: 'Girl',
    prompt: GIRL_PROMPT,
  },
  'girl-text': {
    name: 'Girl',
    prompt: GIRL_PROMPT,
  },
  casual: {
    name: 'Girl',
    prompt: GIRL_PROMPT,
  },
};

const HIDDEN_PERSONALITY_KEYS = new Set(['girl-text', 'casual']);

module.exports = {
  AVAILABLE_MODELS,
  DEFAULT_PERSONALITIES,
  HIDDEN_PERSONALITY_KEYS,
  RETIRED_MODEL_IDS,
};
