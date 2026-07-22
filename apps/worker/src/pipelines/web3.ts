// ─────────────────────────────────────────────────────────────
//  Web3 Pipeline — CoinGecko public API (no key required)
//  + Live search by query keyword
// ─────────────────────────────────────────────────────────────
import type { Entity, IntentType } from "@top5/shared";
import { saveToDatabase } from "./ai_fallback";
import { fetchAndCacheImage } from "./image_fetcher";

interface CoinGeckoCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;    // small icon from /search
  large?: string;   // larger icon from /search
  // from /coins/markets
  current_price?: number;
  market_cap?: number;
  price_change_percentage_24h?: number;
  image?: string;
}

interface CoinGeckoSearchResponse {
  coins?: CoinGeckoCoin[];
}

/** Search CoinGecko for coins matching query */
async function searchCoinGecko(query: string): Promise<CoinGeckoCoin[]> {
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CoinGeckoSearchResponse;
    // Return top 8 coins sorted by market cap rank
    return (data.coins ?? [])
      .filter((c) => c.market_cap_rank !== undefined)
      .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/** Get live price data for a list of CoinGecko IDs */
async function getCoinMarkets(coinIds: string[]): Promise<Map<string, CoinGeckoCoin>> {
  const map = new Map<string, CoinGeckoCoin>();
  if (coinIds.length === 0) return map;
  try {
    const ids = coinIds.slice(0, 8).join(",");
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=8&page=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return map;
    const coins = (await res.json()) as CoinGeckoCoin[];
    for (const c of coins) map.set(c.id, c);
  } catch { /* ignore */ }
  return map;
}

/** Search CoinGecko and save results to D1, return entities */
export async function fetchAndSaveCryptoEntities(
  env: any,
  query: string
): Promise<Entity[]> {
  const coins = await searchCoinGecko(query);
  if (coins.length === 0) return [];

  // Get live price data
  const marketData = await getCoinMarkets(coins.map((c) => c.id));

  const entities: Entity[] = [];

  for (const coin of coins) {
    const market = marketData.get(coin.id);
    const entityId = `cg_${coin.id}`;
    const rank = coin.market_cap_rank ?? 999;
    const price = market?.current_price;
    const change = market?.price_change_percentage_24h;

    // global_score: higher rank = higher score (rank 1 → 100, rank 100 → 50)
    const globalScore = Math.max(10, Math.round(100 - Math.log10(rank) * 25));

    const priceStr = price
      ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
      : "N/A";
    const changeStr = change
      ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
      : "";

    const entity: Entity = {
      entity_id: entityId,
      entity_name: coin.name,
      entity_name_en: coin.name,
      category: "web3" as IntentType,
      description: `Market Cap Rank #${rank} • ${priceStr} ${changeStr}`.trim(),
      global_score: globalScore,
      upvotes: 0,
      external_url: `https://www.coingecko.com/en/coins/${coin.id}`,
      w5h: JSON.stringify({
        who: `${coin.name} (${coin.symbol?.toUpperCase()})`,
        what: `Cryptocurrency — Market Cap Rank #${rank}`,
        where: "Blockchain / Decentralized",
        when: "Active on CoinGecko",
        why: `ราคา ${priceStr} เปลี่ยนแปลง 24h: ${changeStr || "N/A"}`,
      }),
    };

    // Save to DB
    await saveToDatabase(env.TOP5_DB, [entity]);

    // Use CoinGecko's own icon if available (already small PNG/WebP ~50px)
    // Otherwise try Wikipedia
    if (coin.large || coin.thumb) {
      const iconUrl = coin.large || coin.thumb;
      try {
        const imgRes = await fetch(iconUrl!, { signal: AbortSignal.timeout(4000) });
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          await env.IMAGES.put(`thumbs/${entityId}`, buffer, {
            httpMetadata: {
              contentType: imgRes.headers.get("content-type") || "image/png",
              cacheControl: "public, max-age=604800",
            },
          });
          entity.image_url = `/images/${entityId}`;
          await env.TOP5_DB
            .prepare("UPDATE entities SET image_url = ? WHERE entity_id = ?")
            .bind(`/images/${entityId}`, entityId)
            .run();
        }
      } catch { /* ignore — fallback to placeholder */ }
    } else {
      const imageUrl = await fetchAndCacheImage(env, entityId, coin.name, coin.name);
      if (imageUrl) {
        entity.image_url = imageUrl;
        await env.TOP5_DB
          .prepare("UPDATE entities SET image_url = ? WHERE entity_id = ?")
          .bind(imageUrl, entityId)
          .run();
      }
    }

    entities.push(entity);
  }

  return entities;
}
