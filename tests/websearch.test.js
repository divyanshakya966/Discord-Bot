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
