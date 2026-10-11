const crypto = require('crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { splitCodeSafe } = require('../utils/splitMessage');
const { toDiscordMarkdown } = require('../utils/discordMarkdown');
const { trimToCompleteChars } = require('../ai/tokens');

const PAGE_SIZE = 1700; // leaves room for the "Page x/y" footer inside 2000 limit
const MAX_PAGES = 10;
const MAX_TEXT_CHARS = 18000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 500;

const sessions = new Map();

function pruneSessions(now = Date.now()) {
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
  if (sessions.size > MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < sessions.size - MAX_SESSIONS; i++) sessions.delete(sorted[i][0]);
  }
}

function createPaginatorId() {
  return crypto.randomBytes(6).toString('hex'); // 12 hex chars, fits customId limit
}

/**
 * Sanitize + split raw model output into Discord-safe pages.
 * @returns {string[]} pages, each <= pageSize (+ code-fence closer)
 */
function paginateText(rawText, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES, maxChars = MAX_TEXT_CHARS } = {}) {
  const clean = trimToCompleteChars(toDiscordMarkdown(rawText), maxChars);
  if (!clean) return ['(empty response)'];
  const pages = splitCodeSafe(clean, pageSize);
  if (pages.length <= maxPages) return pages;
  const kept = pages.slice(0, maxPages);
  kept[kept.length - 1] = `${trimToCompleteChars(kept[kept.length - 1], Math.max(0, pageSize - 80))}\n\n…(output continues — press ▶ Continue for the rest)`;
  return kept;
}

function createPagedSession(pages) {
  pruneSessions();
  const id = createPaginatorId();
  sessions.set(id, { pages, createdAt: Date.now() });
  return id;
}

function getPagedSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function buildPageContent(pages, index) {
  const page = pages[index] ?? '';
  if (pages.length <= 1) return page;
  return `${page}\n\n📄 Page ${index + 1}/${pages.length}  •  Use ◀ ▶ to navigate`;
}

function paginationRow(paginatorId, index, total) {
  const prev = new ButtonBuilder()
    .setCustomId(`pg:prev:${paginatorId}`)
    .setLabel('◀ Prev')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(index <= 0);
  const counter = new ButtonBuilder()
    .setCustomId(`pg:noop:${paginatorId}`)
    .setLabel(`${index + 1}/${total}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const next = new ButtonBuilder()
    .setCustomId(`pg:next:${paginatorId}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(index >= total - 1);
  return new ActionRowBuilder().addComponents(prev, counter, next);
}

function isPaginationButton(customId) {
  return typeof customId === 'string' && customId.startsWith('pg:');
}

function parsePaginationId(customId) {
  const parts = String(customId).split(':');
  return { action: parts[1], id: parts[2] };
}

/**
 * Handle ◀ Prev / Next ▶ presses by editing the message in place.
 * @returns {Promise<boolean>} true if the interaction was a pagination button
 */
async function handlePaginationButton(interaction) {
  const customId = interaction.customId;
  if (!isPaginationButton(customId)) return false;
  const { action, id } = parsePaginationId(customId);

  if (action === 'noop') {
    try { await interaction.deferUpdate(); } catch {}
    return true;
  }
  if (action !== 'prev' && action !== 'next') return false;

  const session = getPagedSession(id);
  if (!session) {
    try {
      await interaction.reply({ content: 'This paged message expired. Ask again to get a fresh answer.', flags: MessageFlags.Ephemeral });
    } catch {}
    return true;
  }

  let index = typeof session.cursor === 'number' ? session.cursor : 0;
  const m = /Page\s+(\d+)\s*\/\s*(\d+)/i.exec(interaction.message?.content || '');
  if (m) {
    const parsed = parseInt(m[1], 10) - 1;
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < session.pages.length) index = parsed;
  }
  if (action === 'prev') index = Math.max(0, index - 1);
  else index = Math.min(session.pages.length - 1, index + 1);
  session.cursor = index;

  const { actionRowForReply } = require('./embeds');
  const content = buildPageContent(session.pages, index);
  const components = session.pages.length > 1
    ? [paginationRow(id, index, session.pages.length), actionRowForReply()]
    : [actionRowForReply()];
  try {
    await interaction.update({ content, components, allowedMentions: { parse: [] } });
  } catch {}
  return true;
}

/**
 * Build the initial paged payload for a fresh AI answer.
 * Single-page answers get just the action row (no pager).
 * @returns {{ content: string, components: ActionRowBuilder[], paginatorId: string|null, pages: string[] }}
 */function buildInitialPagedPayload(rawText, actionRow, opts = {}) {
  const pages = paginateText(rawText, opts);
  if (pages.length <= 1) {
    return { content: pages[0], components: actionRow ? [actionRow] : [], paginatorId: null, pages };
  }
  const id = createPagedSession(pages);
  const session = sessions.get(id);
  if (session) session.cursor = 0;
  const components = [paginationRow(id, 0, pages.length)];
  if (actionRow) components.push(actionRow);
  return { content: buildPageContent(pages, 0), components, paginatorId: id, pages };
}

module.exports = {
  PAGE_SIZE,
  MAX_PAGES,
  paginateText,
  createPagedSession,
  getPagedSession,
  buildPageContent,
  paginationRow,
  isPaginationButton,
  handlePaginationButton,
  buildInitialPagedPayload,
  _sessions: sessions,
};
