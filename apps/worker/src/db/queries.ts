// ─────────────────────────────────────────────────────────────
//  D1 Database Query Helpers
// ─────────────────────────────────────────────────────────────
import type { Entity, BoundingBox, Env, Sponsor } from "@top5/shared";

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
           e.global_score, e.upvotes, e.last_voted_at, e.created_by_user_id, e.created_by_username, e.created_at,
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

  // 2. Always supplement with SQL LIKE search so items matching in description or created by users are included
  if (results.length < 30) {
    const primaryTerm = terms[0];
    if (primaryTerm && primaryTerm.length >= 2) {
      let likeSql = `
        SELECT entity_id, entity_name, entity_name_en, category, description,
               image_url, external_url, latitude, longitude, address,
               global_score, upvotes, last_voted_at, created_by_user_id, created_by_username, created_at
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
  role: "user" | "admin";
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
  const userCount = await db
    .prepare(`SELECT COUNT(*) as count FROM users`)
    .first<{ count: number }>();
  const role = (userCount?.count ?? 0) === 0 ? "admin" : "user";

  await db
    .prepare(
      `INSERT INTO users (user_id, username, email, password_hash, salt, role)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, username, email, passwordHash, salt, role)
    .run();

  const created = await db
    .prepare(`SELECT user_id, username, email, password_hash, salt, role, created_at FROM users WHERE user_id = ?`)
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
      `SELECT user_id, username, email, password_hash, salt, role, created_at
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
      `SELECT u.user_id, u.username, u.email, u.password_hash, u.salt, u.role, u.created_at
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
    username: string;
  }
): Promise<Entity> {
  const entityId = `custom_${crypto.randomUUID()}`;
  const globalScore = 50.0;
  const initialUpvotes = 1;

  await db
    .prepare(
      `INSERT INTO entities (entity_id, entity_name, entity_name_en, category, description, image_url, global_score, upvotes, created_by_user_id, created_by_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entityId,
      data.entity_name,
      data.entity_name_en || null,
      data.category,
      data.description || null,
      data.image_url || null,
      globalScore,
      initialUpvotes,
      data.userId,
      data.username
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

  // Audit activity log
  await logActivity(db, {
    userId: data.userId,
    username: data.username,
    action: "CREATE_ENTITY",
    entityId,
    entityName: data.entity_name,
    details: `เสนอรายการใหม่: "${data.entity_name}" (Category: ${data.category})`
  });

  const created = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at, created_by_user_id, created_by_username, created_at
       FROM entities WHERE entity_id = ?`
    )
    .bind(entityId)
    .first<Entity>();

  if (!created) throw new Error("Failed to create custom entity");
  return created;
}

// ─────────────────────────────────────────────────────────────
//  Audit Activity Log & Admin Queries
// ─────────────────────────────────────────────────────────────

