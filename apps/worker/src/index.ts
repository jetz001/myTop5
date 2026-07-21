// ─────────────────────────────────────────────────────────────
//  Main Hono.js Worker Router — Top5 Search Engine API
// ─────────────────────────────────────────────────────────────
import { Hono } from "hono";
import { cors } from "hono/cors";
import { timing } from "hono/timing";
import type { Env, SearchResult, VoteResult } from "@top5/shared";
import { classifyIntent } from "./intent";
import { rankEntities, checkChallengerSwap } from "./ranking";
import { buildCacheKey, getCached, setCache } from "./cache";
import { logQuery, recordVote, getTrending, searchEntitiesFTS } from "./db/queries";
import { fetchGeoEntities } from "./pipelines/geo";
import { fetchWeb3Entities } from "./pipelines/web3";
import { fetchDevEntities } from "./pipelines/dev";
import { fetchPopcultureEntities } from "./pipelines/popculture";
import { fetchAcademicEntities } from "./pipelines/academic";
import { isSocialBot, rewriteOgMeta } from "./og";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
app.use("*", timing());

// ──────────────────────────────────────────────────────────────
// GET /api/search?q=กะเพรา&lat=13.75&lng=100.50
// ──────────────────────────────────────────────────────────────
app.get("/api/search", async (c) => {
  const start = Date.now();
  const q     = c.req.query("q")   ?? "";
  const lat   = c.req.query("lat");
  const lng   = c.req.query("lng");

  if (!q.trim()) {
    return c.json({ error: "Query is required" }, 400);
  }

  // 1. Classify intent
  const intentResult = classifyIntent(q);
  const { intent } = intentResult;

  // 2. Cache check
  const cacheKey = buildCacheKey(intent, q, lat, lng);
  const cached = await getCached(c.env.CACHE_KV, cacheKey);
  if (cached) {
    return c.json({ ...cached, cached: true, latency_ms: Date.now() - start });
  }

  // 3. Fetch entities from correct pipeline
  const coords =
    lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined;

  // Try FTS first using original query + did_you_mean (if any)
  const ftsSearchTerms = [q, intentResult.did_you_mean].filter(Boolean).join(" ");
  let rawEntities = await searchEntitiesFTS(c.env.TOP5_DB, ftsSearchTerms, intent === "general" ? undefined : intent);

  // Fallback if FTS doesn't find enough, but only if we really need to
  // If we found some FTS matches and the intent is just "general", we probably shouldn't dilute them with random geo places.
  const shouldFallback = rawEntities.length === 0 || (rawEntities.length < 5 && intentResult.intent !== "general");
  
  if (shouldFallback) {
    let fallbackEntities: any[] = [];
    switch (intent) {
      case "geo":
        fallbackEntities = await fetchGeoEntities(c.env.TOP5_DB, q, coords);
        break;
      case "web3":
        fallbackEntities = await fetchWeb3Entities(c.env.TOP5_DB);
        break;
      case "dev":
        fallbackEntities = await fetchDevEntities(c.env.TOP5_DB);
        break;
      case "popculture":
        fallbackEntities = await fetchPopcultureEntities(c.env.TOP5_DB);
        break;
      case "academic":
        fallbackEntities = await fetchAcademicEntities(c.env.TOP5_DB);
        break;
      default:
        fallbackEntities = await fetchGeoEntities(c.env.TOP5_DB, q, coords);
    }
    
    // Merge and deduplicate
    const seen = new Set(rawEntities.map(e => e.entity_id));
    for (const e of fallbackEntities) {
      if (!seen.has(e.entity_id)) {
        rawEntities.push(e);
        seen.add(e.entity_id);
      }
    }
  }

  // 4. Hybrid ranking
  const { top5, challenger_pool } = rankEntities(
    rawEntities.map((e) => ({ ...e, intent } as typeof e & { intent: typeof intent }))
  );

  const result: SearchResult = {
    query: q,
    intent,
    top5,
    challenger_pool,
    cached: false,
    latency_ms: Date.now() - start,
    did_you_mean: intentResult.did_you_mean,
  };

  // 5. Cache result + log query (non-blocking)
  c.executionCtx.waitUntil(
    Promise.all([
      setCache(c.env.CACHE_KV, cacheKey, result),
      logQuery(c.env.TOP5_DB, q, intent),
    ])
  );

  return c.json(result);
});

