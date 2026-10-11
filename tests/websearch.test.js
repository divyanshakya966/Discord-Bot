const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSerperResults, parseDuckDuckGoResponse, parseWikipediaResponse } = require('../src/ai/websearch');

test('wikipedia parser strips html and links pages', () => {
  const out = parseWikipediaResponse({ query: { search: [
    { title: 'Shreya Ghoshal', snippet: 'Indian <span class="searchmatch">singer</span> born &amp; raised' },
    { title: 'Romanticism', snippet: 'movement' },
  ] } });
  assert.ok(out.includes('**Shreya Ghoshal**'));
  assert.ok(!out.includes('<span'), 'html must be stripped');
  assert.ok(out.includes('https://en.wikipedia.org/wiki/Shreya_Ghoshal'));
});

test('wikipedia parser returns null when empty', () => {
  assert.equal(parseWikipediaResponse({ query: { search: [] } }), null);
  assert.equal(parseWikipediaResponse({}), null);
});

test('serper parser keeps title, snippet, link', () => {
  const out = parseSerperResults({ organic: [{ title: 'T', snippet: 'S', link: 'https://x.test' }] });
  assert.ok(out.includes('**T**') && out.includes('https://x.test'));
  assert.equal(parseSerperResults({ organic: [] }), null);
});

test('ddg parser handles abstract and related topics', () => {
  const out = parseDuckDuckGoResponse({ AbstractText: 'A', Heading: 'H', AbstractURL: 'https://h.test', RelatedTopics: [{ Text: 'R', FirstURL: 'https://r.test' }] });
  assert.ok(out.includes('https://h.test') && out.includes('https://r.test'));
  assert.equal(parseDuckDuckGoResponse({}), null);
});

test('serper output is capped at the provider budget', () => {
  const big = 'word '.repeat(2000);
  const out = parseSerperResults({ organic: [
    { title: 'A', snippet: big, link: 'https://a.test' },
    { title: 'B', snippet: big, link: 'https://b.test' },
    { title: 'C', snippet: big, link: 'https://c.test' },
  ] });
  assert.ok(out.length <= 2000, `len ${out.length}`);
  assert.ok(out.includes('https://a.test'));
});

test('snippets end at word boundaries and decode entities', () => {
  const out = parseSerperResults({ organic: [
    { title: 'E', snippet: 'Fish &lt;b&gt;chips&lt;/b&gt; &amp; mushy peas are great and tasty', link: '' },
  ] });
  assert.ok(out.includes('Fish <b>chips</b> & mushy'), `got ${out}`);
  assert.ok(!out.includes('&lt;') && !out.includes('&amp;'));
});
