# Contributing to Discord Management Bot

Thank you for considering contributing! This guide explains how to report bugs, suggest features, and submit code changes.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Style](#coding-style)
- [Commit Message Format](#commit-message-format)

---

## Code of Conduct

Be respectful and constructive. Harassment, hate speech, or personal attacks of any kind will not be tolerated.

---

## Reporting Bugs

Before opening an issue, please:

1. Search [existing issues](../../issues) to make sure it hasn't already been reported.
2. Check that you're running **Node.js 18+** and **discord.js v14**.
3. Check the [Troubleshooting section](README.md#-troubleshooting) in the README.

When opening a bug report, include:

- **Node.js version** (`node --version`)
- **discord.js version** (`npm list discord.js`)
- **What you did** — the exact command you ran
- **What you expected** to happen
- **What actually happened** — paste the full error message / console output

---

## Suggesting Features

Open a [GitHub Discussion](../../discussions) or [Issue](../../issues/new) with the label `enhancement`. Describe:

- What problem does this feature solve?
- How would the command / behavior work?
- Any relevant Discord API limitations to consider?

---

## Development Setup

```bash
# Fork and clone your fork
git clone https://github.com/divyanshakya966/Discord-Bot.git
cd Discord-Bot

# Install dependencies
npm install

# Copy and fill in your token
cp .env.example .env

# Run the bot with auto-restart on file changes (Node 18+)
node --watch bot.js
```

Test all changes on a **private Discord server** you own before submitting.

---

## Submitting a Pull Request

1. Fork the repo and create a feature branch:
   ```bash
   git checkout -b feature/my-feature-name
   ```

2. Make your changes. Keep commits small and focused.

3. Test your changes manually — try the happy path and also invalid inputs.

4. Update the relevant parts of `README.md`:
   - Add your command to the correct table in [Command Reference](README.md#-command-reference)
   - Add it to the `!help` embed inside `bot.js`

5. Push and open a Pull Request:
   ```bash
   git push origin feature/my-feature-name
   ```

6. Fill in the PR template describing what you changed and why.

---

## Coding Style

- Use `const`/`let`, never `var`
- Use `async/await`, never raw `.then()` chains
- All commands **must** include a permission check before executing
- All commands **must** handle missing arguments gracefully (reply with usage hint)
- Keep helper functions at the top of the file, commands in logical groups
- Use the existing `embed()` helper for all Discord embeds — don't build `EmbedBuilder` inline
- Use the existing `hasPerms()` helper for permission checks
- Use `sendLog()` for all audit log entries

**Good:**
```js
if (command === 'example') {
  if (!hasPerms(msg.member, PermissionFlagsBits.ManageMessages))
    return msg.reply('❌ You need **Manage Messages** permission.');
  const target = msg.mentions.users.first();
  if (!target) return msg.reply('❌ Usage: `!example @user`');
  // ... logic
  await sendLog(msg.guild, `✅ Example ran by **${msg.author.tag}** on **${target.tag}**`);
  return msg.reply({ embeds: [embed('✅ Done', `Action completed.`, 0x57f287)] });
}
```

---

## Commit Message Format

Use conventional commit prefixes:

| Prefix | When to use |
|---|---|
| `feat:` | New command or feature |
| `fix:` | Bug fix |
| `docs:` | README or comment changes only |
| `refactor:` | Code change with no behavior change |
| `chore:` | Dependency updates, config changes |

**Examples:**
```
feat: add !tempban command with auto-unban timer
fix: purge not deleting bot message after cleanup
docs: add VPS setup instructions for Arch Linux
refactor: extract permission check into reusable helper
```