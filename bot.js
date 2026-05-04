require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');


const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_OPENROUTER_MODEL = 'gryphe/mythomax-l2-13b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const PREFIX = process.env.PREFIX || '!';
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'You are a helpful and concise Discord assistant. Keep answers friendly and practical.';
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 8);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1000);
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.85);
const TOP_P = Number(process.env.TOP_P || 0.95);
const FREQUENCY_PENALTY = Number(process.env.FREQUENCY_PENALTY || 0.5);
const PRESENCE_PENALTY = Number(process.env.PRESENCE_PENALTY || 0.3);
const SERPER_API_KEY = process.env.SERPER_API_KEY || null;

// Available models for switching
const AVAILABLE_MODELS = [
  { id: 'gryphe/mythomax-l2-13b', name: 'MythoMax L2 13B', maxTokens: 500 },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', maxTokens: 500 },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', maxTokens: 500 },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 500 },
];

// Preset AI Personalities
const DEFAULT_PERSONALITIES = {
  'standard': {
    name: 'Standard Assistant',
    prompt: 'You are a helpful and concise Discord assistant. Keep answers friendly and practical.'
  },
  'code-analyzer': {
    name: 'Code Analyzer',
    prompt: 'You are an expert code analyzer and programmer. Analyze code thoroughly, identify bugs, suggest optimizations, and explain complex logic in detail. Always provide code examples when helpful.'
  },
  'researcher': {
    name: 'Research Assistant',
    prompt: 'You are a research assistant with access to current information. Provide well-sourced, accurate, and detailed information. Include relevant facts and citations when available.'
  },
  'creative': {
    name: 'Creative Writer',
    prompt: 'You are a creative writing assistant. Help with stories, ideas, worldbuilding, and creative projects. Be imaginative and engaging.'
  },
  'tutor': {
    name: 'Educational Tutor',
    prompt: 'You are an experienced tutor. Explain concepts clearly, use analogies, break down complex topics into manageable parts, and encourage learning.'
  },
  'girl-text': {
    name: 'Girl Text',
    prompt: 'Reply in ONE LINE ONLY. Friendly and engaging girl texting. Just emojis + few words required for user\'s message\'s reply. Examples: hey 😊, lol stoppp 😏, hehe nice 💕, omg yess ❤️. Make the replies more genuine and humanly. Replies based on user\'s message. Make user feel valued and understood with natural, witty expressions in the chat.'
  }
};

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

let openRouterClientPromise;
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

function getHistoryFilePath(sessionKey) {
  const sanitized = sessionKey.replace(/:/g, '_');
  return path.join(DATA_DIR, sanitized + '.json');
}

async function loadConversationHistory(sessionKey) {
  const filePath = getHistoryFilePath(sessionKey);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveConversationHistory(sessionKey, history) {
  await ensureDataDir();
  const filePath = getHistoryFilePath(sessionKey);
  try {
    await fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save conversation history:', error);
  }
}

async function clearConversationHistory(sessionKey) {
  const filePath = getHistoryFilePath(sessionKey);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // File might not exist
  }
}

