const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder } = require('discord.js');

const { CONFIG, validateOrExit } = require('./src/config');
const logger = require('./src/logger');
const { AVAILABLE_MODELS, DEFAULT_PERSONALITIES } = require('./bot-data');
const { getSessionKey, getModelKey, getPersonalityKey } = require('./src/store/sessions');
const { createHistoryStore, createJsonStore } = require('./src/store/historyStore');
const { ensureDir } = require('./src/store/atomic');
const { splitCodeSafe } = require('./src/utils/splitMessage');
const { safeReplyToMessage, safeEditReply } = require('./src/utils/safeReply');
const {
  extractProviderErrorMessage,
  isLikelyParameterCompatibilityError,
  toUserFacingProviderError,
} = require('./src/ai/errors');
const { withRetry } = require('./src/ai/retry');
const { truncateHistory } = require('./src/ai/tokens');
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
  const stored = await modelPrefs.get(key);
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

function trackRequest(latencyMs, failed = false) {
  stats.totalRequests++;
  stats.totalLatencyMs += latencyMs;
  if (failed) stats.totalErrors++;
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

// Single streaming implementation used by both message and slash paths.
async function queryOpenRouter(messages, modelId, onChunk) {
  const openrouter = await getOpenRouterClient();
  const model = modelId || CONFIG.OPENROUTER_MODEL;

  const base = { model, messages, maxTokens: CONFIG.MAX_TOKENS, temperature: CONFIG.TEMPERATURE, stream: true };
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
      logger.warn('Retrying with reduced params', { model, reason: reason.slice(0, 200) });
      stream = await sendOnce(base);
    } else {
      throw new Error(toUserFacingProviderError(error, model));
    }
  }

  let full = '';
  try {
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        full += content;
        if (onChunk) await onChunk(content);
      }
    }
  } catch (error) {
    throw new Error(toUserFacingProviderError(error, model));
  }
  return full.trim() || 'No response returned by model.';
}

// ---------- Web search ----------
async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'DiscordBot/2.2' } });
  if (!res.ok) throw new Error(`DDG ${res.status}`);
  const data = await res.json();
  const out = [];
  if (data.AbstractText) out.push(`**${data.Heading || 'Summary'}** — ${data.AbstractText}\n${data.AbstractURL || ''}`.trim());
  for (const t of (data.RelatedTopics || []).slice(0, 3)) {
    if (typeof t?.Text === 'string' && t.Text) out.push(`**Related** — ${t.Text.slice(0, 300)}${t.FirstURL ? `\n${t.FirstURL}` : ''}`);
  }
  return out.length ? out.join('\n\n').slice(0, 2000) : null;
}

