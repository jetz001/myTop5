// ─────────────────────────────────────────────────────────────
//  Results Page — Complete Rewrite with fixed rendering + premium UI
// ─────────────────────────────────────────────────────────────
import type { RankedEntity, SearchResult } from "@top5/shared";
import { search, vote, subscribeSSE } from "../api/client";
import { createSearchBar } from "../components/SearchBar";
import { createRankCard, animateSwap } from "../components/RankCard";

const INTENT_LABELS: Record<string, string> = {
  geo:        "📍 สถานที่",
  web3:       "⛓️ Web3",
  dev:        "💻 Developer",
  popculture: "🎬 Pop Culture",
  academic:   "🔭 Academic",
  general:    "🔍 ทั่วไป",
};

export async function renderResultsPage(
  container: HTMLElement,
  query: string,
  coords: { lat: number; lng: number } | undefined,
  onBackToHome: () => void,
  onNewSearch: (q: string, c?: { lat: number; lng: number }) => void
): Promise<void> {
  container.innerHTML = "";

  // ── Page shell ─────────────────────────────────────────────
  const page = document.createElement("div");
  page.className = "results-page";

  // Header
  const header = document.createElement("header");
  header.className = "results-header";

  const headerInner = document.createElement("div");
  headerInner.className = "results-header-inner";

  const logo = document.createElement("div");
  logo.className = "results-logo";
  logo.textContent = "Top5";
  logo.addEventListener("click", onBackToHome);

  const compactBar = createSearchBar({
    compact: true,
    initialValue: query,
    onSearch: (q) => onNewSearch(q),
  });

  headerInner.appendChild(logo);
  headerInner.appendChild(compactBar);
  header.appendChild(headerInner);

  // Body
  const body = document.createElement("main");
  body.className = "results-body";

  page.appendChild(header);
  page.appendChild(body);
  container.appendChild(page);

  // ── Skeleton loading ───────────────────────────────────────
  showSkeleton(body);

  // ── Fetch with timeout ─────────────────────────────────────
  let result: SearchResult | null = null;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 40000)
    );
    result = await Promise.race([search(query, coords), timeout]);
  } catch (err) {
    const msg = (err as Error).message === "timeout"
      ? "AI กำลังคิดนานเกินไป ลองกดค้นหาซ้ำอีกครั้ง (ข้อมูลอาจถูกสร้างเสร็จแล้ว)"
      : "เชื่อมต่อ Worker ไม่ได้ — ตรวจสอบว่า `wrangler dev` กำลังรันอยู่";
    showError(body, msg);
    return;
  }

  if (!result) { showError(body, "ไม่ได้รับข้อมูลจาก API"); return; }

  // ── Render results ─────────────────────────────────────────
  renderResults(body, result, query, onNewSearch);

  // ── SSE live updates ───────────────────────────────────────
  let sseSource: EventSource | null = null;
  try {
    sseSource = subscribeSSE(query, (data) => {
      const evt = data as { type: string; data?: { top5: RankedEntity[]; promoted: RankedEntity } };
      if (evt.type === "rank_swap" && evt.data && result) {
        renderResults(body, { ...result, top5: evt.data.top5 }, query, onNewSearch);
        setTimeout(() => {
          const card = body.querySelector<HTMLElement>(`[data-entity-id="${evt.data!.promoted.entity_id}"]`);
          if (card) animateSwap(card);
        }, 50);
      }
    });
  } catch { /* SSE optional */ }

  window.addEventListener("popstate", () => sseSource?.close(), { once: true });
}

