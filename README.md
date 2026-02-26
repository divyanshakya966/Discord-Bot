<div align="center">

# 🤖 Discord Management Bot

**A fully self-hosted, dependency-light Discord bot for complete server administration.**  
Built with [Discord.js v14](https://discord.js.org) · Node.js 18+ · No database required to get started

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)

[Features](#-features) · [Quick Start](#-quick-start) · [Commands](#-command-reference) · [Configuration](#-configuration) · [Self-Hosting](#-self-hosting) · [Contributing](#-contributing)

---

</div>

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Command Reference](#-command-reference)
  - [Moderation](#moderation)
  - [Cleanup](#cleanup)
  - [Server Management](#server-management)
  - [Channel Management](#channel-management)
  - [Anti-Raid](#anti-raid)
  - [Announcements & Polls](#announcements--polls)
  - [Voice Management](#voice-management)
- [Configuration](#-configuration)
- [Self-Hosting](#-self-hosting)
  - [Local (PC / Mac)](#local-pc--mac)
  - [Railway](#railway-recommended)
  - [VPS (Ubuntu / Debian)](#vps-ubuntu--debian)
  - [Heroku](#heroku)
- [Permission Requirements](#-permission-requirements)
- [Auto-Moderation](#-auto-moderation)
- [Anti-Raid System](#-anti-raid-system)
- [Customization Guide](#-customization-guide)
- [Adding a Database](#-adding-a-database)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Category | What it does |
|---|---|
| 🔨 **Moderation** | Ban, Unban, Kick, Mute/Unmute (native timeout), Warnings system |
| 🧹 **Cleanup** | Bulk-delete messages, delete by specific user |
| 📋 **Server Management** | Server info, user info, role CRUD, audit log channel |
| 📢 **Channel Management** | Create/delete channels, lockdown, unlock, slowmode |
| 🛡️ **Anti-Raid** | Real-time join flood detection, auto-kick new accounts, full server lockdown |
| 🤖 **Auto-Moderation** | Invite link filter, audit event logging (bans, kicks, role/channel changes) |
| 📣 **Announcements** | Embed announcements, staff DMs, reaction polls |
| 🔊 **Voice** | Server-mute, unmute, move members between VCs |
| 👋 **Welcome** | Automatic DM to new members with custom message |

**Design goals:**
- ✅ Single file — easy to read, modify, and deploy
- ✅ Only 2 npm dependencies (`discord.js`, `dotenv`)
- ✅ No external services, databases, or APIs needed to start
- ✅ Works on any Node.js 18+ environment
- ✅ Full permission checks on every command

---

## 📦 Prerequisites

- [Node.js](https://nodejs.org) **v18 or later**
- A **Discord account** with a server you own or admin access to
- A **Discord bot token** (see [Getting Your Token](#getting-your-token))

```bash
# Verify you have the right Node version
node --version   # should print v18.x.x or higher
npm --version
```

---

## 🚀 Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/divyanshakya966/Discord-Bot.git
cd Discord-Bot

# 2. Install dependencies
npm install

# 3. Set up your environment
cp .env.example .env
# Open .env in any text editor and paste your bot token

# 4. Run the bot
node bot.js
```

You should see:
```
✅  Logged in as YourBot#1234
```

---

## Getting Your Token

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name → **Create**
3. In the left sidebar, click **Bot**
4. Click **Reset Token** and copy it → paste into your `.env` file
5. Scroll down to **Privileged Gateway Intents** and enable **all three**:
   - ☑ Presence Intent
   - ☑ Server Members Intent
   - ☑ Message Content Intent
6. Click **Save Changes**

> ⚠️ **Never share your token.** Anyone with it has full control of your bot. If it's ever exposed, immediately reset it in the Developer Portal.

### Inviting the Bot to Your Server

1. In the Developer Portal, go to **OAuth2 → URL Generator**
2. Select scopes: `bot` + `applications.commands`
3. Select Bot Permissions: **Administrator** (or individual permissions listed [below](#-permission-requirements))
4. Copy the generated URL, paste it in your browser, and authorize

---

## 📁 Project Structure

```
discord-management-bot/
├── bot.js            # Main bot — all commands and event handlers
├── package.json      # npm metadata and dependencies
├── .env.example      # Token template (copy to .env)
├── .gitignore        # Excludes .env and node_modules
└── README.md         # You are here
```

---

## 📖 Command Reference

Default prefix: `!` (configurable via `.env`)

### Moderation

| Command | Usage | Permission Required |
|---|---|---|
| `!ban` | `!ban @user [reason]` | Ban Members |
| `!unban` | `!unban <userId>` | Ban Members |
| `!kick` | `!kick @user [reason]` | Kick Members |
| `!mute` | `!mute @user <minutes> [reason]` | Moderate Members |
| `!unmute` | `!unmute @user` | Moderate Members |
| `!warn` | `!warn @user <reason>` | Moderate Members |
| `!warnings` | `!warnings @user` | Any |
| `!clearwarns` | `!clearwarns @user` | Administrator |

**Examples:**
```
!ban @TrollUser Spamming in general
!mute @BadUser 30 Posting spoilers
!warn @User123 Please read the rules
!warnings @User123
```

---

### Cleanup

| Command | Usage | Permission Required |
|---|---|---|
| `!purge` | `!purge <1-100>` | Manage Messages |
| `!purgeuser` | `!purgeuser @user <1-100>` | Manage Messages |

**Examples:**
```
!purge 50
!purgeuser @SpamBot 100
```

> ⚠️ Discord only allows bulk-deleting messages younger than 14 days.

---

### Server Management

| Command | Usage | Permission Required |
|---|---|---|
| `!setlog` | `!setlog #channel` | Administrator |
| `!serverinfo` | `!serverinfo` | Any |
| `!userinfo` | `!userinfo [@user]` | Any |
| `!roles` | `!roles` | Any |
| `!addrole` | `!addrole @user <role name>` | Manage Roles |
| `!removerole` | `!removerole @user <role name>` | Manage Roles |
| `!createrole` | `!createrole <name> [#hexcolor]` | Manage Roles |
| `!delrole` | `!delrole <role name>` | Manage Roles |

**Examples:**
```
!setlog #mod-logs
!userinfo @SomeUser
!createrole VIP #ff5733
!addrole @User VIP
```

---

### Channel Management

| Command | Usage | Permission Required |
|---|---|---|
| `!createchannel` | `!createchannel <name>` | Manage Channels |
| `!deletechannel` | `!deletechannel #channel` | Manage Channels |
| `!lockdown` | `!lockdown [#channel]` | Manage Channels |
| `!unlock` | `!unlock [#channel]` | Manage Channels |
| `!slowmode` | `!slowmode [#channel] <seconds>` | Manage Channels |

**Examples:**
```
!createchannel bot-testing
!lockdown #general
!slowmode #general 10
!unlock #general
```

> 💡 `!lockdown` and `!unlock` default to the current channel if none is mentioned.

---

### Anti-Raid

| Command | Usage | Permission Required |
|---|---|---|
| `!raidstatus` | `!raidstatus` | Any |
| `!lockserver` | `!lockserver` | Administrator |
| `!unlockserver` | `!unlockserver` | Administrator |

**Examples:**
```
!raidstatus
!lockserver
!unlockserver
```

---

### Announcements & Polls

| Command | Usage | Permission Required |
|---|---|---|
| `!announce` | `!announce #channel <message>` | Manage Messages |
| `!dm` | `!dm @user <message>` | Administrator |
| `!poll` | `!poll <question> \| <opt1> \| <opt2> ...` | Manage Messages |

**Examples:**
```
!announce #general Server maintenance at 9PM UTC tonight.
!dm @User123 Your support ticket has been resolved.
!poll Favorite color? | Red | Blue | Green | Yellow
```

> 💡 Polls support up to 10 options. Members react with number emojis to vote.

---

### Voice Management

| Command | Usage | Permission Required |
|---|---|---|
| `!voicemute` | `!voicemute @user` | Mute Members |
| `!voiceunmute` | `!voiceunmute @user` | Mute Members |
| `!vcmove` | `!vcmove @user <channel name>` | Move Members |

**Examples:**
```
!voicemute @LoudUser
!vcmove @User AFK
!voiceunmute @LoudUser
```

---

## ⚙️ Configuration

All configuration lives in your `.env` file:

```env
# Required — your bot token from the Discord Developer Portal
DISCORD_TOKEN=your_bot_token_here

# Optional — command prefix (default: !)
PREFIX=!
```

Additional settings you can change directly in `bot.js`:

```js
const RAID_THRESHOLD = 10;     // How many joins per window triggers a raid alert
const RAID_WINDOW_MS = 10_000; // Window in milliseconds (default: 10 seconds)
```

---

## 🖥️ Self-Hosting

### Local (PC / Mac)

The fastest way to run the bot:

```bash
git clone https://github.com/divyanshakya966/Discord-Bot.git
cd Discord-Bot
npm install
cp .env.example .env
# Edit .env with your token
node bot.js
```

**Keep it running with PM2** (auto-restarts on crashes and system reboots):

```bash
npm install -g pm2
pm2 start bot.js --name discord-bot
pm2 save
pm2 startup   # follow the command it prints
```

---

### Railway _(Recommended)_

Railway is the easiest free cloud option.

1. Push this project to a GitHub repository (do **not** include `.env`)
2. Sign up at [https://railway.app](https://railway.app)
3. Click **New Project → Deploy from GitHub Repo**
4. Select your repository
5. Go to **Variables** and add:
   - `DISCORD_TOKEN` = your token
   - `PREFIX` = `!`
6. Railway detects Node.js automatically and runs `npm start`

Your bot is now live 24/7. 🎉

---

### VPS (Ubuntu / Debian)

Best for full control and lowest long-term cost (~$5/month on DigitalOcean, Hetzner, or Linode).

```bash
# 1. Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone the repo
git clone https://github.com/divyanshakya966/Discord-Bot.git
cd Discord-Bot

# 3. Install dependencies
npm install

# 4. Create .env
nano .env
# Paste your token, save with Ctrl+O, exit with Ctrl+X

# 5. Install PM2 and start the bot
npm install -g pm2
pm2 start bot.js --name discord-bot
pm2 save
pm2 startup   # run the command it prints with sudo
```

---

### Heroku

```bash
# 1. Add a Procfile to the project root
echo "worker: node bot.js" > Procfile

# 2. Deploy
heroku create your-bot-name
heroku config:set DISCORD_TOKEN=your_token_here PREFIX=!
git add Procfile
git commit -m "Add Procfile"
git push heroku main

# 3. Scale the worker dyno
heroku ps:scale worker=1
```

---

## 🔐 Permission Requirements

The bot checks permissions before running every command. Here's what each staff role level needs:

| Command Category | Discord Permission | Typical Staff Role |
|---|---|---|
| Ban / Unban | Ban Members | Admin / Senior Mod |
| Kick | Kick Members | Moderator |
| Mute / Unmute / Warn | Moderate Members | Moderator |
| Purge Messages | Manage Messages | Moderator |
| Manage Roles | Manage Roles | Admin |
| Manage Channels | Manage Channels | Admin |
| Server Lock / Unlock | Administrator | Admin |
| DM Users | Administrator | Admin |
| Voice Mute / Move | Mute Members / Move Members | Moderator |

> ⚠️ The bot's own role must be **above** any role it tries to manage in Server Settings → Roles. If the bot can't kick or ban someone, check this first.

---

## 🤖 Auto-Moderation

The bot automatically enforces these rules without any command:

| Rule | Action | Bypass |
|---|---|---|
| Discord invite links (`discord.gg/...`) | Message deleted + warning sent | Administrator permission |
| Member join flood (see Anti-Raid) | Alert posted + new accounts auto-kicked | N/A |

The auto-mod rules are in the **second** `MessageCreate` handler near the bottom of `bot.js`. You can add more rules there.

---

## 🛡️ Anti-Raid System

The bot automatically monitors every member join. When the number of joins exceeds `RAID_THRESHOLD` within `RAID_WINDOW_MS`:

1. A **🚨 RAID ALERT** embed is posted to your configured log channel
2. Any joining account **younger than 7 days** is automatically kicked
3. You can immediately run `!lockserver` to prevent further joins from messaging

```
RAID_THRESHOLD = 10   → 10+ joins in 10 seconds triggers the alert
RAID_WINDOW_MS = 10000 → 10-second sliding window
```

Adjust both values in `bot.js` to match your server's normal activity level.

---

## 🛠️ Customization Guide

### Change the command prefix

Edit `.env`:
```env
PREFIX=?
```

### Add a new command

Find the `MessageCreate` handler in `bot.js` and add a new `if` block:

```js
if (command === 'hello') {
  return msg.reply({ embeds: [embed('👋 Hello!', `Hi ${msg.author}!`, 0x57f287)] });
}
```

### Customize the welcome message

Find the `GuildMemberAdd` event and update the embed text:

```js
member.send({
  embeds: [embed(
    `👋 Welcome to ${guild.name}!`,
    `Welcome ${member.user.username}! Please read #rules before chatting.`,
    0x57f287
  )]
}).catch(() => {});
```

### Add a profanity filter

In the auto-mod `MessageCreate` handler, add after the invite link check:

```js
const BLOCKED_WORDS = ['word1', 'word2', 'word3'];
if (BLOCKED_WORDS.some(w => msg.content.toLowerCase().includes(w))) {
  await msg.delete().catch(() => {});
  const notice = await msg.channel.send(`❌ ${msg.author}, that language is not allowed.`);
  setTimeout(() => notice.delete().catch(() => {}), 5000);
  await sendLog(msg.guild, `🤬 Blocked word used by **${msg.author.tag}** in ${msg.channel}`);
}
```

### Change the raid threshold

```js
const RAID_THRESHOLD = 15;      // Raise for busier servers
const RAID_WINDOW_MS = 15_000;  // Extend the detection window
```

---

## 🗄️ Adding a Database

By default, warnings and config are stored in-memory and reset when the bot restarts. To make them persistent, add [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — it requires no separate server.

```bash
npm install better-sqlite3
```

Replace the in-memory Maps at the top of `bot.js`:

```js
const Database = require('better-sqlite3');
const db = new Database('data.db');

// Create tables once
db.exec(`
  CREATE TABLE IF NOT EXISTS warnings (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT NOT NULL,
    userId  TEXT NOT NULL,
    reason  TEXT NOT NULL,
    by      TEXT NOT NULL,
    date    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    guildId    TEXT PRIMARY KEY,
    logChannel TEXT
  );
`);
```

Then replace warning reads/writes with:

```js
// Add warning
db.prepare('INSERT INTO warnings (guildId, userId, reason, by, date) VALUES (?,?,?,?,?)')
  .run(msg.guild.id, target.id, reason, msg.author.tag, new Date().toISOString());

// Get warnings
const list = db.prepare('SELECT * FROM warnings WHERE guildId = ? AND userId = ?')
  .all(msg.guild.id, target.id);
```

---

## 🐛 Troubleshooting

<details>
<summary><strong>Bot is online but not responding to commands</strong></summary>

- Confirm **Message Content Intent** is enabled in the Developer Portal → Bot → Privileged Gateway Intents
- Confirm the bot has **View Channel** and **Send Messages** permissions in the channel
- Confirm your `PREFIX` in `.env` matches what you're typing (default `!`)
- Make sure you're not DMing the bot — it only responds in servers
</details>

<details>
<summary><strong>Cannot ban / kick / mute a user</strong></summary>

- The bot's **role must be higher** than the target's highest role in Server Settings → Roles
- Server owners can never be banned or kicked by a bot
- Verify the bot was invited with the correct permissions
</details>

<details>
<summary><strong>Error: TOKEN_INVALID</strong></summary>

- Your token may have been reset. Go to Discord Developer Portal → Bot → Reset Token and update `.env`
- Make sure there are no extra spaces or quotes around the token in `.env`
</details>

<details>
<summary><strong>Raid alerts not appearing</strong></summary>

- You must set a log channel first: `!setlog #your-log-channel`
- Config is stored in-memory — re-run `!setlog` after each restart (or add a database)
</details>

<details>
<summary><strong>PM2 not starting after reboot</strong></summary>

```bash
pm2 startup   # copy and run the command it prints (may need sudo)
pm2 save      # save the current process list
```
</details>

<details>
<summary><strong>Cannot purge messages older than 14 days</strong></summary>

This is a Discord API limitation — bulk delete only works on messages under 14 days old. There's no workaround; messages must be deleted one by one via the Discord client for older messages.
</details>

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** this repository
2. **Create a branch**: `git checkout -b feature/my-new-command`
3. **Make your changes** in `bot.js`
4. **Test** thoroughly on a private Discord server
5. **Commit**: `git commit -m "feat: add !mycommand"`
6. **Push**: `git push origin feature/my-new-command`
7. **Open a Pull Request** with a clear description of what you added/changed

### Guidelines

- Keep the single-file structure — no splitting into separate command files unless the project grows significantly
- Every command must include a permission check
- Add your command to the `!help` embed and to this README
- Test that the command fails gracefully with wrong input

### Ideas for Contributions

- [ ] Slash command support (`/ban`, `/kick`, etc.)
- [ ] SQLite persistence out of the box (optional flag)
- [ ] Configurable auto-mod word filter via command
- [ ] Temp-ban with automatic unban after duration
- [ ] Role-based access (e.g., "Moderator" role gets mod commands without needing Discord perms)
- [ ] Starboard system
- [ ] Server statistics tracking

---

<div align="center">

Built with ❤️ using [Discord.js v14](https://discord.js.org)

If this project helped you, consider giving it a ⭐ on GitHub!

</div>