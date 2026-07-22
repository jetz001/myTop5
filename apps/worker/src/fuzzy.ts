// ─────────────────────────────────────────────────────────────
//  Top5 — Fuzzy Search Engine
//  Levenshtein distance + Thai romanization + "Did you mean?"
// ─────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
//  1. Levenshtein Distance (edit distance)
// ══════════════════════════════════════════════════════════════
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row rolling array (O(n) space)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// ══════════════════════════════════════════════════════════════
//  2. Normalized similarity (0–1, higher = more similar)
// ══════════════════════════════════════════════════════════════
export function similarity(a: string, b: string): number {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ══════════════════════════════════════════════════════════════
//  3. Thai Romanization Map
//     ภาษาไทยทับศัพท์ → คีย์เวิร์ดค้นหา
// ══════════════════════════════════════════════════════════════
export const THAI_ROMANIZATION: Record<string, string[]> = {
  // Web3 / Crypto
  "บิตคอยน์": ["bitcoin", "crypto"],
  "บิทคอยน์": ["bitcoin", "crypto"],
  "บิตคอน":   ["bitcoin"],
  "บิทคอน":   ["bitcoin"],
  "อีเธอเรียม": ["ethereum", "eth"],
  "อีเทอเรียม": ["ethereum"],
  "อีธีเรียม": ["ethereum"],
  "โซลาน่า":   ["solana"],
  "โซลานา":    ["solana"],
  "คริปโต":    ["crypto", "bitcoin", "ethereum"],
  "คริปโทเคอร์เรนซี": ["cryptocurrency", "crypto"],
  "บล็อกเชน":  ["blockchain", "web3"],
  "เอ็นเอฟที": ["nft"],
  "วอลเล็ต":   ["wallet", "crypto"],
  "ดีไฟ":      ["defi"],

  // Dev / Programming
  "ไพธอน":     ["python"],
  "ไพทอน":     ["python"],
  "พายธอน":    ["python"],
  "จาวา":      ["java", "javascript"],
  "จาวาสคริปต์": ["javascript"],
  "จาวาสคริป": ["javascript"],
  "ไทพ์สคริปต์": ["typescript"],
  "ไทปสคริปต์": ["typescript"],
  "รัสต์":     ["rust"],
  "โกแลง":     ["golang", "go"],
  "โก":        ["golang", "go"],
  "โกลาง":     ["golang"],
  "คอตลิน":    ["kotlin"],
  "สวิฟท์":   ["swift"],
  "ซีชาร์ป":   ["c#", "csharp"],
  "พีเอชพี":   ["php"],
  "รูบี้":     ["ruby"],
  "เรียคท์":   ["react"],
  "วิว":       ["vue", "vuejs"],
  "แองกูล่าร์": ["angular"],
  "ด็อกเกอร์": ["docker"],

  // PopCulture / ดารา
  "คนหล่อ":    ["handsome", "most handsome"],
  "คนสวย":     ["beautiful", "most beautiful"],
  "ดารา":      ["celebrity", "actor", "actress"],
  "นักร้อง":   ["singer", "kpop", "idol"],
  "ไอดอล":     ["idol", "kpop"],
  "เคป็อป":    ["kpop", "k-pop"],
  "เคป็อบ":    ["kpop"],
  "นักแสดง":   ["actor", "actress", "celebrity"],

  // Academic / Science
  "หลุมดำ":    ["black hole", "astronomy"],
  "หลุมดํา":   ["black hole"],  // วรรณยุกต์ต่าง
  "ดาราศาสตร์": ["astronomy", "space"],
  "กาแล็กซี":  ["galaxy", "astronomy"],
  "กาแล็กซี่": ["galaxy"],
  "จักรวาล":   ["universe", "cosmos", "space"],
  "นาซ่า":     ["nasa", "space"],
  "นาซา":      ["nasa"],
  "ดาวเคราะห์": ["planet", "astronomy"],
  "ควอนตัม":   ["quantum", "physics"],
  "ฟิสิกส์":   ["physics", "science"],
  "วิทยาศาสตร์": ["science", "research"],
  "เอไอ":      ["ai", "artificial intelligence", "machine learning"],
  "ปัญญาประดิษฐ์": ["ai", "artificial intelligence"],
  "แมชชีนเลิร์นนิง": ["machine learning", "ai"],

  // Geo / Food
  "กาแฟ":      ["coffee", "cafe"],
  "คาเฟ่":     ["cafe", "coffee"],
  "ร้านกาแฟ":  ["coffee", "cafe"],
  "อาหาร":     ["food", "restaurant"],
  "ร้านอาหาร": ["restaurant", "food"],
  "ไอศครีม":   ["ice cream", "dessert"],
  "ไอติม":     ["ice cream"],
  "ขนมหวาน":   ["dessert", "sweets"],
  "ซูชิ":      ["sushi", "japanese"],
  "ราเมน":     ["ramen", "japanese"],
  "พิซซ่า":    ["pizza", "italian"],
  "เบอร์เกอร์": ["burger", "fast food"],
  "สเต็ก":     ["steak"],
  "ซีฟู้ด":    ["seafood"],
};

// ══════════════════════════════════════════════════════════════
//  4. Common Typo → Correction map (English)
// ══════════════════════════════════════════════════════════════
const ENGLISH_TYPOS: Record<string, string> = {
  "pythone":      "python",
  "pythn":        "python",
  "phyton":       "python",
  "pyhton":       "python",
  "bitconi":      "bitcoin",
  "etherium":     "ethereum",
  "ehereum":      "ethereum",
  "etherscan":    "ethereum",
  "solanna":      "solana",
  "javascrip":    "javascript",
  "javasript":    "javascript",
  "typscript":    "typescript",
  "typescritp":   "typescript",
  "astornomy":    "astronomy",
  "astronmy":     "astronomy",
  "balck hole":   "black hole",
  "blakc hole":   "black hole",
  "kafka":        "kafka",
  "recat":        "react",
  "raect":        "react",
  "angulr":       "angular",
  "kubrnetes":    "kubernetes",
  "kubernetes":   "kubernetes",
  "dockerr":      "docker",
};

// ══════════════════════════════════════════════════════════════
//  5. Fuzzy Keyword Lookup
// ══════════════════════════════════════════════════════════════
export interface FuzzyMatch {
  keyword:     string;
  correction?: string;          // "Did you mean X?"
  distance:    number;
  similarity:  number;
}

/**
 * Find the closest keyword from a candidate list
 * @param query    User input (already lowercased)
 * @param keywords Candidate keyword list
 * @param maxDist  Max allowed edit distance (default 2)
 */
export function findClosestKeyword(
  query: string,
  keywords: string[],
  maxDist = 2
): FuzzyMatch | null {
  let best: FuzzyMatch | null = null;

  for (const kw of keywords) {
    const dist = levenshtein(query, kw.toLowerCase());
    if (dist > maxDist) continue;
    const sim = 1 - dist / Math.max(query.length, kw.length);
    if (!best || dist < best.distance || (dist === best.distance && sim > best.similarity)) {
      best = { keyword: kw, correction: dist > 0 ? kw : undefined, distance: dist, similarity: sim };
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════
//  6. Expand Query — ดึงคำไทย + ตรวจ Typo + ขยายความหมาย
// ══════════════════════════════════════════════════════════════
export interface ExpandedQuery {
  original:    string;
  normalized:  string;
  expansions:  string[];         // คำที่ expand ได้ (eng+thai)
  did_you_mean?: string;         // Typo correction suggestion
  confidence:  number;           // 0–1
}

export function expandQuery(raw: string): ExpandedQuery {
  const q         = raw.trim().toLowerCase();
  const expansions = new Set<string>([q]);
  let didYouMean: string | undefined;
  let confidence = 1.0;

  // Step 1: Thai romanization exact match
  for (const [thai, engs] of Object.entries(THAI_ROMANIZATION)) {
    if (q.includes(thai.toLowerCase())) {
      engs.forEach((e) => expansions.add(e));
      confidence = 0.9;
    }
  }

  // Step 2: English typo correction
  const typoFix = ENGLISH_TYPOS[q];
  if (typoFix) {
    expansions.add(typoFix);
    didYouMean  = typoFix;
    confidence  = 0.85;
  }

  // Step 3: Fuzzy Thai romanization (handle partial / slight typos)
  if (expansions.size === 1) {
    const thaiKeys = Object.keys(THAI_ROMANIZATION);
    const fuzzyHit = findClosestKeyword(q, thaiKeys, 2);
    if (fuzzyHit && fuzzyHit.distance > 0 && fuzzyHit.similarity >= 0.7) {
      const engs = THAI_ROMANIZATION[fuzzyHit.keyword] ?? [];
      engs.forEach((e) => expansions.add(e));
      didYouMean = fuzzyHit.keyword;
      confidence = fuzzyHit.similarity * 0.85;
    }
  }

  return {
    original:    raw,
    normalized:  q,
    expansions:  [...expansions],
    did_you_mean: didYouMean,
    confidence,
  };
}

// ══════════════════════════════════════════════════════════════
//  7. Fuzzy Entity Name Search (against DB results)
//     Returns entities sorted by name similarity to query
// ══════════════════════════════════════════════════════════════
import type { Entity } from "@top5/shared";

export function fuzzyRankByName<T extends Pick<Entity, "entity_name" | "entity_name_en">>(
  entities: T[],
  query: string,
  minSimilarity = 0.25
): Array<T & { _nameSim: number }> {
  const q = query.toLowerCase();
  return entities
    .map((e) => {
      const simTH = similarity(q, e.entity_name.toLowerCase());
      const simEN = similarity(q, (e.entity_name_en ?? "").toLowerCase());
      const _nameSim = Math.max(simTH, simEN);
      return { ...e, _nameSim };
    })
    .filter((e) => e._nameSim >= minSimilarity)
    .sort((a, b) => b._nameSim - a._nameSim);
}
