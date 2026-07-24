// ─────────────────────────────────────────────────────────────
//  AddEntityModal Component — Propose New Candidate Item
// ─────────────────────────────────────────────────────────────
import { addCustomEntity, getStoredToken } from "../api/client";
import { showAuthModal } from "./AuthModal";

export function showAddEntityModal(
  query: string,
  onSuccess: (data: { top5?: unknown[]; challenger_pool?: unknown[] }) => void
): void {
  // If not logged in, prompt Auth Modal first
  const token = getStoredToken();
  if (!token) {
    showAuthModal("login", () => {
      showAddEntityModal(query, onSuccess);
    });
    return;
  }

  const existingModal = document.getElementById("add-entity-modal");
  if (existingModal) existingModal.remove();

  const overlay = document.createElement("div");
  overlay.id = "add-entity-modal";
  overlay.className = "auth-modal-overlay";

  overlay.innerHTML = `
    <div class="auth-modal-card add-entity-modal-card" role="dialog" aria-modal="true">
      <button class="auth-modal-close" id="add-entity-close-btn" aria-label="Close">&times;</button>
      
      <div class="add-entity-header">
        <span class="add-entity-icon">➕</span>
        <h3>เสนอรายการใหม่</h3>
        <p class="add-entity-subtitle">สำหรับหัวข้อ: <strong>"${esc(query)}"</strong></p>
      </div>

      <div class="auth-error-banner" id="add-entity-error-banner" style="display:none;"></div>

      <form class="auth-form" id="add-entity-form">
        <div class="auth-field">
          <label for="add-entity-name">ชื่อรายการ <span class="required">*</span></label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">🏷️</span>
            <input type="text" id="add-entity-name" placeholder="เช่น Elden Ring, Black Myth: Wukong" required />
          </div>
        </div>

        <div class="auth-field">
          <label for="add-entity-name-en">ชื่อภาษาอังกฤษ (ถ้ามี)</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">🌐</span>
            <input type="text" id="add-entity-name-en" placeholder="เช่น Elden Ring" />
          </div>
        </div>

        <div class="auth-field">
          <label for="add-entity-desc">คำอธิบายสังเขป (ถ้ามี)</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">📝</span>
            <input type="text" id="add-entity-desc" placeholder="เช่น เกม Action RPG แห่งปีจาก FromSoftware" />
          </div>
        </div>

        <div class="auth-field">
          <label for="add-entity-image">URL รูปภาพ (ถ้ามี)</label>
          <div class="auth-input-wrapper">
            <span class="auth-input-icon">🖼️</span>
            <input type="url" id="add-entity-image" placeholder="https://example.com/image.jpg" />
          </div>
        </div>

        <button type="submit" class="auth-submit-btn" id="add-entity-submit-btn">
          ➕ ยืนยันเสนอรายการ
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  setTimeout(() => overlay.classList.add("open"), 10);

  const closeBtn = overlay.querySelector<HTMLButtonElement>("#add-entity-close-btn")!;
  const form = overlay.querySelector<HTMLFormElement>("#add-entity-form")!;
  const submitBtn = overlay.querySelector<HTMLButtonElement>("#add-entity-submit-btn")!;
  const errorBanner = overlay.querySelector<HTMLElement>("#add-entity-error-banner")!;

  const inputName = overlay.querySelector<HTMLInputElement>("#add-entity-name")!;
  const inputNameEn = overlay.querySelector<HTMLInputElement>("#add-entity-name-en")!;
  const inputDesc = overlay.querySelector<HTMLInputElement>("#add-entity-desc")!;
  const inputImage = overlay.querySelector<HTMLInputElement>("#add-entity-image")!;

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBanner.style.display = "none";

    const name = inputName.value.trim();
    if (!name) {
      showError("กรุณากรอกชื่อรายการ");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังเสนอรายการ...";

    try {
      const res = await addCustomEntity({
        query,
        entity_name: name,
        entity_name_en: inputNameEn.value.trim() || undefined,
        description: inputDesc.value.trim() || undefined,
        image_url: inputImage.value.trim() || undefined,
      });

      if (res.success) {
        closeModal();
        onSuccess({ top5: res.top5, challenger_pool: res.challenger_pool });
      } else {
        showError(res.message || "ไม่สามารถเสนอรายการได้");
      }
    } catch {
      showError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "➕ ยืนยันเสนอรายการ";
    }
  });
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
