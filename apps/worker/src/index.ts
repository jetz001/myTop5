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
import { logQuery, recordVote, getTrending, searchEntitiesFTS, createUser, findUserByEmailOrUsername, createSession, getUserBySessionToken, deleteSession, createCustomEntity, logActivity, getActivityLogs, getAllUsers, updateUserRole, getUserEntities, updateCustomEntity, deleteEntityAdmin, getMatchingSponsors, getAllSponsorsAdmin, createSponsorAdmin, updateSponsorAdmin, deleteSponsorAdmin, recordSponsorClick } from "./db/queries";
import { generateSalt, hashPassword, verifyPassword, generateToken } from "./auth";
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

  // 2. Cache check (only use cache if it has > 0 items)
  const cacheKey = buildCacheKey(intent, q, lat, lng);
  const cached = await getCached(c.env.CACHE_KV, cacheKey);
  if (cached && Array.isArray(cached.top5) && cached.top5.length > 0) {
    const sponsors = await getMatchingSponsors(c.env.TOP5_DB, q);
    return c.json({
      ...cached,
      sponsors: sponsors.length > 0 ? sponsors : undefined,
      cached: true,
      latency_ms: Date.now() - start
    });
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
  // If we have NEVER searched for this exact query before (hasBeenSearchedBefore = false),
  // we MUST fallback to AI/API to generate a dedicated Top 5 list for it.
  // Otherwise, if we have searched for it, we only fallback if we have < 5 items.
  const shouldFallback = isGeo ? rawEntities.length === 0 : (!hasBeenSearchedBefore || rawEntities.length < 5);

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

  // 5. Fetch active matching sponsors
  const sponsors = await getMatchingSponsors(c.env.TOP5_DB, q);

  const result: SearchResult = {
    query: q,
    intent,
    top5,
    challenger_pool,
    sponsors: sponsors.length > 0 ? sponsors : undefined,
    cached: false,
    latency_ms: Date.now() - start,
    did_you_mean: intentResult.did_you_mean,
  };

  // 6. Cache result + log query (only if we have items)
  if (result.top5.length > 0) {
    c.executionCtx.waitUntil(
      Promise.all([
        setCache(c.env.CACHE_KV, cacheKey, result),
        logQuery(c.env.TOP5_DB, q, intent, top5[0]?.entity_id),
      ])
    );
  }

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
// AUTH ENDPOINTS
// ──────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (c) => {
  try {
    const { username, email, password } = await c.req.json<{ username?: string; email?: string; password?: string }>();
    if (!username || !username.trim() || username.length < 3) {
      return c.json({ success: false, message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" }, 400);
    }
    if (!email || !email.includes("@")) {
      return c.json({ success: false, message: "อีเมลไม่ถูกต้อง" }, 400);
    }
    if (!password || password.length < 6) {
      return c.json({ success: false, message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);
    }

    const cleanUsername = username.trim();
    const cleanEmail    = email.trim().toLowerCase();

    // Check existing
    const existing = await findUserByEmailOrUsername(c.env.TOP5_DB, cleanEmail);
    if (existing) {
      if (existing.email.toLowerCase() === cleanEmail) {
        return c.json({ success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" }, 400);
      }
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ success: false, message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" }, 400);
      }
    }

    const userId = `user_${crypto.randomUUID()}`;
    const salt   = await generateSalt();
    const hash   = await hashPassword(password, salt);

    const user = await createUser(c.env.TOP5_DB, userId, cleanUsername, cleanEmail, hash, salt);
    const token = generateToken();
    await createSession(c.env.TOP5_DB, token, user.user_id);

    return c.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE constraint failed")) {
      return c.json({ success: false, message: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว" }, 400);
    }
    return c.json({ success: false, message: "เกิดข้อผิดพลาดในการสมัครสมาชิก" }, 500);
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (c) => {
  try {
    const { email_or_username, password } = await c.req.json<{ email_or_username?: string; password?: string }>();
    if (!email_or_username || !password) {
      return c.json({ success: false, message: "กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน" }, 400);
    }

    const user = await findUserByEmailOrUsername(c.env.TOP5_DB, email_or_username.trim());
    if (!user) {
      return c.json({ success: false, message: "ไม่พบบัญชีผู้ใช้งานนี้" }, 400);
    }

    const valid = await verifyPassword(password, user.salt, user.password_hash);
    if (!valid) {
      return c.json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 400);
    }

    const token = generateToken();
    await createSession(c.env.TOP5_DB, token, user.user_id);

    return c.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch {
    return c.json({ success: false, message: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" }, 500);
  }
});

// GET /api/auth/me
app.get("/api/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user  = await getUserBySessionToken(c.env.TOP5_DB, token);

  if (!user) {
    return c.json({ success: false, message: "Session expired or invalid" }, 401);
  }

  return c.json({
    success: true,
    user: {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
  });
});

// POST /api/auth/logout
app.post("/api/auth/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    await deleteSession(c.env.TOP5_DB, token);
  }
  return c.json({ success: true });
});

// POST /api/entities/add — Propose new candidate entity
app.post("/api/entities/add", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "ต้องเข้าสู่ระบบเพื่อเสนอรายการใหม่" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user) {
    return c.json({ success: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" }, 401);
  }

  const { query, entity_name, entity_name_en, description, image_url } =
    await c.req.json<{
      query?: string;
      entity_name?: string;
      entity_name_en?: string;
      description?: string;
      image_url?: string;
    }>();

  if (!query || !query.trim()) {
    return c.json({ success: false, message: "กรุณาระบุหัวข้อการค้นหา" }, 400);
  }
  if (!entity_name || !entity_name.trim()) {
    return c.json({ success: false, message: "กรุณากรอกชื่อรายการ" }, 400);
  }

  const intentResult = classifyIntent(query);
  const category = intentResult.intent;

  const cleanQuery = query.trim();
  let cleanDesc = description?.trim() || "";
  const fullText = `${entity_name} ${entity_name_en || ""} ${cleanDesc}`.toLowerCase();
  if (!fullText.includes(cleanQuery.toLowerCase())) {
    cleanDesc = cleanDesc ? `${cleanDesc} (${cleanQuery})` : `(${cleanQuery})`;
  }

  await createCustomEntity(c.env.TOP5_DB, {
    entity_name: entity_name.trim(),
    entity_name_en: entity_name_en?.trim(),
    category,
    description: cleanDesc || undefined,
    image_url: image_url?.trim(),
    userId: user.user_id,
    username: user.username,
  });

  // Invalidate search cache
  const cacheKey = buildCacheKey(category, query);
  c.executionCtx.waitUntil(c.env.CACHE_KV.delete(cacheKey));

  // Re-fetch and re-rank entities
  const ftsSearchTerms = [query, intentResult.did_you_mean].filter(Boolean).join(" ");
  const rawEntities = await searchEntitiesFTS(
    c.env.TOP5_DB,
    ftsSearchTerms,
    category === "general" ? undefined : category
  );

  const { top5, challenger_pool } = rankEntities(rawEntities);

  return c.json({
    success: true,
    message: `เสนอ "${entity_name.trim()}" เข้าสู่รายการเรียบร้อยแล้ว!`,
    top5,
    challenger_pool,
  });
});

// GET /api/user/entities — Get entities created by logged in user
app.get("/api/user/entities", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }

  const entities = await getUserEntities(c.env.TOP5_DB, user.user_id);
  return c.json({ success: true, entities });
});

// PUT /api/entities/update — Update entity details
app.put("/api/entities/update", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "ต้องเข้าสู่ระบบเพื่อแก้ไขข้อมูล" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user) {
    return c.json({ success: false, message: "Session หมดอายุ" }, 401);
  }

  const { entity_id, entity_name, entity_name_en, description, image_url } =
    await c.req.json<{
      entity_id?: string;
      entity_name?: string;
      entity_name_en?: string;
      description?: string;
      image_url?: string;
    }>();

  if (!entity_id || !entity_name || !entity_name.trim()) {
    return c.json({ success: false, message: "ข้อมูลไม่ครบถ้วน" }, 400);
  }

  const updated = await updateCustomEntity(
    c.env.TOP5_DB,
    entity_id,
    user.user_id,
    user.username,
    user.role === "admin",
    {
      entity_name: entity_name.trim(),
      entity_name_en: entity_name_en?.trim(),
      description: description?.trim(),
      image_url: image_url?.trim(),
    }
  );

  if (!updated) {
    return c.json({ success: false, message: "ไม่พบรายการ หรือคุณไม่มีสิทธิ์แก้ไขรายการนี้" }, 403);
  }

  return c.json({ success: true, message: "แก้ไขข้อมูลรายการเรียบร้อยแล้ว!" });
});

// ──────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────────

// GET /api/admin/logs — Search & view activity logs
app.get("/api/admin/logs", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const q = c.req.query("q") ?? "";
  const logs = await getActivityLogs(c.env.TOP5_DB, q);
  return c.json({ success: true, logs });
});

// GET /api/admin/users — Search & view all users
app.get("/api/admin/users", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const q = c.req.query("q") ?? "";
  const users = await getAllUsers(c.env.TOP5_DB, q);
  return c.json({ success: true, users });
});

