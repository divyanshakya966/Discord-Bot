const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectAttachmentContext, fetchAttachmentText } = require('../src/discord/attachments');

function msgWith(atts) {
  return { attachments: new Map(atts.map((a, i) => [String(i), a])) };
}

test('no attachments passes prompt through', async () => {
  const r = await collectAttachmentContext(msgWith([]), 'hello');
  assert.equal(r.prompt, 'hello');
  assert.deepEqual(r.notes, []);
});

test('text attachment is inlined as a fenced block', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => 'line1\nline2' });
  try {
    const r = await collectAttachmentContext(msgWith([{ name: 'a.txt', size: 10, url: 'https://x/a.txt' }]), 'review this');
    assert.match(r.prompt, /review this/);
    assert.match(r.prompt, /```\nline1\nline2\n```/);
    assert.ok(r.notes.some(n => n.includes('a.txt')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('images noted, unsupported skipped, failures tolerated, capped at 3', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('net down'); };
  try {
    const r = await collectAttachmentContext(msgWith([
      { name: 'p.png', size: 10, contentType: 'image/png', url: 'https://x/p.png' },
      { name: 'b.bin', size: 10, contentType: 'application/octet-stream', url: 'https://x/b.bin' },
      { name: 't.txt', size: 10, url: 'https://x/t.txt' },
      { name: 'extra.txt', size: 10, url: 'https://x/e.txt' },
    ]), 'base');
    assert.match(r.prompt, /base/);
    assert.ok(r.notes.some(n => n.startsWith('image')));
    assert.ok(r.notes.some(n => n.startsWith('skipped')));
    assert.ok(r.notes.some(n => n.startsWith('could not read')));
    assert.equal(r.notes.length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('fetchAttachmentText throws on bad status', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    await assert.rejects(() => fetchAttachmentText({ url: 'https://x/missing' }));
  } finally {
    globalThis.fetch = realFetch;
  }
});
