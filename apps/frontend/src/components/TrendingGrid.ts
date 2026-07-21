// ─────────────────────────────────────────────────────────────
//  TrendingGrid Component
// ─────────────────────────────────────────────────────────────
import type { TrendingQuery } from "@top5/shared";

const INTENT_ICONS: Record<string, string> = {
  geo: "📍", web3: "⛓️", dev: "💻", popculture: "🎬", academic: "🔭", general: "🔍",
};

// Fallback trending data when API is unavailable
const MOCK_TRENDING: TrendingQuery[] = [
  { query: "กะเพราหมูสับ",  intent: "geo",        count: 142, delta_24h: 23 },
  { query: "Bitcoin",        intent: "web3",       count: 98,  delta_24h: 45 },
  { query: "Python",         intent: "dev",        count: 87,  delta_24h: 12 },
  { query: "Lee Min-ho",     intent: "popculture", count: 76,  delta_24h: 67 },
  { query: "หลุมดำ",         intent: "academic",   count: 54,  delta_24h: 8  },
  { query: "Ethereum",       intent: "web3",       count: 51,  delta_24h: 31 },
  { query: "กาแฟ",           intent: "geo",        count: 49,  delta_24h: 5  },
  { query: "Rust",           intent: "dev",        count: 44,  delta_24h: 18 },
];

export function createTrendingGrid(
  items: TrendingQuery[],
  onSearch: (query: string) => void
): HTMLElement {
  const section = document.createElement("div");
  section.className = "trending-section";

  const data = items.length > 0 ? items : MOCK_TRENDING;

  section.innerHTML = `
    <div class="trending-label">🔥 กำลังฮิตตอนนี้</div>
    <div class="trending-grid" id="trending-grid"></div>
  `;

  const grid = section.querySelector<HTMLElement>("#trending-grid")!;

  data.forEach((item) => {
    const chip = document.createElement("button");
    chip.className = "trending-chip";
    chip.innerHTML = `
      <span class="chip-icon">${INTENT_ICONS[item.intent] ?? "🔍"}</span>
      <span>${item.query}</span>
      <span class="chip-count">${item.count}</span>
    `;
    chip.addEventListener("click", () => onSearch(item.query));
    grid.appendChild(chip);
  });

  return section;
}
