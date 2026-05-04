# Discord OpenRouter Chatbot

A lightweight Discord chatbot built with Discord.js and the official OpenRouter SDK.

## What This Version Does

- Responds in DMs automatically
- Responds in servers when:
  - The bot is mentioned, or
  - A chatbot command is used with the configured prefix
- Maintains short per-channel/per-DM conversation history
- Supports resettable chat memory
- Uses OpenRouter Chat Completions API

## Commands

- `!help` - Show help text
- `!ping` - Health check
- `!clear` - Clear conversation memory for current channel/DM
- `!ask <question>` - Ask the model directly

You can also mention the bot and type your prompt.

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

4. Start the bot:

```bash
npm start
```

## Environment Variables

Required:

- `DISCORD_TOKEN` - Discord bot token
- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_MODEL` - Model ID from OpenRouter, for example `google/gemma-4-26b-a4b-it:free`

Optional:

- `OPENROUTER_BASE_URL` - Defaults to `https://openrouter.ai/api/v1`
- `PREFIX` - Defaults to `!`
- `SYSTEM_PROMPT` - System instruction used for model behavior
- `MAX_HISTORY` - Number of recent turns to keep (default `8`)
- `MAX_TOKENS` - Max output tokens per request (default `500`)
- `TEMPERATURE` - Sampling temperature (default `0.7`)

## Discord Developer Portal Setup

Enable these intents for your bot:

- Message Content Intent
- Server Members Intent (optional for this version)
- Presence Intent (not required)

For this chatbot version, the critical intent is Message Content Intent.

## Notes

- Conversation memory is saved to `data/` and persists across restarts.
- The `data/` folder is ignored by Git so local chat logs stay out of commits.
- If OpenRouter credentials are missing, the bot will send a setup reminder instead of calling the API.

## License

MIT