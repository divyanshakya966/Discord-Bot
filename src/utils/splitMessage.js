const DISCORD_LIMIT = 2000;
const DEFAULT_CHUNK = 1900;

function splitMessage(content, maxLength = DEFAULT_CHUNK) {
  if (!content) return ['(empty response)'];
  if (content.length <= maxLength) return [content];

  const chunks = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength + 1);
    let idx = slice.lastIndexOf('\n');
    if (idx < maxLength * 0.4) {
      const ends = [...slice.matchAll(/[.!?…。！？]["'”»`)\]]?\s/g)];
      const lastEnd = ends.length ? ends[ends.length - 1].index + ends[ends.length - 1][0].length : -1;
      idx = lastEnd >= maxLength * 0.4 ? lastEnd : slice.lastIndexOf(' ');
    }
    if (idx < maxLength * 0.4) idx = maxLength;
    const cut = idx === maxLength ? maxLength : idx + 1;
    chunks.push(remaining.slice(0, cut).trimEnd() || remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
    if (chunks.length >= 10) {
      chunks.push('…(truncated — response too long, use /export or ask for a shorter answer)');
      remaining = '';
      break;
    }
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function splitCodeSafe(content, maxLength = DEFAULT_CHUNK) {
  if (!content.includes('```')) return splitMessage(content, maxLength);
  const parts = splitMessage(content, maxLength);
  // Reopen/close fences per chunk so every page renders as valid code.
  let open = false;
  let lang = '';
  return parts.map(chunk => {
    const fences = (chunk.match(/```/g) || []).length;
    if (!open) {
      const m = chunk.match(/```(\w*)/);
      if (m) lang = m[1] || '';
    }
    let out = chunk;
    if (open) out = `\`\`\`${lang}\n${out}`;
    open = fences % 2 === 1 ? !open : open;
    if (open) out = `${out}\n\`\`\``;
    return out;
  });
}

module.exports = { DISCORD_LIMIT, DEFAULT_CHUNK, splitMessage, splitCodeSafe };
