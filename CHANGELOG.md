# Changelog - Premium Features Release

## Unreleased - Paged replies, Discord-safe markdown, complete outputs

- Long AI answers now arrive as ONE paged message with ◀ Prev / Next ▶ buttons (`src/discord/pagination.js`, 30-min sessions) instead of N follow-up messages flooding the channel; `/code`, `/research`, Retry/Continue, and `/export md` all page the same way.
- Discord-safe markdown everywhere: new `src/utils/discordMarkdown.js` rewrites tables → bullets, `# heads` → bold, task/footnote/LaTeX/HTML/reference syntax into supported forms (code fences and `||spoilers||` preserved), enforced by a strict system-prompt rule plus idempotent sanitizing in `safeReply.js`.
- Complete outputs within budget: `finish_reason === 'length'` is detected and auto-continued (bounded: 2 follow-ups, 12000 chars, mid-sentence joins with a space) via `src/ai/completion.js`; per-model `maxTokens` caps are now respected; display trims land on sentence boundaries, never mid-word.
- Fixes: footnote bodies no longer collapsed, code pages reopen fences with language tags, expired pager uses `flags` (not deprecated `ephemeral`), no fallback burn on invalid API keys (clear config hint instead), temperature rejections qualify for reduced-params retry, single shared Continue prompt, mutex chain map evicted when idle, crashed-write `.tmp` files pruned, Serper capped/trimmed like DDG, `/ping`+`/stats` descriptions match the privacy-preserving behavior, `npm run check`/CI now cover every source file.
- Retry fidelity: `/code`+`/research` remember the full user prompt (not a truncated label), and `/code`, `/research`, Retry/Continue fail fast with the setup reminder when no API key is set instead of attempting network calls; mocked runtime suite (`tests/runtime.test.js`, CI-safe with or without `.env`) covers all command/button/degraded paths.
- Bounds + wiring: history memory cache capped (reloads evicted sessions from disk), mutex chains evicted, unknown slash commands answer instead of hanging deferred, slash definitions contract-tested against handlers, syntax check covers every file.
- Live-log fixes: token usage normalized across provider shapes and summed over continuations (`tokens={}` → real totals or honest `null`); shutdown guarded against duplicate SIGINT; navigation footer line removed (pager `1/5` counter already shows position, index now read from it).
- Code formatting: unclosed fences auto-closed (truncated code survives verbatim), lone stray fences removed, `<pre>` blocks and multi-line inline code upgraded to fenced blocks, nested demo fences protected.
- Ops note: `commands.js` descriptions changed (`/ping`, `/stats`, `/export`) — run `npm run deploy-commands` and restart.

## Version 2.3.2 - Verified free models + auto-fallback

