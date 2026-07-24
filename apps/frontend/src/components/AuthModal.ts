// ─────────────────────────────────────────────────────────────
//  AuthModal Component — Login & Register Modal Popup
// ─────────────────────────────────────────────────────────────
import { registerUser, loginUser } from "../api/client";
import type { UserProfile } from "@top5/shared";

export function showAuthModal(
  initialTab: "login" | "register" = "login",
  onSuccess: (user: UserProfile) => void
): void {
  const existingModal = document.getElementById("auth-modal");
  if (existingModal) existingModal.remove();

  const overlay = document.createElement("div");
  overlay.id = "auth-modal";
  overlay.className = "auth-modal-overlay";

  let activeTab: "login" | "register" = initialTab;

  overlay.innerHTML = `
    <div class="auth-modal-card" role="dialog" aria-modal="true">
      <button class="auth-modal-close" id="auth-close-btn" aria-label="Close">&times;</button>
      
      <div class="auth-modal-tabs">
        <button class="auth-tab-btn ${activeTab === "login" ? "active" : ""}" id="auth-tab-login">
          เข้าสู่ระบบ
        </button>
        <button class="auth-tab-btn ${activeTab === "register" ? "active" : ""}" id="auth-tab-register">
          สมัครสมาชิก
        </button>
      </div>

      <div class="auth-error-banner" id="auth-error-banner" style="display:none;"></div>

      <form class="auth-form" id="auth-form">
        <div class="auth-field" id="field-username" style="${activeTab === "register" ? "" : "display:none;"}">
          <label for="auth-input-username">ชื่อผู้ใช้ (Username)</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">👤</span>
            <input type="text" id="auth-input-username" placeholder="เช่น alex99" autocomplete="username" />
          </div>
        </div>

        <div class="auth-field" id="field-email" style="${activeTab === "register" ? "" : "display:none;"}">
          <label for="auth-input-email">อีเมล (Email)</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">✉️</span>
            <input type="email" id="auth-input-email" placeholder="name@example.com" autocomplete="email" />
          </div>
        </div>

        <div class="auth-field" id="field-login-identifier" style="${activeTab === "login" ? "" : "display:none;"}">
          <label for="auth-input-identifier">อีเมล หรือ ชื่อผู้ใช้</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">👤</span>
            <input type="text" id="auth-input-identifier" placeholder="กรอกอีเมลหรือชื่อผู้ใช้" autocomplete="username" />
          </div>
        </div>

        <div class="auth-field">
          <label for="auth-input-password">รหัสผ่าน</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="auth-input-password" placeholder="••••••••" autocomplete="current-password" />
          </div>
        </div>

        <div class="auth-field" id="field-confirm-password" style="${activeTab === "register" ? "" : "display:none;"}">
          <label for="auth-input-confirm-password">ยืนยันรหัสผ่าน</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">🔑</span>
            <input type="password" id="auth-input-confirm-password" placeholder="••••••••" autocomplete="new-password" />
          </div>
        </div>

        <button type="submit" class="auth-submit-btn" id="auth-submit-btn">
          ${activeTab === "login" ? "เข้าสู่ระบบ" : "ยืนยันการสมัครสมาชิก"}
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus transition
  setTimeout(() => overlay.classList.add("open"), 10);

  // Element references
  const closeBtn = overlay.querySelector<HTMLButtonElement>("#auth-close-btn")!;
  const tabLogin = overlay.querySelector<HTMLButtonElement>("#auth-tab-login")!;
  const tabRegister = overlay.querySelector<HTMLButtonElement>("#auth-tab-register")!;
  const form = overlay.querySelector<HTMLFormElement>("#auth-form")!;
  const submitBtn = overlay.querySelector<HTMLButtonElement>("#auth-submit-btn")!;
  const errorBanner = overlay.querySelector<HTMLElement>("#auth-error-banner")!;

  const fieldUsername = overlay.querySelector<HTMLElement>("#field-username")!;
  const fieldEmail = overlay.querySelector<HTMLElement>("#field-email")!;
  const fieldIdentifier = overlay.querySelector<HTMLElement>("#field-login-identifier")!;
  const fieldConfirmPassword = overlay.querySelector<HTMLElement>("#field-confirm-password")!;

  const inputUsername = overlay.querySelector<HTMLInputElement>("#auth-input-username")!;
  const inputEmail = overlay.querySelector<HTMLInputElement>("#auth-input-email")!;
  const inputIdentifier = overlay.querySelector<HTMLInputElement>("#auth-input-identifier")!;
  const inputPassword = overlay.querySelector<HTMLInputElement>("#auth-input-password")!;
  const inputConfirmPassword = overlay.querySelector<HTMLInputElement>("#auth-input-confirm-password")!;

  const closeModal = () => {
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 250);
  };

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const showError = (msg: string) => {
    errorBanner.textContent = msg;
    errorBanner.style.display = "block";
  };
  const hideError = () => {
    errorBanner.style.display = "none";
    errorBanner.textContent = "";
  };

  const setTab = (tab: "login" | "register") => {
    activeTab = tab;
    hideError();
    if (tab === "login") {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      fieldUsername.style.display = "none";
      fieldEmail.style.display = "none";
      fieldIdentifier.style.display = "block";
      fieldConfirmPassword.style.display = "none";
      submitBtn.textContent = "เข้าสู่ระบบ";
    } else {
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      fieldUsername.style.display = "block";
      fieldEmail.style.display = "block";
      fieldIdentifier.style.display = "none";
      fieldConfirmPassword.style.display = "block";
      submitBtn.textContent = "ยืนยันการสมัครสมาชิก";
    }
  };

  tabLogin.addEventListener("click", () => setTab("login"));
  tabRegister.addEventListener("click", () => setTab("register"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const password = inputPassword.value;

    if (activeTab === "register") {
      const username = inputUsername.value.trim();
      const email = inputEmail.value.trim();
      const confirmPassword = inputConfirmPassword.value;

      if (!username || username.length < 3) {
        showError("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
        return;
      }
      if (!email || !email.includes("@")) {
        showError("กรุณากรอกอีเมลให้ถูกต้อง");
        return;
      }
      if (!password || password.length < 6) {
        showError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return;
      }
      if (password !== confirmPassword) {
        showError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังสมัครสมาชิก...";

      try {
        const res = await registerUser({ username, email, password });
        if (res.success && res.user) {
          closeModal();
          onSuccess(res.user);
        } else {
          showError(res.message || "การสมัครสมาชิกไม่สำเร็จ");
        }
      } catch {
        showError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "ยืนยันการสมัครสมาชิก";
      }
    } else {
      const identifier = inputIdentifier.value.trim();
      if (!identifier) {
        showError("กรุณากรอกอีเมลหรือชื่อผู้ใช้");
        return;
      }
      if (!password) {
        showError("กรุณากรอกรหัสผ่าน");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังเข้าสู่ระบบ...";

      try {
        const res = await loginUser({ email_or_username: identifier, password });
        if (res.success && res.user) {
          closeModal();
          onSuccess(res.user);
        } else {
          showError(res.message || "เข้าสู่ระบบไม่สำเร็จ");
        }
      } catch {
        showError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "เข้าสู่ระบบ";
      }
    }
  });
}
