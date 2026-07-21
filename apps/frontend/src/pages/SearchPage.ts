// ─────────────────────────────────────────────────────────────
//  Search Home Page v2 — Premium with category quick-picks
// ─────────────────────────────────────────────────────────────
import { getTrending } from "../api/client";
import { createSearchBar } from "../components/SearchBar";
import { createTrendingGrid } from "../components/TrendingGrid";
import type { TrendingQuery } from "@top5/shared";

const CATEGORY_DEMOS = [
  { label: "🍜 ร้านอาหาร", query: "กะเพรา",    cls: "geo"        },
  { label: "⛓️ Crypto",     query: "bitcoin",    cls: "web3"       },
  { label: "💻 Dev Lang",   query: "python",     cls: "dev"        },
  { label: "🎬 ดารา",       query: "คนหล่อ",    cls: "popculture" },
  { label: "🔭 วิทยาศาสตร์", query: "หลุมดำ",   cls: "academic"   },
];

export function renderSearchPage(
  container: HTMLElement,
  onSearch: (query: string, coords?: { lat: number; lng: number }) => void
): void {
  container.innerHTML = "";

  const page = document.createElement("div");
  page.className = "search-home";

  // ── Logo ──────────────────────────────────────────────────
  const logoWrap = document.createElement("div");
  logoWrap.className = "logo-wrap";
  logoWrap.innerHTML = `
    <div class="logo-title">Top5</div>
    <div class="logo-tagline">Best 5 Results — No More, No Less</div>
    <div class="logo-badges">
      <span class="logo-badge geo">📍 Geo</span>
      <span class="logo-badge web3">⛓️ Web3</span>
      <span class="logo-badge dev">💻 Dev</span>
      <span class="logo-badge popculture">🎬 Culture</span>
      <span class="logo-badge academic">🔭 Science</span>
    </div>
  `;

  // ── Search bar ─────────────────────────────────────────────
  const searchBar = createSearchBar({ onSearch });

  // ── Category Quick-picks ───────────────────────────────────
  const quickPicks = document.createElement("div");
  quickPicks.className = "quick-picks";
  quickPicks.innerHTML = `<div class="quick-picks-label">ลองค้นหา</div>
    <div class="quick-picks-row">
      ${CATEGORY_DEMOS.map((c) =>
        `<button class="quick-chip quick-chip--${c.cls}" data-q="${c.query}">${c.label}</button>`
      ).join("")}
    </div>
  `;
  quickPicks.querySelectorAll<HTMLButtonElement>(".quick-chip").forEach((btn) => {
    btn.addEventListener("click", () => onSearch(btn.dataset.q!));
  });

  page.appendChild(logoWrap);
  page.appendChild(searchBar);
  page.appendChild(quickPicks);

  // ── Trending (async) ───────────────────────────────────────
  const trendingSlot = document.createElement("div");
  page.appendChild(trendingSlot);

  container.appendChild(page);

  getTrending()
    .then((items: TrendingQuery[]) => {
      trendingSlot.replaceWith(createTrendingGrid(items, (q) => onSearch(q)));
    })
    .catch(() => {
      trendingSlot.replaceWith(createTrendingGrid([], (q) => onSearch(q)));
    });
}