export async function logActivity(
  db: D1Database,
  data: {
    userId: string;
    username: string;
    action: "CREATE_ENTITY" | "UPDATE_ENTITY" | "DELETE_ENTITY" | "VOTE";
    entityId?: string;
    entityName?: string;
    details?: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activity_logs (id, user_id, username, action, entity_id, entity_name, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      data.userId,
      data.username,
      data.action,
      data.entityId || null,
      data.entityName || null,
      data.details || null
    )
    .run();
}

export async function getActivityLogs(
  db: D1Database,
  search?: string,
  limit = 100
): Promise<ActivityLog[]> {
  let sql = `SELECT id, user_id, username, action, entity_id, entity_name, details, created_at FROM activity_logs`;
  const params: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE username LIKE ? OR entity_name LIKE ? OR action LIKE ? OR details LIKE ?`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const res = await db.prepare(sql).bind(...params).all<ActivityLog>();
  return res.results ?? [];
}

export async function getAllUsers(
  db: D1Database,
  search?: string,
  limit = 100
): Promise<UserProfile[]> {
  let sql = `SELECT user_id, username, email, role, created_at FROM users`;
  const params: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE username LIKE ? OR email LIKE ?`;
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const res = await db.prepare(sql).bind(...params).all<UserProfile>();
  return res.results ?? [];
}

export async function updateUserRole(
  db: D1Database,
  userId: string,
  newRole: "user" | "admin"
): Promise<void> {
  await db
    .prepare(`UPDATE users SET role = ? WHERE user_id = ?`)
    .bind(newRole, userId)
    .run();
}

export async function getUserEntities(
  db: D1Database,
  userId: string
): Promise<Entity[]> {
  const res = await db
    .prepare(
      `SELECT entity_id, entity_name, entity_name_en, category, description,
              image_url, external_url, latitude, longitude, address,
              global_score, upvotes, last_voted_at, created_by_user_id, created_by_username, created_at
       FROM entities
       WHERE created_by_user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<Entity>();
  return res.results ?? [];
}

export async function updateCustomEntity(
  db: D1Database,
  entityId: string,
  userId: string,
  username: string,
  isAdmin: boolean,
  data: {
    entity_name: string;
    entity_name_en?: string;
    description?: string;
    image_url?: string;
  }
): Promise<boolean> {
  let sql = `UPDATE entities SET entity_name = ?, entity_name_en = ?, description = ?, image_url = ? WHERE entity_id = ?`;
  const params: any[] = [
    data.entity_name,
    data.entity_name_en || null,
    data.description || null,
    data.image_url || null,
    entityId
  ];

  if (!isAdmin) {
    sql += ` AND created_by_user_id = ?`;
    params.push(userId);
  }

  const res = await db.prepare(sql).bind(...params).run();
  const success = (res.meta.changes ?? 0) > 0;

  if (success) {
    await logActivity(db, {
      userId,
      username,
      action: "UPDATE_ENTITY",
      entityId,
      entityName: data.entity_name,
      details: `แก้ไขข้อมูลรายการ: "${data.entity_name}"`
    });
  }

  return success;
}

export async function deleteEntityAdmin(
  db: D1Database,
  entityId: string,
  adminUserId: string,
  adminUsername: string
): Promise<boolean> {
  const entity = await db
    .prepare(`SELECT entity_name FROM entities WHERE entity_id = ?`)
    .bind(entityId)
    .first<{ entity_name: string }>();

  if (!entity) return false;

  await db.prepare(`DELETE FROM entities WHERE entity_id = ?`).bind(entityId).run();
  await db.prepare(`DELETE FROM vote_logs WHERE entity_id = ?`).bind(entityId).run();

  await logActivity(db, {
    userId: adminUserId,
    username: adminUsername,
    action: "DELETE_ENTITY",
    entityId,
    entityName: entity.entity_name,
    details: `ผู้ดูแลระบบลบรายการ "${entity.entity_name}"`
  });

  return true;
}

// ─────────────────────────────────────────────────────────────
//  Sponsor Module DB Queries
// ─────────────────────────────────────────────────────────────

export async function getMatchingSponsors(
  db: D1Database,
  keyword: string
): Promise<Sponsor[]> {
  const cleanKw = keyword.trim().toLowerCase();
  if (!cleanKw) return [];

  const res = await db
    .prepare(
      `SELECT sponsor_id, sponsor_name, target_keyword, title, description, image_url, target_url, badge_text, status, start_at, end_at, click_count, created_at
       FROM sponsors
       WHERE status = 'active'
         AND (start_at IS NULL OR datetime(start_at) <= datetime('now'))
         AND (end_at IS NULL OR datetime(end_at) >= datetime('now'))
       ORDER BY created_at DESC`
    )
    .all<Sponsor>();

  const allActive = res.results ?? [];
  return allActive.filter((sp) => {
    if (!sp.target_keyword) return false;
    if (sp.target_keyword.trim() === "*") return true;

    // Split up to 5 keywords by comma (supports English ',' and Thai/Unicode commas)
    const tags = sp.target_keyword
      .split(/[,，]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    return tags.some((tag) => cleanKw.includes(tag) || tag.includes(cleanKw));
  });
}

export async function getAllSponsorsAdmin(
  db: D1Database,
  search?: string
): Promise<Sponsor[]> {
  let sql = `SELECT sponsor_id, sponsor_name, target_keyword, title, description, image_url, target_url, badge_text, status, start_at, end_at, click_count, created_at FROM sponsors`;
  const params: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE sponsor_name LIKE ? OR target_keyword LIKE ? OR title LIKE ?`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  sql += ` ORDER BY created_at DESC`;

  const res = await db.prepare(sql).bind(...params).all<Sponsor>();
  return res.results ?? [];
}

export async function createSponsorAdmin(
  db: D1Database,
  data: {
    sponsor_name: string;
    target_keyword: string;
    title: string;
    description?: string;
    image_url?: string;
    target_url: string;
    badge_text?: string;
    status?: "active" | "inactive";
    start_at?: string;
    end_at?: string;
  }
): Promise<Sponsor> {
  const sponsorId = `sp_${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO sponsors (sponsor_id, sponsor_name, target_keyword, title, description, image_url, target_url, badge_text, status, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      sponsorId,
      data.sponsor_name,
      data.target_keyword,
      data.title,
      data.description || null,
      data.image_url || null,
      data.target_url,
      data.badge_text || "⭐ สปอนเซอร์",
      data.status || "active",
      data.start_at || null,
      data.end_at || null
    )
    .run();

  const created = await db
    .prepare(`SELECT sponsor_id, sponsor_name, target_keyword, title, description, image_url, target_url, badge_text, status, start_at, end_at, click_count, created_at FROM sponsors WHERE sponsor_id = ?`)
    .bind(sponsorId)
    .first<Sponsor>();

  if (!created) throw new Error("Failed to create sponsor");
  return created;
}

export async function updateSponsorAdmin(
  db: D1Database,
  sponsorId: string,
  data: {
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
  }
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE sponsors SET
         sponsor_name = COALESCE(?, sponsor_name),
         target_keyword = COALESCE(?, target_keyword),
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         image_url = COALESCE(?, image_url),
         target_url = COALESCE(?, target_url),
         badge_text = COALESCE(?, badge_text),
         status = COALESCE(?, status),
         start_at = ?,
         end_at = ?
       WHERE sponsor_id = ?`
    )
    .bind(
      data.sponsor_name || null,
      data.target_keyword || null,
      data.title || null,
      data.description || null,
      data.image_url || null,
      data.target_url || null,
      data.badge_text || null,
      data.status || null,
      data.start_at || null,
      data.end_at || null,
      sponsorId
    )
    .run();

  return (res.meta.changes ?? 0) > 0;
}

export async function deleteSponsorAdmin(
  db: D1Database,
  sponsorId: string
): Promise<boolean> {
  const res = await db
    .prepare(`DELETE FROM sponsors WHERE sponsor_id = ?`)
    .bind(sponsorId)
    .run();

  return (res.meta.changes ?? 0) > 0;
}

export async function recordSponsorClick(
  db: D1Database,
  sponsorId: string
): Promise<void> {
  await db
    .prepare(`UPDATE sponsors SET click_count = click_count + 1 WHERE sponsor_id = ?`)
    .bind(sponsorId)
    .run();
}




