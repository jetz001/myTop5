// ─────────────────────────────────────────────────────────────
//  Cache KV Wrapper — 5-minute cache for search results
// ─────────────────────────────────────────────────────────────
import type { SearchResult } from "@top5/shared";

const CACHE_TTL = 30; // 30 seconds TTL for fast cache + quick vote updates

export function buildCacheKey(
  intent: string,
  query: string,
  lat?: string | null,
  lng?: string | null
): string {
  const geo = lat && lng ? `:${parseFloat(lat).toFixed(2)},${parseFloat(lng).toFixed(2)}` : "";
  return `search:${intent}:${encodeURIComponent(query.toLowerCase())}${geo}`;
}

export async function getCached(
  kv: KVNamespace,
  key: string
): Promise<SearchResult | null> {
  try {
    const val = await kv.get(key, "json");
    return val as SearchResult | null;
  } catch {
    return null;
  }
}

export async function setCache(
  kv: KVNamespace,
  key: string,
  data: SearchResult
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  } catch {
    // Fail silently — cache is optional
  }
}
