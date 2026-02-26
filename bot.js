require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  AuditLogEvent,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const warnings   = new Map();
const mutedUsers = new Map();
const raidLog    = new Map();
const autoModCfg = new Map();

const PREFIX          = process.env.PREFIX || '!';
const RAID_THRESHOLD  = 10;
const RAID_WINDOW_MS  = 10_000;

function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function hasPerms(member, ...perms) {
  return perms.every(p => member.permissions.has(p));
}

async function sendLog(guild, message) {
  const cfg = autoModCfg.get(guild.id);
  if (!cfg?.logChannel) return;
  const ch = guild.channels.cache.get(cfg.logChannel);
  if (ch?.isTextBased()) ch.send({ embeds: [embed('📋 Log', message, 0xffa500)] });
}

client.once(Events.ClientReady, () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
  client.user.setActivity(`${PREFIX}help | Managing servers`, { type: 3 });
});

client.on(Events.GuildMemberAdd, async member => {
  const { guild } = member;
  const now = Date.now();

  if (!raidLog.has(guild.id)) raidLog.set(guild.id, []);
  const joins = raidLog.get(guild.id);
  joins.push(now);

  const recent = joins.filter(t => now - t < RAID_WINDOW_MS);
  raidLog.set(guild.id, recent);

  if (recent.length >= RAID_THRESHOLD) {
    await sendLog(guild,
      `🚨 **RAID ALERT** — ${recent.length} members joined in the last 10 seconds!\n` +
      `Latest: ${member.user.tag} (<@${member.id}>)`
    );

    const ageMs = now - member.user.createdTimestamp;
    if (ageMs < 7 * 24 * 60 * 60 * 1000 && guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      await member.kick('Auto-kick: suspected raid (new account)').catch(() => {});
    }
  }

  member.send({
    embeds: [embed(`👋 Welcome to ${guild.name}!`,
      `Hi ${member.user.username}, welcome! Use \`${PREFIX}help\` to see available commands.`,
      0x57f287
    )]
  }).catch(() => {});
});

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const args    = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'help') {
    const e = new EmbedBuilder()
      .setTitle('📖 Bot Commands')
      .setColor(0x5865f2)
      .setTimestamp()
      .addFields(
        { name: '🔨 Moderation', value:
          '`!ban <@user> [reason]` — Ban a member\n' +
          '`!unban <userId>` — Unban by ID\n' +
          '`!kick <@user> [reason]` — Kick a member\n' +
          '`!mute <@user> <mins> [reason]` — Timeout a member\n' +
          '`!unmute <@user>` — Remove timeout\n' +
          '`!warn <@user> <reason>` — Add a warning\n' +
          '`!warnings <@user>` — View warnings\n' +
          '`!clearwarns <@user>` — Clear warnings'
        },
        { name: '🧹 Cleanup', value:
          '`!purge <1-100>` — Bulk delete messages\n' +
          '`!purgeuser <@user> <1-100>` — Delete user messages'
        },
        { name: '📋 Server Management', value:
          '`!setlog <#channel>` — Set audit log channel\n' +
          '`!serverinfo` — Show server info\n' +
          '`!userinfo <@user>` — Show user info\n' +
          '`!roles` — List all roles\n' +
          '`!addrole <@user> <role>` — Add role to user\n' +
          '`!removerole <@user> <role>` — Remove role from user\n' +
          '`!createrole <name> [color]` — Create a role\n' +
          '`!delrole <role>` — Delete a role'
        },
        { name: '📢 Channels', value:
          '`!createchannel <name> [category]` — Create text channel\n' +
          '`!deletechannel <#channel>` — Delete a channel\n' +
          '`!lockdown <#channel>` — Lock channel\n' +
          '`!unlock <#channel>` — Unlock channel\n' +
          '`!slowmode <#channel> <secs>` — Set slowmode'
        },
        { name: '🛡️ Anti-Raid', value:
          '`!raidstatus` — Check recent join activity\n' +
          '`!lockserver` — Lock all text channels\n' +
          '`!unlockserver` — Unlock all text channels'
        },
        { name: '📣 Announcements', value:
          '`!announce <#channel> <message>` — Send embed announcement\n' +
          '`!dm <@user> <message>` — DM a user\n' +
          '`!poll <question> | <opt1> | <opt2> ...` — Create a poll'
        },
        { name: '🔊 Voice', value:
          '`!voicemute <@user>` — Server-mute in VC\n' +
          '`!voiceunmute <@user>` — Remove VC mute\n' +
          '`!vcmove <@user> <channel>` — Move user to VC'
        }
      );
    return msg.reply({ embeds: [e] });
  }

  if (command === 'ban') {
    if (!hasPerms(msg.member, PermissionFlagsBits.BanMembers))
      return msg.reply('❌ You need **Ban Members** permission.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mention a user to ban.');
    if (!target.bannable) return msg.reply('❌ I cannot ban that user.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.ban({ reason });
    await sendLog(msg.guild, `🔨 **${target.user.tag}** was banned by **${msg.author.tag}** — ${reason}`);
    return msg.reply({ embeds: [embed('✅ User Banned', `**${target.user.tag}** has been banned.\n**Reason:** ${reason}`, 0xed4245)] });
  }

  if (command === 'unban') {
    if (!hasPerms(msg.member, PermissionFlagsBits.BanMembers))
      return msg.reply('❌ You need **Ban Members** permission.');
    const userId = args[0];
    if (!userId) return msg.reply('❌ Provide a user ID.');
    await msg.guild.bans.remove(userId).catch(() => msg.reply('❌ Could not unban (invalid ID or not banned).'));
    await sendLog(msg.guild, `✅ User \`${userId}\` was unbanned by **${msg.author.tag}**`);
    return msg.reply({ embeds: [embed('✅ User Unbanned', `User \`${userId}\` has been unbanned.`, 0x57f287)] });
  }

  if (command === 'kick') {
    if (!hasPerms(msg.member, PermissionFlagsBits.KickMembers))
      return msg.reply('❌ You need **Kick Members** permission.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mention a user to kick.');
    if (!target.kickable) return msg.reply('❌ I cannot kick that user.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.kick(reason);
    await sendLog(msg.guild, `👢 **${target.user.tag}** was kicked by **${msg.author.tag}** — ${reason}`);
    return msg.reply({ embeds: [embed('✅ User Kicked', `**${target.user.tag}** has been kicked.\n**Reason:** ${reason}`, 0xfee75c)] });
  }

  if (command === 'mute') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ModerateMembers))
      return msg.reply('❌ You need **Moderate Members** permission.');
    const target = msg.mentions.members.first();
    const mins   = parseInt(args[1]);
    if (!target || isNaN(mins)) return msg.reply('❌ Usage: `!mute <@user> <minutes> [reason]`');
    const reason = args.slice(2).join(' ') || 'No reason provided';
    await target.timeout(mins * 60_000, reason);
    await sendLog(msg.guild, `🔇 **${target.user.tag}** muted for ${mins}m by **${msg.author.tag}** — ${reason}`);
    return msg.reply({ embeds: [embed('✅ User Muted', `**${target.user.tag}** muted for **${mins} minutes**.\n**Reason:** ${reason}`, 0xfee75c)] });
  }

  if (command === 'unmute') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ModerateMembers))
      return msg.reply('❌ You need **Moderate Members** permission.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mention a user to unmute.');
    await target.timeout(null);
    await sendLog(msg.guild, `🔊 **${target.user.tag}** was unmuted by **${msg.author.tag}**`);
    return msg.reply({ embeds: [embed('✅ User Unmuted', `**${target.user.tag}** has been unmuted.`, 0x57f287)] });
  }

  if (command === 'warn') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ModerateMembers))
      return msg.reply('❌ You need **Moderate Members** permission.');
    const target = msg.mentions.users.first();
    const reason = args.slice(1).join(' ');
    if (!target || !reason) return msg.reply('❌ Usage: `!warn <@user> <reason>`');
    if (!warnings.has(target.id)) warnings.set(target.id, []);
    warnings.get(target.id).push({ reason, date: new Date().toISOString(), by: msg.author.tag });
    const count = warnings.get(target.id).length;
    await sendLog(msg.guild, `⚠️ **${target.tag}** warned (${count} total) by **${msg.author.tag}** — ${reason}`);
    target.send({ embeds: [embed('⚠️ Warning Received', `You have been warned in **${msg.guild.name}**.\n**Reason:** ${reason}`, 0xfee75c)] }).catch(() => {});
    return msg.reply({ embeds: [embed('✅ Warning Issued', `**${target.tag}** now has **${count}** warning(s).`, 0xfee75c)] });
  }

  if (command === 'warnings') {
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Mention a user.');
    const list = warnings.get(target.id) || [];
    if (list.length === 0) return msg.reply(`✅ **${target.tag}** has no warnings.`);
    const text = list.map((w, i) => `**${i + 1}.** ${w.reason} — by ${w.by} (${w.date.split('T')[0]})`).join('\n');
    return msg.reply({ embeds: [embed(`⚠️ Warnings for ${target.tag}`, text, 0xfee75c)] });
  }

  if (command === 'clearwarns') {
    if (!hasPerms(msg.member, PermissionFlagsBits.Administrator))
      return msg.reply('❌ You need **Administrator** permission.');
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Mention a user.');
    warnings.delete(target.id);
    return msg.reply({ embeds: [embed('✅ Warnings Cleared', `All warnings for **${target.tag}** have been removed.`, 0x57f287)] });
  }

  if (command === 'purge') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageMessages))
      return msg.reply('❌ You need **Manage Messages** permission.');
    const amount = Math.min(parseInt(args[0]) || 0, 100);
    if (amount < 1) return msg.reply('❌ Provide a number between 1-100.');
    await msg.channel.bulkDelete(amount + 1, true);
    const notice = await msg.channel.send({ embeds: [embed('🧹 Purged', `Deleted **${amount}** messages.`, 0x57f287)] });
    setTimeout(() => notice.delete().catch(() => {}), 4000);
  }

  if (command === 'purgeuser') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageMessages))
      return msg.reply('❌ You need **Manage Messages** permission.');
    const target = msg.mentions.users.first();
    const amount = Math.min(parseInt(args[1]) || 0, 100);
    if (!target || amount < 1) return msg.reply('❌ Usage: `!purgeuser <@user> <1-100>`');
    const messages = await msg.channel.messages.fetch({ limit: 100 });
    const filtered = messages.filter(m => m.author.id === target.id).first(amount);
    await msg.channel.bulkDelete(filtered, true);
    return msg.reply({ embeds: [embed('🧹 Purged User Messages', `Deleted **${filtered.length}** messages from **${target.tag}**.`, 0x57f287)] });
  }

  if (command === 'setlog') {
    if (!hasPerms(msg.member, PermissionFlagsBits.Administrator))
      return msg.reply('❌ You need **Administrator** permission.');
    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply('❌ Mention a channel.');
    if (!autoModCfg.has(msg.guild.id)) autoModCfg.set(msg.guild.id, {});
    autoModCfg.get(msg.guild.id).logChannel = ch.id;
    return msg.reply({ embeds: [embed('✅ Log Channel Set', `Audit logs will be posted in ${ch}.`, 0x57f287)] });
  }

  if (command === 'serverinfo') {
    const g = msg.guild;
    await g.members.fetch();
    const e = new EmbedBuilder()
      .setTitle(`📊 ${g.name}`)
      .setThumbnail(g.iconURL())
      .setColor(0x5865f2)
      .setTimestamp()
      .addFields(
        { name: 'Owner',      value: `<@${g.ownerId}>`,                    inline: true },
        { name: 'Members',    value: `${g.memberCount}`,                   inline: true },
        { name: 'Channels',   value: `${g.channels.cache.size}`,           inline: true },
        { name: 'Roles',      value: `${g.roles.cache.size}`,              inline: true },
        { name: 'Boosts',     value: `${g.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: 'Created',    value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Verification', value: g.verificationLevel.toString(),     inline: true },
      );
    return msg.reply({ embeds: [e] });
  }

  if (command === 'userinfo') {
    const target = msg.mentions.members.first() || msg.member;
    const u = target.user;
    const e = new EmbedBuilder()
      .setTitle(`👤 ${u.tag}`)
      .setThumbnail(u.displayAvatarURL())
      .setColor(0x5865f2)
      .setTimestamp()
      .addFields(
        { name: 'ID',         value: u.id,                                              inline: true },
        { name: 'Nickname',   value: target.nickname || 'None',                         inline: true },
        { name: 'Joined',     value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Account',    value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`,  inline: true },
        { name: 'Roles',      value: target.roles.cache.filter(r => r.id !== msg.guild.id).map(r => r.toString()).join(', ') || 'None', inline: false },
        { name: 'Warnings',   value: `${(warnings.get(u.id) || []).length}`,            inline: true },
      );
    return msg.reply({ embeds: [e] });
  }

  if (command === 'roles') {
    const roleList = msg.guild.roles.cache
      .filter(r => r.id !== msg.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r} (${r.members.size})`)
      .join('\n') || 'No roles.';
    return msg.reply({ embeds: [embed('📋 Server Roles', roleList.slice(0, 4000))] });
  }

  if (command === 'addrole') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageRoles))
      return msg.reply('❌ You need **Manage Roles** permission.');
    const target = msg.mentions.members.first();
    const roleName = args.slice(1).join(' ');
    if (!target || !roleName) return msg.reply('❌ Usage: `!addrole <@user> <role name>`');
    const role = msg.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return msg.reply(`❌ Role \`${roleName}\` not found.`);
    await target.roles.add(role);
    return msg.reply({ embeds: [embed('✅ Role Added', `${role} has been added to **${target.user.tag}**.`, 0x57f287)] });
  }

  if (command === 'removerole') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageRoles))
      return msg.reply('❌ You need **Manage Roles** permission.');
    const target = msg.mentions.members.first();
    const roleName = args.slice(1).join(' ');
    if (!target || !roleName) return msg.reply('❌ Usage: `!removerole <@user> <role name>`');
    const role = msg.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return msg.reply(`❌ Role \`${roleName}\` not found.`);
    await target.roles.remove(role);
    return msg.reply({ embeds: [embed('✅ Role Removed', `${role} has been removed from **${target.user.tag}**.`, 0x57f287)] });
  }

  if (command === 'createrole') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageRoles))
      return msg.reply('❌ You need **Manage Roles** permission.');
    const color = args.find(a => /^#?[0-9a-f]{6}$/i.test(a)) || '#99aab5';
    const name  = args.filter(a => !/^#?[0-9a-f]{6}$/i.test(a)).join(' ');
    if (!name) return msg.reply('❌ Usage: `!createrole <name> [#hexcolor]`');
    const role = await msg.guild.roles.create({ name, color, reason: `Created by ${msg.author.tag}` });
    return msg.reply({ embeds: [embed('✅ Role Created', `${role} has been created.`, 0x57f287)] });
  }

  if (command === 'delrole') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageRoles))
      return msg.reply('❌ You need **Manage Roles** permission.');
    const roleName = args.join(' ');
    if (!roleName) return msg.reply('❌ Usage: `!delrole <role name>`');
    const role = msg.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return msg.reply(`❌ Role \`${roleName}\` not found.`);
    await role.delete(`Deleted by ${msg.author.tag}`);
    return msg.reply({ embeds: [embed('✅ Role Deleted', `Role **${roleName}** has been deleted.`, 0xed4245)] });
  }

  if (command === 'createchannel') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageChannels))
      return msg.reply('❌ You need **Manage Channels** permission.');
    const name = args[0];
    if (!name) return msg.reply('❌ Usage: `!createchannel <name>`');
    const ch = await msg.guild.channels.create({ name, reason: `Created by ${msg.author.tag}` });
    return msg.reply({ embeds: [embed('✅ Channel Created', `${ch} has been created.`, 0x57f287)] });
  }

  if (command === 'deletechannel') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageChannels))
      return msg.reply('❌ You need **Manage Channels** permission.');
    const ch = msg.mentions.channels.first();
    if (!ch) return msg.reply('❌ Mention a channel to delete.');
    await ch.delete(`Deleted by ${msg.author.tag}`);
    return msg.reply({ embeds: [embed('✅ Channel Deleted', `Channel has been deleted.`, 0xed4245)] });
  }

  if (command === 'lockdown') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageChannels))
      return msg.reply('❌ You need **Manage Channels** permission.');
    const ch = msg.mentions.channels.first() || msg.channel;
    await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
    return msg.reply({ embeds: [embed('🔒 Channel Locked', `${ch} is now in lockdown.`, 0xed4245)] });
  }

  if (command === 'unlock') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageChannels))
      return msg.reply('❌ You need **Manage Channels** permission.');
    const ch = msg.mentions.channels.first() || msg.channel;
    await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: null });
    return msg.reply({ embeds: [embed('🔓 Channel Unlocked', `${ch} is now unlocked.`, 0x57f287)] });
  }

  if (command === 'slowmode') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageChannels))
      return msg.reply('❌ You need **Manage Channels** permission.');
    const ch   = msg.mentions.channels.first() || msg.channel;
    const secs = parseInt(args.find(a => !isNaN(a))) ?? 0;
    await ch.setRateLimitPerUser(secs);
    return msg.reply({ embeds: [embed('⏱️ Slowmode Set', `${ch} slowmode set to **${secs}s**.`, 0x5865f2)] });
  }

  if (command === 'raidstatus') {
    const joins  = raidLog.get(msg.guild.id) || [];
    const recent = joins.filter(t => Date.now() - t < 60_000).length;
    return msg.reply({ embeds: [embed('🛡️ Raid Status',
      `Joins in the last 60 seconds: **${recent}**\n` +
      `Raid threshold: **${RAID_THRESHOLD}** joins / 10 s`,
      recent >= RAID_THRESHOLD ? 0xed4245 : 0x57f287
    )] });
  }

  if (command === 'lockserver') {
    if (!hasPerms(msg.member, PermissionFlagsBits.Administrator))
      return msg.reply('❌ You need **Administrator** permission.');
    const textChannels = msg.guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(msg.guild.members.me).has(PermissionFlagsBits.ManageChannels));
    for (const [, ch] of textChannels) {
      await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false }).catch(() => {});
    }
    await sendLog(msg.guild, `🔒 **Server locked** by **${msg.author.tag}**`);
    return msg.reply({ embeds: [embed('🔒 Server Locked', 'All channels have been locked.', 0xed4245)] });
  }

  if (command === 'unlockserver') {
    if (!hasPerms(msg.member, PermissionFlagsBits.Administrator))
      return msg.reply('❌ You need **Administrator** permission.');
    const textChannels = msg.guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(msg.guild.members.me).has(PermissionFlagsBits.ManageChannels));
    for (const [, ch] of textChannels) {
      await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: null }).catch(() => {});
    }
    await sendLog(msg.guild, `🔓 **Server unlocked** by **${msg.author.tag}**`);
    return msg.reply({ embeds: [embed('🔓 Server Unlocked', 'All channels have been unlocked.', 0x57f287)] });
  }

  if (command === 'announce') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageMessages))
      return msg.reply('❌ You need **Manage Messages** permission.');
    const ch      = msg.mentions.channels.first();
    const message = args.slice(1).join(' ');
    if (!ch || !message) return msg.reply('❌ Usage: `!announce <#channel> <message>`');
    await ch.send({ embeds: [embed('📢 Announcement', message, 0x5865f2)] });
    return msg.reply('✅ Announcement sent!');
  }

  if (command === 'dm') {
    if (!hasPerms(msg.member, PermissionFlagsBits.Administrator))
      return msg.reply('❌ You need **Administrator** permission.');
    const target  = msg.mentions.users.first();
    const message = args.slice(1).join(' ');
    if (!target || !message) return msg.reply('❌ Usage: `!dm <@user> <message>`');
    await target.send({ embeds: [embed(`📩 Message from ${msg.guild.name}`, message, 0x5865f2)] }).catch(() => msg.reply('❌ Could not DM that user.'));
    return msg.reply('✅ DM sent!');
  }

  if (command === 'poll') {
    if (!hasPerms(msg.member, PermissionFlagsBits.ManageMessages))
      return msg.reply('❌ You need **Manage Messages** permission.');
    const parts    = args.join(' ').split('|').map(s => s.trim());
    const question = parts[0];
    const options  = parts.slice(1);
    if (!question || options.length < 2) return msg.reply('❌ Usage: `!poll <question> | <opt1> | <opt2> ...`');
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const optText = options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
    const pollMsg = await msg.channel.send({ embeds: [embed(`📊 ${question}`, optText, 0x5865f2)] });
    for (let i = 0; i < options.length; i++) await pollMsg.react(emojis[i]);
  }

  if (command === 'voicemute') {
    if (!hasPerms(msg.member, PermissionFlagsBits.MuteMembers))
      return msg.reply('❌ You need **Mute Members** permission.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mention a user.');
    if (!target.voice.channel) return msg.reply('❌ That user is not in a voice channel.');
    await target.voice.setMute(true, `Muted by ${msg.author.tag}`);
    return msg.reply({ embeds: [embed('🔇 Voice Muted', `**${target.user.tag}** has been server-muted.`, 0xfee75c)] });
  }

  if (command === 'voiceunmute') {
    if (!hasPerms(msg.member, PermissionFlagsBits.MuteMembers))
      return msg.reply('❌ You need **Mute Members** permission.');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply('❌ Mention a user.');
    await target.voice.setMute(false, `Unmuted by ${msg.author.tag}`);
    return msg.reply({ embeds: [embed('🔊 Voice Unmuted', `**${target.user.tag}** has been unmuted.`, 0x57f287)] });
  }

  if (command === 'vcmove') {
    if (!hasPerms(msg.member, PermissionFlagsBits.MoveMembers))
      return msg.reply('❌ You need **Move Members** permission.');
    const target    = msg.mentions.members.first();
    const chName    = args.slice(1).join(' ');
    const voiceCh   = msg.guild.channels.cache.find(c => c.name.toLowerCase() === chName.toLowerCase() && c.isVoiceBased());
    if (!target || !voiceCh) return msg.reply('❌ Usage: `!vcmove <@user> <voice channel name>`');
    await target.voice.setChannel(voiceCh, `Moved by ${msg.author.tag}`);
    return msg.reply({ embeds: [embed('✅ Member Moved', `**${target.user.tag}** moved to **${voiceCh.name}**.`, 0x57f287)] });
  }
});

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;
  if (msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
  if (/discord\.gg\/[a-zA-Z0-9]+/.test(msg.content)) {
    await msg.delete().catch(() => {});
    await msg.channel.send(`❌ ${msg.author}, invite links are not allowed.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    await sendLog(msg.guild, `🔗 Invite link deleted — sent by **${msg.author.tag}** in ${msg.channel}`);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  await sendLog(member.guild, `📤 **${member.user.tag}** left the server.`);
});

client.on(Events.GuildBanAdd, async ban => {
  await sendLog(ban.guild, `🔨 **${ban.user.tag}** was banned.`);
});

client.on(Events.GuildBanRemove, async ban => {
  await sendLog(ban.guild, `✅ **${ban.user.tag}** was unbanned.`);
});

client.on(Events.ChannelCreate, async channel => {
  await sendLog(channel.guild, `📢 Channel **#${channel.name}** was created.`);
});

client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  await sendLog(channel.guild, `🗑️ Channel **#${channel.name}** was deleted.`);
});

client.on(Events.RoleCreate, async role => {
  await sendLog(role.guild, `🎭 Role **${role.name}** was created.`);
});

client.on(Events.RoleDelete, async role => {
  await sendLog(role.guild, `🗑️ Role **${role.name}** was deleted.`);
});

client.on(Events.Error, err => console.error('Discord client error:', err));
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));

client.login(process.env.DISCORD_TOKEN);