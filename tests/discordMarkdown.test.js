const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toDiscordMarkdown } = require('../src/utils/discordMarkdown');

test('tables become bullet lists, no raw pipes', () => {
  const out = toDiscordMarkdown('| Name | Age |\n|---|---|\n| Alice | 30 |');
  assert.ok(!out.includes('| Name |'));
  assert.match(out, /•/);
  assert.match(out, /Alice/);
});

test('headings become bold', () => {
  assert.equal(toDiscordMarkdown('### Hello'), '**Hello**');
});

test('task lists, footnotes, latex, html, hr, pings sanitized', () => {
  const out = toDiscordMarkdown('- [ ] a\n- [x] b\nSee[^1]\n$$x^2$$\n<b>hi</b>\n***\n@everyone');
  assert.match(out, /☐/);
  assert.match(out, /☑/);
  assert.ok(!out.includes('[^1]'));
  assert.ok(!out.includes('<b>'));
  assert.ok(!out.includes('@everyone'));
  assert.match(out, /`x\^2`/);
});

test('spoilers and code fences preserved', () => {
  const out = toDiscordMarkdown('||secret|| and ```\n| keep |\n```');
  assert.match(out, /\|\|secret\|\|/);
  assert.match(out, /\| keep \|/);
});

test('supported markdown untouched', () => {
  const out = toDiscordMarkdown('**b** *i* __u__ ~~s~~ `c` > q - l [a](http://x)');
  assert.match(out, /\*\*b\*\*/);
  assert.match(out, /\[a\]\(http:\/\/x\)/);
});

test('footnote bodies are preserved, not collapsed', () => {
  const out = toDiscordMarkdown('Claim here.[^1]\n\n[^1]: Smith, Journal of Things, 2024.');
  assert.match(out, /\[1\]: Smith, Journal of Things, 2024\./);
});

test('link reference definitions resolve to bare URL', () => {
  const out = toDiscordMarkdown('See [docs][d].\n\n[d]: https://example.com/page');
  assert.match(out, /https:\/\/example\.com\/page/);
  assert.ok(!out.includes('[d]:'));
});

test('unclosed code fence is auto-closed, code left verbatim', () => {
  const out = toDiscordMarkdown('```js\nconst a = 1 | 2;\n# code comment');
  assert.ok(out.endsWith('```'), 'fence must be balanced');
  assert.match(out, /\| 2/);
  assert.match(out, /# code comment/);
  assert.ok(!out.includes('**code comment**'));
});

test('lone stray fence is removed instead of swallowing text', () => {
  const out = toDiscordMarkdown('Type ``` to open code. Tail stays readable.');
  assert.ok(!out.includes('```'));
  assert.match(out, /Tail stays readable/);
});

test('pre blocks become fenced code', () => {
  const out = toDiscordMarkdown('<pre><code>if (a | b) { go(); }</code></pre>');
  assert.ok(out.startsWith('```') && out.endsWith('```'));
  assert.match(out, /a \| b/);
});

test('multi-line inline code becomes fenced, adjacent singles untouched', () => {
  const out = toDiscordMarkdown('run `line1\nline2` now');
  assert.match(out, /```\nline1\nline2\n```/);
  assert.equal(toDiscordMarkdown('`code1`\n`code2`'), '`code1`\n`code2`');
});

test('nested demo fences pass through verbatim', () => {
  const src = '````\n```js\nx | y\n```\n````';
  assert.equal(toDiscordMarkdown(src), src);
});
