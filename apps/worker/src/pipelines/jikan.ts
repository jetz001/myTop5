// ─────────────────────────────────────────────────────────────
//  Jikan Pipeline — Anime/Manga data from MyAnimeList (free, no key)
//  https://docs.api.jikan.moe/
// ─────────────────────────────────────────────────────────────
import type { Entity, IntentType } from "@top5/shared";
import { saveToDatabase } from "./ai_fallback";
import { fetchAndCacheImage } from "./image_fetcher";

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  score?: number;
  images?: { jpg?: { image_url?: string; large_image_url?: string } };
  url?: string;
  aired?: { from?: string };
  genres?: Array<{ name: string }>;
}

interface JikanResponse {
  data?: JikanAnime[];
}

/**
 * Search Jikan (MAL) API for anime — no API key required.
 * Rate limit: 3 req/sec, 60 req/min.
 */
export async function searchJikanAnime(
  query: string,
  limit = 8
): Promise<JikanAnime[]> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as JikanResponse;
    return data.data ?? [];
  } catch {
    return [];
  }
}

/** Map Jikan anime to Entity format and save to D1 + R2 */
export async function fetchAndSaveAnimeEntities(
  env: any,
  query: string
): Promise<Entity[]> {
  const animeList = await searchJikanAnime(query, 8);
  if (animeList.length === 0) return [];

  const entities: Entity[] = [];

  for (const anime of animeList) {
    const entityId = `jikan_${anime.mal_id}`;
    const titleEn = anime.title_english || anime.title;
    const titleTh = anime.title; // MAL title (often Romaji or English)

    // Calculate a rough global_score from MAL score (0-10 → 0-100)
    const globalScore = anime.score ? Math.round(anime.score * 10) : 50;

    const entity: Entity = {
      entity_id: entityId,
      entity_name: titleTh,
      entity_name_en: titleEn,
      category: "popculture" as IntentType,
      description: anime.synopsis
        ? anime.synopsis.slice(0, 148) + (anime.synopsis.length > 148 ? "…" : "")
        : `อนิเมะจาก MyAnimeList (MAL Score: ${anime.score ?? "N/A"})`,
      global_score: globalScore,
      upvotes: 0,
      image_url: `/images/${entityId}`,
      w5h: JSON.stringify({
        who: "Toei Animation / Ufotable / สตูดิโอผู้สร้าง",
        what: titleEn,
        where: "ญี่ปุ่น (อนิเมะ)",
        when: anime.aired?.from
          ? `เริ่มฉาย ${new Date(anime.aired.from).getFullYear()}`
          : "ไม่ระบุปี",
        why: `MAL Score ${anime.score ?? "N/A"}/10 — ${anime.genres?.map((g) => g.name).join(", ") || "Anime"}`,
      }),
    };

    // Save to DB
    await saveToDatabase(env.TOP5_DB, [entity]);

    // Fetch + cache poster into R2 in background (try MAL image first, then Wikipedia)
    const malPoster = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
    if (malPoster) {
      fetch(malPoster, { signal: AbortSignal.timeout(5000) })
        .then(async (res) => {
          if (!res.ok) return;
          const buffer = await res.arrayBuffer();
          await env.IMAGES.put(`thumbs/${entityId}`, buffer, {
            httpMetadata: {
              contentType: res.headers.get("content-type") || "image/jpeg",
              cacheControl: "public, max-age=604800",
            },
          });
        })
        .catch(() => {
          fetchAndCacheImage(env, entityId, titleTh, titleEn).catch(() => {});
        });
    } else {
      fetchAndCacheImage(env, entityId, titleTh, titleEn).catch(() => {});
    }

    entities.push(entity);
  }

  return entities;
}
