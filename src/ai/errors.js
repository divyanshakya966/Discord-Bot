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

function toUserFacingProviderError(error, model) {
  const raw = extractProviderErrorMessage(error);
  const short = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
  if (/insufficient|credit|quota|billing|payment/i.test(raw)) {
    return `The AI provider is out of credits/quota for now. Please try again later. (model: ${model})`;
  }
  if (/rate.?limit|too many requests/i.test(raw)) {
    return `The AI is rate-limited right now. Please wait a few seconds and try again. (model: ${model})`;
  }
  if (/not found|unknown model|no route|access denied|forbidden|unauthorized/i.test(raw)) {
    return `That model is unavailable for the current API key. Try /model list and pick another. (model: ${model})`;
  }
  return `AI request failed — please retry. Details: ${short}`;
}

module.exports = { extractProviderErrorMessage, isLikelyParameterCompatibilityError, isRetryableError, toUserFacingProviderError };
