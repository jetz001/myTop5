// Dev Pipeline — Programming Languages from D1 seed data
import type { Entity } from "@top5/shared";
import { getEntitiesByCategory } from "../db/queries";

export async function fetchDevEntities(db: D1Database): Promise<Entity[]> {
  const entities = await getEntitiesByCategory(db, "dev");
  return entities.map((e) => ({ ...e, intent: "dev" as const }));
}
