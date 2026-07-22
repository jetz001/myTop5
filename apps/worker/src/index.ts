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
import { runAIFallback } from "./pipelines/ai_fallback";
import { runCronSeeder } from "./pipelines/cron_seeder";

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

  // Check if this query was ever searched before (exists in query_logs = AI was called already)
  const isGeo = intentResult.intent === "geo";
  
  let hasBeenSearchedBefore = false;
  if (!isGeo && rawEntities.length > 0) {
    // If we already have some FTS results, check if this query was searched before
    // If yes → skip AI (the entities are already in DB, FTS just returns what matches)
    const prevSearch = await c.env.TOP5_DB
      .prepare(`SELECT id FROM query_logs WHERE query = ? LIMIT 1`)
      .bind(q)
      .first();
    hasBeenSearchedBefore = !!prevSearch;
  }

  // Fallback logic:
  // - GEO queries: always call AI (location context matters - "ผัดไทกทม" ≠ "ผัดไทนนทบุรี")
  // - Queries searched before: trust FTS results, no AI needed
  // - New queries with < 5 FTS results: call AI to populate DB
  const shouldFallback = isGeo || (!hasBeenSearchedBefore && (rawEntities.length === 0 || (rawEntities.length < 5 && intent !== "general")));
  
  if (shouldFallback) {
    const aiEntities = await runAIFallback(c.env, q, intent);
    
    // For geo: AI results take priority (they're location-specific)
    // For others: merge FTS and AI results
    if (isGeo) {
      const seen = new Set(aiEntities.map(e => e.entity_id));
      // Add FTS results that AI didn't cover (to fill any gaps)
      for (const e of rawEntities) {
        if (!seen.has(e.entity_id) && aiEntities.length < 8) {
          aiEntities.push(e);
          seen.add(e.entity_id);
        }
      }
      rawEntities = aiEntities;
    } else {
      const seen = new Set(rawEntities.map(e => e.entity_id));
      for (const e of aiEntities) {
        if (!seen.has(e.entity_id)) {
          rawEntities.push(e);
          seen.add(e.entity_id);
        }
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
  if (entity_id.startsWith("error_")) return c.json({ success: false, message: "ไม่สามารถโหวตให้ข้อผิดพลาดได้" } as VoteResult);

  // Spam guard: hash IP + entity_id so 1 IP = 1 vote per entity per 24h
  // This prevents keyword abuse (voting same entity via different search queries)
  const ip   = c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const hash = await hashIdentifier(`${ip}:${entity_id}`);

  const voteRecord = await recordVote(c.env.TOP5_DB, entity_id, hash);

  if (!voteRecord.success) {
    return c.json({ success: false, message: "โหวตแล้วในช่วง 24 ชั่วโมงนี้", new_upvotes: voteRecord.new_upvotes } as VoteResult);
  }

  // Re-rank after vote and check challenger swap
  const intentResult = classifyIntent(query ?? "");
  
  // Try FTS first
  const ftsSearchTerms = [query, intentResult.did_you_mean].filter(Boolean).join(" ");
  let rawEntities = await searchEntitiesFTS(c.env.TOP5_DB, ftsSearchTerms, intentResult.intent === "general" ? undefined : intentResult.intent);

  // Fallback shouldn't be needed here because AI already saved entities during /api/search
  // We just rank whatever FTS finds.
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

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCronSeeder(env));
  },
};
