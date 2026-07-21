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
  // สร้าง FTS5 query string รองรับ prefix match เช่น "กะเพรา*"
  // เปลี่ยนช่องว่างเป็น OR หรือ AND ขึ้นกับความเข้มงวด (เอา OR แบบหลวมๆ)
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  
  // ใช้ prefix match (*) สำหรับแต่ละคำเพื่อให้เจอง่ายขึ้น
  const ftsQuery = terms.map(t => `"${t}"*`).join(" OR ");

  // Join FTS table กับ entities หลัก
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

  const result = await db.prepare(sql).bind(...bindParams).all<Entity>();
  return result.results ?? [];
}