async function searchWeb(query) {
  const cached = searchCache.get(query);
  if (cached && cached.expires > Date.now()) return cached.text;

  if (CONFIG.SERPER_API_KEY) {
    const run = async () => {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': CONFIG.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Serper ${res.status}`);
      const data = await res.json();
      const results = data.organic || [];
      if (!results.length) return null;
      return results.slice(0, 3).map(r => `**${r.title}** — ${r.snippet}\n${r.link || ''}`.trim()).join('\n\n');
    };

    try {
      const text = await withRetry(run, { retries: 1, baseDelayMs: 600, timeoutMs: 20000 });
      if (text) {
        searchCache.set(query, { text, expires: Date.now() + 10 * 60 * 1000 });
        if (searchCache.size > 200) searchCache.clear();
        return text;
      }
    } catch (e) {
      logger.warn('Serper failed, trying free fallback', { error: e?.message });
    }
  }

  try {
    const text = await withRetry(() => searchDuckDuckGo(query), { retries: 1, baseDelayMs: 500, timeoutMs: 15000 });
    if (text) {
      searchCache.set(query, { text, expires: Date.now() + 10 * 60 * 1000 });
      if (searchCache.size > 200) searchCache.clear();
      return text;
    }
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
    const msg = 'OpenRouter is not configured yet. Add OPENROUTER_API_KEY to your .env, then restart the bot.';
    if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, msg);
    else await safeEditReply(replyMode.interaction, msg);
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
  lastPromptBySession.set(sessionKey, userPrompt);
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
    const assistantReply = await queryOpenRouter(modelMessages, sessionModel, wrappedOnChunk);
    trackRequest(Date.now() - t0, false);
    await historyStore.append(sessionKey, userPrompt, assistantReply);

    const footer = `\n\n— *${sessionModel} · ${(Date.now() - t0) / 1000}s*`;
    const withFooter = (assistantReply + footer).slice(0, 12000);
    const chunks = splitCodeSafe(withFooter);
    if (replyMode.kind === 'message') {
      const first = await replyMode.message.reply({ content: chunks[0], allowedMentions: NO_PING, components: [actionRowForReply()] });
      for (let i = 1; i < chunks.length; i++) await replyMode.message.channel.send({ content: chunks[i], allowedMentions: NO_PING });
      return first;
    } else {
      await replyMode.interaction.editReply({ content: chunks[0], allowedMentions: NO_PING, components: [actionRowForReply()] });
      for (let i = 1; i < chunks.length; i++) await replyMode.interaction.followUp({ content: chunks[i], allowedMentions: NO_PING });
    }
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
    const uptimeMin = Math.round((Date.now() - stats.startTime) / 60000);
    const avg = stats.totalRequests ? Math.round(stats.totalLatencyMs / stats.totalRequests) : 0;
    await replyEmbedOrText(replyMode, infoEmbed('🏓 Pong',
      `WS ping: **${ws}ms**\nUptime: **${uptimeMin} min**\nRequests: **${stats.totalRequests}** (errors: ${stats.totalErrors})\nAvg LLM latency: **${avg}ms**`));
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
    const uptimeMin = Math.round((Date.now() - stats.startTime) / 60000);
    const avg = stats.totalRequests ? Math.round(stats.totalLatencyMs / stats.totalRequests) : 0;
    await replyEmbedOrText(replyMode, infoEmbed('📊 Bot Stats',
      `Uptime: **${uptimeMin} min**\nRequests: **${stats.totalRequests}** · Errors: **${stats.totalErrors}** · Avg: **${avg}ms**\nYour model: \`${model}\`\nYour personality: **${pers.name}** (\`${pers.key}\`)`));
    return;
  }
  if (command === 'export') {
    const history = await historyStore.load(getSessionKey(source));
    const fmt = (prompt || 'json').trim().toLowerCase();
    if (fmt === 'md') {
      const md = history.map(m => `**${m.role}**: ${m.content}`).join('\n\n').slice(0, 18000) || 'No history.';
      const chunks = splitCodeSafe(md);
      if (replyMode.kind === 'message') {
        await safeReplyToMessage(replyMode.message, chunks.join('\n\n').slice(0, 18000));
      } else {
        await safeEditReply(replyMode.interaction, chunks.join('\n\n').slice(0, 18000));
      }
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
    lastPromptBySession.set(sessionKey, `Code Analysis: ${prompt.slice(0, 120)}`);
    const stopTyping = startTypingLoop(channel);
    const t0 = Date.now();
    try {
      const analysis = await queryOpenRouter(messages, sessionModel);
      trackRequest(Date.now() - t0, false);
      await historyStore.append(sessionKey, `Code Analysis: ${prompt.slice(0, 120)}`, analysis);
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, analysis);
      else await safeEditReply(replyMode.interaction, analysis);
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
    lastPromptBySession.set(sessionKey, `Research: ${prompt.slice(0, 120)}`);
    const stopTyping = startTypingLoop(channel);
    const t0 = Date.now();
    try {
      const web = await searchWeb(prompt);
      const context = web ? `\n\n**Recent Search Results:**\n${web}` : '\n\n(No live web results found — answering from model knowledge. For better results add SERPER_API_KEY; a free DuckDuckGo fallback is tried automatically.)';
      const messages = [
        { role: 'system', content: buildSystemPrompt(researcher.prompt) },
        ...truncateHistory(history, CONFIG.MAX_HISTORY, 6000),
        { role: 'user', content: `Research this topic:\n\n${prompt}${context}` },
      ];
      const research = await queryOpenRouter(messages, sessionModel);
      trackRequest(Date.now() - t0, false);
      await historyStore.append(sessionKey, `Research: ${prompt}`, research);
      if (replyMode.kind === 'message') await safeReplyToMessage(replyMode.message, research);
      else await safeEditReply(replyMode.interaction, research);
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
  const sessionKey = getSessionKey(messageProxyFromInteraction(interaction));
  const last = lastPromptBySession.get(sessionKey);
  if (interaction.customId === 'clear') {
    await historyStore.clear(sessionKey);
    lastPromptBySession.delete(sessionKey);
    await interaction.reply({ embeds: [infoEmbed('🧹 Cleared', 'Conversation memory cleared.')], ephemeral: true }).catch(() => {});
    return;
  }
  if (!last) {
    await interaction.reply({ content: 'No recent prompt to reuse. Ask something first with /ask.', ephemeral: true }).catch(() => {});
    return;
  }
  await interaction.deferUpdate().catch(() => {});
  const channel = interaction.channel;
  const source = messageProxyFromInteraction(interaction);
  const prompt = interaction.customId === 'continue' ? `${last}\n\n(Continue your previous answer.)` : last;
  const history = await historyStore.load(sessionKey);
  const sessionModel = await getSessionModel(source);
  const modelMessages = await buildModelMessages(source, history, prompt);
  const stopTyping = startTypingLoop(channel);
  try {
    const reply = await queryOpenRouter(modelMessages, sessionModel);
    await historyStore.append(sessionKey, prompt, reply);
    const chunks = splitCodeSafe(reply);
    await interaction.followUp({ content: chunks[0], allowedMentions: NO_PING });
    for (let i = 1; i < chunks.length; i++) await interaction.followUp({ content: chunks[i], allowedMentions: NO_PING });
  } catch (e) {
    await interaction.followUp({ embeds: [errorEmbed((e?.message || 'Failed').slice(0, 500))], ephemeral: true }).catch(() => {});
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
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: text, ephemeral: true });
      else await interaction.reply({ content: text, ephemeral: true });
    } catch {}
  }
});

