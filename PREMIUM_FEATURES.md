# Premium Features Implementation Guide

## Overview
Your Discord bot now includes four powerful premium features that enhance its capabilities:

1. **Multi-Model Switcher**
2. **Custom AI Personalities**
3. **Programming Code Analysis Mode**
4. **Research Mode with Web Search**

---

## 1. Multi-Model Switcher 🔄

### What It Does
Allows users to switch between different AI models on a per-guild or per-user basis. Each conversation session can use a different model.

### Available Models
- **Google Gemma 4** (Free) - `google/gemma-4-26b-a4b-it:free`
- **Meta Llama 3.1 70B** - `meta-llama/llama-3.1-70b-instruct`
- **Mistral Large** - `mistralai/mistral-large`
- **OpenAI GPT-4 Turbo** - `openai/gpt-4-turbo`
- **Anthropic Claude 3.5 Sonnet** - `anthropic/claude-3.5-sonnet`

### Commands

```
!model list          # View all available models
!model set <id>      # Switch to a specific model
!model current       # See current model in use
```

### How It Works
- Model preferences are stored in `data/model_preferences.json`
- Each guild has its own model preference
- DM users have individual preferences
- Falls back to `OPENROUTER_MODEL` env var if no preference is set

### Example Usage
```
User: !model list
Bot: Shows all available models with IDs

User: !model set claude-3.5-sonnet
Bot: ✅ Switched to **Claude 3.5 Sonnet**

User: !model current
Bot: 📊 Current Model: **Claude 3.5 Sonnet**
```

---

## 2. Custom AI Personalities 🎭

### What It Does
Different conversation personalities with specialized system prompts for different use cases.

### Built-in Personalities

| Name | ID | Use Case |
|------|-----|----------|
| Standard Assistant | `standard` | General-purpose helpful assistant |
| Code Analyzer | `code-analyzer` | Expert code review and optimization |
| Research Assistant | `researcher` | Detailed, sourced research |
| Creative Writer | `creative` | Imaginative writing helper |
| Educational Tutor | `tutor` | Patient, pedagogical explanations |

### Commands

```
!personality list            # View all personalities
!personality set <name>      # Switch personality
!personality current         # See current personality
```

### How It Works
- Personalities stored in `data/personalities.json`
- Each has a unique system prompt that influences AI behavior
- Per-guild and per-user preferences
- Default to 'standard' if not set

### Example Usage
```
User: !personality set code-analyzer
Bot: ✅ Switched to **Code Analyzer**

User: !personality current
Bot: 🎭 Current Personality: **Code Analyzer**

User: !code def fibonacci(n):
      if n <= 1:
          return n
      return fibonacci(n-1) + fibonacci(n-2)
Bot: [Detailed code analysis with optimization suggestions]
```

---

## 3. Code Analysis Mode 💻

### What It Does
Specialized mode for analyzing code snippets with expert-level feedback.

### Features
- Bug detection
- Optimization suggestions
- Security analysis
- Performance improvements
- Explanation of complex logic

### Command

```
!code <code_snippet>
```

### How It Works
- Uses the "Code Analyzer" personality automatically
- Formats code properly for analysis
- Provides detailed feedback on multiple aspects
- Maintains conversation context

### Example Usage
```
User: !code
       const arr = [1, 2, 3];
       for(let i=0; i<arr.length; i++) {
           console.log(arr[i]);
       }

Bot: **Analysis:**
     ✅ Syntax is correct
     ⚠️ Consider using forEach or for...of for cleaner iteration
     💡 Modern approach: arr.forEach(item => console.log(item))
     [Additional analysis]
```

---

## 4. Research Mode 🔍

### What It Does
Combines AI analysis with real-time web search for current, sourced information.

### Features
- Real-time web search
- Current information
- Multiple sources
- Citation-ready results
- Research-focused personality

### Command

```
!research <query>
```

