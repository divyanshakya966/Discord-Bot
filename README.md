# Discord AI Chatbot

A Discord chatbot built with Discord.js and the official OpenRouter SDK — now hardened for reliability, performance, and richer interaction.

## What This Version Does

- Responds in DMs automatically
- Responds in servers when mentioned, when replied to, or via slash command
- Per-user conversation history (per server + per DM), resettable with `/clear`
- Per-user model + personality prefs (fixed: previously guild-wide)
- OpenRouter Chat Completions with retry, timeout, and param-compat fallback
- Long replies auto-split under Discord's 2000-char limit (no more crashes)
- Embeds + buttons (Retry / Continue / Clear) + autocomplete for models/personalities
- Code analysis mode, research mode (cached web search), `/stats`, `/export`
- Cooldowns + input caps to protect API quota; structured logs; graceful shutdown

## Commands

### Basic
- `/help` - Embed with all commands
- `/ping` - Health check (gateway ping)
- `/clear` - Clear your memory for this server/DM
- `/ask question:<question>` - Ask the AI (progressive edits for long answers)
- `/stats` - Your current model/personality
- `/export [format:json|md]` - Export history (JSON file or Markdown)

### Model & Personality (per-user, autocomplete)
- `/model list` - Embed list
- `/model set model:<id>` - Switch model; accepts any valid OpenRouter ID (custom IDs allowed)
- `/model current` - Show current model
- `/personality list` / `/personality set name:<name>` / `/personality current`

**Models:** Nemotron 3 Super (Free, default — zero cost), Auto Free Router, Gemma 4 26B (Free), Llama 3.1 70B, Mistral Large, GPT-4 Turbo, Claude 3.5 Sonnet (+ legacy MythoMax for old prefs). If your model dies, the bot auto-falls-back to the default once.
**Personalities:** Standard, Code Analyzer, Researcher, Creative, Tutor, **Girl** (`girl` — loving, playfully seductive, tasteful PG-13 by default).

### Specialized
- `/code code:<code>` - Expert code review (max 6000 chars by default; text-file attachments also read)
- `/research query:<query>` - Web search + AI synthesis (Serper if configured, else free Wikipedia → DuckDuckGo fallbacks, 10-min cache)

You can also mention the bot, or reply directly to one of its messages to continue.

## Slash Command Setup

1. Copy Application ID into `DISCORD_CLIENT_ID`.
2. Invite with `bot` + `applications.commands` scopes.
3. Run `npm run deploy-commands` after any command change (required after this upgrade — `/model set` signature changed, `/stats` + `/export` added).
4. Restart the bot. Global commands can take minutes to propagate.

## Quick Start

```bash
npm install
cp .env.example .env   # (Windows: copy .env.example .env)
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, OPENROUTER_API_KEY, OPENROUTER_MODEL
npm run deploy-commands
npm start
```

Research mode (optional): add `SERPER_API_KEY` from https://serper.dev for best quality. Without it, a free DuckDuckGo fallback is used automatically — no cost.

## Fedora (KDE Plasma) Local Run — Zero Hosting Cost

This bot is tuned for running on your own Fedora machine. No VPS needed.

```bash
# 1. Node 22 (Fedora 40+)
sudo dnf install -y nodejs npm
node --version  # want >= 18, ideally 22

# 2. Install + configure
npm install
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, OPENROUTER_API_KEY
# OPENROUTER_MODEL defaults to nvidia/nemotron-3-super-120b-a12b:free (verified free)
npm run deploy-commands
npm test

# 3a. Run in foreground (Konsole)
npm start

# 3b. Or run as a user service (auto-restart, survives logout if lingering enabled)
npm run service:install
npm run service:logs     # follow logs (journald)
# manage: npm run service:restart / npm run service:stop
# enable lingering so it runs after logout: loginctl enable-linger $USER
```

Cost-saving defaults for local use: free default model, DuckDuckGo fallback (no Serper needed), cooldowns + input caps, cached prefs/history, 30-day history prune, JSON logs (no external monitoring needed). Data stays in `./data/`.

## Environment Variables

Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (e.g. `nvidia/nemotron-3-super-120b-a12b:free`).

Optional: `OPENROUTER_BASE_URL`, `SYSTEM_PROMPT` (overrides Standard personality), `MAX_HISTORY` (8), `MAX_TOKENS` (1000), `TEMPERATURE` (0.85), `TOP_P`, `FREQUENCY_PENALTY`, `PRESENCE_PENALTY`, `SERPER_API_KEY`.

Safety tuning: `MAX_PROMPT_CHARS` (4000), `MAX_CODE_CHARS` (6000), `COOLDOWN_MS` (4000), `LLM_TIMEOUT_MS` (60000), `LLM_MAX_RETRIES` (2), `LOG_LEVEL` (info), `DATA_DIR` (./data).

## Testing & Ops

```bash
npm test          # node --test tests/*.test.js (56 automated checks)
npm run check     # syntax check
```
- CI (`.github/workflows/ci.yml`): install, syntax check, tests, `npm audit`.
- Docker (optional, not needed locally): `docker build -t discord-bot . && docker run --env-file .env -v ./data:/app/data discord-bot`
- Fedora service: `systemd/discord-bot.service` + `npm run service:*` scripts above.
- Logs are redacted (keys/tokens scrubbed even inside message strings) and never include prompt or reply text. Health via `/ping` + `/stats`.
- `LOG_FORMAT=pretty|json` (default pretty locally, json when `NODE_ENV=production`), `LOG_LEVEL=debug|info|warn|error`.
- `LOG_FILE=./data/bot.log` enables file logging with rotation (`LOG_MAX_BYTES`, default 5MB; `LOG_MAX_FILES`, default 5 keeps `bot.log.1…5`).
- Every AI reply logs one correlated line: session, model, latency ms, and prompt/completion/total tokens for cost tracking.

## Data Storage

- `data/` (gitignored): per-user history `guild_<gid>_user_<uid>.json` / `dm_<uid>.json`, `model_preferences.json`, `personality_preferences.json`, `personalities.json` (custom only).
- Writes are atomic (tmp + rename), per-session serialized, with in-memory cache. History trimmed by turns (MAX_HISTORY) and ~6000-token budget.

## Notes

- Settings are per-user now. Changing model/personality no longer affects the whole server.
- Provider errors shown to users are sanitized; details go to logs.
- If OpenRouter key is missing the bot runs degraded (replies with setup reminder).

## Troubleshooting

- **Bot doesn't respond:** check it is in the server, Message Content intent is on, `DISCORD_TOKEN` is valid, and `npm run deploy-commands` was run after command changes.
- **Slash commands missing:** global commands take minutes to propagate; for instant testing set `DISCORD_GUILD_ID` and redeploy.
- **Model errors / quota:** try `/model list` and pick another model; dead models auto-fall-back to the free default once. Free default is Nemotron 3 Super.
- **Research has no web results:** add `SERPER_API_KEY`, otherwise the free DuckDuckGo fallback applies automatically.
- **Service won't start (Fedora):** run `journalctl --user -u discord-bot -n 50` and verify `.env` values.

## License

MIT
