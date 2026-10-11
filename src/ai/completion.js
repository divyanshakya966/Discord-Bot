/**
 * Detect provider-side truncation (finish_reason === 'length') and stitch
 * bounded auto-continuations. Each call keeps its own maxTokens budget.
 */

const CONTINUE_PROMPT =
  'Continue your previous response from where it stopped. Do not repeat what you already said. Finish completely with a proper ending.';
const MAX_AUTO_CONTINUATIONS = 2;
const AUTO_CONTINUE_CHAR_BUDGET = 12000; // matches the paged display budget

function isLengthTruncated(finishReason) {
  return finishReason === 'length';
}

function pickNumber(...vals) {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

// Streaming responses often omit usage (or yield {}); providers also vary
// field names. Normalize to { in, out, total } or null when meaningless.
function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  // Already normalized (e.g. merged across continuations) — pass through.
  if (typeof usage.in === 'number' || typeof usage.out === 'number' || typeof usage.total === 'number') {
    const inp = Number.isFinite(usage.in) ? usage.in : 0;
    const out = Number.isFinite(usage.out) ? usage.out : 0;
    const total = Number.isFinite(usage.total) ? usage.total : inp + out;
    if (!inp && !out && !total) return null;
    return { in: inp, out, total };
  }
  const inp = pickNumber(usage.prompt_tokens, usage.input_tokens, usage.promptTokens, usage.inputTokens);
  const out = pickNumber(usage.completion_tokens, usage.output_tokens, usage.completionTokens, usage.outputTokens);
  const total = pickNumber(usage.total_tokens, usage.totalTokens, inp !== undefined && out !== undefined ? inp + out : undefined);
  if (inp === undefined && out === undefined && total === undefined) return null;
  return { in: inp ?? 0, out: out ?? 0, total: total ?? (inp ?? 0) + (out ?? 0) };
}

// Sum usage across stitched continuations so cost tracking reflects the
// whole answer. Plain `a || b` would keep an empty {} and drop real data.
function mergeUsage(a, b) {
  const x = normalizeUsage(a);
  const y = normalizeUsage(b);
  if (!x) return y;
  if (!y) return x;
  return { in: x.in + y.in, out: x.out + y.out, total: x.total + y.total };
}

/**
 * Drain a streaming response, tolerating SDK shape variations
 * (delta.content vs message.content vs text; finish_reason casing).
 * @returns {Promise<{text:string, usage:any, finishReason:string|null}>}
 */
async function collectStreamText(stream, onChunk) {
  let full = '';
  let usage = null;
  let finishReason = null;
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
    if (content) {
      full += content;
      if (onChunk) await onChunk(content);
    }
    const fr = choice?.finish_reason ?? choice?.finishReason ?? chunk.finish_reason ?? null;
    if (fr) finishReason = fr;
    if (chunk.usage) usage = chunk.usage;
  }
  return { text: full.trim() || 'No response returned by model.', usage, finishReason };
}

const { isCompleteResponse } = require('./tokens');

/**
 * Run sendFn(baseMessages); while the provider reports length-truncation,
 * follow up with continue prompts and stitch. Bounded by maxContinuations
 * and charBudget.
 * @param {(msgs:any[]) => Promise<{text:string,usage:any,finishReason:string|null}>} sendFn
 */
async function completeWithAutoContinue(sendFn, baseMessages, opts = {}) {
  const maxContinuations = opts.maxContinuations ?? MAX_AUTO_CONTINUATIONS;
  const charBudget = opts.charBudget ?? AUTO_CONTINUE_CHAR_BUDGET;
  let result = await sendFn(baseMessages);
  let text = result.text;
  let { usage, finishReason } = result;
  let continuations = 0;
  while (isLengthTruncated(finishReason) && continuations < maxContinuations && text.length < charBudget) {
    continuations++;
    const next = await sendFn([
      ...baseMessages,
      { role: 'assistant', content: text },
      { role: 'user', content: CONTINUE_PROMPT },
    ]);
    text = isCompleteResponse(text) ? `${text}\n\n${next.text}`.trim() : `${text} ${next.text}`.trim();
    usage = mergeUsage(usage, next.usage);
    finishReason = next.finishReason;
  }
  return { text, usage, finishReason, continuations };
}

module.exports = {
  CONTINUE_PROMPT,
  MAX_AUTO_CONTINUATIONS,
  AUTO_CONTINUE_CHAR_BUDGET,
  isLengthTruncated,
  normalizeUsage,
  mergeUsage,
  collectStreamText,
  completeWithAutoContinue,
};
