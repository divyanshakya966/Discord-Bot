function extractProviderErrorMessage(error) {
  if (!error) return 'Unknown provider error.';
  const sdkMessage = error?.error?.message;
  const responseMessage = error?.response?.data?.error?.message || error?.response?.data?.message;
  const detailsMessage = error?.details?.message;
  return sdkMessage || responseMessage || detailsMessage || error.message || 'Unknown provider error.';
}

function isLikelyParameterCompatibilityError(message) {
  if (!message) return false;
  return /(unsupported|invalid|unrecognized).*(parameter|field)|top[ _-]?p|frequency[ _-]?penalty|presence[ _-]?penalty/i.test(message);
}

function isRetryableError(error) {
  const msg = extractProviderErrorMessage(error);
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  if (/rate.?limit|too many requests|timeout|timed out|econnreset|socket hang up|service unavailable|overloaded|try again/i.test(msg)) return true;
  return false;
}

function isModelUnavailableError(error) {
  const msg = extractProviderErrorMessage(error);
  return /not found|unknown model|no route|access denied|forbidden|unauthorized|unavailable for free|paid version is available/i.test(msg);
}

// Detailed one-line summary for server logs only (never shown to users).
function describeProviderError(error) {
  const msg = extractProviderErrorMessage(error);
  const status = error?.status ?? error?.statusCode ?? error?.response?.status ?? error?.code;
  const raw =
    error?.response?.data?.error?.metadata?.raw ||
    error?.error?.metadata?.raw ||
    error?.metadata?.raw ||
    error?.error?.error?.metadata?.raw ||
    error?.data?.error?.metadata?.raw;
  const parts = [`msg=${msg.slice(0, 200)}`];
  if (status !== undefined) parts.push(`status=${status}`);
  if (raw) parts.push(`raw=${String(raw).slice(0, 200)}`);
  return parts.join(' ');
}

function toUserFacingProviderError(error, model) {
  void model;
  const raw = extractProviderErrorMessage(error);
  const short = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
  if (/insufficient|credit|quota|billing|payment/i.test(raw)) {
    return 'The AI provider is out of credits/quota for now. Please try again later.';
  }
  if (/rate.?limit|too many requests/i.test(raw)) {
    return 'The AI is rate-limited right now. Please wait a few seconds and try again.';
  }
  if (/not found|unknown model|no route|access denied|forbidden|unauthorized|unavailable for free|paid version/i.test(raw)) {
    return 'That model is unavailable right now. Try /model list and pick another.';
  }
  return `AI request failed — please retry. Details: ${short}`;
}

module.exports = { extractProviderErrorMessage, isLikelyParameterCompatibilityError, isRetryableError, isModelUnavailableError, describeProviderError, toUserFacingProviderError };
