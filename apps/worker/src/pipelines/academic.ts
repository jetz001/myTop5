// Academic Pipeline — Science/Astronomy from D1 seed data
import type { Entity } from "@top5/shared";
import { getEntitiesByCategory } from "../db/queries";

export async function fetchAcademicEntities(db: D1Database): Promise<Entity[]> {
  const entities = await getEntitiesByCategory(db, "academic");
  return entities.map((e) => ({ ...e, intent: "academic" as const }));
}
