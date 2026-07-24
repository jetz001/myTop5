// ─────────────────────────────────────────────────────────────
//  D1 Database Query Helpers
// ─────────────────────────────────────────────────────────────
import type { Entity, BoundingBox, Env } from "@top5/shared";

/** ดึง entities ตาม category (ทุก intent ยกเว้น geo) */
export async function getEntitiesByCategory(
  db: D1Database,
  category: string,
  limit = 20
): Promise<Entity[]> {
  const result = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at
       FROM entities
       WHERE category = ?
       ORDER BY global_score DESC
       LIMIT ?`
    )
    .bind(category, limit)
    .all<Entity>();
  return result.results ?? [];
}

/** ดึง geo entities ภายใน Bounding Box (ไม่ต้องใช้ Google Maps API) */
export async function getEntitiesByBoundingBox(
  db: D1Database,
  category: string,
  box: BoundingBox,
  limit = 20
): Promise<Entity[]> {
  const result = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at
       FROM entities
       WHERE category = ?
         AND latitude  BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?
       ORDER BY global_score DESC
       LIMIT ?`
    )
    .bind(category, box.min_lat, box.max_lat, box.min_lng, box.max_lng, limit)
    .all<Entity>();
  return result.results ?? [];
}

/** ดึงทั้งหมดที่เป็น geo (fallback เมื่อไม่มี GPS) */
export async function getAllGeoEntities(
  db: D1Database,
  limit = 20
): Promise<Entity[]> {
  const result = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at
       FROM entities
       WHERE category = 'geo'
       ORDER BY global_score DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<Entity>();
  return result.results ?? [];
}

/** บันทึกโหวตและเพิ่ม upvotes */
export async function recordVote(
  db: D1Database,
  entityId: string,
  userIdentifier: string
): Promise<{ success: boolean; new_upvotes: number }> {
  // ตรวจ spam: โหวตซ้ำใน 24h ไม่ได้
  const existing = await db
    .prepare(
      `SELECT id FROM vote_logs
       WHERE entity_id = ? AND user_identifier = ?
         AND voted_at > datetime('now', '-24 hours')`
    )
    .bind(entityId, userIdentifier)
    .first();

  if (existing) {
    const current = await db
      .prepare(`SELECT upvotes FROM entities WHERE entity_id = ?`)
      .bind(entityId)
      .first<{ upvotes: number }>();
    return { success: false, new_upvotes: current?.upvotes ?? 0 };
  }

  // เพิ่ม upvotes
  await db
    .prepare(
      `UPDATE entities
       SET upvotes = upvotes + 1, last_voted_at = CURRENT_TIMESTAMP
       WHERE entity_id = ?`
    )
    .bind(entityId)
    .run();

  // บันทึก vote log
  await db
    .prepare(
      `INSERT INTO vote_logs (id, entity_id, user_identifier)
       VALUES (?, ?, ?)`
    )
    .bind(crypto.randomUUID(), entityId, userIdentifier)
    .run();

  const updated = await db
    .prepare(`SELECT upvotes FROM entities WHERE entity_id = ?`)
    .bind(entityId)
    .first<{ upvotes: number }>();

  return { success: true, new_upvotes: updated?.upvotes ?? 0 };
}

