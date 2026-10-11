const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function baseEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp().setColor(0x5865f2);
}

function helpEmbed(prefix = '/') {
  return baseEmbed('🤖 Chatbot Commands',
    `**Basic**\n${prefix}help · ${prefix}ping · ${prefix}clear · ${prefix}ask\n\n` +
    `**AI Setup**\n${prefix}model · ${prefix}personality (try \`girl\` 💕)\n\n` +
    `**Pro modes**\n${prefix}code · ${prefix}research · ${prefix}stats · ${prefix}export\n\n` +
    `Long answers arrive as one paged message — use ◀ Prev / Next ▶ to read everything.\n` +
    `Tip: mention me or reply to my message to continue a thread. Prefix \`!\` also works (e.g. \`!help\`).`
  ).addFields(
    { name: 'Ask', value: `\`${prefix}ask question:<…>\``, inline: true },
    { name: 'Code', value: `\`${prefix}code code:<…>\``, inline: true },
    { name: 'Research', value: `\`${prefix}research query:<…>\``, inline: true },
  );
}

function errorEmbed(text) {
  return new EmbedBuilder().setTitle('⚠️ Something went wrong').setDescription(String(text).slice(0, 1500)).setColor(0xed4245).setTimestamp();
}

function infoEmbed(title, text) {
  return new EmbedBuilder().setTitle(title).setDescription(String(text).slice(0, 3500)).setColor(0x57f287).setTimestamp();
}

function modelListEmbed(models) {
  const desc = models.map(m => `• **${m.name}** — \`${m.id}\``).join('\n').slice(0, 3500);
  return baseEmbed('🧠 Available Models', desc || 'No models configured.');
}

function personalityListEmbed(personalities, hiddenKeys) {
  const hidden = hiddenKeys || new Set(['girl-text', 'casual']);
  const desc = Object.entries(personalities)
    .filter(([k]) => !hidden.has(k))
    .map(([k, p]) => `• **${p.name}** — \`${k}\``)
    .join('\n')
    .slice(0, 3500);
  return baseEmbed('🎭 Available Personalities', desc);
}

function actionRowForReply() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('retry').setLabel('↻ Retry').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('continue').setLabel('▶ Continue').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('clear').setLabel('🧹 Clear').setStyle(ButtonStyle.Danger),
  );
}

function guildWelcomeEmbed() {
  return baseEmbed('👋 Thanks for adding me!',
    'I answer DMs directly, and in servers when mentioned or via slash commands.\n\n' +
    '**Start here:** `/help` · `/ask question:<…>` · `/model list` · `/personality list`\n\n' +
    'I need **View Channel, Send Messages, Embed Links** to work. Message Content intent must be on in the Developer Portal for mention replies.'
  );
}

module.exports = { baseEmbed, helpEmbed, errorEmbed, infoEmbed, modelListEmbed, personalityListEmbed, actionRowForReply, guildWelcomeEmbed };
