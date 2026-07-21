// ─────────────────────────────────────────────────────────────
//  Geo Pipeline — ใช้ Google Maps Deep Link (ไม่ต้องการ API Key)
//  URL Pattern: https://www.google.com/maps/search/?api=1&query={lat},{lng}
// ─────────────────────────────────────────────────────────────
import type { Entity, GeoCoords, BoundingBox } from "@top5/shared";
import {
  getEntitiesByBoundingBox,
  getAllGeoEntities,
} from "../db/queries";

const GEO_RADIUS_KM = 5;
const LAT_PER_KM = 1 / 111.0;   // ~0.009 degrees per km
const LNG_PER_KM = 1 / 111.320; // approximate at equator

/**
 * สร้าง Google Maps deep link จาก lat/lng — ไม่ต้องการ API Key
 */
export function buildGoogleMapsUrl(
  lat: number,
  lng: number,
  name: string
): string {
  const encodedName = encodeURIComponent(name);
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodedName}`;
}

/**
 * สร้าง Google Maps embed static preview URL (ไม่ต้องการ API Key — ใช้ maps.app.goo.gl redirect)
 */
export function buildMapsShareUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * คำนวณ Bounding Box รอบพิกัดผู้ใช้ ±5km
 */
export function calcBoundingBox(center: GeoCoords, radiusKm = GEO_RADIUS_KM): BoundingBox {
  const deltaLat = radiusKm * LAT_PER_KM;
  const deltaLng = radiusKm * LNG_PER_KM;
  return {
    min_lat: center.lat - deltaLat,
    max_lat: center.lat + deltaLat,
    min_lng: center.lng - deltaLng,
    max_lng: center.lng + deltaLng,
  };
}

/**
 * ดึงข้อมูล Geo Entities จาก D1 และเติม Google Maps deep links
 */
export async function fetchGeoEntities(
  db: D1Database,
  query: string,
  coords?: GeoCoords
): Promise<Entity[]> {
  let entities: Entity[];

  if (coords) {
    const box = calcBoundingBox(coords);
    entities = await getEntitiesByBoundingBox(db, "geo", box);
    // Fallback: ถ้าไม่มีใกล้ radius ให้ดึงทั้งหมด
    if (entities.length === 0) {
      entities = await getAllGeoEntities(db);
    }
  } else {
    entities = await getAllGeoEntities(db);
  }

  // เติม Google Maps URL ให้ทุก entity (ไม่ต้องการ API Key)
  return entities.map((e) => ({
    ...e,
    external_url:
      e.latitude && e.longitude
        ? buildGoogleMapsUrl(e.latitude, e.longitude, e.entity_name)
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.entity_name + " " + (e.address ?? ""))}`,
    // image_url: ใช้ Unsplash placeholder ที่ seed ไว้แล้ว
  }));
}
