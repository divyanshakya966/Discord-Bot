const { SlashCommandBuilder } = require('discord.js');

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('Show available commands and modes'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot health and latency'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation memory for this server or DM'),
  new SlashCommandBuilder().setName('stats').setDescription('Show your current model and personality'),
  new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export your conversation history as JSON or Markdown')
    .addStringOption(o => o.setName('format').setDescription('Export format').setRequired(false).addChoices(
      { name: 'JSON', value: 'json' },
      { name: 'Markdown', value: 'md' },
    )),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI a question')
    .addStringOption(option =>
      option.setName('question').setDescription('What you want to ask').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('model')
    .setDescription('Manage the active AI model')
    .addSubcommand(s => s.setName('list').setDescription('List available AI models'))
    .addSubcommand(s => s.setName('current').setDescription('Show the current AI model'))
    .addSubcommand(s =>
      s.setName('set').setDescription('Switch to a specific model')
        .addStringOption(o => o.setName('model').setDescription('Model (autocomplete, or any OpenRouter ID)').setRequired(true).setAutocomplete(true))
    ),
  new SlashCommandBuilder()
    .setName('personality')
    .setDescription('Manage the active AI personality')
    .addSubcommand(s => s.setName('list').setDescription('List available personalities'))
    .addSubcommand(s => s.setName('current').setDescription('Show the current personality'))
    .addSubcommand(s =>
      s.setName('set').setDescription('Switch to a specific personality')
        .addStringOption(o => o.setName('name').setDescription('Personality').setRequired(true).setAutocomplete(true))
    ),
  new SlashCommandBuilder()
    .setName('group')
    .setDescription('Shared group-discussion memory for this channel')
    .addSubcommand(s => s.setName('on').setDescription('Enable shared history in this channel'))
    .addSubcommand(s => s.setName('off').setDescription('Disable shared history in this channel'))
    .addSubcommand(s => s.setName('status').setDescription('Show group mode status'))
    .addSubcommand(s => s.setName('clear').setDescription('Wipe the shared history for this channel')),
  new SlashCommandBuilder()
    .setName('code')
    .setDescription('Analyze code with the expert code mode')
    .addStringOption(option =>
      option.setName('code').setDescription('Paste code or describe what to analyze').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('research')
    .setDescription('Research a topic with web search support')
    .addStringOption(option =>
      option.setName('query').setDescription('Topic or question to research').setRequired(true)
    ),
].map(c => c.toJSON());

module.exports = { slashCommands };
