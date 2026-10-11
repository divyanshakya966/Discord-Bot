const KNOWN = ['help', 'ping', 'clear', 'stats', 'export', 'ask', 'group', 'model', 'personality', 'code', 'research'];

function normalizeInput(text) {
  return String(text || '').trim().replace(/^[/!]+/, '').trim();
}

function parseMentionCommand(text) {
  const clean = normalizeInput(text);
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const first = lower.split(/\s+/)[0];
  if (!KNOWN.includes(first)) return null;
  if (['help', 'ping', 'clear', 'stats'].includes(first) && lower === first) {
    return { command: first, prompt: '' };
  }
  const rest = clean.slice(first.length).trim();
  if (['ask', 'model', 'personality', 'code', 'research', 'export', 'group'].includes(first)) {
    return { command: first, prompt: rest };
  }
  return null;
}

function parsePrefixCommand(content) {
  const raw = String(content || '').trim();
  if (!/^[/!]/.test(raw)) return null;
  return parseMentionCommand(raw);
}

module.exports = { KNOWN, parseMentionCommand, parsePrefixCommand };
