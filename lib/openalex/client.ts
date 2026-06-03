const OPENALEX_BASE = "https://api.openalex.org";

export function openAlexWorksUrl(pathAndQuery: string): string {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${OPENALEX_BASE}${path}`;
}

/** Headers and query params for OpenAlex (mailto + optional API key). */
export function openAlexRequestInit(): {
  headers: Record<string, string>;
  extraParams: URLSearchParams;
} {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const extraParams = new URLSearchParams();

  const mailto = process.env.OPENALEX_MAILTO?.trim();
  if (mailto) extraParams.set("mailto", mailto);

  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    extraParams.set("api_key", apiKey);
  }

  return { headers, extraParams };
}

export async function openAlexFetch(
  pathAndQuery: string
): Promise<unknown> {
  const url = new URL(openAlexWorksUrl(pathAndQuery));
  const { headers, extraParams } = openAlexRequestInit();
  extraParams.forEach((v, k) => url.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers, next: { revalidate: 0 } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenAlex request failed: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenAlex HTTP ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`
    );
  }

  try {
    return await res.json();
  } catch {
    throw new Error("OpenAlex: malformed JSON response");
  }
}
