// ─────────────────────────────────────────────────────────────
//  UserProfileModal Component — Member Profile & Added Items Log
// ─────────────────────────────────────────────────────────────
import { getUserEntities, updateCustomEntity } from "../api/client";
import type { UserProfile, Entity } from "@top5/shared";

export function showUserProfileModal(
  user: UserProfile,
  onEntityUpdated?: () => void
): void {
  const existingModal = document.getElementById("user-profile-modal");
  if (existingModal) existingModal.remove();

  const overlay = document.createElement("div");
  overlay.id = "user-profile-modal";
  overlay.className = "auth-modal-overlay";

  overlay.innerHTML = `
    <div class="auth-modal-card profile-modal-card" role="dialog" aria-modal="true">
      <button class="auth-modal-close" id="profile-close-btn" aria-label="Close">&times;</button>
      
      <div class="profile-header">
        <div class="profile-avatar">👤</div>
        <div class="profile-info">
          <h3 class="profile-username">${esc(user.username)}</h3>
          <p class="profile-email">${esc(user.email)}</p>
          <div class="profile-badges">
            <span class="role-badge ${user.role}">${user.role === "admin" ? "👑 Admin" : "👤 สมาชิก"}</span>
            <span class="join-date">เข้าร่วมเมื่อ ${new Date(user.created_at).toLocaleDateString("th-TH")}</span>
          </div>
        </div>
      </div>

      <div class="profile-section-title">
        <span>📋 รายการที่คุณเคยเสนอ (${0})</span>
      </div>

      <div class="profile-items-list" id="profile-items-list">
        <div class="loading-spinner">กำลังโหลดรายการ...</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  setTimeout(() => overlay.classList.add("open"), 10);

  const closeBtn = overlay.querySelector<HTMLButtonElement>("#profile-close-btn")!;
  const itemsContainer = overlay.querySelector<HTMLElement>("#profile-items-list")!;
  const sectionTitle = overlay.querySelector<HTMLElement>(".profile-section-title span")!;

  const closeModal = () => {
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 250);
  };

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const loadUserItems = async () => {
    try {
      const items = await getUserEntities();
      sectionTitle.textContent = `📋 รายการที่คุณเคยเสนอ (${items.length})`;

      if (items.length === 0) {
        itemsContainer.innerHTML = `
          <div class="empty-profile-items">
            <p>คุณยังไม่ได้เคยเสนอรายการใหม่</p>
            <p class="sub-text">ค้นหาหัวข้อที่คุณสนใจ แล้วกดปุ่ม "+ เสนอตัวเลือกใหม่" ได้เลย!</p>
          </div>
        `;
        return;
      }

      itemsContainer.innerHTML = "";
      items.forEach((item) => {
        const itemRow = document.createElement("div");
        itemRow.className = "profile-item-row";
        itemRow.innerHTML = `
          <div class="profile-item-details">
            <div class="profile-item-name">${esc(item.entity_name)}</div>
            ${item.entity_name_en ? `<div class="profile-item-sub">${esc(item.entity_name_en)}</div>` : ""}
            ${item.description ? `<div class="profile-item-desc">${esc(item.description)}</div>` : ""}
            <div class="profile-item-meta">
              <span class="cat-tag">${esc(item.category)}</span>
              <span class="vote-tag">▲ ${item.upvotes ?? 0} โหวต</span>
            </div>
          </div>
          <button class="profile-edit-btn" data-entity-id="${item.entity_id}">
            ✏️ แก้ไข
          </button>
        `;

        const editBtn = itemRow.querySelector<HTMLButtonElement>(".profile-edit-btn")!;
        editBtn.addEventListener("click", () => {
          showEditForm(itemRow, item);
        });

        itemsContainer.appendChild(itemRow);
      });
    } catch {
      itemsContainer.innerHTML = `<div class="error-text">ไม่สามารถโหลดรายการได้</div>`;
    }
  };

  const showEditForm = (itemRow: HTMLElement, item: Entity) => {
    itemRow.innerHTML = `
      <form class="profile-edit-form">
        <div class="auth-field">
          <label>ชื่อรายการ *</label>
          <input type="text" class="edit-name" value="${esc(item.entity_name)}" required />
        </div>
        <div class="auth-field">
          <label>ชื่อภาษาอังกฤษ</label>
          <input type="text" class="edit-name-en" value="${esc(item.entity_name_en || "")}" />
        </div>
        <div class="auth-field">
          <label>คำอธิบายสังเขป</label>
          <input type="text" class="edit-desc" value="${esc(item.description || "")}" />
        </div>
        <div class="auth-field">
          <label>URL รูปภาพ</label>
          <input type="url" class="edit-image" value="${esc(item.image_url || "")}" />
        </div>
        <div class="edit-actions">
          <button type="submit" class="save-edit-btn">💾 บันทึกการแก้ไข</button>
          <button type="button" class="cancel-edit-btn">ยกเลิก</button>
        </div>
      </form>
    `;

    const form = itemRow.querySelector<HTMLFormElement>(".profile-edit-form")!;
    const cancelBtn = itemRow.querySelector<HTMLButtonElement>(".cancel-edit-btn")!;

    cancelBtn.addEventListener("click", () => loadUserItems());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newName = form.querySelector<HTMLInputElement>(".edit-name")!.value.trim();
      const newNameEn = form.querySelector<HTMLInputElement>(".edit-name-en")!.value.trim();
      const newDesc = form.querySelector<HTMLInputElement>(".edit-desc")!.value.trim();
      const newImage = form.querySelector<HTMLInputElement>(".edit-image")!.value.trim();

      const saveBtn = form.querySelector<HTMLButtonElement>(".save-edit-btn")!;
      saveBtn.disabled = true;
      saveBtn.textContent = "กำลังบันทึก...";

      try {
        const res = await updateCustomEntity({
          entity_id: item.entity_id,
          entity_name: newName,
          entity_name_en: newNameEn || undefined,
          description: newDesc || undefined,
          image_url: newImage || undefined,
        });

        if (res.success) {
          await loadUserItems();
          if (onEntityUpdated) onEntityUpdated();
        } else {
          alert(res.message || "แก้ไขไม่สำเร็จ");
          saveBtn.disabled = false;
          saveBtn.textContent = "💾 บันทึกการแก้ไข";
        }
      } catch {
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 บันทึกการแก้ไข";
      }
    });
  };

  loadUserItems();
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
