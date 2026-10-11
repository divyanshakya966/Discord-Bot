const { trimToCompleteChars } = require('./tokens');

const SNIPPET_CHARS = 500; // per-result budget: complete sentences, never mid-word
const TOTAL_CHARS = 2000; // per-provider budget, matching research context limits

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseSerperResults(data) {
  const results = data?.organic || [];
  if (!results.length) return null;
  const out = results
    .slice(0, 3)
    .map(r => `**${r.title}** — ${trimToCompleteChars(stripHtml(r.snippet), SNIPPET_CHARS)}\n${r.link || ''}`.trim())
    .join('\n\n');
  return trimToCompleteChars(out, TOTAL_CHARS) || null;
}

function parseDuckDuckGoResponse(data) {
  const out = [];
  if (data?.AbstractText) out.push(`**${data.Heading || 'Summary'}** — ${trimToCompleteChars(stripHtml(data.AbstractText), SNIPPET_CHARS)}\n${data.AbstractURL || ''}`.trim());
  for (const t of (data?.RelatedTopics || []).slice(0, 3)) {
    if (typeof t?.Text === 'string' && t.Text) out.push(`**Related** — ${trimToCompleteChars(t.Text, 300)}${t.FirstURL ? `\n${t.FirstURL}` : ''}`);
  }
  return out.length ? trimToCompleteChars(out.join('\n\n'), TOTAL_CHARS) : null;
}

function wikiPageUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}

function parseWikipediaResponse(data) {
  const results = data?.query?.search || [];
  if (!results.length) return null;
  return results
    .slice(0, 3)
    .map(r => `**${r.title}** — ${trimToCompleteChars(stripHtml(r.snippet), 300)}\n${wikiPageUrl(r.title)}`)
    .join('\n\n');
}

async function searchWikipedia(query, timeoutMs = 12000) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'DiscordBot/2.3' } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return parseWikipediaResponse(await res.json());
}

async function searchDuckDuckGo(query, timeoutMs = 12000) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'DiscordBot/2.3' } });
  if (!res.ok) throw new Error(`DDG ${res.status}`);
  return parseDuckDuckGoResponse(await res.json());
}

module.exports = { parseSerperResults, parseDuckDuckGoResponse, parseWikipediaResponse, searchWikipedia, searchDuckDuckGo };
