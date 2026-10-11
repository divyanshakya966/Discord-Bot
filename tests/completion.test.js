const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isLengthTruncated,
  normalizeUsage,
  mergeUsage,
  collectStreamText,
  completeWithAutoContinue,
  CONTINUE_PROMPT,
  MAX_AUTO_CONTINUATIONS,
} = require('../src/ai/completion');

function streamOf(chunks) {
  return (async function* () {
    for (const c of chunks) yield c;
  })();
}

test('normalizeUsage tolerates empty and variant shapes', () => {
  assert.equal(normalizeUsage(null), null);
  assert.equal(normalizeUsage({}), null);
  assert.deepEqual(
    normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }),
    { in: 10, out: 20, total: 30 }
  );
  assert.deepEqual(
    normalizeUsage({ input_tokens: 5, output_tokens: 7 }),
    { in: 5, out: 7, total: 12 }
  );
});

test('normalizeUsage is idempotent on merged output', () => {
  const merged = mergeUsage(
    { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    { prompt_tokens: 120, completion_tokens: 5, total_tokens: 125 }
  );
  assert.deepEqual(merged, { in: 220, out: 15, total: 235 });
  assert.deepEqual(normalizeUsage(merged), merged);
});

test('mergeUsage sums stitched calls instead of keeping {}', () => {
  assert.deepEqual(
    mergeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, {}),
    { in: 10, out: 5, total: 15 }
  );
  assert.deepEqual(
    mergeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 }),
    { in: 30, out: 8, total: 38 }
  );
  assert.equal(mergeUsage(null, null), null);
});

test('isLengthTruncated only matches length', () => {
  assert.equal(isLengthTruncated('length'), true);
  assert.equal(isLengthTruncated('stop'), false);
  assert.equal(isLengthTruncated(null), false);
  assert.equal(isLengthTruncated(undefined), false);
});

test('collectStreamText joins delta content + finish reason', async () => {
  const stream = streamOf([
    { choices: [{ delta: { content: 'Hello ' } }] },
    { choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }] },
  ]);
  const r = await collectStreamText(stream);
  assert.equal(r.text, 'Hello world');
  assert.equal(r.finishReason, 'stop');
});

test('collectStreamText tolerates message/text shapes', async () => {
  const stream = streamOf([
    { choices: [{ message: { content: 'Hi' } }] },
    { choices: [{ text: ' there', finishReason: 'stop' }] },
  ]);
  const r = await collectStreamText(stream);
  assert.equal(r.text, 'Hi there');
  assert.equal(r.finishReason, 'stop');
});

test('collectStreamText forwards chunks to onChunk', async () => {
  const seen = [];
  const stream = streamOf([{ choices: [{ delta: { content: 'a' } }] }, { choices: [{ delta: { content: 'b' } }] }]);
  await collectStreamText(stream, async (c) => seen.push(c));
  assert.deepEqual(seen, ['a', 'b']);
});

test('complete response needs no continuation', async () => {
  let calls = 0;
  const sendFn = async (msgs) => {
    calls++;
    return { text: 'Full answer.', usage: null, finishReason: 'stop' };
  };
  const r = await completeWithAutoContinue(sendFn, [{ role: 'user', content: 'hi' }]);
  assert.equal(r.text, 'Full answer.');
  assert.equal(r.continuations, 0);
  assert.equal(calls, 1);
});

test('length-truncated output is auto-continued and stitched', async () => {
  const seen = [];
  const sendFn = async (msgs) => {
    seen.push(msgs);
    if (seen.length === 1) return { text: 'Part one without ending', usage: null, finishReason: 'length' };
    return { text: 'part two complete.', usage: null, finishReason: 'stop' };
  };
  const base = [{ role: 'user', content: 'tell me' }];
  const r = await completeWithAutoContinue(sendFn, base);
  assert.equal(r.continuations, 1);
  assert.match(r.text, /Part one/);
  assert.match(r.text, /part two/);
  // continuation prompt references prior assistant output, doesn't repeat question
  const contMsgs = seen[1];
  assert.equal(contMsgs[contMsgs.length - 1].content, CONTINUE_PROMPT);
  assert.equal(contMsgs[contMsgs.length - 2].role, 'assistant');
  assert.deepEqual(seen[0], base);
});

test('mid-sentence cuts resume with a space, complete thoughts with a break', async () => {
  const cut = async (msgs) => msgs.length > 1
    ? { text: 'went home.', usage: null, finishReason: 'stop' }
    : { text: 'She walked in,', usage: null, finishReason: 'length' };
  const r1 = await completeWithAutoContinue(cut, []);
  assert.equal(r1.text, 'She walked in, went home.');

  const whole = async (msgs) => msgs.length > 1
    ? { text: 'Next idea.', usage: null, finishReason: 'stop' }
    : { text: 'First idea.', usage: null, finishReason: 'length' };
  const r2 = await completeWithAutoContinue(whole, []);
  assert.equal(r2.text, 'First idea.\n\nNext idea.');
});

test('continuations are bounded', async () => {  let calls = 0;
  const sendFn = async () => {
    calls++;
    return { text: 'more', usage: null, finishReason: 'length' };
  };
  const r = await completeWithAutoContinue(sendFn, [], { maxContinuations: MAX_AUTO_CONTINUATIONS });
  assert.equal(calls, 1 + MAX_AUTO_CONTINUATIONS);
  assert.equal(r.continuations, MAX_AUTO_CONTINUATIONS);
  assert.equal(r.finishReason, 'length');
});

test('char budget stops continuations', async () => {
  let calls = 0;
  const sendFn = async () => {
    calls++;
    return { text: 'x'.repeat(5000), usage: null, finishReason: 'length' };
  };
  const r = await completeWithAutoContinue(sendFn, [], { charBudget: 100 });
  assert.equal(calls, 1);
  assert.equal(r.continuations, 0);
});
