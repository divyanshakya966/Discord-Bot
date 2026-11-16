# Discord AI Chatbot

A Discord chatbot built with Discord.js, a local Ollama provider, and an optional OpenRouter fallback — hardened for reliability, performance, and richer interaction.

## What This Version Does

- Responds in DMs automatically
- Responds in servers when mentioned, when replied to, or via slash command
- Per-user conversation history (per server + per DM), resettable with `/clear`
- Per-user model + personality prefs
- Local Ollama chat as the default provider (no remote credits), with an optional OpenRouter fallback
- Retry, timeout, provider fallback, and param-compat handling
- Long replies arrive as one paged message with ◀ Prev / Next ▶ buttons (no channel flooding); code blocks stay fenced on every page
- Discord-safe markdown (no raw tables/HTML/LaTeX) + auto-continued complete answers within the output token budget
- Embeds + buttons (Retry / Continue / Clear) + autocomplete for models/personalities
- Code analysis mode, research mode (cached web search), `/stats`, `/export`
- Group discussion mode (`/group on`): one shared memory per channel, answers draw on everyone's messages
- Cooldowns + input caps to protect API quota; structured logs; graceful shutdown

## Commands

### Basic
- `/help` - Embed with all commands
- `/ping` - Health check (gateway ping + whether local Ollama is online)
- `/clear` - Clear your memory for this server/DM
- `/ask question:<question>` - Ask the AI (one paged answer with Prev/Next buttons)
- `/stats` - Your current model/personality + local AI health
- `/export [format:json|md]` - Export history (JSON file or paged Markdown)

### Model & Personality (per-user, autocomplete)
- `/model list` - Models grouped by local Ollama and optional OpenRouter
- `/model set model:<id>` - Switch model; local `ollama/<name>` IDs or any valid OpenRouter ID (custom IDs allowed)
- `/model current` - Show current model
- `/personality list` / `/personality set name:<name>` / `/personality current`

### Group discussion (shared memory per channel)
- `/group on` - Remember everyone's messages in this channel (needs Manage Channels, or bot owner via `BOT_OWNER_IDS`)
- `/group status` - Show mode + saved message count · `/group off` · `/group clear` (wipe shared history, mods only)

**How it works:** in a group channel the bot silently records discussion and answers mentions/replies/`/ask` from the shared history (one `group_<channel>.json` file) — every turn, chatter and answers alike, is tagged by its author's server display name. Model, personality, cooldowns and Retry memory stay per-user; `/clear` and `/export` stay personal. Retry/Continue/Clear buttons always act on the clicker's own session — nobody can trigger them on another user's behalf.

**Local models (Ollama, default):** Llama 3.2 3B (general, default — ~2 GB), Qwen3 4B (reasoning/creative), Qwen3 1.7B (fast), Qwen2.5 Coder 7B and 7B Lite (code). The bot talks to `http://127.0.0.1:11434/v1`; start it with `ollama serve` and pull models with `ollama pull <name>`.
**Remote models (optional fallback):** Nemotron 3 Super (Free), Auto Free Router, Gemma 4 26B (Free), Llama 3.1 70B, Mistral Large, GPT-4 Turbo, Claude 3.5 Sonnet (+ legacy MythoMax). These are used only if the local model fails or a user explicitly selects one.
**Personalities are model-wired:** Standard/Tutor → Llama 3.2 3B · Code Analyzer → Qwen2.5 Coder 7B · Researcher/Creative/Girl → Qwen3 4B. Selecting a personality also selects its tuned model; `/model set` can override it afterwards.

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
npm run models:pull   # llama3.2:3b + qwen3:4b + qwen2.5-coder:7b
cp .env.example .env   # (Windows: copy .env.example .env)
# fill DISCORD_TOKEN and DISCORD_CLIENT_ID; local Ollama works out of the box
npm run deploy-commands
npm start
```

OpenRouter is optional: set `OPENROUTER_API_KEY` only if you want a cloud fallback or cloud-only models. Research mode (optional): add `SERPER_API_KEY` from https://serper.dev for best quality. Without it, a free DuckDuckGo fallback is used automatically — no cost.

## Fedora (KDE Plasma) Local Run — Zero Hosting Cost

This bot is tuned for running on your own Fedora machine. No VPS needed.

```bash
# 1. Node 22 (Fedora 40+)
sudo dnf install -y nodejs npm
node --version  # want >= 18, ideally 22

# 2. Install + configure
npm install
npm run models:pull   # recommended local model set
cp .env.example .env
# fill DISCORD_TOKEN and DISCORD_CLIENT_ID
# local defaults: LOCAL_MODEL=llama3.2:3b, DEFAULT_MODEL=ollama/llama3.2:3b
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

Cost-saving defaults for local use: local Ollama default model (no API credits), DuckDuckGo fallback (no Serper needed), cooldowns + input caps, cached prefs/history, 30-day history prune, JSON logs (no external monitoring needed). Data stays in `./data/`.

## Environment Variables

Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. AI works locally by default.

Local AI: `LOCAL_MODEL` (`llama3.2:3b`), `OLLAMA_BASE_URL` (`http://127.0.0.1:11434/v1`), `OLLAMA_API_KEY` (`ollama`), `DEFAULT_MODEL` (defaults to `ollama/<LOCAL_MODEL>`).

Optional remote fallback: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (e.g. `nvidia/nemotron-3-super-120b-a12b:free`), `OPENROUTER_BASE_URL`.

Other: `SYSTEM_PROMPT` (overrides Standard personality), `MAX_HISTORY` (8), `MAX_TOKENS` (1000), `TEMPERATURE` (0.85), `TOP_P`, `FREQUENCY_PENALTY`, `PRESENCE_PENALTY`, `SERPER_API_KEY`.

Safety tuning: `MAX_PROMPT_CHARS` (4000), `MAX_CODE_CHARS` (6000), `COOLDOWN_MS` (4000), `LLM_TIMEOUT_MS` (60000), `LLM_MAX_RETRIES` (2), `LOG_LEVEL` (info), `DATA_DIR` (./data).

## Testing & Ops

```bash
npm test          # node --test tests/*.test.js (full automated suite)
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

- Settings are per-user. Changing model/personality no longer affects the whole server.
- Provider errors shown to users are sanitized; details go to logs.
- If both `LOCAL_MODEL` and `OPENROUTER_API_KEY` are empty the bot runs degraded (replies with setup reminder). With Ollama running locally, no OpenRouter key is needed.

## Troubleshooting

- **Bot doesn't respond:** check it is in the server, Message Content intent is on, `DISCORD_TOKEN` is valid, and `npm run deploy-commands` was run after command changes.
- **Slash commands missing:** global commands take minutes to propagate; for instant testing set `DISCORD_GUILD_ID` and redeploy.
- **Local model errors:** ensure `ollama serve` is running and `ollama list` shows the model. If a personality model was never pulled, run `ollama pull qwen3:4b` / `ollama pull qwen2.5-coder:7b`, or pick another with `/model list`.
- **Model errors / quota:** try `/model list` and pick another model; failed models fall back to the local default, then to OpenRouter if configured.
- **Research has no web results:** add `SERPER_API_KEY`, otherwise the free DuckDuckGo fallback applies automatically.
- **Service won't start (Fedora):** run `journalctl --user -u discord-bot -n 50` and verify `.env` values.

## License

MIT
