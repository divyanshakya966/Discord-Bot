const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paginateText, buildInitialPagedPayload, buildPageContent, handlePaginationButton } = require('../src/discord/pagination');

test('short text is single page without pager', () => {
  const p = buildInitialPagedPayload('hello', null);
  assert.equal(p.pages.length, 1);
  assert.equal(p.components.length, 0);
  assert.equal(p.paginatorId, null);
});

test('long text paginates with footer and pager row', () => {
  const long = 'word '.repeat(1200); // ~6000 chars
  const p = buildInitialPagedPayload(long, null);
  assert.ok(p.pages.length > 1);
  assert.ok(p.paginatorId);
  assert.equal(p.components.length, 1);
  assert.match(p.content, /Page 1\//);
  for (const page of p.pages) assert.ok(page.length <= 1800, `page ${page.length}`);
  assert.ok(p.content.length <= 2000);
});

test('prev/next buttons walk pages in place', async () => {
  const long = 'para. '.repeat(800);
  const first = buildInitialPagedPayload(long, null);
  let updated = null;
  const mk = (action, content) => ({
    customId: `pg:${action}:${first.paginatorId}`,
    message: { content },
    update: async (p) => { updated = p; },
    deferUpdate: async () => {},
    reply: async () => {},
  });
  assert.equal(await handlePaginationButton(mk('next', first.content)), true);
  assert.match(updated.content, /Page 2\//);
  assert.equal(await handlePaginationButton(mk('prev', updated.content)), true);
  assert.match(updated.content, /Page 1\//);
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
