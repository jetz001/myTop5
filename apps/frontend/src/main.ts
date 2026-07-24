// ─────────────────────────────────────────────────────────────
//  Main App Entry — SPA Router (URL state)
// ─────────────────────────────────────────────────────────────
import "./styles/main.css";
import { renderSearchPage } from "./pages/SearchPage";
import { renderResultsPage } from "./pages/ResultsPage";
import { renderAdminPage } from "./pages/AdminPage";

const app = document.getElementById("app")!;

function getQueryFromURL(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function pushSearchURL(query: string): void {
  const url = query
    ? `${window.location.pathname}?q=${encodeURIComponent(query)}`
    : window.location.pathname;
  window.history.pushState({ query }, "", url);
}

function navigate(query?: string, coords?: { lat: number; lng: number }): void {
  if (window.location.hash === "#/admin" || window.location.pathname === "/admin") {
    renderAdminPage(app, () => {
      window.location.hash = "";
      navigate();
    });
    return;
  }

  if (!query) {
    pushSearchURL("");
    renderSearchPage(app, (q, c) => navigate(q, c));
  } else {
    pushSearchURL(query);
    renderResultsPage(
      app,
      query,
      coords,
      () => navigate(),
      (q, c) => navigate(q, c)
    );
  }
}

// Handle back/forward & hash changes
window.addEventListener("popstate", () => {
  const q = getQueryFromURL();
  navigate(q || undefined);
});

window.addEventListener("hashchange", () => {
  const q = getQueryFromURL();
  navigate(q || undefined);
});

// Initial render
const initialQuery = getQueryFromURL();
navigate(initialQuery || undefined);

