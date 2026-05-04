require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');


const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const PREFIX = process.env.PREFIX || '!';
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'You are a helpful and concise Discord assistant. Keep answers friendly and practical.';
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 8);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 500);
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.7);

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

async function queryOpenRouter(messages) {
  const openrouter = await getOpenRouterClient();

  // Streamed responses let us read reasoning token usage from the final chunk.
  const stream = await openrouter.chat.send({
    chatRequest: {
      model: OPENROUTER_MODEL,
      messages,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream: true,
    },
  });

  let response = '';
  let reasoningTokens;

  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      response += content;
    }

    if (chunk.usage?.reasoningTokens !== undefined && chunk.usage.reasoningTokens !== null) {
      reasoningTokens = chunk.usage.reasoningTokens;
    }
  }

  if (reasoningTokens !== undefined) {
    console.log(`Reasoning tokens: ${reasoningTokens}`);
  }

  return response.trim() || 'No response returned by model.';
}

function buildModelMessages(history, userPrompt) {
  const recentHistory = history.slice(-MAX_HISTORY);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
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
  if (!OPENROUTER_API_KEY || !OPENROUTER_MODEL) {
    await message.reply(
      'OpenRouter is not configured yet. Add OPENROUTER_API_KEY and OPENROUTER_MODEL to your .env, then restart the bot.'
    );
    return;
  }

  if (!userPrompt) {
    await message.reply(`Send a message or use ${PREFIX}ask <question>.`);
    return;
  }

  const sessionKey = getSessionKey(message);
  const history = await loadConversationHistory(sessionKey);
  const modelMessages = buildModelMessages(history, userPrompt);

  await message.channel.sendTyping();

  const assistantReply = await queryOpenRouter(modelMessages);
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
    await message.reply('Something went wrong while contacting the AI provider. Please try again.').catch(() => {});
  }
});

client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(DISCORD_TOKEN);