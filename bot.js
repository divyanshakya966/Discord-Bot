const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder, MessageFlags } = require('discord.js');

const { CONFIG, validateOrExit } = require('./src/config');
const logger = require('./src/logger');
const { AVAILABLE_MODELS, DEFAULT_PERSONALITIES, RETIRED_MODEL_IDS } = require('./bot-data');
const { getSessionKey, getModelKey, getPersonalityKey } = require('./src/store/sessions');
const { createHistoryStore, createJsonStore } = require('./src/store/historyStore');
const { ensureDir } = require('./src/store/atomic');
const { buildInitialPagedPayload, handlePaginationButton } = require('./src/discord/pagination');
const { safeReplyToMessage, safeEditReply } = require('./src/utils/safeReply');
const {
  extractProviderErrorMessage,
  isLikelyParameterCompatibilityError,
  isModelUnavailableError,
  isAuthError,
  describeProviderError,
  toUserFacingProviderError,
} = require('./src/ai/errors');
const { withRetry } = require('./src/ai/retry');
const { truncateHistory, trimToCompleteChars } = require('./src/ai/tokens');
const { CooldownManager } = require('./src/discord/cooldown');
const { startTypingLoop } = require('./src/discord/typing');
const { parseMentionCommand, parsePrefixCommand } = require('./src/discord/routing');
const { getMissingPermissions, missingToUserText } = require('./src/discord/permissions');
const { collectAttachmentContext } = require('./src/discord/attachments');
const { buildSystemPrompt } = require('./src/ai/systemPrompt');
const {
  helpEmbed, errorEmbed, infoEmbed, modelListEmbed, personalityListEmbed, actionRowForReply, guildWelcomeEmbed,
} = require('./src/discord/embeds');

validateOrExit(CONFIG);

const DATA_DIR = CONFIG.DATA_DIR || path.join(__dirname, 'data');
const COMMAND_PREFIX = '/';
const NO_PING = { parse: [] };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ---------- Stores ----------
const historyStore = createHistoryStore({ dataDir: DATA_DIR, maxHistory: CONFIG.MAX_HISTORY, maxTokens: 6000 });
const modelPrefs = createJsonStore('model_preferences.json', { dataDir: DATA_DIR });
const personalityPrefs = createJsonStore('personality_preferences.json', { dataDir: DATA_DIR });
const customPersonalityStore = createJsonStore('personalities.json', { dataDir: DATA_DIR });

// ---------- Stats ----------
const stats = { startTime: Date.now(), totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 };
const cooldowns = new CooldownManager(CONFIG.COOLDOWN_MS);
const lastPromptBySession = new Map();
const searchCache = new Map();

let openRouterClientPromise;

// ---------- Helpers ----------
function isValidCustomModelId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9\-_./:]+$/.test(id) && id.length >= 3 && id.length <= 120;
}

async function loadPersonalities() {
  const custom = await customPersonalityStore.load();
  return { ...DEFAULT_PERSONALITIES, ...(custom || {}) };
}

async function getSessionModel(source) {
  const key = getModelKey(source);
  let stored = await modelPrefs.get(key);
  if (stored && RETIRED_MODEL_IDS[stored]) {
    stored = RETIRED_MODEL_IDS[stored];
    await modelPrefs.set(key, stored);
  }
  if (stored && (AVAILABLE_MODELS.some(m => m.id === stored) || isValidCustomModelId(stored))) return stored;
  return CONFIG.OPENROUTER_MODEL;
}

async function setSessionModel(source, modelId) {
  const id = String(modelId || '').trim();
  const known = AVAILABLE_MODELS.find(m => m.id === id);
  if (!known && !isValidCustomModelId(id)) throw new Error(`Unknown model "${id}". Use /model list to see options.`);
  const key = getModelKey(source);
  await modelPrefs.set(key, id);
  return known || { id, name: id };
}

async function getSessionPersonality(source) {
  const personalities = await loadPersonalities();
  const key = getPersonalityKey(source);
  let stored = await personalityPrefs.get(key);
  if (stored === 'girl-text' || stored === 'casual') stored = 'girl';
  const resolved = personalities[stored] ? stored : 'standard';
  const p = personalities[resolved] || personalities.standard;
  if (resolved === 'standard' && CONFIG.SYSTEM_PROMPT) return { key: resolved, name: p.name, prompt: CONFIG.SYSTEM_PROMPT };
  return { key: resolved, ...p };
}

