/**
 * Safely parses a JSON response from an internal Next.js API route.
 * Surfaces readable HTTP errors if the platform (e.g. Vercel 504/500) returns plain text or HTML.
 */
export async function parseApiResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  const rawText = await res.text();
  let parsed: (T & { error?: string }) | null = null;

  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T & { error?: string };
    } catch {
      // Response is non-JSON (e.g. Vercel gateway timeout or HTML error page)
    }
  }

  if (!res.ok) {
    if (parsed?.error) {
      throw new Error(parsed.error);
    }
    const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (res.status === 504) {
      throw new Error(
        `Request timed out (504) while generating workouts. Please try again.`
      );
    }
    throw new Error(
      snippet
        ? `${fallbackMessage} (${res.status}): ${snippet.slice(0, 140)}`
        : `${fallbackMessage} (HTTP ${res.status})`
    );
  }

  if (!parsed) {
    throw new Error(`${fallbackMessage}: empty or invalid server response.`);
  }

  return parsed;
}
