const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paginateText, buildInitialPagedPayload, buildPageContent, indexFromCounterButton, paginationRow, handlePaginationButton } = require('../src/discord/pagination');

test('short text is single page without pager', () => {
  const p = buildInitialPagedPayload('hello', null);
  assert.equal(p.pages.length, 1);
  assert.equal(p.components.length, 0);
  assert.equal(p.paginatorId, null);
});

test('long text paginates with pager row and no footer line', () => {
  const long = 'word '.repeat(1200); // ~6000 chars
  const p = buildInitialPagedPayload(long, null);
  assert.ok(p.pages.length > 1);
  assert.ok(p.paginatorId);
  assert.equal(p.components.length, 1);
  assert.ok(!/Page\s+\d+\s*\//.test(p.content), 'no navigation footer in message text');
  const btns = p.components[0].toJSON().components;
  assert.ok(btns.some(b => /^\d+\/\d+$/.test(b.label)), 'counter button shows position');
  assert.equal(btns.find(b => b.custom_id.startsWith('pg:noop:')).label, `1/${p.pages.length}`);
  for (const page of p.pages) assert.ok(page.length <= 1800, `page ${page.length}`);
  assert.ok(p.content.length <= 2000);
});

test('prev/next buttons walk pages in place', async () => {
  const long = 'para. '.repeat(800);
  const first = buildInitialPagedPayload(long, null);
  let updated = null;
  let message = { content: first.content, components: first.components };
  const mk = (action) => ({
    customId: `pg:${action}:${first.paginatorId}`,
    message,
    update: async (p) => { updated = p; message = { content: p.content, components: p.components }; },
    deferUpdate: async () => {},
    reply: async () => {},
  });
  assert.equal(await handlePaginationButton(mk('next')), true);
  assert.equal(message.components[0].toJSON().components.find(b => b.custom_id.startsWith('pg:noop:')).label, '2/3');
  assert.equal(await handlePaginationButton(mk('prev')), true);
  assert.equal(message.components[0].toJSON().components.find(b => b.custom_id.startsWith('pg:noop:')).label, '1/3');
  assert.equal(updated.content, first.pages[0]);
});

test('page index recovers from the counter button, not message text', () => {
  const rawApiMessage = {
    components: [{ components: [
      { custom_id: 'pg:prev:abc', label: '◀ Prev' },
      { custom_id: 'pg:noop:abc', label: '3/5' },
      { custom_id: 'pg:next:abc', label: 'Next ▶' },
    ] }],
  };
  assert.equal(indexFromCounterButton(rawApiMessage, 5), 2);
  assert.equal(indexFromCounterButton({ content: 'no buttons here' }, 5), null);
  assert.equal(indexFromCounterButton({ components: [] }, 5), null);
});

test('unknown pagination button is noop-safe', async () => {
  assert.equal(await handlePaginationButton({ customId: 'retry' }), false);
});

test('expired pager replies with flags, not deprecated ephemeral', async () => {
  const { MessageFlags } = require('discord.js');
  let replied = null;
  const fake = {
    customId: 'pg:next:deadbeefcafe',
    message: { content: 'Page 1/2' },
    update: async () => { throw new Error('must not update when expired'); },
    deferUpdate: async () => {},
    reply: async (d) => { replied = d; },
  };
  assert.equal(await handlePaginationButton(fake), true);
  assert.equal(replied.flags, MessageFlags.Ephemeral);
  assert.ok(!('ephemeral' in replied), 'must not use deprecated ephemeral option');
});

test('buildPageContent single page has no footer', () => {
  assert.equal(buildPageContent(['hi'], 0), 'hi');
});
