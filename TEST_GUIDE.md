# Quick Test Guide - Premium Features

## Pre-Test Checklist

- [ ] Updated `.env` with DISCORD_TOKEN, OPENROUTER_API_KEY, OPENROUTER_MODEL
- [ ] (Optional) Added SERPER_API_KEY for research mode
- [ ] Ran `npm install` to ensure all dependencies
- [ ] Started bot with `npm start`
- [ ] Bot shows "Logged in as [bot-name]" in console

---

## Test 1: Help Command Updated ✅

```
User: !help
Expected: Shows all new commands (model, personality, code, research)
```

---

## Test 2: Multi-Model Switcher 🔄

```
User: !model list
Expected: Shows 5 available models with IDs

User: !model set meta-llama/llama-3.1-70b-instruct
Expected: ✅ Switched to **Llama 3.1 70B**

User: !model current
Expected: 📊 Current Model: **Llama 3.1 70B**

User: !ask What is machine learning?
Expected: Response from Llama model (should show different style than default)
```

---

## Test 3: Custom Personalities 🎭

```
User: !personality list
Expected: Shows all 5 personalities (Standard, Code Analyzer, Researcher, Creative, Tutor)

User: !personality set tutor
Expected: ✅ Switched to **Educational Tutor**

User: !personality current
Expected: 🎭 Current Personality: **Educational Tutor**

User: !ask Explain quantum computing
Expected: Explanation in educational, step-by-step style
```

---

## Test 4: Code Analysis Mode 💻

```
User: !code
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

Expected: 
- Identifies the algorithm
- Notes performance issues (exponential time)
- Suggests optimization (memoization)
- Provides alternative implementations
```

---

## Test 5: Research Mode 🔍

### Without SERPER_API_KEY:
```
User: !research AI trends 2025
Expected: Web search is not configured. Add SERPER_API_KEY to your .env file.
```

### With SERPER_API_KEY:
```
User: !research latest AI breakthroughs
Expected: 
- Recent web search results shown
- AI provides analysis incorporating current information
- Sources are cited
```

---

## Test 6: Personality-Specific Modes

### Code Analysis with Different Personality:
```
User: !personality set code-analyzer
User: !code print("Hello")
Expected: Detailed analysis of the code snippet
```

### Research with Different Personality:
```
User: !personality set researcher
User: !research climate change
Expected: Well-sourced, detailed research response
```

---

## Test 7: Model + Personality Combinations

```
User: !model set anthropic/claude-3.5-sonnet
User: !personality set creative
User: !ask Write a short poem about coding
Expected: Creative poem from Claude model
```

---

## Test 8: Conversation Memory

```
User: !personality set tutor
User: !ask What is a variable?
[Bot explains]

User: !ask Can you give me an example?
Expected: Bot remembers context, provides example (not just generic response)

User: !clear
User: !ask Give me an example
Expected: Bot doesn't remember previous context
```

---

## Test 9: DM vs Guild Behavior

### In DM with bot:
```
!model set claude-3.5-sonnet
[Use that model]
```

### In guild channel 1:
```
!model set gemma
[Use Gemma]
```

### Back in DM:
```
!ask Hello
Expected: Should still use Claude (DM preferences are separate)
```

---

## Test 10: Error Handling

### Invalid Model:
```
User: !model set invalid-model
Expected: ❌ Model not found: invalid-model
```

### Invalid Personality:
```
User: !personality set nonexistent
Expected: ❌ Personality not found: nonexistent
```

### Missing Code Snippet:
```
User: !code
Expected: Usage: `!code <code_snippet or language>`
```

---

## Troubleshooting

### Issue: Bot doesn't respond to commands
- [ ] Check bot has MESSAGE_CONTENT intent enabled
- [ ] Verify DISCORD_TOKEN is correct
- [ ] Check bot is in the server
- [ ] Verify PREFIX in .env (default is `!`)

### Issue: Model switching doesn't work
- [ ] Verify model ID from `!model list`
- [ ] Check OPENROUTER_API_KEY is valid
- [ ] Ensure model ID format is correct (use ID, not name)

### Issue: Personalities not changing response style
- [ ] Run `!personality current` to verify it's set
- [ ] Try sending a new message (not a cached response)
- [ ] Check personality name spelling matches exactly

### Issue: Research mode says "not configured"
- [ ] Add SERPER_API_KEY to `.env`
- [ ] Restart the bot after adding key
- [ ] Verify API key from https://serper.dev

### Issue: Code analysis not detailed
- [ ] Try using the dedicated `!code` command instead of `!ask`
- [ ] Verify personality is set to "code-analyzer"
- [ ] Ensure code snippet is properly formatted

---

## Performance Notes

- First command may be slower (initializing OpenRouter client)
- Web search adds 1-2 seconds latency (Serper API)
- Large code snippets may take longer to analyze
- Conversation history kept to 8 turns by default (configurable)

---

## Data Files Created

After running these tests, check `data/` folder for:

```
data/
├── model_preferences.json      (stores model choices)
├── personalities.json          (custom personalities)
├── guild_123_channel_456.json  (guild conversation)
└── dm_789.json                 (DM conversation)
```

---

## Success Criteria

✅ All tests pass when you can:
1. Switch models and see different response styles
2. Change personalities and notice behavioral changes
3. Analyze code with expert feedback
4. Research topics with web sources (if SERPER_API_KEY set)
5. Maintain separate settings per guild and DM

---

## Reporting Issues

If tests fail, collect:
- [ ] Console output/error messages
- [ ] Exact command run
- [ ] Expected vs actual output
- [ ] Environment variables set (hide keys)
- [ ] Bot.js file size: Should be ~500+ lines
