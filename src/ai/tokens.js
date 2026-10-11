function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function historyTokens(history) {
  return history.reduce((n, m) => n + estimateTokens(m.content) + 4, 0);
}

function truncateHistory(history, maxTurns = 8, maxTokens = 6000) {
  const maxEntries = maxTurns * 2;
  let h = history.length > maxEntries ? history.slice(history.length - maxEntries) : [...history];
  while (h.length > 2 && historyTokens(h) > maxTokens) h.splice(0, 2);
  return h;
}

// Output completeness: cuts (token cap, Discord cap) must land on sentence
// boundaries, never mid-word. The model is also told to budget itself.
function isCompleteResponse(text) {
  // Structural check only — a mid-word cut is indistinguishable from a short
  // reply by text alone; finish_reason === 'length' is the authority (completion.js).
  const t = String(text ?? '').trim();
  if (!t) return true;
  const fences = (t.match(/```/g) || []).length;
  if (fences % 2 === 1) return false;
  const lastLine = t.split('\n').pop().replace(/```/g, '');
  if ((lastLine.match(/`/g) || []).length % 2 === 1) return false;
  if (/[,;:—–\-/\\@#]$/.test(t)) return false;
  return true;
}

function findCompleteCut(text, maxChars) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s.length;
  const window = s.slice(0, maxChars + 1);
  // Prefer paragraph > newline > sentence end > clause > space.
  let idx = window.lastIndexOf('\n\n');
  if (idx >= maxChars * 0.5) return idx;
  idx = window.lastIndexOf('\n');
  if (idx >= maxChars * 0.5) return idx + 1;
  const ends = [...window.matchAll(/[.!?…。！？]["'”»`)\]]?\s/g)];
  if (ends.length) {
    const end = ends[ends.length - 1].index + ends[ends.length - 1][0].length;
    if (end >= maxChars * 0.4) return end;
  }
  const clause = Math.max(window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
  if (clause >= maxChars * 0.5) return clause + 1;
  idx = window.lastIndexOf(' ');
  if (idx >= maxChars * 0.4) return idx;
  return maxChars;
}

/**
 * Trim text to maxChars, ending on a sentence/paragraph boundary when
 * possible. Never returns a mid-word fragment if a clean cut exists.
 */function trimToCompleteChars(text, maxChars) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s;
  const cut = findCompleteCut(s, maxChars);
  return s.slice(0, cut).trimEnd();
}

module.exports = { estimateTokens, historyTokens, truncateHistory, isCompleteResponse, findCompleteCut, trimToCompleteChars };
