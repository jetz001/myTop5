// ─────────────────────────────────────────────────────────────
//  RankCard Component v2 — Premium with Google Maps deep link
// ─────────────────────────────────────────────────────────────
import type { RankedEntity } from "@top5/shared";

const RANK_CROWNS  = ["👑", "🥈", "🥉", "", ""];
const RANK_LABELS  = ["BEST", "2ND", "3RD", "4TH", "5TH"];

const INTENT_ICONS: Record<string, string> = {
  geo: "📍", web3: "⛓️", dev: "💻", popculture: "🎬", academic: "🔭", general: "🔍",
};

// Category gradient fallbacks when no image
const CATEGORY_GRADIENTS: Record<string, string> = {
  geo:        "linear-gradient(135deg,#ecfdf5,#d1fae5)",
  web3:       "linear-gradient(135deg,#eff6ff,#dbeafe)",
  dev:        "linear-gradient(135deg,#faf5ff,#ede9fe)",
  popculture: "linear-gradient(135deg,#fff1f2,#ffe4e6)",
  academic:   "linear-gradient(135deg,#f0f9ff,#e0f2fe)",
  general:    "linear-gradient(135deg,#f8fafc,#f1f5f9)",
};

const CATEGORY_EMOJI: Record<string, string> = {
  geo: "🍜", web3: "₿", dev: "⌨️", popculture: "⭐", academic: "🔭", general: "🔍",
};

const MAPS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const EXT_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function scoreClass(score: number): string {
  if (score >= 65) return "high";
  if (score >= 40) return "mid";
  return "low";
}

export function createRankCard(
  entity: RankedEntity,
  query: string,
  onVote: (entityId: string) => void
): HTMLElement {
  const rank    = entity.rank ?? 1;
  const intent  = entity.intent ?? "general";
  const isGeo   = intent === "geo" || (entity.latitude != null && entity.latitude !== 0);
  const hasImg  = !!entity.image_url;

  // Google Maps URL — no API key needed
  const mapsUrl = isGeo && entity.latitude && entity.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${entity.latitude},${entity.longitude}`
    : null;

  const extUrl = !isGeo && entity.external_url ? entity.external_url : null;

  const card = document.createElement("article");
  card.className = `rank-card rank-${rank}`;
  card.dataset.entityId = entity.entity_id;
  card.style.animationDelay = `${(rank - 1) * 70}ms`;

  // ── Thumbnail (image OR gradient emoji fallback)
  const thumbHtml = hasImg
    ? `<div class="rank-card-img">
         <img src="${entity.image_url}" alt="${esc(entity.entity_name)}" loading="lazy"
              onerror="this.parentElement.innerHTML=this.parentElement.dataset.fallback" />
       </div>`
    : `<div class="rank-card-img rank-card-img--icon"
           style="background:${CATEGORY_GRADIENTS[intent] ?? CATEGORY_GRADIENTS.general}">
         <span class="rank-card-emoji">${CATEGORY_EMOJI[intent] ?? "🔍"}</span>
       </div>`;

  // ── Action buttons
  const mapsHtml = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="maps-btn" title="ดูใน Google Maps">
         ${MAPS_SVG}<span>Maps</span>
       </a>`
    : "";

  const extHtml = extUrl
    ? `<a href="${esc(extUrl)}" target="_blank" rel="noopener noreferrer" class="ext-btn" title="ดูเพิ่มเติม">
         ${EXT_SVG}
       </a>`
    : "";

  const sc = scoreClass(entity.total_score);

  card.innerHTML = `
    <div class="rank-medal">
      ${RANK_CROWNS[rank - 1] ? `<span class="rank-crown">${RANK_CROWNS[rank - 1]}</span>` : ""}
      <span class="rank-number">${rank}</span>
      <span class="rank-label">${RANK_LABELS[rank - 1] ?? ""}</span>
    </div>

    ${thumbHtml}

    <div class="rank-card-body">
      <div class="rank-card-names">
        <div class="rank-card-name">${esc(entity.entity_name)}</div>
        ${entity.entity_name_en && entity.entity_name_en !== entity.entity_name
          ? `<div class="rank-card-name-en">${esc(entity.entity_name_en)}</div>` : ""}
      </div>
      ${entity.description
        ? `<p class="rank-card-desc">${esc(entity.description)}</p>` : ""}
      <div class="rank-card-meta">
        <span class="score-badge ${sc}">
          ${INTENT_ICONS[intent] ?? "⭐"} ${entity.total_score.toFixed(1)}
        </span>
        ${entity.address
          ? `<span class="address-text">📍 ${esc(entity.address)}</span>` : ""}
      </div>
    </div>

    <div class="rank-card-actions">
      <button class="upvote-btn" data-entity-id="${esc(entity.entity_id)}" title="โหวตสนับสนุน">
        <span class="upvote-arrow">▲</span>
        <span class="upvote-count">${entity.upvotes}</span>
      </button>
      ${mapsHtml}
      ${extHtml}
    </div>
  `;

  // Upvote handler with optimistic UI
  const upvoteBtn = card.querySelector<HTMLButtonElement>(".upvote-btn")!;
  const countEl   = upvoteBtn.querySelector<HTMLElement>(".upvote-count")!;

  upvoteBtn.addEventListener("click", () => {
    if (upvoteBtn.classList.contains("voted")) return;
    upvoteBtn.classList.add("voted");
    const arrow = upvoteBtn.querySelector<HTMLElement>(".upvote-arrow")!;
    arrow.animate([
      { transform: "scale(1) translateY(0)" },
      { transform: "scale(1.4) translateY(-4px)" },
      { transform: "scale(0.9) translateY(1px)" },
      { transform: "scale(1) translateY(0)" },
    ], { duration: 400, easing: "cubic-bezier(0.34,1.56,0.64,1)" });
    countEl.textContent = String((entity.upvotes ?? 0) + 1);
    onVote(entity.entity_id);
  });

  return card;
}

export function animateSwap(card: HTMLElement): void {
  card.classList.add("swapping", "promoted-badge");
  card.addEventListener("animationend", () => {
    card.classList.remove("swapping");
    setTimeout(() => card.classList.remove("promoted-badge"), 3500);
  }, { once: true });
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