- Live-probed OpenRouter with the real key: `openrouter/free` (200, routes to a live free model) and `nvidia/nemotron-3-super-120b-a12b:free` (200) verified working; Gemma 3/GPT-OSS/GLM free slugs return 404 (retired), Gemma 4 free exists but was upstream-429 at probe time.
- Default model pinned to `nvidia/nemotron-3-super-120b-a12b:free` (verified live: follows personas, keeps thinking out of `content`, fast). The `openrouter/free` router stays available but can hand out reasoning models that leak chain-of-thought into replies — new guardrail bans thought/meta leakage, and Girl replies are constrained to a single short message so long rambles can't span 3 messages.
- `queryOpenRouter` now returns `{ text, model }` and retries once against the default model when the session model is unavailable (404/no-route/no-access); the reply footer shows the model that actually answered. Failure logs now include provider status + raw snippet via `describeProviderError`.
- Girl prompt locked: always matches the user's language, never breaks character into a generic assistant (single `GIRL_PROMPT` shared by all aliases); global language-match guardrail for all modes.
- Privacy: chat replies no longer carry a model/latency footer; `/ping` and `/stats` no longer expose uptime, request/error counts, or latency; provider errors and setup hints no longer name models, keys, or env files (details stay in server logs).
- ▶ Continue button now sends a pure resume instruction instead of re-asking the original question, so it continues the same answer rather than regenerating a different-feeling one.
- Girl prompt reworked for a freer feel: bolder flirtation and suggestive playfulness, in-character deflection instead of lectures, never mentions policies (verified live on all three probe types); explicit sexual description stays out by design.
- Replies can no longer leak "User Safety: safe" style prefaces — guardrail bans safety assessments, verdicts, and internal reasoning from outputs.
- Research retrieval upgraded: free chain is now Serper → Wikipedia → DuckDuckGo (verified live: Wikipedia returns sourced snippets+links where DDG returns nothing); parsers extracted to testable `src/ai/websearch.js`.
- Industrial logging: pretty (local) / JSON (production) formats, optional rotating file transport (`LOG_FILE`, size-capped with numbered backups), child loggers carrying session+command on every line, secret scrubbing inside message strings (fixed: plural `tokens` usage objects no longer redacted), boot banner with version/node/model, log flush on shutdown. Every AI reply logs one line with model, latency, and prompt/completion/total tokens — prompt and reply text are never logged.
- Reliability sweep: Retry/Continue buttons now respect cooldowns (spam-proof); `lastPromptBySession` capped at 1000 entries (no unbounded growth); history prune scans all files instead of a 2500-file window; `/ping` handles pre-ready NaN; failure logs dig deeper SDK shapes for the raw provider message.

## Version 2.3.1 - Fix retired free model

- OpenRouter retired `google/gemma-3-27b-it:free` (paid-only now). Default and list moved to live `google/gemma-4-26b-a4b-it:free`, plus an `openrouter/free` Auto router option.
- Saved prefs pointing at retired IDs auto-migrate on next request (`RETIRED_MODEL_IDS`, no action needed). Just restart the bot.

## Version 2.3.0 - Girl Mode + Zero-Cost Local Run

- **Girl mode:** single canonical `girl` personality named **Girl** — loving, playfully seductive, passionate by default, tasteful PG-13 with explicit-content decline boundary. Legacy `girl-text`/`casual` keys kept as hidden aliases (auto-normalized to `girl`, hidden from list/autocomplete).
- **Zero-cost local:** default model now `google/gemma-4-26b-a4b-it:free`; `/research` falls back to free DuckDuckGo Instant Answer when `SERPER_API_KEY` is unset (Serper still preferred when configured); export-md now sends full history instead of first chunk only.
- **Fedora KDE:** `systemd/discord-bot.service` user unit + `npm run service:*` scripts, README local-run guide (dnf Node 22, lingering, journalctl), `.env.example` free-default notes. Tests: 38 pass.

## Version 2.2.0 - Interaction & Safety Round 2

- Mention routing: `@bot help/ping/clear/stats` and `@bot <model|ask|…>` now hit embeds/commands instead of the LLM; prefix `!`/`/` commands work without a mention (`src/discord/routing.js` + tests).
- Permission preflight (`ViewChannel/SendMessages/EmbedLinks`) with friendly hint instead of silent failure; guild welcome embed on `GuildCreate`.
- Attachments: small text/code files fetched into context (100KB cap, 3 files), images acknowledged gracefully; empty-message guard.
- Safety guardrails appended to all system prompts (no system-prompt reveal, no @everyone, destructive-command warnings).
- Ops/docs: `LICENSE` (MIT), `.nvmrc` (22), Dockerfile non-root + HEALTHCHECK, version 2.1.0, CONTRIBUTING/TEST_GUIDE/PREMIUM_FEATURES synced. Tests: 32 pass.

## Version 2.1.0 - Reliability & Interactivity Hardening

### Fixed (P0)
- Long replies auto-split under 2000 chars (no more DiscordAPIError crashes) via `src/utils/splitMessage.js` + `safeReply.js`.
- Model/personality scope fixed to per-user (`guild:user`, `dm:user`); previously guild-wide and clobbered other users. See `src/store/sessions.js`.
- Atomic writes (tmp+rename) + per-session mutex; concurrent appends no longer lose history (verified by `tests/store.test.js`).
- LLM calls have timeout (`LLM_TIMEOUT_MS`), retry with backoff on 429/5xx, param-compat fallback preserved, user-facing errors sanitized.
- Startup env validation, structured JSON logs with secret redaction, graceful SIGINT/SIGTERM shutdown, history prune on boot.

