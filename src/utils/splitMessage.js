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
    if (idx < maxLength * 0.4) idx = slice.lastIndexOf(' ');
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
  return parts.map(chunk => {
    const fences = (chunk.match(/```/g) || []).length;
    if (fences % 2 === 1) return chunk + '\n```';
    return chunk;
  });
}

module.exports = { DISCORD_LIMIT, DEFAULT_CHUNK, splitMessage, splitCodeSafe };