### How It Works
1. User enters a research query
2. Bot searches the web using Serper API
3. Search results are included in the AI prompt
4. AI provides comprehensive analysis with sources

### Requirements
To enable research mode, add to your `.env` file:
```
SERPER_API_KEY=your_serper_api_key
```

Get a free Serper API key at: https://serper.dev

### Example Usage
```
User: !research latest AI breakthroughs 2025

Bot: **Research Results:**
     **Search Results:**
     - [Recent AI article 1]
     - [Recent AI article 2]
     
     **Analysis:**
     [Comprehensive analysis incorporating current information]
```

### Free API Tier
- Serper offers 100 free searches/month
- Perfect for testing and moderate usage
- Upgrade for production use

---

## Setup Instructions

### 1. Basic Setup (All Features Except Research)

```bash
npm install
copy .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_test_server_id
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

Run:
```bash
npm start
```

### 2. Enable Research Mode

1. Get free Serper API key: https://serper.dev
2. Add to `.env`:
   ```
   SERPER_API_KEY=your_serper_api_key
   ```
3. Restart the bot

---

## Data Files

The bot automatically creates and manages:

- **`data/model_preferences.json`** - Stores model choices per guild/user
- **`data/personalities.json`** - Custom personality definitions
- **`data/guild_{id}_channel_{id}.json`** - Conversation history per channel
- **`data/dm_{user_id}.json`** - DM conversation history

All files are automatically created and updated.

---

## Usage Tips

### Combining Features
```
# Set up a specific personality and model, then use code analysis
/personality set name:code-analyzer
/model set model_id:claude-3.5-sonnet
/code code:<your_code>
```

### Using Research for Different Topics
```
/research query:machine learning trends
/research query:historical events
/research query:scientific discoveries
```

### Switching Between Personalities
```
# For creative work
/personality set name:creative

# For learning
/personality set name:tutor

# Back to general chat
/personality set name:standard
```

---

## Environment Variables Summary

### Required
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application/client ID
- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_MODEL` - Default model ID

### Optional Premium Features
- `SERPER_API_KEY` - Enable research mode (get free tier at serper.dev)

### Configuration
- `DISCORD_GUILD_ID` - Optional test server ID for instant slash command updates
- `MAX_HISTORY` - Conversation history length (default: `8`)
- `MAX_TOKENS` - Max response tokens (default: `500`)
- `TEMPERATURE` - AI creativity level (default: `0.7`)

---

## Troubleshooting

### Model Not Switching
- Verify model ID matches available list: `/model list`
- Check OPENROUTER_API_KEY is valid

### Research Mode Not Working
- Ensure SERPER_API_KEY is set
- Verify API key is valid at https://serper.dev
- Check rate limit (100/month on free tier)

### Personality Not Applied
- Verify personality name from: `/personality list`
- Ensure spelling matches exactly

### Code Analysis Not Detailed
- Try the dedicated `/code` command
- Use the "code-analyzer" personality

---

## Advanced Customization

### Add Custom Personalities
Edit `data/personalities.json`:
```json
{
  "my-custom": {
    "name": "My Custom Personality",
    "prompt": "You are a specialized assistant that..."
  }
}
```

Then use:
```
!personality set my-custom
```

### Add More Models
Edit the `AVAILABLE_MODELS` array in `bot.js`:
```javascript
const AVAILABLE_MODELS = [
  // ... existing models ...
  { id: 'new-model-id', name: 'New Model', maxTokens: 500 }
];
```

---

## Support & Resources

- OpenRouter Models: https://openrouter.ai/docs/models
- Serper API: https://serper.dev
- Discord.js: https://discord.js.org/
- Discord Developer Portal: https://discord.com/developers

---

## What's Next?

Consider adding:
- Custom personality creation UI
- User-specific usage tracking
- Model cost estimation
- Scheduled research tasks
- Conversation export (PDF/JSON)