// ============ Model Management ============
async function loadModelPreferences() {
  const filePath = path.join(DATA_DIR, 'model_preferences.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveModelPreferences(preferences) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, 'model_preferences.json');
  try {
    await fs.writeFile(filePath, JSON.stringify(preferences, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save model preferences:', error);
  }
}

function getSessionModelKey(message) {
  if (message.guildId) return `guild:${message.guildId}`;
  return `user:${message.author.id}`;
}

async function getSessionModel(message) {
  const preferences = await loadModelPreferences();
  const key = getSessionModelKey(message);
  const modelId = preferences[key] || OPENROUTER_MODEL;
  
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  return model ? modelId : OPENROUTER_MODEL;
}

async function setSessionModel(message, modelId) {
  const validModel = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (!validModel) {
    throw new Error(`Model not found: ${modelId}`);
  }
  
  const preferences = await loadModelPreferences();
  const key = getSessionModelKey(message);
  preferences[key] = modelId;
  await saveModelPreferences(preferences);
  
  return validModel;
}

// ============ Personality Management ============
async function loadPersonalities() {
  const filePath = path.join(DATA_DIR, 'personalities.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return { ...DEFAULT_PERSONALITIES, ...JSON.parse(data) };
  } catch (error) {
    return DEFAULT_PERSONALITIES;
  }
}

async function savePersonalities(personalities) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, 'personalities.json');
  const custom = Object.keys(personalities)
    .filter(key => !DEFAULT_PERSONALITIES[key])
    .reduce((obj, key) => {
      obj[key] = personalities[key];
      return obj;
    }, {});
  try {
    await fs.writeFile(filePath, JSON.stringify(custom, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save personalities:', error);
  }
}

async function loadPersonalityPreferences() {
  const filePath = path.join(DATA_DIR, 'personality_preferences.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function savePersonalityPreferences(preferences) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, 'personality_preferences.json');
  try {
    await fs.writeFile(filePath, JSON.stringify(preferences, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save personality preferences:', error);
  }
}

function getGuildPersonalityKey(message) {
  if (message.guildId) return `guild:${message.guildId}`;
  return `user:${message.author.id}`;
}

async function getSessionPersonality(message) {
  const personalities = await loadPersonalities();
  const preferences = await loadPersonalityPreferences();
  const key = getGuildPersonalityKey(message);
  const personalityKey = preferences[key] || 'standard';
  
  return personalities[personalityKey] || personalities['standard'];
}

async function setSessionPersonality(message, personalityKey) {
  const personalities = await loadPersonalities();
  if (!personalities[personalityKey]) {
    throw new Error(`Personality not found: ${personalityKey}`);
  }

  const preferences = await loadPersonalityPreferences();
  const key = getGuildPersonalityKey(message);
  preferences[key] = personalityKey;
  await savePersonalityPreferences(preferences);

  return personalities[personalityKey];
}

// ============ Research Mode (Web Search) ============
async function searchWeb(query) {
  if (!SERPER_API_KEY) {
    return null; // Web search not configured
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: 5,
      }),
    });

    if (!response.ok) {
      console.error('Serper API error:', response.statusText);
      return null;
    }

    const data = await response.json();
    const results = data.organic || [];

    if (results.length === 0) return null;

    return results
      .slice(0, 3)
      .map(result => `**${result.title}** - ${result.snippet}`)
      .join('\n\n');
  } catch (error) {
    console.error('Web search error:', error);
    return null;
  }
}

async function buildResearchContext(query) {
  const searchResults = await searchWeb(query);
  if (!searchResults) {
    return 'Web search is not configured. Add SERPER_API_KEY to your .env file.';
  }

  return `\n\n**Recent Search Results:**\n${searchResults}`;
}


async function getOpenRouterClient() {
  if (!openRouterClientPromise) {
    openRouterClientPromise = import('@openrouter/sdk').then(({ OpenRouter }) => {
      return new OpenRouter({
        apiKey: OPENROUTER_API_KEY,
        serverURL: OPENROUTER_BASE_URL,
        httpReferer: 'https://github.com/local/discord-chatbot',
        appTitle: 'Discord Chatbot',
      });
    });
  }

  return openRouterClientPromise;
}

function getSessionKey(message) {
  if (message.guildId) return `guild:${message.guildId}:channel:${message.channelId}`;
  return `dm:${message.author.id}`;
}

function shouldRespond(message) {
  if (message.author.bot) return false;
  if (message.channel.isDMBased()) return true;

  const isMention = message.mentions.has(client.user);
  const isCommand = message.content.startsWith(PREFIX);
  return isMention || isCommand;
}

function stripBotMention(content) {
  if (!client.user) return content.trim();

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, 'g');
  return content.replace(mentionPattern, '').trim();
}

function parseUserPrompt(message) {
  const trimmed = message.content.trim();

  if (trimmed.startsWith(PREFIX)) {
    const withoutPrefix = trimmed.slice(PREFIX.length).trim();
    const [command, ...rest] = withoutPrefix.split(/\s+/);
    return {
      mode: 'command',
      command: (command || '').toLowerCase(),
      prompt: rest.join(' ').trim(),
    };
  }

  return {
    mode: 'chat',
    prompt: stripBotMention(trimmed),
  };
}

function extractProviderErrorMessage(error) {
  if (!error) return 'Unknown provider error.';

  const sdkMessage = error?.error?.message;
  const responseMessage = error?.response?.data?.error?.message || error?.response?.data?.message;
  const detailsMessage = error?.details?.message;
  return sdkMessage || responseMessage || detailsMessage || error.message || 'Unknown provider error.';
}

function isLikelyParameterCompatibilityError(message) {
  if (!message) return false;
  return /(unsupported|invalid|unrecognized).*(parameter|field)|top[ _-]?p|frequency[ _-]?penalty|presence[ _-]?penalty/i.test(
    message
  );
}

function toUserFacingProviderError(error, model) {
  const message = extractProviderErrorMessage(error);

  if (/insufficient|credit|quota|billing|payment/i.test(message)) {
    return `Model ${model} failed due to credits/billing limits: ${message}`;
  }

  if (/rate.?limit|too many requests/i.test(message)) {
    return `Model ${model} is rate limited right now. Please retry in a few seconds.`;
  }

  if (/not found|unknown model|no route|access denied|forbidden|unauthorized/i.test(message)) {
    return `Model ${model} is unavailable for this API key: ${message}`;
  }

  return `Model ${model} request failed: ${message}`;
}

async function queryOpenRouter(messages, modelId) {
  const openrouter = await getOpenRouterClient();
  const model = modelId || OPENROUTER_MODEL;

  const richChatRequest = {
    model,
    messages,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    topP: TOP_P,
    frequencyPenalty: FREQUENCY_PENALTY,
    presencePenalty: PRESENCE_PENALTY,
    stream: true,
  };

  const basicChatRequest = {
    model,
    messages,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    stream: true,
  };

  let stream;
  try {
    stream = await openrouter.chat.send({ chatRequest: richChatRequest });
  } catch (error) {
    const reason = extractProviderErrorMessage(error);
    if (isLikelyParameterCompatibilityError(reason)) {
      console.warn(`Retrying ${model} with reduced params due to compatibility error: ${reason}`);
      stream = await openrouter.chat.send({ chatRequest: basicChatRequest });
    } else {
      throw new Error(toUserFacingProviderError(error, model));
    }
  }

  let response = '';
  let reasoningTokens;

  try {
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        response += content;
      }

      if (chunk.usage?.reasoningTokens !== undefined && chunk.usage.reasoningTokens !== null) {
        reasoningTokens = chunk.usage.reasoningTokens;
      }
    }
  } catch (error) {
    throw new Error(toUserFacingProviderError(error, model));
  }

  if (reasoningTokens !== undefined) {
    console.log(`Reasoning tokens: ${reasoningTokens}`);
  }

  return response.trim() || 'No response returned by model.';
}