// PUT /api/admin/users/role — Toggle user role (admin <-> user)
app.put("/api/admin/users/role", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const { target_user_id, role } = await c.req.json<{ target_user_id?: string; role?: "user" | "admin" }>();
  if (!target_user_id || !role || (role !== "user" && role !== "admin")) {
    return c.json({ success: false, message: "Invalid parameters" }, 400);
  }

  await updateUserRole(c.env.TOP5_DB, target_user_id, role);

  await logActivity(c.env.TOP5_DB, {
    userId: user.user_id,
    username: user.username,
    action: "UPDATE_ENTITY",
    details: `แอดมิน ${user.username} สลับบทบาทสมาชิก ${target_user_id} เป็น ${role}`
  });

  return c.json({ success: true, message: `เปลี่ยนสิทธิ์เป็น ${role} เรียบร้อยแล้ว` });
});

// DELETE /api/admin/entities — Delete entity
app.delete("/api/admin/entities", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const { entity_id } = await c.req.json<{ entity_id?: string }>();
  if (!entity_id) {
    return c.json({ success: false, message: "entity_id required" }, 400);
  }

  const deleted = await deleteEntityAdmin(c.env.TOP5_DB, entity_id, user.user_id, user.username);
  if (!deleted) {
    return c.json({ success: false, message: "ไม่พบรายการที่ต้องการลบ" }, 404);
  }

  return c.json({ success: true, message: "ลบรายการเรียบร้อยแล้ว" });
});

