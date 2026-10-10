require('dotenv').config();
const { REST, Routes } = require('discord.js');
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

function parseGuildIdList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(v => v.trim()).filter(isSnowflake);
}

(async () => {
  try {
    const names = slashCommands.map(c => c.name).join(', ');
    console.log(`Deploying ${slashCommands.length} commands: ${names}`);

    if (isSnowflake(guildId)) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: slashCommands });
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`Registered ${slashCommands.length} guild slash commands for ${guildId}.`);
      console.log('Cleared global slash commands to prevent duplicate suggestions.');
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), { body: slashCommands });

    const cleanupGuildIds = [...new Set([
      process.env.DISCORD_GUILD_ID,
      process.env.TEMP_GUILD_ID,
      ...parseGuildIdList(process.env.DISCORD_GUILD_IDS),
    ].filter(isSnowflake))];

    for (const gid of cleanupGuildIds) {
      await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: [] });
      console.log(`Cleared guild slash commands for ${gid}.`);
    }

    console.log(`Registered ${slashCommands.length} global slash commands.`);
  } catch (error) {
    console.error('Failed to deploy slash commands:', error?.message || error);
    process.exitCode = 1;
  }
})();
