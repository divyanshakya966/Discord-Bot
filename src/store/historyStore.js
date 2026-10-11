const { readJson, atomicWriteFile, ensureDir } = require('./atomic');
const { withLock } = require('./mutex');
const { getHistoryFilePath } = require('./sessions');
const { truncateHistory } = require('../ai/tokens');
const path = require('path');

function createHistoryStore({ dataDir, maxHistory = 8, maxTokens = 6000, maxCachedSessions = 1000 } = {}) {
  const cache = new Map();

  // Disk is the source of truth, so dropping a memory copy is safe.
  function setCached(sessionKey, history) {
    cache.delete(sessionKey);
    cache.set(sessionKey, history);
    while (cache.size > maxCachedSessions) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function load(sessionKey) {
    if (cache.has(sessionKey)) return cache.get(sessionKey);
    const fp = getHistoryFilePath(dataDir, sessionKey);
    const data = await readJson(fp, []);
    const arr = Array.isArray(data) ? data : [];
    setCached(sessionKey, arr);
    return arr;
  }

  async function save(sessionKey, history) {
    setCached(sessionKey, history);
    const fp = getHistoryFilePath(dataDir, sessionKey);
    return withLock(`history:${sessionKey}`, () => atomicWriteFile(fp, JSON.stringify(history, null, 2)));
  }

  async function append(sessionKey, userPrompt, assistantReply) {
    return withLock(`history:${sessionKey}`, async () => {
      let history;
      if (cache.has(sessionKey)) history = cache.get(sessionKey);
      else {
        const fp = getHistoryFilePath(dataDir, sessionKey);
        const data = await readJson(fp, []);
        history = Array.isArray(data) ? data : [];
        setCached(sessionKey, history);
      }
      history.push({ role: 'user', content: userPrompt });
      history.push({ role: 'assistant', content: assistantReply });
      const trimmed = truncateHistory(history, maxHistory, maxTokens);
      history.length = 0;
      history.push(...trimmed);
      const fp = getHistoryFilePath(dataDir, sessionKey);
      await atomicWriteFile(fp, JSON.stringify(history, null, 2));
      return history;
    });
  }

  async function clear(sessionKey) {
    cache.delete(sessionKey);
    const fp = getHistoryFilePath(dataDir, sessionKey);
    return withLock(`history:${sessionKey}`, async () => {
      const fs = require('fs').promises;
      try { await fs.unlink(fp); } catch {}
    });
  }

  function invalidate(sessionKey) { cache.delete(sessionKey); }

  return { load, save, append, clear, invalidate, _cache: cache };
}

// Cached JSON store (model/personality prefs).
function createJsonStore(fileName, { dataDir } = {}) {
  const filePath = path.join(dataDir, fileName);
  let cache = null;
  let loaded = false;

  async function load() {
    if (loaded) return cache;
    cache = await readJson(filePath, {});
    if (!cache || typeof cache !== 'object') cache = {};
    loaded = true;
    return cache;
  }

  async function save(obj) {
    cache = obj;
    loaded = true;
    await ensureDir(dataDir);
    return withLock(`json:${fileName}`, () => atomicWriteFile(filePath, JSON.stringify(obj, null, 2)));
  }

  async function get(key) {
    const all = await load();
    return all[key];
  }

  async function set(key, value) {
    const all = await load();
    all[key] = value;
    await save(all);
    return value;
  }

  function invalidate() { loaded = false; cache = null; }

  return { load, save, get, set, invalidate };
}

module.exports = { createHistoryStore, createJsonStore };