async function setSessionPersonality(source, name) {
  const personalities = await loadPersonalities();
  let key = String(name || '').trim().toLowerCase();
  if (key === 'girl-text' || key === 'casual') key = 'girl';
  if (!personalities[key]) throw new Error(`Personality not found: ${key}`);
  await personalityPrefs.set(getPersonalityKey(source), key);
  return { key, ...personalities[key] };
}

function checkCooldown(source, label = 'request') {
  const key = `${label}:${getSessionKey(source)}`;
  const r = cooldowns.check(key);
  return r;
}

function rememberPrompt(sessionKey, prompt) {
  lastPromptBySession.set(sessionKey, prompt);
  if (lastPromptBySession.size > 1000) {
    lastPromptBySession.delete(lastPromptBySession.keys().next().value);
  }
}

function trackRequest(latencyMs, failed = false) {
  stats.totalRequests++;
  stats.totalLatencyMs += latencyMs;
  if (failed) stats.totalErrors++;
}

const NOT_CONFIGURED_MSG = 'The AI is not configured yet. Please check the bot setup and try again.';

async function replyNotConfigured(replyMode) {
  if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, NOT_CONFIGURED_MSG);
  else await safeEditReply(replyMode.interaction, NOT_CONFIGURED_MSG);
}

// ---------- Paged AI replies ----------
// One paged message per answer (Prev/Next buttons, no channel flood); the payload builder also sanitizes markdown.
async function sendPagedAIReply(replyMode, rawText) {
  const payload = buildInitialPagedPayload(String(rawText ?? ''), actionRowForReply(), { maxChars: AUTO_CONTINUE_CHAR_BUDGET });
  if (replyMode.kind === 'message') {
    return replyMode.message.reply({ content: payload.content, allowedMentions: NO_PING, components: payload.components });
  }
  await replyMode.interaction.editReply({ content: payload.content, allowedMentions: NO_PING, components: payload.components });
  return null;
}

async function sendPagedFollowUp(interaction, rawText) {
  const payload = buildInitialPagedPayload(String(rawText ?? ''), actionRowForReply(), { maxChars: AUTO_CONTINUE_CHAR_BUDGET });
  await interaction.followUp({ content: payload.content, allowedMentions: NO_PING, components: payload.components });
}

// ---------- OpenRouter ----------
async function getOpenRouterClient() {
  if (!openRouterClientPromise) {
    openRouterClientPromise = import('@openrouter/sdk').then(({ OpenRouter }) => {
      return new OpenRouter({
        apiKey: CONFIG.OPENROUTER_API_KEY,
        serverURL: CONFIG.OPENROUTER_BASE_URL,
        httpReferer: 'https://github.com/local/discord-chatbot',
        appTitle: 'Discord Chatbot',
      });
    });
  }
  return openRouterClientPromise;
}

// Streams chat completions for message + slash paths; auto-continues
// length-truncated outputs. Falls back to the default model once when the
// session model is unavailable (retired slug, no route, key has no access).
const {
  CONTINUE_PROMPT,
  MAX_AUTO_CONTINUATIONS,
  AUTO_CONTINUE_CHAR_BUDGET,
  collectStreamText,
  completeWithAutoContinue,
  normalizeUsage,
} = require('./src/ai/completion');

function getEffectiveMaxTokens(modelId) {
  const known = AVAILABLE_MODELS.find(m => m.id === modelId);
  const cap = known?.maxTokens;
  if (Number.isFinite(cap) && cap > 0) return Math.min(CONFIG.MAX_TOKENS, cap);
  return CONFIG.MAX_TOKENS;
}

