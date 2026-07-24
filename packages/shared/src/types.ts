// ─────────────────────────────────────────────
//  Top5 — Shared TypeScript Types & Interfaces
// ─────────────────────────────────────────────

export type IntentType = "geo" | "web3" | "dev" | "popculture" | "academic" | "general";

export interface Entity {
  entity_id: string;
  entity_name: string;
  entity_name_en?: string;
  category: string;
  intent: IntentType;
  description?: string;
  image_url?: string;
  external_url?: string;
  // Geo fields
  latitude?: number;
  longitude?: number;
  address?: string;
  // Scores
  global_score: number;     // 0-100
  community_score: number;  // 0-100
  total_score: number;      // final hybrid score with decay
  upvotes: number;
  // Metadata
  w5h?: {
    who?: string;
    what?: string;
    where?: string;
    when?: string;
    why?: string;
  };
  extra?: Record<string, string | number | boolean>;
  last_voted_at?: string;
}

export interface SearchResult {
  query: string;
  intent: IntentType;
  top5: RankedEntity[];
  challenger_pool: RankedEntity[]; // ranks 6-20
  cached: boolean;
  latency_ms: number;
  did_you_mean?: string;
}

export interface RankedEntity extends Entity {
  rank: number;
  rank_change?: number; // positive = moved up, negative = moved down
}

export interface VotePayload {
  entity_id: string;
  query: string;
  turnstile_token?: string;
}

export interface VoteResult {
  success: boolean;
  new_upvotes: number;
  rank_changed: boolean;
  new_rank?: number;
  swapped_with?: string;
  message: string;
}

export interface TrendingQuery {
  query: string;
  intent: IntentType;
  count: number;
  delta_24h: number; // % change vs yesterday
}

export interface RankingScore {
  entity_id: string;
  global_score: number;
  community_score: number;
  decay_factor: number;
  total_score: number;
}

export interface IntentResult {
  intent: IntentType;
  use_gps: boolean;
  confidence: number;
  detected_keywords: string[];
}

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

export interface SSEEvent {
  type: "rank_swap" | "vote_update" | "heartbeat";
  query: string;
  data?: {
    promoted: RankedEntity;
    demoted: RankedEntity;
    top5: RankedEntity[];
  };
}

export interface Env {
  TOP5_DB: any;
  CACHE_KV: any;
  IMAGES: any;
  GOOGLE_PLACES_API_KEY: string;
  TURNSTILE_SECRET: string;
  ENVIRONMENT: string;
  AI: any;
}

// ─────────────────────────────────────────────
//  Auth Types
// ─────────────────────────────────────────────
export interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email_or_username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: UserProfile;
}

