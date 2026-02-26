# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest (`main` branch) | ✅ Yes |
| Older tagged releases | ❌ No — please update to latest |

---

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security issue (e.g., a command bypass that allows unprivileged users to run admin commands, a token leak vector, or a way to crash the bot remotely), please report it privately:

1. Email: **your-email@example.com** (replace with your actual contact)
2. Or use [GitHub's private vulnerability reporting](../../security/advisories/new) if enabled on this repo.

Include in your report:

- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fix if you have one

You can expect an acknowledgement within **48 hours** and a fix or mitigation within **7 days** for critical issues.

---

## Security Best Practices for Bot Operators

- **Never commit your `.env` file.** The `.gitignore` in this project excludes it automatically.
- **Rotate your token immediately** if it is ever accidentally exposed (e.g., pushed to a public repo). Do this in the [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Reset Token.
- **Run the bot as a non-root user** on VPS deployments.
- **Keep dependencies updated** regularly:
  ```bash
  npm update discord.js
  npm audit
  ```
- **Do not invite the bot with Administrator** to servers you don't fully control. Use minimum required permissions instead.
- **Restrict sensitive commands** (`!lockserver`, `!dm`, `!ban`) to trusted staff roles via Discord's role hierarchy.