// ─────────────────────────────────────────────────────────────
function renderResults(
  body: HTMLElement,
  result: SearchResult,
  query: string,
  onNewSearch: (q: string) => void
): void {
  body.innerHTML = "";

  // Meta row
  const meta = document.createElement("div");
  meta.className = "results-meta";

  const intentKey = result.intent in INTENT_LABELS ? result.intent : "general";

  let metaHtml = `
    <span class="results-query-text">
      ผลลัพธ์สำหรับ <strong>"${escapeHtml(query)}"</strong>
      &nbsp;—&nbsp; ${result.top5.length} อันดับ
    </span>
    <span class="intent-tag ${intentKey}">${INTENT_LABELS[intentKey]}</span>
    ${result.cached ? `<span class="cached-badge">⚡ Cached</span>` : ""}
    <span class="latency-badge">${result.latency_ms}ms</span>
    <span class="live-indicator"><span class="live-dot"></span>Live</span>
  `;

  if (result.did_you_mean) {
    metaHtml += `
      <div class="did-you-mean">
        คุณหมายถึง <button class="did-you-mean-btn" data-q="${escapeHtml(result.did_you_mean)}">"${escapeHtml(result.did_you_mean)}"</button> หรือเปล่า?
      </div>
    `;
  }

  meta.innerHTML = metaHtml;

  if (result.did_you_mean) {
    const btn = meta.querySelector<HTMLButtonElement>(".did-you-mean-btn");
    btn?.addEventListener("click", () => onNewSearch(btn.dataset.q!));
  }

  body.appendChild(meta);

  // Rank list
  const rankList = document.createElement("div");
  rankList.className = "rank-list";

  if (!result.top5 || result.top5.length === 0) {
    rankList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h2 class="empty-title">ไม่พบผลลัพธ์สำหรับ "${escapeHtml(query)}"</h2>
        <p class="empty-desc">ลองค้นหาด้วยคำอื่น เช่น กะเพรา, bitcoin, python, คนหล่อ</p>
        <div class="empty-suggestions">
          ${["กะเพรา", "Bitcoin", "Python", "Lee Min-ho", "หลุมดำ"]
            .map((s) => `<button class="suggestion-chip" data-q="${s}">${s}</button>`)
            .join("")}
        </div>
      </div>
    `;
    // Wire suggestion chips
    rankList.querySelectorAll<HTMLButtonElement>(".suggestion-chip").forEach((btn) => {
      btn.addEventListener("click", () => onNewSearch(btn.dataset.q!));
    });
  } else {
    result.top5.forEach((entity, i) => {
      // Ensure intent is set
      const enriched: RankedEntity = {
        ...entity,
        intent: entity.intent ?? (result.intent as RankedEntity["intent"]),
        rank: entity.rank ?? i + 1,
      };
      const card = createRankCard(enriched, query, async (entityId) => {
        try {
          const vr = await vote(entityId, query);
          if (vr.rank_changed && "top5" in vr && Array.isArray(vr.top5)) {
            renderResults(body, { ...result, top5: vr.top5 as RankedEntity[] }, query, onNewSearch);
            setTimeout(() => {
              const c = body.querySelector<HTMLElement>(`[data-entity-id="${entityId}"]`);
              if (c) animateSwap(c);
            }, 50);
          }
        } catch { /* silent */ }
      });
      rankList.appendChild(card);
    });
  }

  body.appendChild(rankList);

  // Challenger Pool
  if (result.challenger_pool && result.challenger_pool.length > 0) {
    body.appendChild(buildChallengerSection(result.challenger_pool));
  }
}

// ─────────────────────────────────────────────────────────────
function buildChallengerSection(pool: RankedEntity[]): HTMLElement {
  const sec = document.createElement("section");
  sec.className = "challenger-section";

  const toggle = document.createElement("button");
  toggle.className = "challenger-toggle";
  toggle.innerHTML = `
    <span class="challenger-icon">⚔️</span>
    <span>ผู้ท้าชิง — อันดับ 6–${Math.min(5 + pool.length, 20)}</span>
    <span class="challenger-sub">โหวตดันขึ้น Top5 ได้!</span>
    <span class="chevron">▼</span>
  `;

  const list = document.createElement("div");
  list.className = "challenger-list";
  pool.forEach((e) => {
    const row = document.createElement("div");
    row.className = "challenger-mini";
    row.innerHTML = `
      <span class="challenger-rank">#${e.rank}</span>
      <span class="challenger-name">${escapeHtml(e.entity_name)}</span>
      <span class="challenger-score">${e.total_score.toFixed(1)} pts</span>
    `;
    list.appendChild(row);
  });

  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    list.classList.toggle("open");
  });

  sec.appendChild(toggle);
  sec.appendChild(list);
  return sec;
}

// ─────────────────────────────────────────────────────────────
function showSkeleton(body: HTMLElement): void {
  body.innerHTML = `
    <div class="skeleton-header-ai">
      <div class="ai-spinner">🤖</div>
      <span>กำลังค้นหาข้อมูลและใช้ AI วิเคราะห์จากทั่วโลก...</span>
    </div>
    <div class="results-meta">
      <div class="skeleton" style="width:220px;height:22px;border-radius:99px;"></div>
      <div class="skeleton" style="width:80px;height:22px;border-radius:99px;"></div>
    </div>
    <div class="rank-list">
      ${[1,2,3,4,5].map((i) => `
        <div class="rank-card skeleton-card" style="animation-delay:${(i-1)*60}ms">
          <div class="rank-medal"><div class="skeleton" style="width:28px;height:28px;border-radius:50%;"></div></div>
          <div class="rank-card-img"><div class="skeleton" style="width:100%;height:100%;"></div></div>
          <div class="rank-card-body" style="gap:10px;">
            <div class="skeleton" style="width:60%;height:20px;border-radius:6px;"></div>
            <div class="skeleton" style="width:100%;height:14px;border-radius:6px;"></div>
            <div class="skeleton" style="width:80%;height:14px;border-radius:6px;"></div>
            <div class="skeleton" style="width:40%;height:18px;border-radius:99px;"></div>
          </div>
          <div class="rank-card-actions">
            <div class="skeleton" style="width:56px;height:56px;border-radius:10px;"></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function showError(body: HTMLElement, msg: string): void {
  body.innerHTML = `
    <div class="error-state">
      <div class="error-icon">😵</div>
      <div class="error-title">เกิดข้อผิดพลาด</div>
      <div class="error-desc">${escapeHtml(msg)}</div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
