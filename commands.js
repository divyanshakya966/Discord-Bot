const { SlashCommandBuilder } = require('discord.js');
const { AVAILABLE_MODELS, DEFAULT_PERSONALITIES } = require('./bot-data');

const modelChoices = AVAILABLE_MODELS.map(model => ({
  name: model.name,
  value: model.id,
}));

const personalityChoices = Object.entries(DEFAULT_PERSONALITIES).map(([key, personality]) => ({
  name: personality.name,
  value: key,
}));

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('Show available commands and modes'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot health'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear conversation memory for this channel or DM'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI a question')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('What you want to ask')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('model')
    .setDescription('Manage the active AI model')
    .addSubcommand(subcommand =>
      subcommand.setName('list').setDescription('List available AI models')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('current').setDescription('Show the current AI model')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Switch to a specific model')
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('Choose a model from the list')
            .setRequired(false)
            .addChoices(...modelChoices)
        )
        .addStringOption(option =>
          option
            .setName('model_id')
            .setDescription('Or enter a custom model ID manually (e.g., openai/gpt-4-turbo)')
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName('personality')
    .setDescription('Manage the active AI personality')
    .addSubcommand(subcommand =>
      subcommand.setName('list').setDescription('List available personalities')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('current').setDescription('Show the current personality')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Switch to a specific personality')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Choose a personality')
            .setRequired(true)
            .addChoices(...personalityChoices)
        )
    ),
  new SlashCommandBuilder()
    .setName('code')
    .setDescription('Analyze code with the expert code mode')
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('Paste code or describe what to analyze')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('research')
    .setDescription('Research a topic with web search support')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Topic or question to research')
        .setRequired(true)
    ),
].map(command => command.toJSON());

module.exports = {
  slashCommands,
};