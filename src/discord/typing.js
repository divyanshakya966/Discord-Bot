function startTypingLoop(channel, intervalMs = 9000) {
  if (!channel || typeof channel.sendTyping !== 'function') return () => {};
  let stopped = false;
  channel.sendTyping().catch(() => {});
  const t = setInterval(() => {
    if (stopped) return;
    channel.sendTyping().catch(() => {});
  }, intervalMs);
  t.unref?.();
  return () => { stopped = true; clearInterval(t); };
}

function humanTypingDurationMs(text, random = Math.random) {
  const chars = String(text || '').trim().length;
  if (!chars) return 0;
  const base = Math.min(3200, 700 + chars * 22);
  const jitter = Math.floor(random() * 700);
  return base + jitter;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHumanTyping(text, startedAt = Date.now(), random = Math.random) {
  const remaining = humanTypingDurationMs(text, random) - (Date.now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

module.exports = { startTypingLoop, humanTypingDurationMs, waitForHumanTyping };