async function queryOpenRouter(messages, modelId, onChunk) {
  const openrouter = await getOpenRouterClient();
  const model = modelId || CONFIG.OPENROUTER_MODEL;

  async function attempt(current, msgs = messages) {
    const maxTokens = getEffectiveMaxTokens(current);
    const base = { model: current, messages: msgs, maxTokens, temperature: CONFIG.TEMPERATURE, stream: true };
    const rich = { ...base, topP: CONFIG.TOP_P, frequencyPenalty: CONFIG.FREQUENCY_PENALTY, presencePenalty: CONFIG.PRESENCE_PENALTY };

    async function sendOnce(chatRequest) {
      return withRetry(
        () => openrouter.chat.send({ chatRequest }),
        { retries: CONFIG.LLM_MAX_RETRIES, baseDelayMs: 800, timeoutMs: CONFIG.LLM_TIMEOUT_MS }
      );
    }

    let stream;
    try {
      stream = await sendOnce(rich);
    } catch (error) {
      const reason = extractProviderErrorMessage(error);
      if (isLikelyParameterCompatibilityError(reason)) {
        logger.warn('Retrying with reduced params', { model: current, reason: reason.slice(0, 200) });
        stream = await sendOnce(base);
      } else {
        throw error;
      }
    }

    const collected = await collectStreamText(stream, onChunk);
    return { ...collected, maxTokens };
  }

  // Stitch continuations when the provider hits the output token limit.
  async function attemptComplete(current, baseMessages) {
    const sendFn = (msgs) => attempt(current, msgs);
    const { text, usage, finishReason, continuations } = await completeWithAutoContinue(sendFn, baseMessages);
    if (continuations > 0) {
      logger.info('Auto-continued truncated output', { model: current, continuations, chars: text.length });
    }
    if (finishReason === 'length') {
      logger.warn('Output still truncated after auto-continue', { model: current, chars: text.length });
    }
    return { text, usage, finishReason };
  }

  try {
    const { text, usage } = await attemptComplete(model, messages);
    return { text, model, usage };
  } catch (error) {
    const fallback = CONFIG.OPENROUTER_MODEL;
    // Auth failures can't be fixed by switching models — fail fast instead of burning a fallback call.
    if (model !== fallback && !isAuthError(error) && isModelUnavailableError(error)) {
      logger.warn('Session model unavailable, falling back', { detail: describeProviderError(error), from: model, to: fallback });
      try {
        const fb = await attemptComplete(fallback, messages);
        return { text: fb.text, model: fallback, usage: fb.usage };
      } catch (fallbackError) {
        logger.error('Fallback model failed', { detail: describeProviderError(fallbackError), model: fallback });
        throw new Error(toUserFacingProviderError(fallbackError, fallback));
      }
    }
    logger.error('Model request failed', { detail: describeProviderError(error), model });
    throw new Error(toUserFacingProviderError(error, model));
  }
}

// ---------- Web search ----------
// Chain: Serper (best, needs key) -> Wikipedia (free, factual) -> DuckDuckGo (free, instant answers).
async function searchWeb(query) {
  const { parseSerperResults, searchWikipedia, searchDuckDuckGo } = require('./src/ai/websearch');
  const cached = searchCache.get(query);
  if (cached && cached.expires > Date.now()) return cached.text;

  function cache(text) {
    if (text) {
      searchCache.set(query, { text, expires: Date.now() + 10 * 60 * 1000 });
      if (searchCache.size > 200) searchCache.clear();
    }
    return text;
  }

  if (CONFIG.SERPER_API_KEY) {
    const run = async () => {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': CONFIG.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Serper ${res.status}`);
      return parseSerperResults(await res.json());
    };

    try {
      const text = await withRetry(run, { retries: 1, baseDelayMs: 600, timeoutMs: 20000 });
      if (text) return cache(text);
    } catch (e) {
      logger.warn('Serper failed, trying free fallbacks', { error: e?.message });
    }
  }

  try {
    const text = await withRetry(() => searchWikipedia(query), { retries: 1, baseDelayMs: 500, timeoutMs: 15000 });
    if (text) return cache(text);
  } catch (e) {
    logger.warn('Wikipedia search failed', { error: e?.message });
  }

  try {
    const text = await withRetry(() => searchDuckDuckGo(query), { retries: 1, baseDelayMs: 500, timeoutMs: 15000 });
    if (text) return cache(text);
    return null;
  } catch (e) {
    logger.warn('Web search failed', { error: e?.message });
    return null;
  }
}

// ---------- Message building ----------
async function buildModelMessages(source, history, userPrompt) {
  const personality = await getSessionPersonality(source);
  const recent = truncateHistory(history, CONFIG.MAX_HISTORY, 6000);
  return [{ role: 'system', content: buildSystemPrompt(personality.prompt) }, ...recent, { role: 'user', content: userPrompt }];
}

function shouldRespond(message) {
  if (message.author?.bot) return false;
  if (message.channel.isDMBased()) return true;
  return client.user && message.mentions.has(client.user);
}

function stripBotMention(content) {
  if (!client.user) return content.trim();
  return content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
}