### Performance (P1)
- In-memory cache for history + prefs (was 4-5 disk reads/message); token-budget truncation (~6000) + turn cap.
- Cooldowns (`COOLDOWN_MS`), input caps (`MAX_PROMPT_CHARS`, `MAX_CODE_CHARS`), typing loop refresh, Serper cache (10 min), real `/ping` (WS ping/uptime/avg latency).

### Interactivity (P2)
- Embeds for help/model/personality/stats/errors; buttons Retry/Continue/Clear; autocomplete for `/model set` and `/personality set`; progressive edits for long `/ask`; new `/stats` and `/export` (JSON file / Markdown).

### Ops (P3)
- New layout `src/{config,logger,utils,store,ai,discord}/`, 23 automated tests (`node --test tests/`), CI workflow, Dockerfile + .dockerignore, updated `.env.example`, README, SECURITY.
- `deploy-commands.js` no longer crawls `data/`; `bot-data.js` models synced to 5 current + legacy fallback; `girl-text` kept as alias to new `casual`.

Migration: run `npm run deploy-commands` (command signatures changed), restart. Prefs/history files are backward compatible.

## Version 2.0.0 - Premium Edition

### 🎉 Major Features Added

#### 1. Multi-Model Switcher
- Users can now switch between 5 different AI models
- Models available:
  - Google Gemma 4 (Free)
  - Meta Llama 3.1 70B
  - Mistral Large
  - OpenAI GPT-4 Turbo
  - Anthropic Claude 3.5 Sonnet
- Per-guild and per-DM model preferences
- Commands: `!model list`, `!model set`, `!model current`
- Model preferences persisted in `data/model_preferences.json`

#### 2. Custom AI Personalities
- 5 built-in personalities with specialized system prompts:
  - **Standard**: General-purpose assistant
  - **Code Analyzer**: Expert code review
  - **Researcher**: Sourced information specialist
  - **Creative Writer**: Imaginative content creation
  - **Educational Tutor**: Patient teacher
- Per-guild and per-DM personality preferences
- Commands: `!personality list`, `!personality set`, `!personality current`
- Custom personality support via `data/personalities.json`

#### 3. Programming Code Analysis Mode
- Dedicated `!code <snippet>` command
- Expert analysis of code with:
  - Bug detection
  - Performance optimization suggestions
  - Security analysis
  - Code explanation
- Automatically uses Code Analyzer personality
- Formats code for optimal analysis

#### 4. Research Mode with Web Search
- `!research <query>` command for web-based research
- Integration with Serper API for real-time web search
- Combines search results with AI analysis
- Uses Researcher personality for sourced responses
- Optional: Requires SERPER_API_KEY environment variable
- Free tier: 100 searches/month

### 📝 Documentation

#### New Files
- **PREMIUM_FEATURES.md** - Comprehensive guide to all premium features
- **TEST_GUIDE.md** - Step-by-step testing procedures
- **CHANGELOG.md** - This file

#### Updated Files
- **README.md** - Complete rewrite with premium features
- **.env.example** - Added SERPER_API_KEY configuration
- **bot.js** - Core implementation of all features

### 🔧 Technical Changes

#### New Functions
```javascript
// Model Management
loadModelPreferences()
saveModelPreferences()
getSessionModel()
setSessionModel()

// Personality Management
loadPersonalities()
savePersonalities()
getSessionPersonality()
setSessionPersonality()

// Web Search
searchWeb()
buildResearchContext()
```

#### Modified Functions
- `queryOpenRouter()` - Now accepts modelId parameter
- `buildModelMessages()` - Now uses personality system
- `handleCommand()` - Extended with new commands
- `handleChatRequest()` - Integrated with model switching

