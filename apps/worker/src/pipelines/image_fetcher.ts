// ─────────────────────────────────────────────────────────────
//  Image Fetcher Pipeline — Wikipedia → R2 thumbnail cache
// ─────────────────────────────────────────────────────────────

const WIKI_THUMB_SIZE = 200; // px

interface WikiSummary {
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string };
}

/** Clean title by stripping Season, Part, Arc, etc. to get core entity name */
function cleanSearchQuery(q: string): string {
  return q
    .replace(/\(Season \d+\)|\(Part \d+\)|Season \d+|Part \d+|Final Season|Egghead Arc|Hashira Training Arc/gi, "")
    .replace(/ซีซั่น \d+|ภาค \d+|อาร์ค/gi, "")
    .trim();
}

/** Query Wikipedia summary API directly for exact page title */
async function fetchWikiThumbnail(name: string): Promise<string | null> {
  for (const lang of ["en", "th"]) {
    try {
      const encoded = encodeURIComponent(name.replace(/ /g, "_"));
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Top5App/1.0 (https://top5-28n.pages.dev)" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as WikiSummary;
      if (data.thumbnail?.source) {
        return data.thumbnail.source; // Use valid Wikipedia thumbnail URL directly
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/** Search Wikipedia API in en and th for fuzzy query match */
async function fetchWikiSearchThumbnail(query: string): Promise<string | null> {
  const cleanQ = cleanSearchQuery(query);
  if (!cleanQ) return null;

  for (const lang of ["en", "th"]) {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&srlimit=1&format=json&origin=*`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Top5App/1.0 (https://top5-28n.pages.dev)" },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const title = data?.query?.search?.[0]?.title;
      if (!title) continue;

      const thumb = await fetchWikiThumbnail(title);
      if (thumb) return thumb;
    } catch {
      // ignore
    }
  }

  // Fallback to Wikimedia Commons Media Search
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQ)}&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&origin=*`;
    const res = await fetch(commonsUrl, {
      headers: { "User-Agent": "Top5App/1.0 (https://top5-28n.pages.dev)" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const pages = data?.query?.pages;
      if (pages) {
        const firstPage = Object.values(pages)[0] as any;
        const imgUrl = firstPage?.imageinfo?.[0]?.url;
        if (imgUrl && /\.(jpg|jpeg|png|webp)/i.test(imgUrl)) {
          return imgUrl;
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}


/**
 * Fetch a thumbnail for an entity and cache it in R2 under `thumbs/{entityId}`.
 * Returns "/images/{entityId}" or null.
 */
export async function fetchAndCacheImage(
  env: { IMAGES: R2Bucket },
  entityId: string,
  entityName: string,
  entityNameEn?: string
): Promise<string | null> {
  const r2Key = `thumbs/${entityId}`;

  // 1. Already in R2?
  const existing = await env.IMAGES.head(r2Key);
  if (existing) return `/images/${entityId}`;

  // 2. Build candidate search titles
  const candidates = [
    entityNameEn,
    entityName,
    entityNameEn ? cleanSearchQuery(entityNameEn) : null,
    entityName ? cleanSearchQuery(entityName) : null,
  ].filter(Boolean) as string[];

  let thumbUrl: string | null = null;

  // 3. Try exact Wikipedia page summary lookup first
  for (const name of candidates) {
    thumbUrl = await fetchWikiThumbnail(name);
    if (thumbUrl) break;
  }

  // 4. Try Wikipedia search API fallback if direct lookup returned 404
  if (!thumbUrl) {
    for (const name of candidates) {
      thumbUrl = await fetchWikiSearchThumbnail(name);
      if (thumbUrl) break;
    }
  }

  if (!thumbUrl) return null;

  // 5. Download image and save to R2
  try {
    const imgRes = await fetch(thumbUrl, {
      headers: { "User-Agent": "Top5App/1.0 (https://top5-28n.pages.dev)" },
      signal: AbortSignal.timeout(6000)
    });
    if (!imgRes.ok) return null;

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    await env.IMAGES.put(r2Key, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=604800", // 7 days
      },
    });

    return `/images/${entityId}`;
  } catch {
    return null;
  }
}

/** Serve an image from R2, or 302 redirect (no-store) to ui-avatars */
export async function serveImage(
  env: { IMAGES: R2Bucket },
  entityId: string,
  fallbackName?: string,
  ctx?: ExecutionContext
): Promise<Response> {
  // 1. Try R2 cache first
  let obj = await env.IMAGES.get(`thumbs/${entityId}`);

  // 2. If missing in R2, attempt quick fetch (max 2s) so response is never delayed
  if (!obj && fallbackName) {
    try {
      const p = fetchAndCacheImage(env, entityId, fallbackName, fallbackName);
      if (ctx) {
        ctx.waitUntil(p.catch(() => {}));
      }
      await Promise.race([p, new Promise(r => setTimeout(r, 2000))]);
      obj = await env.IMAGES.get(`thumbs/${entityId}`);
    } catch { /* ignore */ }
  }

  // 3. Serve from R2 if found
  if (obj) {
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=604800");
    headers.set("ETag", obj.etag);
    return new Response(obj.body, { headers });
  }

  // 4. Fallback if no image exists on Wikipedia/web
  const displayName = fallbackName && fallbackName.trim() ? fallbackName.trim() : "Top5";
  const name = encodeURIComponent(displayName);
  const headers = new Headers();
  headers.set("Location", `https://ui-avatars.com/api/?name=${name}&size=200&background=random&color=fff&bold=true`);
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(null, { status: 302, headers });
}