// ---------- Chat pipeline ----------
async function runChat({ source, channel, userPrompt, replyMode }) {
  if (!CONFIG.OPENROUTER_API_KEY) {
    await replyNotConfigured(replyMode);
    return;
  }
  if (!userPrompt?.trim()) {
    const msg = `Send a message or use ${COMMAND_PREFIX}ask question:<question>.`;
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
    return;
  }
  if (userPrompt.length > CONFIG.MAX_PROMPT_CHARS) {
    const msg = `That message is too long (${userPrompt.length} chars, max ${CONFIG.MAX_PROMPT_CHARS}). Please shorten it.`;
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
    return;
  }

  const cd = checkCooldown(source);
  if (!cd.allowed) {
    const msg = `Slow down — try again in ${(cd.retryAfterMs / 1000).toFixed(1)}s.`;
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
    return;
  }

  const sessionKey = getSessionKey(source);
  rememberPrompt(sessionKey, userPrompt);
  const history = await historyStore.load(sessionKey);
  const sessionModel = await getSessionModel(source);
  const modelMessages = await buildModelMessages(source, history, userPrompt);

  const stopTyping = startTypingLoop(channel);
  const t0 = Date.now();
  try {
    let full = '';
    let lastEdit = 0;
    const isInteraction = replyMode.kind === 'interaction';
    const onChunk = isInteraction ? async () => {
      const now = Date.now();
      if (now - lastEdit < 3000) return;
      lastEdit = now;
      const preview = (full + '…').slice(-1900);
      try { await replyMode.interaction.editReply({ content: preview.slice(0, 1900), allowedMentions: NO_PING }); } catch {}
    } : undefined;

    const wrappedOnChunk = onChunk ? async (c) => { full += c; await onChunk(); } : undefined;
    const log = logger.child({ session: sessionKey, command: 'chat' });
    const { text: assistantReply, model: usedModel, usage } = await queryOpenRouter(modelMessages, sessionModel, wrappedOnChunk);
    const ms = Date.now() - t0;
    trackRequest(ms, false);
    log.info('AI reply', { model: usedModel, ms, tokens: normalizeUsage(usage) });
    await historyStore.append(sessionKey, userPrompt, assistantReply);

    return sendPagedAIReply(replyMode, assistantReply);
  } catch (error) {
    trackRequest(Date.now() - t0, true);
    logger.error('Chat pipeline failed', { error: error?.message, sessionKey });
    const safe = (error?.message || 'Something went wrong. Please try again.').slice(0, 1500);
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, `AI provider error: ${safe}`).catch(() => {});
    else await safeEditReply(replyMode.interaction, `AI provider error: ${safe}`).catch(() => {});
  } finally {
    stopTyping();
  }
}

// ---------- Commands ----------
async function replyEmbedOrText(replyMode, embed) {
  const data = { embeds: [embed], allowedMentions: NO_PING };
  if (replyMode.kind === 'message') await replyMode.message.reply(data);
  else await replyMode.interaction.editReply(data);
}

