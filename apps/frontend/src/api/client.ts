// ─────────────────────────────────────────────────────────────
//  API Client — Typed fetch wrapper for Top5 Worker API
// ─────────────────────────────────────────────────────────────
import type { SearchResult, VoteResult, TrendingQuery } from "@top5/shared";

const BASE_URL = import.meta.env.DEV ? "" : "https://top5-worker.jimwar02.workers.dev";

export async function search(
  query: string,
  coords?: { lat: number; lng: number }
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query });
  if (coords) {
    params.set("lat", String(coords.lat));
    params.set("lng", String(coords.lng));
  }
  const res = await fetch(`${BASE_URL}/api/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function vote(
  entityId: string,
  query: string
): Promise<VoteResult & { top5?: unknown[] }> {
  const res = await fetch(`${BASE_URL}/api/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId, query }),
  });
  if (!res.ok) throw new Error(`Vote failed: ${res.status}`);
  return res.json();
}

export async function getTrending(): Promise<TrendingQuery[]> {
  const res = await fetch(`${BASE_URL}/api/trending`);
  if (!res.ok) return [];
  const data = await res.json() as { trending: TrendingQuery[] };
  return data.trending ?? [];
}

export function subscribeSSE(
  query: string,
  onEvent: (data: unknown) => void
): EventSource {
  const es = new EventSource(`${BASE_URL}/api/sse?q=${encodeURIComponent(query)}`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type !== "heartbeat") onEvent(data);
    } catch { /* ignore */ }
  };
  return es;
}
