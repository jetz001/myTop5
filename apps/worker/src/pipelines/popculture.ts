// Popculture Pipeline — Celebrities from D1 seed data
import type { Entity } from "@top5/shared";
import { getEntitiesByCategory } from "../db/queries";

export async function fetchPopcultureEntities(db: D1Database): Promise<Entity[]> {
  const entities = await getEntitiesByCategory(db, "popculture");
  return entities.map((e) => ({ ...e, intent: "popculture" as const }));
}
