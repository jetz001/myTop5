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
import { fetchDevEntities } from "./pipelines/dev";
import { fetchPopcultureEntities } from "./pipelines/popculture";
import { fetchAcademicEntities } from "./pipelines/academic";
import { isSocialBot, rewriteOgMeta } from "./og";
import { runAIFallback } from "./pipelines/ai_fallback";
import { runCronSeeder } from "./pipelines/cron_seeder";
import { fetchAndSaveAnimeEntities } from "./pipelines/jikan";
import { fetchAndSaveCryptoEntities } from "./pipelines/web3";
import { serveImage } from "./pipelines/image_fetcher";

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

  // ── API-first, AI-last logic ────────────────────────────────
  // Detect specific sub-intents to route to free structured APIs
  const qLower = q.toLowerCase();
  const isAnimeQuery = intent === "popculture" && (
    /anime|manga|อนิเมะ|การ์ตูน|มังงะ|หนังการ์ตูน|season|arc|ซีซัน/.test(qLower)
  );
  const isCryptoQuery = intent === "web3" || (
    /crypto|coin|token|bitcoin|ethereum|btc|eth|defi|nft|คริปโต|เหรียญ/.test(qLower)
  );

  // ── DB-first, AI-last rule ─────────────────────────────────
  // If DB already has >= 5 matching entities, NEVER call AI or external APIs.
  // AI / external APIs are strictly used as fallback when DB has < 5 items.
  const shouldFallback = isGeo ? rawEntities.length === 0 : rawEntities.length < 5;

  if (shouldFallback) {
    let apiEntities: typeof rawEntities = [];

    // 1. Try structured APIs first (fast, free, no AI quota)
    if (isAnimeQuery) {
      apiEntities = await fetchAndSaveAnimeEntities(c.env, q, c.executionCtx);
    } else if (isCryptoQuery) {
      apiEntities = await fetchAndSaveCryptoEntities(c.env, q, c.executionCtx);
    }

    // 2. Only call AI if structured APIs didn't provide enough results
    const needsAI = isGeo || (apiEntities.length < 5 && !isAnimeQuery && !isCryptoQuery) || 
                    (apiEntities.length === 0 && (isAnimeQuery || isCryptoQuery));

    let aiEntities: typeof rawEntities = [];
    if (needsAI) {
      aiEntities = await runAIFallback(c.env, q, intent, c.executionCtx);
    }

    // Merge: API entities + AI entities + existing FTS
    const seen = new Set(rawEntities.map(e => e.entity_id));
    for (const e of [...apiEntities, ...aiEntities]) {
      if (!seen.has(e.entity_id)) {
        if (isGeo) {
          rawEntities.unshift(e); // geo: new results take priority
        } else {
          rawEntities.push(e);
        }
        seen.add(e.entity_id);
      }
    }
    // For geo: use AI/API results directly
    if (isGeo && aiEntities.length > 0) {
      rawEntities = aiEntities;
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
// GET /images/:entityId  — Serve R2 thumbnail (WebP/JPEG)
// ──────────────────────────────────────────────────────────────
app.get("/images/:entityId", async (c) => {
  const entityId = c.req.param("entityId");
  const name = c.req.query("name");
  return serveImage(c.env, entityId, name, c.executionCtx);
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

  // Invalidate search cache for this query so next search returns updated upvotes immediately
  if (query) {
    const cacheKey = buildCacheKey(classifyIntent(query).intent, query);
    c.executionCtx.waitUntil(c.env.CACHE_KV.delete(cacheKey));
  }

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