// GET /api/admin/sponsors — Fetch all sponsors
app.get("/api/admin/sponsors", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const q = c.req.query("q") ?? "";
  const sponsors = await getAllSponsorsAdmin(c.env.TOP5_DB, q);
  return c.json({ success: true, sponsors });
});

// POST /api/admin/sponsors — Create sponsor campaign
app.post("/api/admin/sponsors", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const body = await c.req.json<{
    sponsor_name?: string;
    target_keyword?: string;
    title?: string;
    description?: string;
    image_url?: string;
    target_url?: string;
    badge_text?: string;
    status?: "active" | "inactive";
    start_at?: string;
    end_at?: string;
  }>();

  if (!body.sponsor_name || !body.target_keyword || !body.title || !body.target_url) {
    return c.json({ success: false, message: "กรุณากรอกข้อมูลสำคัญให้ครบถ้วน" }, 400);
  }

  const tags = body.target_keyword.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  if (tags.length > 5) {
    return c.json({ success: false, message: "รองรับคีย์เวิร์ดเป้าหมายสูงสุดไม่เกิน 5 คีย์เวิร์ด (คั่นด้วยเครื่องหมาย ,)" }, 400);
  }

  const sponsor = await createSponsorAdmin(c.env.TOP5_DB, {
    sponsor_name: body.sponsor_name.trim(),
    target_keyword: body.target_keyword.trim(),
    title: body.title.trim(),
    description: body.description?.trim(),
    image_url: body.image_url?.trim(),
    target_url: body.target_url.trim(),
    badge_text: body.badge_text?.trim() || "⭐ สปอนเซอร์",
    status: body.status || "active",
    start_at: body.start_at || undefined,
    end_at: body.end_at || undefined,
  });

  await logActivity(c.env.TOP5_DB, {
    userId: user.user_id,
    username: user.username,
    action: "CREATE_ENTITY",
    details: `แอดมินสร้างสปอนเซอร์ใหม่: "${sponsor.sponsor_name}" (คีย์เวิร์ด: ${sponsor.target_keyword})`
  });

  return c.json({ success: true, sponsor, message: "สร้างแคมเปญสปอนเซอร์เรียบร้อยแล้ว!" });
});

// PUT /api/admin/sponsors/update — Update sponsor campaign
app.put("/api/admin/sponsors/update", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const { sponsor_id, ...data } = await c.req.json<{
    sponsor_id?: string;
    sponsor_name?: string;
    target_keyword?: string;
    title?: string;
    description?: string;
    image_url?: string;
    target_url?: string;
    badge_text?: string;
    status?: "active" | "inactive";
    start_at?: string;
    end_at?: string;
  }>();

  if (!sponsor_id) {
    return c.json({ success: false, message: "sponsor_id required" }, 400);
  }

  if (data.target_keyword) {
    const tags = data.target_keyword.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    if (tags.length > 5) {
      return c.json({ success: false, message: "รองรับคีย์เวิร์ดเป้าหมายสูงสุดไม่เกิน 5 คีย์เวิร์ด (คั่นด้วยเครื่องหมาย ,)" }, 400);
    }
  }

  const updated = await updateSponsorAdmin(c.env.TOP5_DB, sponsor_id, data);
  if (!updated) {
    return c.json({ success: false, message: "ไม่พบแคมเปญสปอนเซอร์ที่ต้องการแก้ไข" }, 404);
  }

  await logActivity(c.env.TOP5_DB, {
    userId: user.user_id,
    username: user.username,
    action: "UPDATE_ENTITY",
    details: `แอดมินแก้ไขข้อมูลแคมเปญสปอนเซอร์ ID: ${sponsor_id}`
  });

  return c.json({ success: true, message: "อัปเดตแคมเปญสปอนเซอร์เรียบร้อยแล้ว!" });
});