async function handleCommand(source, channel, command, prompt, replyMode) {
  if (command === 'help') {
    await replyEmbedOrText(replyMode, helpEmbed(COMMAND_PREFIX));
    return;
  }
  if (command === 'ping') {
    const ws = Math.round(client.ws.ping);
    const pingText = Number.isFinite(ws) ? `**${ws}ms**` : 'measuring…';
    await replyEmbedOrText(replyMode, infoEmbed('🏓 Pong', `Online · gateway ping: ${pingText}`));
    return;
  }
  if (command === 'clear') {
    await historyStore.clear(getSessionKey(source));
    lastPromptBySession.delete(getSessionKey(source));
    await replyEmbedOrText(replyMode, infoEmbed('🧹 Cleared', 'Conversation memory cleared for you in this server/DM.'));
    return;
  }
  if (command === 'stats') {
    const model = await getSessionModel(source);
    const pers = await getSessionPersonality(source);
    await replyEmbedOrText(replyMode, infoEmbed('📊 Your Settings',
      `Model: \`${model}\`\nPersonality: **${pers.name}** (\`${pers.key}\`)`));
    return;
  }
  if (command === 'export') {
    const history = await historyStore.load(getSessionKey(source));
    const fmt = (prompt || 'json').trim().toLowerCase();
    if (fmt === 'md') {
      const md = trimToCompleteChars(history.map(m => `**${m.role}**: ${m.content}`).join('\n\n'), 18000) || 'No history.';
      await sendPagedAIReply(replyMode, md);
      return;
    }
    const buf = Buffer.from(JSON.stringify(history, null, 2), 'utf-8');
    const file = new AttachmentBuilder(buf, { name: 'history.json' });
    if (replyMode.kind === 'message') await replyMode.message.reply({ files: [file], allowedMentions: NO_PING });
    else await replyMode.interaction.editReply({ files: [file] });
    return;
  }
  if (command === 'ask') {
    await runChat({ source, channel, userPrompt: prompt, replyMode });
    return;
  }
  if (command === 'model') {
    const [sub, ...rest] = (prompt || '').split(/\s+/).filter(Boolean);
    const arg = rest.join(' ');
    if (sub === 'list') {
      await replyEmbedOrText(replyMode, modelListEmbed(AVAILABLE_MODELS));
      return;
    }
    if (sub === 'current') {
      const cur = await getSessionModel(source);
      const known = AVAILABLE_MODELS.find(m => m.id === cur);
      await replyEmbedOrText(replyMode, infoEmbed('🧠 Current Model', `**${known?.name || cur}**\n\`${cur}\``));
      return;
    }
    if (sub === 'set') {
      if (!arg) {
        const msg = `Usage: \`${COMMAND_PREFIX}model set <model-id>\` — see \`${COMMAND_PREFIX}model list\`.`;
        if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
        else await safeEditReply(replyMode.interaction, msg);
        return;
      }
      try {
        const m = await setSessionModel(source, arg);
        await replyEmbedOrText(replyMode, infoEmbed('✅ Model Switched', `Now using **${m.name}**\n\`${m.id}\``));
      } catch (e) {
        if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, `❌ ${e.message}`);
        else await safeEditReply(replyMode.interaction, `❌ ${e.message}`);
      }
      return;
    }
    const msg = `Usage: \`${COMMAND_PREFIX}model <list|set|current>\``;
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
    return;
  }
  if (command === 'personality') {
    const [sub, ...rest] = (prompt || '').split(/\s+/).filter(Boolean);
    const arg = rest.join(' ');
    if (sub === 'list') {
      const { HIDDEN_PERSONALITY_KEYS } = require('./bot-data');
      await replyEmbedOrText(replyMode, personalityListEmbed(await loadPersonalities(), HIDDEN_PERSONALITY_KEYS));
      return;
    }
    if (sub === 'current') {
      const p = await getSessionPersonality(source);
      await replyEmbedOrText(replyMode, infoEmbed('🎭 Current Personality', `**${p.name}** (\`${p.key}\`)`));
      return;
    }
    if (sub === 'set') {
      if (!arg) {
        const msg = `Usage: \`${COMMAND_PREFIX}personality set <name>\`.`;
        if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
        else await safeEditReply(replyMode.interaction, msg);
        return;
      }
      try {
        const p = await setSessionPersonality(source, arg);
        await replyEmbedOrText(replyMode, infoEmbed('✅ Personality Switched', `Now using **${p.name}**`));
      } catch (e) {
        if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, `❌ ${e.message}`);
        else await safeEditReply(replyMode.interaction, `❌ ${e.message}`);
      }
      return;
    }
    const msg = `Usage: \`${COMMAND_PREFIX}personality <list|set|current>\``;
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
    return;
  }
  if (command === 'code') {
    if (!prompt) {
      const msg = `Usage: \`${COMMAND_PREFIX}code <code>\``;
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
      else await safeEditReply(replyMode.interaction, msg);
      return;
    }
    if (!CONFIG.OPENROUTER_API_KEY) {
      await replyNotConfigured(replyMode);
      return;
    }
    if (prompt.length > CONFIG.MAX_CODE_CHARS) {
      const msg = `Code too long (${prompt.length} chars, max ${CONFIG.MAX_CODE_CHARS}). Paste a smaller snippet or link a file.`;
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
      else await safeEditReply(replyMode.interaction, msg);
      return;
    }
    const personalities = await loadPersonalities();
    const analyzer = personalities['code-analyzer'];
    const sessionKey = getSessionKey(source);
    const history = await historyStore.load(sessionKey);
    const sessionModel = await getSessionModel(source);
    const messages = [
      { role: 'system', content: buildSystemPrompt(analyzer.prompt) },
      ...truncateHistory(history, CONFIG.MAX_HISTORY, 6000),
      { role: 'user', content: `Please analyze this code:\n\`\`\`\n${prompt}\n\`\`\`` },
    ];
    const cd = checkCooldown(source, 'code');
    if (!cd.allowed) {
      const msg = `Slow down — try again in ${(cd.retryAfterMs / 1000).toFixed(1)}s.`;
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
      else await safeEditReply(replyMode.interaction, msg);
      return;
    }
    rememberPrompt(sessionKey, prompt);
    const stopTyping = startTypingLoop(channel);
    const t0 = Date.now();
    try {
      const { text: analysis } = await queryOpenRouter(messages, sessionModel);
      trackRequest(Date.now() - t0, false);
      await historyStore.append(sessionKey, `Code Analysis: ${prompt.slice(0, 120)}`, analysis);
      await sendPagedAIReply(replyMode, analysis);
    } catch (e) {
      trackRequest(Date.now() - t0, true);
      const safe = (e?.message || 'Failed.').slice(0, 1500);
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, `AI provider error: ${safe}`).catch(() => {});
      else await safeEditReply(replyMode.interaction, `AI provider error: ${safe}`).catch(() => {});
    } finally {
      stopTyping();
    }
    return;
  }
  if (command === 'research') {
    if (!prompt) {
      const msg = `Usage: \`${COMMAND_PREFIX}research <query>\``;
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
      else await safeEditReply(replyMode.interaction, msg);
      return;
    }
    if (!CONFIG.OPENROUTER_API_KEY) {
      await replyNotConfigured(replyMode);
      return;
    }
    const personalities = await loadPersonalities();
    const researcher = personalities.researcher;
    const sessionKey = getSessionKey(source);
    const history = await historyStore.load(sessionKey);
    const sessionModel = await getSessionModel(source);
    const cd = checkCooldown(source, 'research');
    if (!cd.allowed) {
      const msg = `Slow down — try again in ${(cd.retryAfterMs / 1000).toFixed(1)}s.`;
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
      else await safeEditReply(replyMode.interaction, msg);
      return;
    }
    rememberPrompt(sessionKey, prompt);
    const stopTyping = startTypingLoop(channel);
    const t0 = Date.now();
    try {
      const web = await searchWeb(prompt);
      const context = web ? `\n\n**Recent Search Results:**\n${web}` : '\n\n(No live web results found — answering from model knowledge.)';
      const messages = [
        { role: 'system', content: buildSystemPrompt(researcher.prompt) },
        ...truncateHistory(history, CONFIG.MAX_HISTORY, 6000),
        { role: 'user', content: `Research this topic:\n\n${prompt}${context}` },
      ];
      const { text: research } = await queryOpenRouter(messages, sessionModel);
      trackRequest(Date.now() - t0, false);
      await historyStore.append(sessionKey, `Research: ${prompt}`, research);
      await sendPagedAIReply(replyMode, research);
    } catch (e) {
      trackRequest(Date.now() - t0, true);
      const safe = (e?.message || 'Failed.').slice(0, 1500);
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, `AI provider error: ${safe}`).catch(() => {});
      else await safeEditReply(replyMode.interaction, `AI provider error: ${safe}`).catch(() => {});
    } finally {
      stopTyping();
    }
    return;
  }
  if (!command) {
    await runChat({ source, channel, userPrompt: prompt, replyMode });
    return;
  }
  const msg = `Unknown command: ${command}. Try ${COMMAND_PREFIX}help.`;
  if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
  else await safeEditReply(replyMode.interaction, msg);
}

