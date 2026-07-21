// ─────────────────────────────────────────────────────────────
//  SearchBar Component — Intent Classification (Frontend copy)
//  Note: Uses a lightweight inline version of classifyIntent
//        to avoid cross-workspace import issues in Vite
// ─────────────────────────────────────────────────────────────

type IntentType = "geo" | "web3" | "dev" | "popculture" | "academic" | "general";

const GEO_KW = [
  "กะเพรา","ร้านอาหาร","กาแฟ","ชาบู","หมูกะทะ","ข้าวมันไก่","ส้มตำ",
  "ก๋วยเตี๋ยว","ผัดไทย","ต้มยำ","สุกี้","บุฟเฟ่","ร้าน","อาหาร",
  "ใกล้ฉัน","ใกล้เคียง","แถวนี้","คาเฟ่","เบเกอรี่","บาร์","ผับ",
  "restaurant","cafe","coffee","food","near me","nearby","hotel","bar","pub","spa","bakery",
];
const WEB3_KW = [
  "คริปโต","บิทคอยน์","อีเธอเรียม","โซลานา","เหรียญ","บล็อกเชน","ดีไฟ","เอ็นเอฟที",
  "crypto","bitcoin","ethereum","solana","bnb","defi","nft","blockchain","web3","token","coin",
  "wallet","binance","polygon","cardano","dogecoin","xrp",
];
const DEV_KW = [
  "ภาษาโปรแกรม","ภาษาคอมพิวเตอร์","เขียนโค้ด","โปรแกรมเมอร์",
  "python","javascript","typescript","rust","golang","kotlin","swift","java","c++","php",
  "programming","language","developer","coding","github","react","vue","nextjs","nodejs",
];
const POP_KW = [
  "คนหล่อ","คนสวย","ดารา","นักแสดง","นักร้อง","ศิลปิน","ไอดอล","เคป็อป",
  "handsome","beautiful","celebrity","actor","actress","singer","kpop","idol","popular","famous",
];
const ACA_KW = [
  "งานวิจัย","ดาราศาสตร์","หลุมดำ","จักรวาล","วิทยาศาสตร์","ฟิสิกส์",
  "research","astronomy","black hole","universe","science","physics","nasa","arxiv","quantum","space",
];

function quickClassify(q: string): { intent: IntentType; use_gps: boolean } {
  const lq = q.toLowerCase();
  const score: Record<IntentType, number> = { geo: 0, web3: 0, dev: 0, popculture: 0, academic: 0, general: 0 };
  GEO_KW.forEach((k) => { if (lq.includes(k)) score.geo += 10; });
  WEB3_KW.forEach((k) => { if (lq.includes(k)) score.web3 += 10; });
  DEV_KW.forEach((k) => { if (lq.includes(k)) score.dev += 10; });
  POP_KW.forEach((k) => { if (lq.includes(k)) score.popculture += 10; });
  ACA_KW.forEach((k) => { if (lq.includes(k)) score.academic += 10; });

  let best: IntentType = "general";
  let bestScore = 0;
  for (const [k, v] of Object.entries(score) as [IntentType, number][]) {
    if (k !== "general" && v > bestScore) { best = k; bestScore = v; }
  }
  return { intent: best, use_gps: best === "geo" };
}

const INTENT_ICONS: Record<string, string> = {
  geo: "📍", web3: "⛓️", dev: "💻", popculture: "🎬", academic: "🔭", general: "🔍",
};

const INTENT_LABELS: Record<string, string> = {
  geo:        "📍 ค้นหาสถานที่ใกล้คุณ",
  web3:       "⛓️ Web3 & Crypto",
  dev:        "💻 ภาษาโปรแกรมมิ่ง",
  popculture: "🎬 Pop Culture & ดารา",
  academic:   "🔭 วิทยาศาสตร์ & งานวิจัย",
  general:    "🔍 ค้นหาทั่วไป",
};

const SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

interface SearchBarOptions {
  initialValue?: string;
  onSearch: (query: string, coords?: { lat: number; lng: number }) => void;
  compact?: boolean;
}

export function createSearchBar(opts: SearchBarOptions): HTMLElement {
  const { compact = false, onSearch, initialValue = "" } = opts;
  const wrap = document.createElement("div");
  wrap.className = compact ? "results-search-wrap" : "search-form";

  if (compact) {
    wrap.innerHTML = `
      <input type="text" class="results-search-input" placeholder="ค้นหา..." value="${initialValue}" autocomplete="off" />
      <button class="results-search-btn" title="ค้นหา">${SEARCH_ICON}</button>
    `;
    const input = wrap.querySelector<HTMLInputElement>("input")!;
    const btn   = wrap.querySelector<HTMLButtonElement>("button")!;
    const go = () => { const q = input.value.trim(); if (q) onSearch(q); };
    btn.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  } else {
    wrap.innerHTML = `
      <div class="search-input-wrap">
        <span class="search-intent-icon" id="intent-icon">🔍</span>
        <input type="text" class="search-input" id="home-search-input"
          placeholder="ค้นหาอะไรก็ได้... กะเพรา, bitcoin, python, คนหล่อ"
          value="${initialValue}" autocomplete="off" autofocus />
        <button class="search-btn" id="home-search-btn">
          ${SEARCH_ICON} ค้นหา Top5
        </button>
      </div>
      <div class="intent-hint" id="intent-hint">พิมพ์เพื่อค้นหา...</div>
    `;

    const input  = wrap.querySelector<HTMLInputElement>("#home-search-input")!;
    const btn    = wrap.querySelector<HTMLButtonElement>("#home-search-btn")!;
    const hint   = wrap.querySelector<HTMLElement>("#intent-hint")!;
    const icon   = wrap.querySelector<HTMLElement>("#intent-icon")!;
    let coords: { lat: number; lng: number } | undefined;
    let timer: ReturnType<typeof setTimeout>;

    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim();
        if (!q) { hint.textContent = "พิมพ์เพื่อค้นหา..."; icon.textContent = "🔍"; return; }
        const { intent, use_gps } = quickClassify(q);
        icon.textContent = INTENT_ICONS[intent] ?? "🔍";
        hint.innerHTML = `<span class="intent-badge">${INTENT_LABELS[intent]}</span>`;
        if (use_gps) requestGPS().then((c) => { coords = c ?? undefined; });
        else coords = undefined;
      }, 300);
    });

    const go = () => {
      const q = input.value.trim();
      if (!q) return;
      const { use_gps } = quickClassify(q);
      onSearch(q, use_gps && coords ? coords : undefined);
    };
    btn.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
  return wrap;
}

async function requestGPS(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}
