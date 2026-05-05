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

(async () => {
  try {
    if (isSnowflake(guildId)) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: slashCommands,
      });
      console.log(`Registered ${slashCommands.length} guild slash commands for ${guildId}.`);
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), {
      body: slashCommands,
    });
    console.log(`Registered ${slashCommands.length} global slash commands.`);
  } catch (error) {
    console.error('Failed to deploy slash commands:', error);
    process.exitCode = 1;
  }
})();