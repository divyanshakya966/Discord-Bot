function getUserId(source) {
  return source?.author?.id || source?.user?.id || 'unknown';
}

function getSessionKey(source) {
  const uid = getUserId(source);
  if (source?.guildId) return `guild:${source.guildId}:user:${uid}`;
  return `dm:${uid}`;
}

function getModelKey(source) {
  return getSessionKey(source);
}

function getPersonalityKey(source) {
  return getSessionKey(source);
}

function getHistoryFilePath(dataDir, sessionKey) {
  const sanitized = String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = require('path');
  return path.join(dataDir, sanitized + '.json');
}

module.exports = { getUserId, getSessionKey, getModelKey, getPersonalityKey, getHistoryFilePath };