client.on(Events.Error, error => logger.error('Discord client error', { error: error?.message }));
process.on('unhandledRejection', error => logger.error('Unhandled rejection', { error: error?.message || String(error) }));

// ---------- Boot ----------
async function pruneOldHistories(maxAgeDays = 30, maxFiles = 2000) {
  try {
    const fs = require('fs').promises;
    const entries = await fs.readdir(DATA_DIR);
    const now = Date.now();
    const cutoff = now - maxAgeDays * 24 * 3600 * 1000;
    let removed = 0;
    const jsonFiles = entries.filter(f => f.endsWith('.json') && !['model_preferences.json', 'personality_preferences.json', 'personalities.json'].includes(f));
    const withStat = [];
    for (const f of jsonFiles.slice(0, maxFiles + 500)) {
      try {
        const st = await fs.stat(path.join(DATA_DIR, f));
        withStat.push({ f, mtime: st.mtimeMs });
      } catch {}
    }
    withStat.sort((a, b) => a.mtime - b.mtime);
    const overCap = withStat.length > maxFiles ? withStat.slice(0, withStat.length - maxFiles) : [];
    for (const { f, mtime } of withStat) {
      if (mtime < cutoff || overCap.some(o => o.f === f)) {
        try { await fs.unlink(path.join(DATA_DIR, f)); removed++; } catch {}
      }
    }
    if (removed) logger.info('Pruned old histories', { removed });
  } catch (e) {
    logger.warn('Prune failed', { error: e?.message });
  }
}

async function boot() {
  await ensureDir(DATA_DIR);
  await pruneOldHistories();
  await client.login(CONFIG.DISCORD_TOKEN);
}

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down…`);
  try {
    await client.destroy();
  } catch (e) {
    logger.warn('Error during destroy', { error: e?.message });
  }
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

module.exports = { client, handleCommand, runChat, getSessionModel, getSessionPersonality, queryOpenRouter };
