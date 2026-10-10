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

module.exports = { startTypingLoop };
