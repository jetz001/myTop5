// ─────────────────────────────────────────────────────────────
//  Image Fetcher Pipeline — Wikipedia → R2 thumbnail cache
// ─────────────────────────────────────────────────────────────
//  Flow:
//    1. Check R2 for existing thumbnail
//    2. Query Wikipedia REST API for page summary + thumbnail
//    3. Fetch thumbnail image (200px) from Wikipedia CDN
//    4. Store in R2 bucket as "thumbs/{entityId}"
//    5. Return public URL served via Worker /images/:entityId
// ─────────────────────────────────────────────────────────────

const WIKI_THUMB_SIZE = 200; // px — balances quality vs file size

interface WikiSummary {
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string };
}

/** Try Wikipedia in lang order, return thumbnail URL or null */
async function fetchWikiThumbnail(name: string): Promise<string | null> {
  // Try English first (broader coverage), then Thai
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
        // Swap out any width parameter to get WIKI_THUMB_SIZE
        return data.thumbnail.source.replace(/\/\d+px-/, `/${WIKI_THUMB_SIZE}px-`);
      }
    } catch {
      // timeout or network error — try next lang
    }
  }
  return null;
}

/** Fetch image URL from Wikipedia Search API when direct title lookup fails */
async function fetchWikiSearchThumbnail(query: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const title = data?.query?.search?.[0]?.title;
    if (!title) return null;
    return fetchWikiThumbnail(title);
  } catch {
    return null;
  }
}

/**
 * Fetch a thumbnail for an entity and cache it in R2.
 * Returns the worker-relative image path: "/images/{entityId}"
 * or null if no image could be found.
 */
export async function fetchAndCacheImage(
  env: { IMAGES: R2Bucket },
  entityId: string,
  entityName: string,
  entityNameEn?: string
): Promise<string | null> {
  const r2Key = `thumbs/${entityId}`;

  // 1. Already cached in R2?
  const existing = await env.IMAGES.head(r2Key);
  if (existing) return `/images/${entityId}`;

  // 2. Try Wikipedia thumbnail (English name first, then Thai)
  const searchNames = [
    entityNameEn,          // "Demon Slayer"
    entityName,            // "ดาบพิฆาตอสูร"
    entityNameEn?.split(":")[0].trim(),  // "Demon Slayer" (strip subtitle)
  ].filter(Boolean) as string[];

  let thumbUrl: string | null = null;

  for (const name of searchNames) {
    thumbUrl = await fetchWikiThumbnail(name);
    if (thumbUrl) break;
  }

  // 3. Fall back to Wikipedia search if direct title didn't work
  if (!thumbUrl) {
    thumbUrl = await fetchWikiSearchThumbnail(entityNameEn || entityName);
  }

  if (!thumbUrl) return null;

  // 4. Download the image
  try {
    const imgRes = await fetch(thumbUrl, { signal: AbortSignal.timeout(6000) });
    if (!imgRes.ok) return null;

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    // 5. Store in R2
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

/** Serve an image from R2, with fallback to ui-avatars placeholder */
export async function serveImage(
  env: { IMAGES: R2Bucket },
  entityId: string,
  fallbackName?: string
): Promise<Response> {
  const obj = await env.IMAGES.get(`thumbs/${entityId}`);

  if (obj) {
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=604800");
    headers.set("ETag", obj.etag);
    return new Response(obj.body, { headers });
  }

  // Fallback: redirect to ui-avatars
  const name = encodeURIComponent(fallbackName || entityId.slice(0, 2).toUpperCase());
  return Response.redirect(
    `https://ui-avatars.com/api/?name=${name}&size=200&background=random&color=fff&bold=true`,
    302
  );
}
