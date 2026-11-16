require('dotenv').config();

function num(name, def, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`Env ${name} must be a number, got "${raw}"`);
  if (min !== undefined && v < min) throw new Error(`Env ${name} must be >= ${min}, got ${v}`);
  if (max !== undefined && v > max) throw new Error(`Env ${name} must be <= ${max}, got ${v}`);
  return v;
}

function str(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return raw;
}

function idList(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return [];
  return raw.split(/[,\s]+/).map(v => v.trim()).filter(v => /^\d{5,25}$/.test(v));
}

const CONFIG = {
  DISCORD_TOKEN: str('DISCORD_TOKEN', ''),
  DISCORD_CLIENT_ID: str('DISCORD_CLIENT_ID', ''),
  OPENROUTER_API_KEY: str('OPENROUTER_API_KEY', ''),
  OPENROUTER_MODEL: str('OPENROUTER_MODEL', 'nvidia/nemotron-3-super-120b-a12b:free'),
  OPENROUTER_BASE_URL: str('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
  LOCAL_MODEL: str('LOCAL_MODEL', 'llama3.2:3b'),
  LOCAL_BASE_URL: str('OLLAMA_BASE_URL', 'http://127.0.0.1:11434/v1'),
  LOCAL_API_KEY: str('OLLAMA_API_KEY', 'ollama'),
  SYSTEM_PROMPT: str('SYSTEM_PROMPT', 'You are a helpful and concise Discord assistant. Keep answers friendly and practical.'),
  MAX_HISTORY: num('MAX_HISTORY', 8, 1, 50),
  MAX_TOKENS: num('MAX_TOKENS', 1000, 1, 8000),
  TEMPERATURE: num('TEMPERATURE', 0.85, 0, 2),
  TOP_P: num('TOP_P', 0.95, 0, 1),
  FREQUENCY_PENALTY: num('FREQUENCY_PENALTY', 0.5, -2, 2),
  PRESENCE_PENALTY: num('PRESENCE_PENALTY', 0.3, -2, 2),
  SERPER_API_KEY: str('SERPER_API_KEY', '') || null,
  MAX_PROMPT_CHARS: num('MAX_PROMPT_CHARS', 4000, 500, 20000),
  MAX_CODE_CHARS: num('MAX_CODE_CHARS', 6000, 500, 30000),
  COOLDOWN_MS: num('COOLDOWN_MS', 4000, 0, 60000),
  LLM_TIMEOUT_MS: num('LLM_TIMEOUT_MS', 60000, 5000, 300000),
  LLM_MAX_RETRIES: num('LLM_MAX_RETRIES', 2, 0, 5),
  DATA_DIR: str('DATA_DIR', ''),
  BOT_OWNER_IDS: idList('BOT_OWNER_IDS'),
};

// Accept either `llama3.2:3b` or `ollama/llama3.2:3b` in LOCAL_MODEL.
CONFIG.LOCAL_MODEL = String(CONFIG.LOCAL_MODEL || '').trim().replace(/^ollama\//, '');

// Local Ollama is the default so the bot keeps working without remote credits.
CONFIG.DEFAULT_MODEL = str('DEFAULT_MODEL', '')
  || (CONFIG.LOCAL_MODEL ? `ollama/${CONFIG.LOCAL_MODEL}` : CONFIG.OPENROUTER_MODEL);

function validateConfig(cfg = CONFIG) {
  const errors = [];
  if (!cfg.DISCORD_TOKEN) errors.push('DISCORD_TOKEN is required');
  if (!cfg.LOCAL_MODEL && !cfg.OPENROUTER_API_KEY) {
    errors.push('No AI provider configured: set LOCAL_MODEL (Ollama) or OPENROUTER_API_KEY (bot will run in degraded mode without AI)');
  }
  if (cfg.DISCORD_TOKEN && cfg.DISCORD_TOKEN.length < 20) errors.push('DISCORD_TOKEN looks invalid (too short)');
  return errors;
}

function validateOrExit(cfg = CONFIG) {
  const errors = validateConfig(cfg);
  const fatal = errors.filter(e => e.startsWith('DISCORD_TOKEN'));
  if (fatal.length) {
    console.error('Invalid configuration:\n - ' + fatal.join('\n - '));
    process.exit(1);
  }
  const soft = errors.filter(e => !e.startsWith('DISCORD_TOKEN'));
  for (const w of soft) console.warn('[config] warning:', w);
  return cfg;
}

module.exports = { CONFIG, validateConfig, validateOrExit };