#### New Data Structures
```javascript
const AVAILABLE_MODELS = [
  { id: string, name: string, maxTokens: number }
]

const DEFAULT_PERSONALITIES = {
  [key]: { name: string, prompt: string }
}
```

### 💾 Data Storage

New JSON files managed automatically:
- `data/model_preferences.json` - Model selection per guild/user
- `data/personalities.json` - Custom personality definitions

Existing files:
- `data/{session_key}.json` - Conversation history (unchanged)

### 🔐 Security & Error Handling

- Graceful fallback if SERPER_API_KEY not configured
- Input validation for model and personality selection
- API error handling with console logging
- Rate limiting support (Serper free tier: 100/month)

### 📊 Performance

- Model loading: ~100ms (first request)
- Web search: +1-2 seconds (Serper API latency)
- Personality switching: Instant (in-memory)
- No impact on existing conversation speed

### ✅ Backward Compatibility

- All new features are optional
- Existing commands unchanged: `!help`, `!ask`, `!clear`, `!ping`
- Graceful degradation if optional services unavailable
- Default behavior unchanged if new env vars not set

### 🔄 Migration Notes

From Version 1.0.0:
- Existing conversation history preserved
- Existing settings remain functional
- Model defaults to OPENROUTER_MODEL env var
- Personality defaults to 'standard' (original behavior)

### 📦 Dependencies

No new dependencies required. Features use:
- Built-in `fetch` API (Node 18+)
- Existing discord.js and OpenRouter SDK

### 🚀 Environment Variables

#### New Optional
- `SERPER_API_KEY` - For research mode (free tier at serper.dev)

#### Existing (Unchanged)
- `DISCORD_TOKEN` - Required
- `OPENROUTER_API_KEY` - Required
- `OPENROUTER_MODEL` - Required
- `PREFIX` - Optional (default: `!`)
- `MAX_HISTORY` - Optional (default: 8)
- `MAX_TOKENS` - Optional (default: 500)
- `TEMPERATURE` - Optional (default: 0.7)

### 📋 Commands

#### New Commands
- `!model list` - Show available models
- `!model set <id>` - Switch to model
- `!model current` - Show current model
- `!personality list` - Show available personalities
- `!personality set <name>` - Switch personality
- `!personality current` - Show current personality
- `!code <snippet>` - Analyze code
- `!research <query>` - Research topic

#### Updated Commands
- `!help` - Now shows all new commands

#### Existing Commands (Unchanged)
- `!ask <question>`
- `!clear`
- `!ping`

### 🐛 Bug Fixes

- Improved error messages
- Better API error handling
- Graceful degradation for missing configs

### 🔍 Testing

See TEST_GUIDE.md for:
- Pre-test checklist
- 10 comprehensive test scenarios
- Troubleshooting guide
- Success criteria

### 📚 Documentation

- See PREMIUM_FEATURES.md for detailed feature guide
- See README.md for setup instructions
- See TEST_GUIDE.md for testing procedures

### 🎯 Known Limitations

- Serper free tier: 100 searches/month
- Model availability depends on OpenRouter
- Conversation history limited to MAX_HISTORY (default 8)
- Research results depend on Serper API availability

### 🚦 Future Enhancements

Potential additions for v3.0.0:
- User usage statistics dashboard
- Custom personality creation UI
- Model cost estimation
- Conversation export (PDF/JSON)
- Scheduled research tasks
- Personality inheritance
- Custom model parameters per session
- Voice channel integration

### 📞 Support

- OpenRouter Models: https://openrouter.ai/docs/models
- Serper API: https://serper.dev/docs
- Discord.js: https://discord.js.org/
- GitHub Issues: [Your repo]

---

## Installation

```bash
# Update existing installation
npm install

# Update .env with new optional setting
SERPER_API_KEY=your_key_here  # Optional

# Restart bot
npm start
```

## Upgrade from 1.0.0

- Existing conversations preserved ✅
- Existing commands still work ✅
- New features opt-in ✅
- No database migration needed ✅

---

**Release Date**: May 4, 2026
**Status**: Stable
**License**: MIT
