const chains = new Map();

function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(() => fn());
  chains.set(key, next.catch(() => {}));
  return next;
}

module.exports = { withLock };