// ──────────────────────────────────────────────────────────────
// POST /api/vote  { entity_id, query }
// ──────────────────────────────────────────────────────────────
app.post("/api/vote", async (c) => {
  const body = await c.req.json<{ entity_id: string; query: string }>();
  const { entity_id, query } = body;

  if (!entity_id) return c.json({ error: "entity_id required" }, 400);

  // IP-based spam guard (hash the IP)
  const ip   = c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const hash = await hashIdentifier(ip);

  const voteRecord = await recordVote(c.env.TOP5_DB, entity_id, hash);

  if (!voteRecord.success) {
    return c.json({ success: false, message: "โหวตแล้วในช่วง 24 ชั่วโมงนี้", new_upvotes: voteRecord.new_upvotes } as VoteResult);
  }

  // Re-rank after vote and check challenger swap
  const intentResult = classifyIntent(query ?? "");
  
  // Try FTS first
  const ftsSearchTerms = [query, intentResult.did_you_mean].filter(Boolean).join(" ");
  let rawEntities = await searchEntitiesFTS(c.env.TOP5_DB, ftsSearchTerms, intentResult.intent === "general" ? undefined : intentResult.intent);

  // Fallback
  if (rawEntities.length < 3) {
    let fallbackEntities: any[] = [];
    switch (intentResult.intent) {
      case "geo":        fallbackEntities = await fetchGeoEntities(c.env.TOP5_DB, query); break;
      case "web3":       fallbackEntities = await fetchWeb3Entities(c.env.TOP5_DB); break;
      case "dev":        fallbackEntities = await fetchDevEntities(c.env.TOP5_DB); break;
      case "popculture": fallbackEntities = await fetchPopcultureEntities(c.env.TOP5_DB); break;
      case "academic":   fallbackEntities = await fetchAcademicEntities(c.env.TOP5_DB); break;
      default:           fallbackEntities = await fetchGeoEntities(c.env.TOP5_DB, query);
    }
    const seen = new Set(rawEntities.map(e => e.entity_id));
    for (const e of fallbackEntities) {
      if (!seen.has(e.entity_id)) {
        rawEntities.push(e);
        seen.add(e.entity_id);
      }
    }
  }

  const { top5, challenger_pool } = rankEntities(rawEntities);
  const swapResult = checkChallengerSwap(top5, challenger_pool);

  // Invalidate cache
  const cacheKey = buildCacheKey(intentResult.intent, query);
  c.executionCtx.waitUntil(c.env.CACHE_KV.delete(cacheKey));

  const result: VoteResult = {
    success: true,
    new_upvotes: voteRecord.new_upvotes,
    rank_changed: swapResult.swapped,
    new_rank: swapResult.top5.findIndex((e) => e.entity_id === entity_id) + 1 || undefined,
    swapped_with: swapResult.demoted?.entity_name,
    message: swapResult.swapped
      ? `🎉 ${swapResult.promoted?.entity_name} ขึ้นอันดับใหม่แล้ว!`
      : "โหวตสำเร็จ!",
  };

  return c.json({ ...result, top5: swapResult.top5, challenger_pool: swapResult.challenger_pool });
});

// ──────────────────────────────────────────────────────────────
// GET /api/trending
// ──────────────────────────────────────────────────────────────
app.get("/api/trending", async (c) => {
  const trending = await getTrending(c.env.TOP5_DB, 12);
  return c.json({ trending });
});

// ──────────────────────────────────────────────────────────────
// GET /api/sse?q=กะเพรา — Server-Sent Events for live rank updates
// ──────────────────────────────────────────────────────────────
app.get("/api/sse", async (c) => {
  const q = c.req.query("q") ?? "";
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (data: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Heartbeat every 30s to keep connection alive
  const interval = setInterval(() => {
    send({ type: "heartbeat", query: q, ts: Date.now() });
  }, 30000);

  // Initial connection message
  send({ type: "connected", query: q, ts: Date.now() });

  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(interval);
    writer.close();
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ──────────────────────────────────────────────────────────────
// Healthcheck
// ──────────────────────────────────────────────────────────────
app.get("/api/health", (c) =>
  c.json({ status: "ok", version: "1.0.0", ts: Date.now() })
);

// ──────────────────────────────────────────────────────────────
// Utility: Hash IP for privacy-preserving spam guard
// ──────────────────────────────────────────────────────────────
async function hashIdentifier(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export default app;
