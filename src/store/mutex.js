const chains = new Map();

function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(() => fn());
  const tracked = next.catch(() => {});
  chains.set(key, tracked);
  tracked.then(() => { if (chains.get(key) === tracked) chains.delete(key); });
  return next;
}

module.exports = { withLock, _chains: chains };