async function buildModelMessages(message, history, userPrompt) {
  const personality = await getSessionPersonality(message);
  const recentHistory = history.slice(-MAX_HISTORY);

  return [
    { role: 'system', content: personality.prompt },
    ...recentHistory,
    { role: 'user', content: userPrompt },
  ];
}

function appendConversation(history, userPrompt, assistantReply) {
  history.push({ role: 'user', content: userPrompt });
  history.push({ role: 'assistant', content: assistantReply });

  const maxEntries = MAX_HISTORY * 2;
  if (history.length > maxEntries) {
    history.splice(0, history.length - maxEntries);
  }
}

async function appendAndSaveConversation(sessionKey, history, userPrompt, assistantReply) {
  appendConversation(history, userPrompt, assistantReply);
  await saveConversationHistory(sessionKey, history);
}

async function handleChatRequest(message, userPrompt) {
  if (!OPENROUTER_API_KEY) {
    await message.reply(
      'OpenRouter is not configured yet. Add OPENROUTER_API_KEY to your .env, then restart the bot.'
    );
    return;
  }

  if (!userPrompt) {
    await message.reply(`Send a message or use ${PREFIX}ask <question>.`);
    return;
  }

  const sessionKey = getSessionKey(message);
  const history = await loadConversationHistory(sessionKey);
  const sessionModel = await getSessionModel(message);
  const modelMessages = await buildModelMessages(message, history, userPrompt);

  await message.channel.sendTyping();

  const assistantReply = await queryOpenRouter(modelMessages, sessionModel);
  await appendAndSaveConversation(sessionKey, history, userPrompt, assistantReply);

  const chunks = assistantReply.match(/[\s\S]{1,1800}/g) || [];
  for (const chunk of chunks) {
    await message.reply(chunk);
  }
}

