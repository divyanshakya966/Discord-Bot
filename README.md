# Discord OpenRouter Chatbot - Premium Edition

A lightweight Discord chatbot built with Discord.js and the official OpenRouter SDK, now featuring advanced AI capabilities.

## What This Version Does

- Responds in DMs automatically
- Responds in servers when:
  - The bot is mentioned, or
  - A slash command is used
- Maintains short per-channel/per-DM conversation history
- Supports resettable chat memory
- Uses OpenRouter Chat Completions API
- **NEW: Switch between multiple AI models per session**
- **NEW: Custom AI personalities with specialized modes**
- **NEW: Slash command responses are single-message and reliable**
- **NEW: Code analysis mode with expert programming feedback**
- **NEW: Research mode with web search integration**

## Premium Features

### 🔄 Multi-Model Switcher
Switch between different AI models with a single command. Each session/guild can have its own preferred model.

- `/model list` - View available models
- `/model set model_id:<id>` - Switch to a different model
- `/model current` - Show current model

**Available Models:**
- Google Gemma 4 (Free)
- Meta Llama 3.1 70B
- Mistral Large
- OpenAI GPT-4 Turbo
- Anthropic Claude 3.5 Sonnet

### 🎭 Custom AI Personalities
Select different AI personalities for different conversational styles. Each personality has a specialized system prompt.

- `/personality list` - View available personalities
- `/personality set name:<name>` - Switch personality
- `/personality current` - Show current personality

**Built-in Personalities:**
- **Standard** - General-purpose assistant
- **Code Analyzer** - Expert code review and optimization
- **Researcher** - Research assistant with sourced information
- **Creative Writer** - Imaginative and engaging writing helper
- **Educational Tutor** - Patient educator for learning

### 💻 Code Analysis Mode
Get expert analysis on code snippets with bug detection, optimization suggestions, and detailed explanations.

- `/code code:<code>` - Analyze code with expert mode

### 🔍 Research Mode
Search the web and get comprehensive information on any topic with sources.

- `/research query:<query>` - Research a topic with web search

## Commands

### Basic Commands
- `/help` - Show all available commands
- `/ping` - Health check
- `/clear` - Clear conversation memory for current channel/DM
- `/ask question:<question>` - Ask the model directly

All slash commands respond with a single final message when possible to keep the UI clean and reliable.

### Model & Personality Commands
- `/model list` - List available AI models
- `/model set model_id:<id>` - Switch to a different model (type any valid OpenRouter model ID)
- `/model current` - Show current model
- `/personality list` - List available personalities
- `/personality set name:<name>` - Switch personality
- `/personality current` - Show current personality

### Specialized Modes
- `/code code:<code>` - Analyze code with expert mode
- `/research query:<query>` - Search and research a topic

You can also mention the bot and type your prompt.

## Slash Command Setup

Slash commands only appear after Discord knows about them. Do this once after you add or change commands:

1. In the Discord Developer Portal, open your application and copy the **Application ID** into `DISCORD_CLIENT_ID`.
2. Invite the bot with both `bot` and `applications.commands` scopes.
3. Run `npm run deploy-commands`.
4. Restart the bot.

Global commands can take longer to propagate than guild-scoped ones, but you do not need any extra server ID setup for the default workflow.

For the cleanest user experience, the bot defers slash commands immediately and sends a single final reply for commands like `/ask`, `/code`, and `/research`.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
copy .env.example .env
```

3. Fill in at least:

- `DISCORD_TOKEN`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

4. (Optional) For Research Mode, add:

- `SERPER_API_KEY` - Get free tier at https://serper.dev

5. Start the bot:

```bash
npm start
```

## Environment Variables

### Required

- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application/client ID used to register slash commands
- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_MODEL` - Default model ID from OpenRouter, e.g., `google/gemma-4-26b-a4b-it:free`

### Optional

- `OPENROUTER_BASE_URL` - Defaults to `https://openrouter.ai/api/v1`
- `SYSTEM_PROMPT` - Default system instruction (overridden by personalities)
- `MAX_HISTORY` - Number of recent turns to keep (default `8`)
- `MAX_TOKENS` - Max output tokens per request (default `500`)
- `TEMPERATURE` - Sampling temperature (default `0.7`)
- `SERPER_API_KEY` - For research mode web search (optional, get free tier at serper.dev)

## Discord Developer Portal Setup

Enable these intents for your bot:

- Message Content Intent
- Server Members Intent (optional for this version)
- Presence Intent (not required)

For this chatbot version, the critical intent is Message Content Intent.

## Data Storage

- Conversation memory is saved to `data/` and persists across restarts
- Model preferences are stored per guild/user
- Custom personalities are stored per guild/user
- The `data/` folder is ignored by Git so local chat logs stay out of commits

## Notes

- Each guild/user can have different model and personality settings
- Conversation history is maintained separately per channel/DM
- If OpenRouter credentials are missing, the bot will send a setup reminder
- Research mode requires SERPER_API_KEY for web search functionality
- Model IDs must match those available on OpenRouter

## License

MIT