// ---------- Slash wiring ----------
function messageProxyFromInteraction(interaction) {
  return { guildId: interaction.guildId, channelId: interaction.channelId, author: interaction.user, user: interaction.user };
}

async function handleSlashCommand(interaction) {
  const command = interaction.commandName;
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  const source = messageProxyFromInteraction(interaction);
  const channel = interaction.channel || { sendTyping: async () => {} };
  const replyMode = { kind: 'interaction', interaction };

  if (command === 'ask') {
    await runChat({ source, channel, userPrompt: interaction.options.getString('question', true), replyMode });
    return;
  }
  if (command === 'model') {
    const sub = interaction.options.getSubcommand();
    const picked = interaction.options.getString('model') || '';
    await handleCommand(source, channel, 'model', [sub, picked].filter(Boolean).join(' '), replyMode);
    return;
  }
  if (command === 'personality') {
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString('name') || '';
    await handleCommand(source, channel, 'personality', [sub, name].filter(Boolean).join(' '), replyMode);
    return;
  }
  if (command === 'code') {
    await handleCommand(source, channel, 'code', interaction.options.getString('code', true), replyMode);
    return;
  }
  if (command === 'research') {
    await handleCommand(source, channel, 'research', interaction.options.getString('query', true), replyMode);
    return;
  }
  if (command === 'export') {
    await handleCommand(source, channel, 'export', interaction.options.getString('format') || 'json', replyMode);
    return;
  }
  if (['help', 'ping', 'clear', 'stats'].includes(command)) {
    await handleCommand(source, channel, command, '', replyMode);
    return;
  }
  // Unknown slash names must not leave the deferred interaction hanging.
  await replyMode.interaction.editReply({ content: `Unknown command: ${command}. Try /help.`, allowedMentions: NO_PING }).catch(() => {});
}

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (interaction.commandName === 'model' && focused.name === 'model') {
    const q = String(focused.value || '').toLowerCase();
    const matches = AVAILABLE_MODELS.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 25);
    await interaction.respond(matches.map(m => ({ name: `${m.name} (${m.id})`.slice(0, 100), value: m.id })));
  } else if (interaction.commandName === 'personality' && focused.name === 'name') {
    const { HIDDEN_PERSONALITY_KEYS } = require('./bot-data');
    const personalities = await loadPersonalities();
    const q = String(focused.value || '').toLowerCase();
    const matches = Object.entries(personalities)
      .filter(([k]) => !HIDDEN_PERSONALITY_KEYS.has(k))
      .filter(([k, p]) => k.includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 25);
    await interaction.respond(matches.map(([k, p]) => ({ name: `${p.name} (${k})`.slice(0, 100), value: k })));
  }
}