async function handleCommand(message, command, prompt) {
  if (command === 'help') {
    await message.reply(
      [
        '**Chatbot Commands**',
        `${PREFIX}help - Show this message`,
        `${PREFIX}ping - Check bot health`,
        `${PREFIX}clear - Clear chat memory for this channel/DM`,
        `${PREFIX}ask <question> - Ask the AI`,
        '',
        '**Model & Personality Commands**',
        `${PREFIX}model list - List available AI models`,
        `${PREFIX}model set <id> - Switch to a different model`,
        `${PREFIX}model current - Show current model`,
        `${PREFIX}personality list - List available personalities`,
        `${PREFIX}personality set <name> - Switch personality`,
        `${PREFIX}personality current - Show current personality`,
        '',
        '**Specialized Modes**',
        `${PREFIX}code <code> - Analyze code with expert mode`,
        `${PREFIX}research <query> - Search and research a topic`,
        '',
        'You can also mention the bot with a prompt, or DM the bot directly.',
      ].join('\n')
    );
    return;
  }

  if (command === 'ping') {
    await message.reply('Pong. Bot is online.');
    return;
  }

  if (command === 'clear') {
    const sessionKey = getSessionKey(message);
    await clearConversationHistory(sessionKey);
    await message.reply('Conversation memory cleared for this channel.');
    return;
  }

  if (command === 'ask') {
    await handleChatRequest(message, prompt);
    return;
  }

  // ============ Model Commands ============
  if (command === 'model') {
    const subcommand = prompt.split(/\s+/)[0];
    const args = prompt.split(/\s+/).slice(1).join(' ');

    if (subcommand === 'list') {
      const modelList = AVAILABLE_MODELS
        .map(m => `• **${m.name}** - \`${m.id}\``)
        .join('\n');
      await message.reply(`**Available Models:**\n${modelList}`);
      return;
    }

    if (subcommand === 'set') {
      if (!args) {
        await message.reply('Usage: `!model set <model_id>`');
        return;
      }
      try {
        const model = await setSessionModel(message, args.trim());
        await message.reply(`✅ Switched to **${model.name}**`);
      } catch (error) {
        await message.reply(`❌ ${error.message}`);
      }
      return;
    }

    if (subcommand === 'current') {
      const currentModel = await getSessionModel(message);
      const model = AVAILABLE_MODELS.find(m => m.id === currentModel);
      await message.reply(`📊 Current Model: **${model?.name || currentModel}**`);
      return;
    }

    await message.reply(`Usage: \`${PREFIX}model <list|set|current>\``);
    return;
  }

  // ============ Personality Commands ============
  if (command === 'personality') {
    const subcommand = prompt.split(/\s+/)[0];
    const args = prompt.split(/\s+/).slice(1).join(' ');

    if (subcommand === 'list') {
      const personalities = await loadPersonalities();
      const list = Object.entries(personalities)
        .map(([key, p]) => `• **${p.name}** - \`${key}\``)
        .join('\n');
      await message.reply(`**Available Personalities:**\n${list}`);
      return;
    }

    if (subcommand === 'set') {
      if (!args) {
        await message.reply('Usage: `!personality set <name>`');
        return;
      }
      try {
        const personality = await setSessionPersonality(message, args.trim());
        await message.reply(`✅ Switched to **${personality.name}**`);
      } catch (error) {
        await message.reply(`❌ ${error.message}`);
      }
      return;
    }

    if (subcommand === 'current') {
      const personality = await getSessionPersonality(message);
      await message.reply(`🎭 Current Personality: **${personality.name}**`);
      return;
    }

    await message.reply(`Usage: \`${PREFIX}personality <list|set|current>\``);
    return;
  }

  // ============ Code Analysis Mode ============
  if (command === 'code') {
    if (!prompt) {
      await message.reply('Usage: `!code <code_snippet or language>`');
      return;
    }

    const codeAnalysisPersonality = DEFAULT_PERSONALITIES['code-analyzer'];
    const sessionKey = getSessionKey(message);
    const history = await loadConversationHistory(sessionKey);
    const sessionModel = await getSessionModel(message);

    const messages = [
      { role: 'system', content: codeAnalysisPersonality.prompt },
      ...history.slice(-MAX_HISTORY),
      { 
        role: 'user', 
        content: `Please analyze this code:\n\`\`\`\n${prompt}\n\`\`\`` 
      },
    ];

    await message.channel.sendTyping();
    const analysis = await queryOpenRouter(messages, sessionModel);
    await appendAndSaveConversation(sessionKey, history, `Code Analysis: ${prompt.slice(0, 50)}...`, analysis);

    const chunks = analysis.match(/[\s\S]{1,1800}/g) || [];
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
    return;
  }

  // ============ Research Mode ============
  if (command === 'research') {
    if (!prompt) {
      await message.reply('Usage: `!research <query>`');
      return;
    }

    const researchPersonality = DEFAULT_PERSONALITIES['researcher'];
    const sessionKey = getSessionKey(message);
    const history = await loadConversationHistory(sessionKey);
    const sessionModel = await getSessionModel(message);

    const researchContext = await buildResearchContext(prompt);
    const messages = [
      { role: 'system', content: researchPersonality.prompt },
      ...history.slice(-MAX_HISTORY),
      { 
        role: 'user', 
        content: `Research this topic and provide detailed information:\n\n${prompt}${researchContext}` 
      },
    ];

    await message.channel.sendTyping();
    const research = await queryOpenRouter(messages, sessionModel);
    await appendAndSaveConversation(sessionKey, history, `Research: ${prompt}`, research);

    const chunks = research.match(/[\s\S]{1,1800}/g) || [];
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
    return;
  }

  if (!command) {
    await handleChatRequest(message, prompt);
    return;
  }

  await message.reply(`Unknown command: ${command}. Try ${PREFIX}help.`);
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('AI chat mode', { type: 4 });
});

client.on(Events.MessageCreate, async message => {
  try {
    if (!shouldRespond(message)) return;

    const parsed = parseUserPrompt(message);
    if (parsed.mode === 'command') {
      await handleCommand(message, parsed.command, parsed.prompt);
      return;
    }

    await handleChatRequest(message, parsed.prompt);
  } catch (error) {
    console.error('Failed to process message:', error);
    const errorText = error?.message || 'Something went wrong while contacting the AI provider. Please try again.';
    const safeErrorText = errorText.slice(0, 300);
    await message.reply(`AI provider error: ${safeErrorText}`).catch(() => {});
  }
});

client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(DISCORD_TOKEN);