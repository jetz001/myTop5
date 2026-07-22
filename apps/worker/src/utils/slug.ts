// ─────────────────────────────────────────────────────────────
//  Deterministic Entity ID Generator — prevents duplicate rows
// ─────────────────────────────────────────────────────────────

/**
 * Generates a clean, deterministic entity_id slug from name.
 * Examples:
 *   "Demon Slayer" -> "ent_demon-slayer"
 *   "ร้านกะเพราอโศก" -> "ent_ร้านกะเพราอโศก"
 */
export function generateEntityId(name: string): string {
  if (!name || !name.trim()) return `ent_item_${Date.now()}`;

  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s\u0E00-\u0E7F-]/gi, "") // Keep alphanumeric, spaces, hyphens, and Thai script
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return `ent_${clean || "item_" + Date.now()}`;
}
