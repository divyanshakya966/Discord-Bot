const { trimToCompleteChars } = require('../ai/tokens');
const TEXT_EXT = ['.txt', '.md', '.markdown', '.js', '.ts', '.py', '.json', '.yml', '.yaml', '.java', '.c', '.cpp', '.rs', '.go', '.log', '.csv'];
const MAX_ATTACH_BYTES = 100 * 1024;
const MAX_TOTAL_CHARS = 6000;
function isTextAttachment(att) {
  const name = (att?.name || '').toLowerCase();
  if (att?.size > MAX_ATTACH_BYTES) return false;
  if (TEXT_EXT.some(e => name.endsWith(e))) return true;
  if ((att?.contentType || '').startsWith('text/')) return true;
  return false;
}

async function fetchAttachmentText(att, timeoutMs = 12000) {
  const res = await fetch(att.url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const text = await res.text();
  return text.slice(0, MAX_TOTAL_CHARS);
}

async function collectAttachmentContext(message, basePrompt) {
  const atts = [...(message.attachments?.values?.() || message.attachments || [])];
  if (!atts.length) return { prompt: basePrompt, notes: [] };
  const notes = [];
  let extra = '';
  for (const att of atts.slice(0, 3)) {
    try {
      if (isTextAttachment(att)) {
        const text = await fetchAttachmentText(att);
        extra += `\n\n[Attached file ${att.name}]:\n\`\`\`\n${text.slice(0, 4000)}\n\`\`\``;
        notes.push(`included ${att.name}`);
      } else if ((att?.contentType || '').startsWith('image/')) {
        extra += `\n\n[User attached an image: ${att.name || 'image'}. Describe that you cannot view images directly and ask them to describe or paste relevant text.]`;
        notes.push(`image ${att.name || ''} noted`);
      } else {
        notes.push(`skipped ${att.name || 'attachment'} (unsupported type)`);
      }
    } catch (e) {
      notes.push(`could not read ${att.name || 'attachment'}`);
    }
  }
  const prompt = trimToCompleteChars(basePrompt + extra, 12000);
  return { prompt, notes };
}

module.exports = { isTextAttachment, fetchAttachmentText, collectAttachmentContext, MAX_ATTACH_BYTES };
