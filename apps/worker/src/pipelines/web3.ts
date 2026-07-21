// Web3 Pipeline — CoinGecko public API (no key required for basic endpoints)
import type { Entity } from "@top5/shared";
import { getEntitiesByCategory } from "../db/queries";

const COINGECKO_IDS: Record<string, string> = {
  bitcoin: "bitcoin", ethereum: "ethereum", solana: "solana",
  bnb: "binancecoin", cardano: "cardano", polygon: "matic-network",
  xrp: "ripple", dogecoin: "dogecoin", avalanche: "avalanche-2",
  chainlink: "chainlink", polkadot: "polkadot", shiba: "shib",
};

export async function fetchWeb3Entities(db: D1Database): Promise<Entity[]> {
  // ดึงจาก D1 (seed data) — สามารถผสม CoinGecko live data ได้ในอนาคต
  const entities = await getEntitiesByCategory(db, "web3");
  return entities.map((e) => ({
    ...e,
    intent: "web3" as const,
    external_url: e.external_url || `https://www.coingecko.com/en/coins/${COINGECKO_IDS[e.entity_name_en?.toLowerCase() ?? ""] ?? e.entity_name_en?.toLowerCase()}`,
  }));
}
