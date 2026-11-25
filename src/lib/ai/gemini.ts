import { GoogleGenAI, ThinkingLevel, type Schema } from '@google/genai';

export type AiThinkingMode = 'low' | 'high';

const MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
] as const;

const PER_CALL_TIMEOUT_MS = 22_000;
const TOTAL_DEADLINE_MS = 48_000;

function isTransientOrUnavailableError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('"code":503') ||
    msg.includes('"code":429') ||
    msg.includes('"code":404') ||
    msg.includes('"code":504') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('high demand') ||
    msg.includes('empty response') ||
    /timed?\s*out|timeout|aborted|ETIMEDOUT|ECONNRESET/i.test(msg)
  );
}

function isUnsupportedThinkingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes('"code":400') || msg.includes('INVALID_ARGUMENT')) &&
    /thinking/i.test(msg)
  );
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export function formatGeminiError(err: unknown): {
  message: string;
  status: number;
} {
  const raw =
    err instanceof Error ? err.message : 'Gemini request failed.';
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; message?: string };
    };
    if (parsed?.error?.message) {
      const code = parsed.error.code;
      const status = code === 503 || code === 429 ? code : 502;
      return { message: parsed.error.message, status };
    }
  } catch {
    // Not JSON
  }
  return { message: raw, status: 500 };
}

export async function generateStructuredJson<T>(
  apiKey: string,
  prompt: string,
  responseSchema: Schema,
  temperature = 0.35,
  thinkingMode: AiThinkingMode = 'low'
): Promise<T> {
  const startedAt = Date.now();
  const perCallTimeoutMs =
    thinkingMode === 'high' ? 45_000 : PER_CALL_TIMEOUT_MS;
  const totalDeadlineMs =
    thinkingMode === 'high' ? 52_000 : TOTAL_DEADLINE_MS;
  const targetThinkingLevel =
    thinkingMode === 'high' ? ThinkingLevel.HIGH : ThinkingLevel.LOW;
  let lastError: unknown = null;

  for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
    const remainingMs = totalDeadlineMs - (Date.now() - startedAt);
    if (remainingMs < 5_000) {
      break;
    }

    const model = MODEL_FALLBACK_CHAIN[i];
    const callTimeoutMs = Math.min(perCallTimeoutMs, remainingMs);
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: callTimeoutMs },
    });

    const runCall = async (useThinkingConfig: boolean) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature,
          ...(useThinkingConfig
            ? { thinkingConfig: { thinkingLevel: targetThinkingLevel } }
            : {}),
        },
      });

      if (!response.text) {
        throw new Error('Gemini returned an empty response.');
      }

      return JSON.parse(stripJsonCodeFence(response.text)) as T;
    };

    try {
      return await runCall(true);
    } catch (err) {
      if (isUnsupportedThinkingError(err)) {
        try {
          return await runCall(false);
        } catch (retryErr) {
          lastError = retryErr;
          if (!isTransientOrUnavailableError(retryErr)) {
            throw retryErr;
          }
          continue;
        }
      }

      lastError = err;
      if (!isTransientOrUnavailableError(err)) {
        throw err;
      }
    }
  }

  throw (
    lastError ??
    new Error('All Gemini models timed out or are currently unavailable.')
  );
}