// DELETE /api/admin/sponsors — Delete sponsor campaign
app.delete("/api/admin/sponsors", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Unauthenticated" }, 401);
  }
  const token = authHeader.substring(7);
  const user = await getUserBySessionToken(c.env.TOP5_DB, token);
  if (!user || user.role !== "admin") {
    return c.json({ success: false, message: "Access denied. Admin only." }, 403);
  }

  const { sponsor_id } = await c.req.json<{ sponsor_id?: string }>();
  if (!sponsor_id) {
    return c.json({ success: false, message: "sponsor_id required" }, 400);
  }

  const deleted = await deleteSponsorAdmin(c.env.TOP5_DB, sponsor_id);
  if (!deleted) {
    return c.json({ success: false, message: "ไม่พบแคมเปญสปอนเซอร์ที่ต้องการลบ" }, 404);
  }

  await logActivity(c.env.TOP5_DB, {
    userId: user.user_id,
    username: user.username,
    action: "DELETE_ENTITY",
    details: `แอดมินลบแคมเปญสปอนเซอร์ ID: ${sponsor_id}`
  });

  return c.json({ success: true, message: "ลบแคมเปญสปอนเซอร์เรียบร้อยแล้ว" });
});

// POST /api/sponsors/click — Track click on sponsor ad
app.post("/api/sponsors/click", async (c) => {
  const { sponsor_id } = await c.req.json<{ sponsor_id?: string }>();
  if (sponsor_id) {
    c.executionCtx.waitUntil(recordSponsorClick(c.env.TOP5_DB, sponsor_id));
  }
  return c.json({ success: true });
});





// ──────────────────────────────────────────────────────────────
// GET /api/sse?q=กะเพรา — Server-Sent Events for live rank updates
// ──────────────────────────────────────────────────────────────
app.get("/api/sse", async (c) => {
  const q = c.req.query("q") ?? "";
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let isClosed = false;

  const send = (data: object) => {
    if (isClosed) return;
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      isClosed = true;
    }
  };

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(interval);
    clearTimeout(timeout);
    try {
      writer.close();
    } catch { /* ignore */ }
  };

  // Heartbeat every 5s to keep QUIC UDP stream active and prevent ERR_QUIC_PROTOCOL_ERROR
  const interval = setInterval(() => {
    send({ type: "heartbeat", query: q, ts: Date.now() });
  }, 5000);

  // Gracefully close stream after 90s so browser EventSource reconnects cleanly
  const timeout = setTimeout(() => {
    cleanup();
  }, 90000);

  // Initial connection message
  send({ type: "connected", query: q, ts: Date.now() });

  c.req.raw.signal.addEventListener("abort", cleanup);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
});


// ──────────────────────────────────────────────────────────────
// Healthcheck & AI Diagnostic Endpoint
// ──────────────────────────────────────────────────────────────
app.get("/api/health", (c) =>
  c.json({ status: "ok", version: "1.0.0", ts: Date.now() })
);

app.get("/api/test-ai", async (c) => {
  try {
    const query = "ดาราหญิงญี่ปุ่น";
    const intent = "popculture";
    const prompt = `You are Top5 AI. User searched: "${query}".
Return ONLY a valid JSON array of 8 REAL, FAMOUS, HUGELY POPULAR specific entities (people, places, things, brands, etc.) for this query. Do NOT invent fake names. Use real and well-known entities.
Format MUST be a valid JSON array of 8 objects:
[
  {
    "entity_name": "<ใส่ชื่อภาษาไทยที่เป็นที่รู้จักอย่างแพร่หลาย>",
    "entity_name_en": "<Official exact English Wikipedia title>",
    "description": "<ทำไมถึงติดอันดับ และมีความสำคัญอย่างไร (ภาษาไทย max 100 chars)>",
    "category": "${intent}",
    "w5h": {
      "who": "<ใครเกี่ยวข้อง>",
      "what": "<คืออะไร / ผลงานเด่น>",
      "where": "<ประเทศ / สถานที่>",
      "when": "<ช่วงเวลา / ยุค>",
      "why": "<ทำไมถึงติดอันดับ>"
    }
  }
]`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${c.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.7
      })
    });

    const data: any = await groqRes.json();
    const responseText = data.choices?.[0]?.message?.content || "";

    return c.json({
      groq_status: groqRes.status,
      raw_text: responseText,
      data
    });
  } catch (e: any) {
    return c.json({ error: e.message });
  }
});


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
