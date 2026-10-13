/**
 * Utility for executing Gemini API calls with automatic exponential backoff retry
 * for transient errors (503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, demand spikes).
 */

export function isTransientGeminiError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.statusCode || error.code;
  if (status === 503 || status === 429 || status === 500 || status === 504 || status === 408) {
    return true;
  }

  const rawStr = typeof error === 'string' 
    ? error 
    : String(error?.message || error?.statusText || JSON.stringify(error) || '');
  const lower = rawStr.toLowerCase();

  return (
    lower.includes('503') ||
    lower.includes('429') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('resource exhausted') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('overloaded') ||
    lower.includes('temporary') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  );
}

export function formatGeminiErrorMessage(error: any, fallback = "AI request failed"): string {
  if (!error) return fallback;

  // If the error object or message is a stringified JSON like {"error":{"code":503,"message":"..."}}
  let extractedMsg = "";
  const rawMsg = typeof error === 'string' ? error : (error.message || "");

  if (typeof rawMsg === 'string') {
    const trimmed = rawMsg.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.error?.message) {
          extractedMsg = parsed.error.message;
        } else if (parsed?.message) {
          extractedMsg = parsed.message;
        }
      } catch {
        // ignore parse error
      }
    }
  }

  if (!extractedMsg && error.error && typeof error.error.message === 'string') {
    extractedMsg = error.error.message;
  }

  if (!extractedMsg) {
    extractedMsg = typeof rawMsg === 'string' ? rawMsg : fallback;
  }

  const lower = extractedMsg.toLowerCase();

  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('spikes in demand')) {
    return "Google Gemini is currently experiencing a temporary demand spike. Please try again in a few moments.";
  }

  if (lower.includes('429') || lower.includes('resource exhausted') || lower.includes('resource_exhausted') || lower.includes('rate limit')) {
    return "Google Gemini rate limit reached. Please wait a moment or configure your own Gemini API key in Settings.";
  }

  if (lower.includes('api key') && (lower.includes('invalid') || lower.includes('not found') || lower.includes('expired') || lower.includes('unauthorized'))) {
    return "Gemini API key is invalid or unauthorized. Please verify your API key in Settings.";
  }

  // Clean out any lingering raw JSON wrappers if present
  return extractedMsg
    .replace(/^{"error":\{.*?"message":"(.*?)"(?:,.*?)?\}\}$/, '$1')
    .replace(/^Error:\s*/, '')
    .trim() || fallback;
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  label?: string;
}

export async function callGeminiWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 1500, label = 'Gemini API' } = options;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const isTransient = isTransientGeminiError(err);

      if (isTransient && attempt < maxAttempts) {
        // Exponential backoff with random jitter (0 - 400ms)
        const jitter = Math.floor(Math.random() * 400);
        const delayMs = initialDelayMs * Math.pow(1.8, attempt - 1) + jitter;
        console.warn(`[${label}] Transient error on attempt ${attempt}/${maxAttempts} (${formatGeminiErrorMessage(err)}). Retrying in ${Math.round(delayMs)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // If not transient or attempts exhausted, break and format
      break;
    }
  }

  const userFriendlyMessage = formatGeminiErrorMessage(lastError);
  const errorToThrow = new Error(userFriendlyMessage);
  (errorToThrow as any).originalError = lastError;
  (errorToThrow as any).isTransient = isTransientGeminiError(lastError);
  throw errorToThrow;
}
