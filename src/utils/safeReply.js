const { MessageFlags } = require('discord.js');
const { splitCodeSafe } = require('./splitMessage');

const NO_PING = { parse: [] };

async function safeReplyToMessage(message, content, options = {}) {
  const chunks = splitCodeSafe(String(content ?? ''), options.maxLength || 1900);
  const first = await message.reply({
    content: chunks[0],
    allowedMentions: NO_PING,
    ...(options.firstExtra || {}),
  });
  for (let i = 1; i < chunks.length; i++) {
    await message.channel.send({ content: chunks[i], allowedMentions: NO_PING });
  }
  return first;
}

async function safeEditReply(interaction, content, options = {}) {
  const chunks = splitCodeSafe(String(content ?? ''), options.maxLength || 1900);
  await interaction.editReply({ content: chunks[0], allowedMentions: NO_PING });
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({ content: chunks[i], allowedMentions: NO_PING, ...(options.ephemeralFollowUps ? { flags: MessageFlags.Ephemeral } : {}) });
  }
}

async function safeFollowUp(interactionOrChannel, content, options = {}) {
  const chunks = splitCodeSafe(String(content ?? ''), options.maxLength || 1900);
  for (const c of chunks) {
    if (typeof interactionOrChannel.followUp === 'function') {
      await interactionOrChannel.followUp({ content: c, allowedMentions: NO_PING, ...(options.ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
    } else {
      await interactionOrChannel.send({ content: c, allowedMentions: NO_PING });
    }
  }
}

module.exports = { safeReplyToMessage, safeEditReply, safeFollowUp };
