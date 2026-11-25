import { GoogleGenAI, type Schema } from '@google/genai';

const MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
] as const;

function isTransientOrUnavailableError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('"code":503') ||
    msg.includes('"code":429') ||
    msg.includes('"code":404') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('high demand') ||
    msg.includes('empty response')
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
  temperature = 0.35
): Promise<T> {
  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown = null;

  for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
    const model = MODEL_FALLBACK_CHAIN[i];
    const maxAttempts = i === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature,
          },
        });

        if (!response.text) {
          throw new Error('Gemini returned an empty response.');
        }

        return JSON.parse(stripJsonCodeFence(response.text)) as T;
      } catch (err) {
        lastError = err;
        if (!isTransientOrUnavailableError(err)) {
          throw err;
        }
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }
  }

  throw lastError ?? new Error('All Gemini models are currently unavailable.');
}
