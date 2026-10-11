/**
 * Convert generic LLM markdown into Discord-supported markdown.
 * Supported: **bold**, *italic*, __underline__, ~~strike~~, `code`,
 * ```blocks```, > quotes, ||spoilers||, lists, [label](url).
 * Rewritten: | tables |, HTML, LaTeX, footnotes, task lists, reference links.
 * Fenced code blocks pass through verbatim. Idempotent.
 */

const ZERO_WIDTH = '\u200b';

function protectFencedBlocks(text) {
  const parts = String(text ?? '').split(/```/);
  return parts;
}

function restoreFencedBlocks(parts) {
  return parts.join('```');
}

function isTableSeparator(line) {
  // e.g. |---|---|, |:---|---:|, ---|---, :-: etc.
  const t = line.trim().replace(/^\||\|$/g, '').trim();
  if (!t) return false;
  if (!t.includes('|') && !t.includes('-')) return false;
  if (!/^[:|\-\s]+$/.test(t)) return false;
  return /-{2,}|:-+|-+:/.test(t);
}

function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
}

function convertTableBlock(lines) {
  if (lines.length < 2) return lines.join('\n');
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow).filter(r => r.some(c => c !== '' && c !== '-'));
  if (!rows.length) return `**${header.filter(Boolean).join(' · ')}**`;
  const out = [];
  for (const row of rows) {
    if (row.length === header.length && header.some(Boolean)) {
      const bits = row.map((cell, i) => `**${header[i] || `Col ${i + 1}`}**: ${cell || '—'}`);
      out.push(`• ${bits.join('  ·  ')}`);
    } else {
      out.push(`• ${row.filter(Boolean).join('  ·  ') || '—'}`);
    }
  }
  return out.join('\n');
}

function convertTablesOutsideCode(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (cur.includes('|') && next !== undefined && isTableSeparator(next)) {
      const block = [cur, next];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        block.push(lines[j]);
        j++;
      }
      out.push(convertTableBlock(block));
      i = j;
    } else {
      out.push(cur);
      i++;
    }
  }
  return out.join('\n');
}

function sanitizeOutsideCode(segment) {
  let s = segment;

  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(https?:\/\/[^<>\s]+)>/g, '$1');

  // Strip HTML but keep Discord <@id>/<#id>/emote syntax intact.
  s = s.replace(/<(?![@#][!&]?\d+>)(?!:\w+:)(?!a?:\w+:\d+>)[A-Za-z][^<>]*>/g, '');
  s = s.replace(/<\/(?:[A-Za-z][^<>]*)>/g, '');

  s = convertTablesOutsideCode(s);

  // Spoilers and inline code legitimately use | and ` — shield them first.
  const protectedSpans = [];
  s = s.replace(/\|\|(.+?)\|\||`[^`\n]+`/g, match => {
    protectedSpans.push(match);
    return `\0SPAN${protectedSpans.length - 1}\0`;
  });

  s = s.split('\n').map(line => {
    return line.includes('|') ? line.replace(/\|/g, '│') : line;
  }).join('\n');

  s = s.replace(/\0SPAN(\d+)\0/g, (_, n) => protectedSpans[Number(n)] ?? '');

  s = s.replace(/^(\s{0,3})#{1,6}\s+(.+?)\s*#*\s*$/gm, '$1**$2**');
  s = s.replace(/^([^\n]+)\n[ \t]*(=+|-{3,})[ \t]*$/gm, '**$1**');
  s = s.replace(/^[ \t]*(?:\*\s*){3,}$/gm, '────────────');
  s = s.replace(/^[ \t]*(?:-\s*){3,}$/gm, '────────────');
  s = s.replace(/^[ \t]*(?:_\s*){3,}$/gm, '────────────');
  s = s.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[ \]\s+/gm, '$1☐ ');
  s = s.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[x\]\s+/gim, '$1☑ ');
  s = s.replace(/^\s*\[\^([^\]]+)\]:/gm, '[$1]:');
  s = s.replace(/\[\^([^\]]+)\]/g, '[$1]');
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => `\`${inner.trim()}\``);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `\`${inner.trim()}\``);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `\`${inner.trim()}\``);
  // Single $..$ only when it looks like math — avoids mangling currency.
  s = s.replace(/\$([^$\n]*[\\^_{}=][^$\n]*)\$/g, (_, inner) => `\`${inner.trim()}\``);
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  // URL targets only: footnote bodies ([1]: note text) must survive.
  s = s.replace(/^\s*\[[^\]]+\]:\s*(https?:\S+).*$/gm, '$1');
  s = s.replace(/(^|[^~])~([^~\n]+?)~([^~]|$)/g, '$1~~$2~~$3');
  s = s.replace(/@(everyone|here)/g, `@${ZERO_WIDTH}$1`);
  s = s.replace(/\n{4,}/g, '\n\n\n');

  return s;
}

function toDiscordMarkdown(text) {
  if (text === null || text === undefined) return '';
  const raw = String(text);
  if (!raw) return '';
  const parts = protectFencedBlocks(raw);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = sanitizeOutsideCode(parts[i]);
  }
  return restoreFencedBlocks(parts).trim();
}

module.exports = { toDiscordMarkdown, convertTableBlock, isTableSeparator };
