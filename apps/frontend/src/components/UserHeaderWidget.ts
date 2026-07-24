// ─────────────────────────────────────────────────────────────
//  UserHeaderWidget — Top-Right Login / Register / Profile Bar
// ─────────────────────────────────────────────────────────────
import { getMe, logoutUser } from "../api/client";
import { showAuthModal } from "./AuthModal";
import type { UserProfile } from "@top5/shared";

let cachedUser: UserProfile | null = null;
let userChecked = false;

export async function createUserHeaderWidget(): Promise<HTMLElement> {
  const widget = document.createElement("div");
  widget.className = "user-header-widget";

  if (!userChecked) {
    userChecked = true;
    cachedUser = await getMe();
  }

  const renderWidget = () => {
    widget.innerHTML = "";

    if (cachedUser) {
      const userChip = document.createElement("div");
      userChip.className = "user-profile-chip";
      userChip.innerHTML = `
        <span class="user-avatar-icon">👤</span>
        <span class="user-name-text">${esc(cachedUser.username)}</span>
        <span class="user-dropdown-arrow">▼</span>
        <div class="user-dropdown-menu">
          <div class="user-dropdown-item user-info">
            <span class="user-email-text">${esc(cachedUser.email)}</span>
          </div>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item logout-btn" id="user-logout-btn">
            🚪 ออกจากระบบ
          </button>
        </div>
      `;

      const logoutBtn = userChip.querySelector<HTMLButtonElement>("#user-logout-btn")!;
      logoutBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await logoutUser();
        cachedUser = null;
        renderWidget();
      });

      userChip.addEventListener("click", () => {
        userChip.classList.toggle("open");
      });

      document.addEventListener("click", (evt) => {
        if (!userChip.contains(evt.target as Node)) {
          userChip.classList.remove("open");
        }
      });

      widget.appendChild(userChip);
    } else {
      const authBtn = document.createElement("button");
      authBtn.className = "user-auth-btn";
      authBtn.innerHTML = `
        <span class="auth-btn-icon">🔐</span>
        <span>เข้าสู่ระบบ / สมัครสมาชิก</span>
      `;

      authBtn.addEventListener("click", () => {
        showAuthModal("login", (user) => {
          cachedUser = user;
          renderWidget();
        });
      });

      widget.appendChild(authBtn);
    }
  };

  renderWidget();
  return widget;
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
