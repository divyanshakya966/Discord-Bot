const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Write to tmp then rename (POSIX-atomic on the same filesystem).
async function atomicWriteFile(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, filePath);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = { ensureDir, atomicWriteFile, readJson };
