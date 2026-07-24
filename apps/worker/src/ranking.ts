// ─────────────────────────────────────────────────────────────
//  Hybrid Ranking Engine — Score Formula + Time Decay + Challenger Pool
// ─────────────────────────────────────────────────────────────
import type { Entity, RankedEntity, RankingScore } from "@top5/shared";

const HALF_LIFE_HOURS = 72; // คะแนนโหวตเก่าลดครึ่งทุก 72 ชั่วโมง
const W_GLOBAL = 0.3;       // 30% จากคะแนนภายนอก/สถิติ
const W_COMMUNITY = 0.7;    // 70% จากโหวตของชุมชนสมาชิก (ให้ผลโหวตมีอิทธิพลหลักในการขึ้นอันดับ 1)

/**
 * คำนวณ Time Decay Factor
 * Decay = 2^(-Δt / H)
 * Δt = ชั่วโมงที่ผ่านมานับจากโหวตล่าสุด
 */
export function calcDecay(lastVotedAt: string | undefined): number {
  if (!lastVotedAt) return 1.0;
  const lastVoted = new Date(lastVotedAt).getTime();
  const now = Date.now();
  const deltaHours = (now - lastVoted) / (1000 * 60 * 60);
  return Math.pow(2, -deltaHours / HALF_LIFE_HOURS);
}

/**
 * คำนวณ Community Score จาก upvotes
 * แต่ละโหวตให้คะแนนเต็มที่: 1 โหวต = 25 pts, 2 โหวต = 50 pts, 4+ โหวต = 100 pts
 */
export function calcCommunityScore(upvotes: number): number {
  if (!upvotes || upvotes <= 0) return 0;
  return Math.min(upvotes * 25, 100);
}

/**
 * คำนวณ Total Hybrid Score
 * Score_Total = (Global*0.3 + Community*0.7) * Decay
 */
export function calcTotalScore(
  globalScore: number,
  upvotes: number,
  lastVotedAt: string | undefined
): RankingScore {
  const communityScore = calcCommunityScore(upvotes);
  const decay = calcDecay(lastVotedAt);
  const total = (globalScore * W_GLOBAL + communityScore * W_COMMUNITY) * decay;

  return {
    entity_id: "",
    global_score: globalScore,
    community_score: communityScore,
    decay_factor: decay,
    total_score: Math.round(total * 100) / 100,
  };
}

/**
 * จัดอันดับ entities ทั้งหมดและแบ่งเป็น Top5 + Challenger Pool
 */
export function rankEntities(entities: Entity[]): {
  top5: RankedEntity[];
  challenger_pool: RankedEntity[];
} {
  // คำนวณคะแนนทุก entity
  const scored = entities.map((e) => {
    const communityScore = calcCommunityScore(e.upvotes);
    const decay = calcDecay(e.last_voted_at);
    const totalScore = (e.global_score * W_GLOBAL + communityScore * W_COMMUNITY) * decay;
    return {
      ...e,
      community_score: Math.round(communityScore * 100) / 100,
      total_score: Math.round(totalScore * 100) / 100,
      rank: 0,
    } as RankedEntity;
  });

  // Sort by total_score descending
  scored.sort((a, b) => b.total_score - a.total_score);

  // Assign ranks
  scored.forEach((e, i) => {
    e.rank = i + 1;
  });

  const top5 = scored.slice(0, 5);
  const challenger_pool = scored.slice(5, 20);

  return { top5, challenger_pool };
}

/**
 * ตรวจสอบว่า Challenger ที่ rank 6 สามารถแซง rank 5 ได้หรือไม่
 * Returns swapped arrays หากเกิด rank swap
 */
export function checkChallengerSwap(
  top5: RankedEntity[],
  challengerPool: RankedEntity[]
): {
  swapped: boolean;
  top5: RankedEntity[];
  challenger_pool: RankedEntity[];
  promoted?: RankedEntity;
  demoted?: RankedEntity;
} {
  if (challengerPool.length === 0) {
    return { swapped: false, top5, challenger_pool: challengerPool };
  }

  const rank5 = top5[4];
  const rank6 = challengerPool[0];

  if (!rank5 || !rank6) {
    return { swapped: false, top5, challenger_pool: challengerPool };
  }

  if (rank6.total_score > rank5.total_score) {
    // SWAP!
    const promoted = { ...rank6, rank: 5, rank_change: +(rank6.rank - 5) };
    const demoted  = { ...rank5, rank: 6, rank_change: -1 };

    const newTop5 = [...top5.slice(0, 4), promoted];
    const newPool = [demoted, ...challengerPool.slice(1)];

    return {
      swapped: true,
      top5: newTop5,
      challenger_pool: newPool,
      promoted,
      demoted,
    };
  }

  return { swapped: false, top5, challenger_pool: challengerPool };
}