async function handleButton(interaction) {
  if (await handlePaginationButton(interaction)) return;
  const sessionKey = getSessionKey(messageProxyFromInteraction(interaction));
  const last = lastPromptBySession.get(sessionKey);
  if (interaction.customId === 'clear') {
    await historyStore.clear(sessionKey);
    lastPromptBySession.delete(sessionKey);
    await interaction.reply({ embeds: [infoEmbed('🧹 Cleared', 'Conversation memory cleared.')], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  if (!last) {
    await interaction.reply({ content: 'No recent prompt to reuse. Ask something first with /ask.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  const source = messageProxyFromInteraction(interaction);
  const cd = checkCooldown(source);
  if (!cd.allowed) {
    await interaction.reply({ content: `Slow down — try again in ${(cd.retryAfterMs / 1000).toFixed(1)}s.`, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  if (!CONFIG.OPENROUTER_API_KEY) {
    await interaction.reply({ content: NOT_CONFIGURED_MSG, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  await interaction.deferUpdate().catch(() => {});
  const channel = interaction.channel;
  const prompt = interaction.customId === 'continue'
    ? CONTINUE_PROMPT
    : last;
  const history = await historyStore.load(sessionKey);
  const sessionModel = await getSessionModel(source);
  const modelMessages = await buildModelMessages(source, history, prompt);
  const stopTyping = startTypingLoop(channel);
  try {
    const { text: reply } = await queryOpenRouter(modelMessages, sessionModel);
    await historyStore.append(sessionKey, prompt, reply);
    await sendPagedFollowUp(interaction, reply);
  } catch (e) {
    await interaction.followUp({ embeds: [errorEmbed((e?.message || 'Failed').slice(0, 500))], flags: MessageFlags.Ephemeral }).catch(() => {});
  } finally {
    stopTyping();
  }
}

// ---------- Events ----------
client.once(Events.ClientReady, () => {
  logger.info(`Logged in as ${client.user.tag}`, { guilds: client.guilds.cache.size });
  client.user.setActivity('AI chat · /help', { type: 4 });
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author?.bot) return;

    const prefixParsed = parsePrefixCommand(message.content);
    if (prefixParsed) {
      const missing = getMissingPermissions(message.channel, client.user);
      if (missing.length) {
        await message.reply({ content: missingToUserText(missing), allowedMentions: NO_PING }).catch(() => {});
        return;
      }
      await handleCommand(message, message.channel, prefixParsed.command, prefixParsed.prompt, { kind: 'message', message });
      return;
    }

    if (message.reference?.messageId) {
      try {
        const ref = await message.channel.messages.fetch(message.reference.messageId);
        if (ref?.author?.id === client.user.id) {
          let prompt = message.content?.trim() || '';
          if (!prompt && message.attachments?.size) {
            const ctx = await collectAttachmentContext(message, '(user sent attachments, no text)');
            prompt = ctx.prompt;
          }
          if (!prompt) return;
          const missing = getMissingPermissions(message.channel, client.user);
          if (missing.length) {
            await message.reply({ content: missingToUserText(missing), allowedMentions: NO_PING }).catch(() => {});
            return;
          }
          const routed = parseMentionCommand(prompt);
          if (routed) {
            await handleCommand(message, message.channel, routed.command, routed.prompt, { kind: 'message', message });
            return;
          }
          const withAtt = (await collectAttachmentContext(message, prompt)).prompt;
          await runChat({ source: message, channel: message.channel, userPrompt: withAtt, replyMode: { kind: 'message', message } });
          return;
        }
      } catch (err) {
        logger.warn('Failed to fetch referenced message', { error: err?.message });
      }
    }
    if (!shouldRespond(message)) return;
    const missing = getMissingPermissions(message.channel, client.user);
    if (missing.length) {
      await message.reply({ content: missingToUserText(missing), allowedMentions: NO_PING }).catch(() => {});
      return;
    }
    const stripped = stripBotMention(message.content.trim());
    const routed = parseMentionCommand(stripped);
    if (routed) {
      await handleCommand(message, message.channel, routed.command, routed.prompt, { kind: 'message', message });
      return;
    }
    let finalPrompt = stripped;
    if (!finalPrompt && !message.attachments?.size) {
      await safeReplyToMessage(message, `Send a message or use ${COMMAND_PREFIX}ask question:<question>. Try ${COMMAND_PREFIX}help.`);
      return;
    }
    if (message.attachments?.size) {
      finalPrompt = (await collectAttachmentContext(message, finalPrompt || '(no text, see attachments)')).prompt;
    }
    await runChat({ source: message, channel: message.channel, userPrompt: finalPrompt, replyMode: { kind: 'message', message } });
  } catch (error) {
    logger.error('Failed to process message', { error: error?.message });
    await message.reply({ embeds: [errorEmbed((error?.message || 'Failed').slice(0, 300))], allowedMentions: NO_PING }).catch(() => {});
  }
});

client.on(Events.GuildCreate, async guild => {
  logger.info('Joined guild', { guild: guild?.name, id: guild?.id });
  try {
    const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased?.() && c.permissionsFor?.(guild.members.me)?.has?.('SendMessages'));
    if (channel?.send) await channel.send({ embeds: [guildWelcomeEmbed()], allowedMentions: NO_PING }).catch(() => {});
  } catch (e) {
    logger.warn('Welcome message failed', { error: e?.message });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await handleSlashCommand(interaction);
  } catch (error) {
    logger.error('Failed to process interaction', { error: error?.message, command: interaction?.commandName });
    const text = `AI provider error: ${(error?.message || 'Failed').slice(0, 300)}`;
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    } catch {}
  }
});

client.on(Events.Error, error => logger.error('Discord client error', { error: error?.message }));
process.on('unhandledRejection', error => logger.error('Unhandled rejection', { error: error?.message || String(error) }));

// ---------- Boot ----------
async function pruneOldHistories(maxAgeDays = 30, maxFiles = 2000, dir = DATA_DIR) {
  try {
    const fs = require('fs').promises;
    const entries = await fs.readdir(dir);
    const now = Date.now();
    const cutoff = now - maxAgeDays * 24 * 3600 * 1000;
    let removed = 0;
    const jsonFiles = entries.filter(f => f.endsWith('.json') && !['model_preferences.json', 'personality_preferences.json', 'personalities.json'].includes(f));
    // Drop orphaned atomic-write temps from crashed saves.
    for (const f of entries.filter(f => f.endsWith('.tmp'))) {
      try { await fs.unlink(path.join(dir, f)); removed++; } catch {}
    }
    const withStat = [];
    for (const f of jsonFiles) {
      try {
        const st = await fs.stat(path.join(dir, f));
        withStat.push({ f, mtime: st.mtimeMs });
      } catch {}
    }
    withStat.sort((a, b) => a.mtime - b.mtime);
    const overCap = new Set(withStat.length > maxFiles ? withStat.slice(0, withStat.length - maxFiles).map(o => o.f) : []);
    for (const { f, mtime } of withStat) {
      if (mtime < cutoff || overCap.has(f)) {
        try { await fs.unlink(path.join(dir, f)); removed++; } catch {}
      }
    }
    if (removed) logger.info('Pruned old histories', { removed });
  } catch (e) {
    logger.warn('Prune failed', { error: e?.message });
  }
}

function appVersion() {
  try {
    return require('./package.json').version || 'dev';
  } catch {
    return 'dev';
  }
}

async function boot() {
  logger.info(`Starting discord-openrouter-chatbot v${appVersion()}`, {
    node: process.version,
    model: CONFIG.OPENROUTER_MODEL,
    logFormat: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    logFile: process.env.LOG_FILE || null,
  });
  await ensureDir(DATA_DIR);
  await pruneOldHistories();
  await client.login(CONFIG.DISCORD_TOKEN);
}

async function shutdown(signal) {
  if (shutdown.invoked) return;
  shutdown.invoked = true;
  logger.info(`Received ${signal}, shutting down…`);
  try {
    await client.destroy();
  } catch (e) {
    logger.warn('Error during destroy', { error: e?.message });
  }
  try {
    await logger.close();
  } catch {}
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  boot().catch(err => {
    logger.error('Failed to start bot', { error: err?.message });
    process.exit(1);
  });
}

module.exports = { client, handleCommand, handleButton, handleSlashCommand, handleAutocomplete, runChat, getSessionModel, getSessionPersonality, queryOpenRouter, sendPagedAIReply, sendPagedFollowUp, getEffectiveMaxTokens, lastPromptBySession, pruneOldHistories, CONTINUE_PROMPT, MAX_AUTO_CONTINUATIONS, AUTO_CONTINUE_CHAR_BUDGET };
