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
    usage = next.usage || usage;
    finishReason = next.finishReason;
  }
  return { text, usage, finishReason, continuations };
}

module.exports = {
  CONTINUE_PROMPT,
  MAX_AUTO_CONTINUATIONS,
  AUTO_CONTINUE_CHAR_BUDGET,
  isLengthTruncated,
  collectStreamText,
  completeWithAutoContinue,
};
