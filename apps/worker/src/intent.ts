// ─────────────────────────────────────────────────────────────
//  Intent Classification Router — Thai + English
// ─────────────────────────────────────────────────────────────
import type { IntentType, IntentResult } from "@top5/shared";

interface IntentPattern {
  intent: IntentType;
  use_gps: boolean;
  keywords: string[];
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "geo",
    use_gps: true,
    weight: 10,
    keywords: [
      // Thai food/place keywords
      "กะเพรา","ร้านอาหาร","กาแฟ","ชาบู","หมูกะทะ","ข้าวมันไก่","ส้มตำ",
      "ก๋วยเตี๋ยว","ผัดไทย","ต้มยำ","สุกี้","บุฟเฟ่","ร้าน","อาหาร",
      "ใกล้ฉัน","ใกล้เคียง","แถวนี้","คาเฟ่","เบเกอรี่","บาร์","ผับ",
      "โรงแรม","สปา","นวด","ที่พัก","ร้านขาย","ตลาด","ห้าง",
      // English geo keywords
      "restaurant","cafe","coffee","food","near me","nearby","hotel",
      "bar","pub","spa","massage","bakery","buffet","shabu",
    ],
  },
  {
    intent: "web3",
    use_gps: false,
    weight: 10,
    keywords: [
      // Thai
      "คริปโต","บิทคอยน์","อีเธอเรียม","โซลานา","เหรียญ","บล็อกเชน",
      "ดีไฟ","เอ็นเอฟที","นักขุด","กระเป๋าดิจิทัล","เว็บสาม",
      // English
      "crypto","bitcoin","ethereum","solana","bnb","defi","nft",
      "blockchain","web3","token","coin","wallet","binance","polygon",
      "avalanche","chainlink","cardano","dogecoin","xrp","ripple",
    ],
  },
  {
    intent: "dev",
    use_gps: false,
    weight: 10,
    keywords: [
      // Thai
      "ภาษาโปรแกรม","ภาษาคอมพิวเตอร์","เขียนโค้ด","พัฒนาแอป","นักพัฒนา",
      "โปรแกรมเมอร์","เฟรมเวิร์ค","ฐานข้อมูล","ซอฟต์แวร์","ไอที",
      // English
      "python","javascript","typescript","rust","golang","kotlin","swift",
      "java","c++","php","ruby","scala","elixir","haskell","framework",
      "programming","language","developer","coding","github","npm","react",
      "vue","angular","nextjs","nodejs","database","sql","nosql",
    ],
  },
  {
    intent: "popculture",
    use_gps: false,
    weight: 10,
    keywords: [
      // Thai
      "คนหล่อ","คนสวย","ดารา","นักแสดง","นักร้อง","ศิลปิน","ไอดอล",
      "เคป็อป","หล่อที่สุด","สวยที่สุด","ดังที่สุด","ยอดนิยม","เซเลบ",
      "พระเอก","นางเอก","แบรนด์แอมบาสเดอร์","อินฟลูเอนเซอร์",
      // English
      "handsome","beautiful","celebrity","actor","actress","singer",
      "kpop","idol","popular","trending","famous","influencer","model",
      "musician","band","group","marvel","netflix","drama","movie",
    ],
  },
  {
    intent: "academic",
    use_gps: false,
    weight: 10,
    keywords: [
      // Thai
      "งานวิจัย","ดาราศาสตร์","หลุมดำ","จักรวาล","วิทยาศาสตร์","ฟิสิกส์",
      "เคมี","ชีววิทยา","คณิตศาสตร์","วิศวกรรม","การแพทย์","วิจัย",
      "บทความ","วารสาร","สถิติ","ทฤษฎี","ดาวเคราะห์","กาแล็กซี่",
      // English
      "research","astronomy","black hole","universe","science","physics",
      "chemistry","biology","mathematics","engineering","medical",
      "paper","journal","study","theory","nasa","arxiv","quantum",
      "space","telescope","galaxy","neutron","relativity","dark matter",
    ],
  },
];

import { expandQuery } from "./fuzzy";

export function classifyIntent(query: string): IntentResult & { did_you_mean?: string } {
  const expanded = expandQuery(query);
  const q = expanded.normalized;
  
  // Use all expanded terms for intent classification
  const searchTerms = expanded.expansions;
  const words = searchTerms.flatMap(term => term.split(/[\s,]+/));

  const scores: Record<IntentType, { score: number; keywords: string[] }> = {
    geo:        { score: 0, keywords: [] },
    web3:       { score: 0, keywords: [] },
    dev:        { score: 0, keywords: [] },
    popculture: { score: 0, keywords: [] },
    academic:   { score: 0, keywords: [] },
    general:    { score: 0, keywords: [] },
  };

  for (const pattern of INTENT_PATTERNS) {
    for (const term of searchTerms) {
      for (const kw of pattern.keywords) {
        if (term.includes(kw) && !scores[pattern.intent].keywords.includes(kw)) {
          scores[pattern.intent].score += pattern.weight;
          scores[pattern.intent].keywords.push(kw);
        }
      }
    }
    // Also check word-by-word
    for (const word of words) {
      if (pattern.keywords.includes(word) && !scores[pattern.intent].keywords.includes(word)) {
        scores[pattern.intent].score += pattern.weight * 0.5;
        scores[pattern.intent].keywords.push(word);
      }
    }
  }

  // Find winner
  let best: IntentType = "general";
  let bestScore = 0;

  for (const [intent, data] of Object.entries(scores) as [IntentType, { score: number; keywords: string[] }][]) {
    if (intent === "general") continue;
    if (data.score > bestScore) {
      bestScore = data.score;
      best = intent;
    }
  }

  const pattern = INTENT_PATTERNS.find((p) => p.intent === best);
  const confidence = bestScore > 0 ? Math.min(bestScore / 30, 1) * expanded.confidence : 0;

  return {
    intent: best,
    use_gps: pattern?.use_gps ?? false,
    confidence,
    detected_keywords: scores[best]?.keywords ?? [],
    did_you_mean: expanded.did_you_mean,
  };
}
