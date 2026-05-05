require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { slashCommands } = require('./commands');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error('Missing DISCORD_TOKEN in environment variables.');
  process.exit(1);
}

if (!clientId) {
  console.error('Missing DISCORD_CLIENT_ID in environment variables.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

const guildId = process.env.TEMP_GUILD_ID || process.env.DISCORD_GUILD_ID || null;

function isSnowflake(id) {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

async function discoverGuildIdsFromDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    const entries = await fs.readdir(dataDir);
    const ids = new Set();

    for (const name of entries) {
      const match = name.match(/^guild_(\d{17,20})_/);
      if (match) ids.add(match[1]);
    }

    return [...ids];
  } catch (error) {
    return [];
  }
}

function parseGuildIdList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(isSnowflake);
}

(async () => {
  try {
    if (isSnowflake(guildId)) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: slashCommands,
      });
      // Clear global commands to avoid duplicate names appearing alongside guild commands.
      await rest.put(Routes.applicationCommands(clientId), {
        body: [],
      });
      console.log(`Registered ${slashCommands.length} guild slash commands for ${guildId}.`);
      console.log('Cleared global slash commands to prevent duplicate command suggestions.');
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), {
      body: slashCommands,
    });

    // Clear known guild-scoped commands to avoid duplicate names with global commands.
    const configuredGuildIds = [
      process.env.DISCORD_GUILD_ID,
      process.env.TEMP_GUILD_ID,
      ...parseGuildIdList(process.env.DISCORD_GUILD_IDS),
    ].filter(isSnowflake);
    const discoveredGuildIds = await discoverGuildIdsFromDataDir();
    const cleanupGuildIds = [...new Set([...configuredGuildIds, ...discoveredGuildIds])];

    for (const cleanupGuildId of cleanupGuildIds) {
      await rest.put(Routes.applicationGuildCommands(clientId, cleanupGuildId), {
        body: [],
      });
      console.log(`Cleared guild slash commands for ${cleanupGuildId} to prevent duplicate suggestions.`);
    }

    console.log(`Registered ${slashCommands.length} global slash commands.`);
  } catch (error) {
    console.error('Failed to deploy slash commands:', error);
    process.exitCode = 1;
  }
})();