/** บันทึก query log (trending analytics) */
export async function logQuery(
  db: D1Database,
  query: string,
  intent: string
): Promise<void> {
  await db
    .prepare(`INSERT INTO query_logs (id, query, intent) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), query, intent)
    .run();
}

/** ดึง trending queries ใน 24 ชั่วโมงที่ผ่านมา */
export async function getTrending(
  db: D1Database,
  limit = 10
): Promise<{ query: string; intent: string; count: number }[]> {
  const result = await db
    .prepare(
      `SELECT query, intent, COUNT(*) as count
       FROM query_logs
       WHERE searched_at > datetime('now', '-24 hours')
       GROUP BY query, intent
       ORDER BY count DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<{ query: string; intent: string; count: number }>();
  return result.results ?? [];
}

/** ค้นหาผ่าน FTS5 (รองรับ query แบบ prefix หรือ exact match บนชื่อและรายละเอียด) */
export async function searchEntitiesFTS(
  db: D1Database,
  query: string,
  category?: string,
  limit = 20
): Promise<Entity[]> {
  // 1. Smart term tokenization (split spaces and separate letters from numbers e.g. "อนิเมะ2026" -> ["อนิเมะ", "2026"])
  const cleanQ = query.trim().replace(/([a-zA-Z\u0E00-\u0E7F]+)(\d+)/g, "$1 $2").replace(/(\d+)([a-zA-Z\u0E00-\u0E7F]+)/g, "$1 $2");
  const terms = cleanQ.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  
  // Filter out standalone year digits (e.g. "2026") from FTS text matching to prevent false positives
  const textTerms = terms.filter(t => !/^\d+$/.test(t));
  const searchTerms = textTerms.length > 0 ? textTerms : terms;
  const ftsQuery = searchTerms.map(t => `"${t}"*`).join(" AND ");


  let sql = `
    SELECT e.entity_id, e.entity_name, e.entity_name_en, e.category, e.description,
           e.image_url, e.external_url, e.latitude, e.longitude, e.address,
           e.global_score, e.upvotes, e.last_voted_at,
           bm25(entities_fts) as fts_rank
    FROM entities_fts fts
    JOIN entities e ON fts.entity_id = e.entity_id
    WHERE entities_fts MATCH ?
  `;

  const bindParams: any[] = [ftsQuery];

  if (category && category !== "general") {
    sql += ` AND e.category = ?`;
    bindParams.push(category);
  }

  sql += ` ORDER BY fts_rank ASC, e.global_score DESC LIMIT ?`;
  bindParams.push(limit);

  let results: Entity[] = [];
  try {
    const res = await db.prepare(sql).bind(...bindParams).all<Entity>();
    results = res.results ?? [];
    
    // SQLite FTS5 strips Thai vowels/tones (diacritics) by default. 
    // This causes "ปืน" (p-ue-n) and "ปุ่น" (p-u-n) to both become "ปน".
    // We must manually filter out false positives.
    results = results.filter(e => {
      const combined = `${e.entity_name} ${e.entity_name_en || ""} ${e.description || ""}`.toLowerCase();
      return searchTerms.every(t => combined.includes(t.toLowerCase()));
    });
  } catch { /* ignore FTS syntax errors */ }

  // 2. If FTS returned fewer than 5 results, search via SQL LIKE fallback
  if (results.length < 5) {
    const primaryTerm = terms[0];
    if (primaryTerm && primaryTerm.length >= 2) {
      let likeSql = `
        SELECT entity_id, entity_name, entity_name_en, category, description,
               image_url, external_url, latitude, longitude, address,
               global_score, upvotes, last_voted_at
        FROM entities
        WHERE (entity_name LIKE ? OR entity_name_en LIKE ? OR description LIKE ?)
      `;
      const likeBind: any[] = [`%${primaryTerm}%`, `%${primaryTerm}%`, `%${primaryTerm}%`];
      if (category && category !== "general") {
        likeSql += ` AND category = ?`;
        likeBind.push(category);
      }
      likeSql += ` ORDER BY upvotes DESC, global_score DESC LIMIT ?`;
      likeBind.push(limit);

      try {
        const likeRes = await db.prepare(likeSql).bind(...likeBind).all<Entity>();
        const seen = new Set(results.map(e => e.entity_id));
        for (const item of (likeRes.results ?? [])) {
          if (!seen.has(item.entity_id)) {
            results.push(item);
            seen.add(item.entity_id);
          }
        }
      } catch { /* ignore */ }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
//  User & Session DB Helpers
// ─────────────────────────────────────────────────────────────

export interface DBUser {
  user_id: string;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

export async function createUser(
  db: D1Database,
  userId: string,
  username: string,
  email: string,
  passwordHash: string,
  salt: string
): Promise<DBUser> {
  await db
    .prepare(
      `INSERT INTO users (user_id, username, email, password_hash, salt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(userId, username, email, passwordHash, salt)
    .run();

  const created = await db
    .prepare(`SELECT user_id, username, email, password_hash, salt, created_at FROM users WHERE user_id = ?`)
    .bind(userId)
    .first<DBUser>();

  if (!created) throw new Error("Failed to create user");
  return created;
}

export async function findUserByEmailOrUsername(
  db: D1Database,
  identifier: string
): Promise<DBUser | null> {
  return await db
    .prepare(
      `SELECT user_id, username, email, password_hash, salt, created_at
       FROM users
       WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)`
    )
    .bind(identifier, identifier)
    .first<DBUser>();
}

export async function createSession(
  db: D1Database,
  token: string,
  userId: string,
  expiresInDays = 30
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO user_sessions (token, user_id, expires_at)
       VALUES (?, ?, ?)`
    )
    .bind(token, userId, expiresAt)
    .run();
}

export async function getUserBySessionToken(
  db: D1Database,
  token: string
): Promise<DBUser | null> {
  const session = await db
    .prepare(
      `SELECT u.user_id, u.username, u.email, u.password_hash, u.salt, u.created_at
       FROM user_sessions s
       JOIN users u ON s.user_id = u.user_id
       WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`
    )
    .bind(token)
    .first<DBUser>();

  return session ?? null;
}

export async function deleteSession(
  db: D1Database,
  token: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM user_sessions WHERE token = ?`)
    .bind(token)
    .run();
}

export async function createCustomEntity(
  db: D1Database,
  data: {
    entity_name: string;
    entity_name_en?: string;
    category: string;
    description?: string;
    image_url?: string;
    userId: string;
  }
): Promise<Entity> {
  const entityId = `custom_${crypto.randomUUID()}`;
  const globalScore = 50.0;
  const initialUpvotes = 1;

  await db
    .prepare(
      `INSERT INTO entities (entity_id, entity_name, entity_name_en, category, description, image_url, global_score, upvotes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entityId,
      data.entity_name,
      data.entity_name_en || null,
      data.category,
      data.description || null,
      data.image_url || null,
      globalScore,
      initialUpvotes
    )
    .run();

  // Record initial vote log from creator
  await db
    .prepare(
      `INSERT INTO vote_logs (id, entity_id, user_identifier)
       VALUES (?, ?, ?)`
    )
    .bind(crypto.randomUUID(), entityId, data.userId)
    .run();

  const created = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at
       FROM entities WHERE entity_id = ?`
    )
    .bind(entityId)
    .first<Entity>();

  if (!created) throw new Error("Failed to create custom entity");
  return created;
}


