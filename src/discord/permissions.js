const { PermissionsBitField } = require('discord.js');

function getMissingPermissions(channel, clientUser) {
  try {
    if (!channel || channel.isDMBased?.()) return [];
    const me = channel.guild?.members?.me;
    const permsIn = channel.permissionsFor?.(me || clientUser);
    if (!permsIn) return [];
    const need = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ReadMessageHistory];
    const missing = need.filter(f => !permsIn.has(f));
    return missing.map(f => String(f));
  } catch {
    return [];
  }
}

function missingToUserText(missing) {
  if (!missing?.length) return '';
  return 'I seem to be missing permissions here (needs View Channel, Send Messages, Embed Links, Read Message History). Please ask a moderator to check my role/channel overrides.';
}

module.exports = { getMissingPermissions, missingToUserText };
