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

module.exports = { estimateTokens, historyTokens, truncateHistory };
