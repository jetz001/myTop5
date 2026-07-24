// ─────────────────────────────────────────────────────────────
//  AdminPage Component — Left Sidebar Layout & Sponsor Module
// ─────────────────────────────────────────────────────────────
import {
  getAdminLogs,
  getAdminUsers,
  updateUserRoleAdmin,
  deleteEntityAdmin,
  getAdminSponsors,
  createAdminSponsor,
  updateAdminSponsor,
  deleteAdminSponsor,
  getMe,
} from "../api/client";
import type { ActivityLog, UserProfile, Sponsor } from "@top5/shared";

export async function renderAdminPage(
  container: HTMLElement,
  onBackToHome: () => void
): Promise<void> {
  container.innerHTML = "";

  const me = await getMe();
  if (!me || me.role !== "admin") {
    container.innerHTML = `
      <div class="admin-page-unauth">
        <div class="admin-unauthorized">
          <div class="error-icon">🔒</div>
          <h2>สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin Only)</h2>
          <p>คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หรือ session ของคุณหมดอายุ</p>
          <button class="back-home-btn" id="admin-unauth-back">กลับหน้าหลัก</button>
        </div>
      </div>
    `;
    container.querySelector("#admin-unauth-back")?.addEventListener("click", onBackToHome);
    return;
  }

  const page = document.createElement("div");
  page.className = "admin-layout";

  page.innerHTML = `
    <!-- Left Sidebar Navigation -->
    <aside class="admin-sidebar">
      <div class="sidebar-brand" id="admin-logo-btn">
        <span class="brand-logo">Top5</span>
        <span class="brand-admin-badge">⚙️ Admin</span>
      </div>

      <nav class="sidebar-nav">
        <button class="sidebar-item active" id="nav-logs">
          <span class="nav-icon">📜</span>
          <span class="nav-text">Activity Audit Logs</span>
        </button>
        <button class="sidebar-item" id="nav-users">
          <span class="nav-icon">👥</span>
          <span class="nav-text">จัดการสมาชิก</span>
        </button>
        <button class="sidebar-item" id="nav-sponsors">
          <span class="nav-icon">📢</span>
          <span class="nav-text">จัดการสปอนเซอร์</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-back-btn" id="admin-back-btn">
          <span>⬅️</span>
          <span>กลับหน้าหลัก</span>
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="admin-main-content">
      <header class="admin-topbar">
        <h1 class="page-title" id="admin-page-title">📜 Activity Audit Logs</h1>
        <div class="admin-user-info">
          <span>👑 ${esc(me.username)}</span>
        </div>
      </header>

      <div class="admin-filter-bar">
        <div class="admin-search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="admin-search-input" placeholder="พิมพ์เพื่อค้นหา..." />
        </div>

        <div class="admin-action-chips" id="action-chips">
          <button class="chip active" data-action="all">ทั้งหมด</button>
          <button class="chip" data-action="CREATE_ENTITY">➕ เพิ่มรายการ</button>
          <button class="chip" data-action="UPDATE_ENTITY">✏️ แก้ไขรายการ</button>
          <button class="chip" data-action="DELETE_ENTITY">🗑️ ลบรายการ</button>
        </div>

        <button class="add-sponsor-btn" id="add-sponsor-btn" style="display: none;">
          ➕ เพิ่มสปอนเซอร์ใหม่
        </button>
      </div>

      <div class="admin-content-area" id="admin-content-area">
        <div class="loading-spinner">กำลังโหลด...</div>
      </div>
    </main>
  `;

  container.appendChild(page);

  page.querySelector("#admin-logo-btn")?.addEventListener("click", onBackToHome);
  page.querySelector("#admin-back-btn")?.addEventListener("click", onBackToHome);

  let activeTab: "logs" | "users" | "sponsors" = "logs";
  let currentSearch = "";
  let actionFilter = "all";

  const navLogs = page.querySelector<HTMLButtonElement>("#nav-logs")!;
  const navUsers = page.querySelector<HTMLButtonElement>("#nav-users")!;
  const navSponsors = page.querySelector<HTMLButtonElement>("#nav-sponsors")!;
  const searchInput = page.querySelector<HTMLInputElement>("#admin-search-input")!;
  const actionChips = page.querySelector<HTMLElement>("#action-chips")!;
  const addSponsorBtn = page.querySelector<HTMLButtonElement>("#add-sponsor-btn")!;
  const contentArea = page.querySelector<HTMLElement>("#admin-content-area")!;
  const pageTitle = page.querySelector<HTMLElement>("#admin-page-title")!;

  const renderLogs = async () => {
    contentArea.innerHTML = `<div class="loading-spinner">กำลังโหลดประวัติการทำงาน...</div>`;
    const logs = await getAdminLogs(currentSearch);
    const filtered = actionFilter === "all" ? logs : logs.filter((l) => l.action === actionFilter);

    if (filtered.length === 0) {
      contentArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📜</div>
          <h3>ไม่พบประวัติกิจกรรมที่ตรงตามเงื่อนไข</h3>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>วัน/เวลา</th>
              <th>ผู้ทำรายการ</th>
              <th>Action</th>
              <th>รายการ</th>
              <th>รายละเอียดกิจกรรม</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((log) => `
              <tr>
                <td class="time-col">${new Date(log.created_at).toLocaleString("th-TH")}</td>
                <td class="user-col"><strong>👤 ${esc(log.username)}</strong></td>
                <td><span class="action-tag ${log.action}">${actionBadge(log.action)}</span></td>
                <td class="entity-col">${esc(log.entity_name || "-")}</td>
                <td class="details-col">${esc(log.details || "-")}</td>
                <td class="action-col">
                  ${log.entity_id ? `<button class="admin-del-btn" data-entity-id="${log.entity_id}" data-name="${esc(log.entity_name || "")}">🗑️ ลบ</button>` : "-"}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    contentArea.querySelectorAll<HTMLButtonElement>(".admin-del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const entityId = btn.dataset.entityId!;
        const entityName = btn.dataset.name!;
        if (confirm(`คุณต้องการลบรายการ "${entityName}" ใช่หรือไม่?`)) {
          const res = await deleteEntityAdmin(entityId);
          if (res.success) renderLogs();
          else alert(res.message || "ลบรายการไม่สำเร็จ");
        }
      });
    });
  };

  const renderUsers = async () => {
    contentArea.innerHTML = `<div class="loading-spinner">กำลังโหลดรายชื่อสมาชิก...</div>`;
    const users = await getAdminUsers(currentSearch);

    if (users.length === 0) {
      contentArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>ไม่พบบัญชีสมาชิกที่ตรงตามคำค้นหา</h3>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>วันสมัคร</th>
              <th>ชื่อผู้ใช้ (Username)</th>
              <th>อีเมล</th>
              <th>สิทธิ์บทบาท</th>
              <th>สลับบทบาท</th>
            </tr>
          </thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td class="time-col">${new Date(u.created_at).toLocaleDateString("th-TH")}</td>
                <td class="user-col"><strong>👤 ${esc(u.username)}</strong></td>
                <td class="email-col">${esc(u.email)}</td>
                <td><span class="role-badge ${u.role}">${u.role === "admin" ? "👑 Admin" : "👤 สมาชิก"}</span></td>
                <td>
                  <button class="role-toggle-btn" data-user-id="${u.user_id}" data-role="${u.role}">
                    ${u.role === "admin" ? "เปลี่ยนเป็น สมาชิก" : "แต่งตั้งเป็น Admin 👑"}
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    contentArea.querySelectorAll<HTMLButtonElement>(".role-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.dataset.userId!;
        const currentRole = btn.dataset.role!;
        const newRole = currentRole === "admin" ? "user" : "admin";
        if (confirm(`สลับสิทธิ์ผู้ใช้งานเป็น ${newRole} ใช่หรือไม่?`)) {
          const res = await updateUserRoleAdmin(userId, newRole);
          if (res.success) renderUsers();
          else alert(res.message || "ไม่สามารถเปลี่ยนสิทธิ์ได้");
        }
      });
    });
  };

  const renderSponsors = async () => {
    contentArea.innerHTML = `<div class="loading-spinner">กำลังโหลดแคมเปญสปอนเซอร์...</div>`;
    const sponsors = await getAdminSponsors(currentSearch);

    if (sponsors.length === 0) {
      contentArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📢</div>
          <h3>ยังไม่มีแคมเปญสปอนเซอร์</h3>
          <p>กดปุ่ม "+ เพิ่มสปอนเซอร์ใหม่" เพื่อสร้างแคมเปญโฆษณาแทรกตามคีย์เวิร์ดได้เลย!</p>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>แคมเปญ / คีย์เวิร์ด</th>
              <th>หัวข้อโฆษณา / ลิงก์</th>
              <th>สถานะ</th>
              <th>ระยะเวลาเปิดใช้งาน</th>
              <th>ยอดคลิก</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${sponsors.map((s) => {
              const tags = (s.target_keyword || "").split(/[,，]/).map(t => t.trim()).filter(Boolean);
              return `
              <tr>
                <td class="sponsor-name-col">
                  <strong>📢 ${esc(s.sponsor_name)}</strong>
                  <div class="kw-tags-container">
                    ${tags.map(t => `<span class="kw-badge">🔑 ${esc(t)}</span>`).join(" ")}
                  </div>
                </td>
                <td class="sponsor-title-col">
                  <div class="sponsor-title-text">${esc(s.title)}</div>
                  <a href="${esc(s.target_url)}" target="_blank" class="sponsor-url-link">🔗 ${esc(s.target_url)}</a>
                </td>
                <td>
                  <button class="status-toggle-btn ${s.status}" data-id="${s.sponsor_id}" data-status="${s.status}">
                    ${s.status === "active" ? "🟢 เปิดใช้งาน (Active)" : "🔴 ปิดใช้งาน (Inactive)"}
                  </button>
                </td>
                <td class="time-range-col">
                  ${s.start_at || s.end_at ? `
                    <div>🕒 เริ่ม: ${s.start_at ? new Date(s.start_at).toLocaleString("th-TH") : "ไม่จำกัด"}</div>
                    <div>⏳ สิ้นสุด: ${s.end_at ? new Date(s.end_at).toLocaleString("th-TH") : "ไม่จำกัด"}</div>
                  ` : `<span class="time-always">♾️ ตลอดเวลา</span>`}
                </td>
                <td class="clicks-col"><strong>👆 ${s.click_count}</strong> คลิก</td>
                <td class="action-col">
                  <button class="edit-sponsor-btn" data-sponsor='${JSON.stringify(s).replace(/'/g, "&apos;")}'>✏️ แก้ไข</button>
                  <button class="del-sponsor-btn" data-id="${s.sponsor_id}" data-name="${esc(s.sponsor_name)}">🗑️ ลบ</button>
                </td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      </div>
    `;

    // Status Toggle Handlers
    contentArea.querySelectorAll<HTMLButtonElement>(".status-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        const current = btn.dataset.status!;
        const nextStatus = current === "active" ? "inactive" : "active";
        const res = await updateAdminSponsor({ sponsor_id: id, status: nextStatus });
        if (res.success) renderSponsors();
        else alert(res.message || "ไม่สามารถเปลี่ยนสถานะได้");
      });
    });

    // Edit Sponsor Handlers
    contentArea.querySelectorAll<HTMLButtonElement>(".edit-sponsor-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const data = JSON.parse(btn.dataset.sponsor!);
        openSponsorModal(data);
      });
    });

    // Delete Sponsor Handlers
    contentArea.querySelectorAll<HTMLButtonElement>(".del-sponsor-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        const name = btn.dataset.name!;
        if (confirm(`คุณต้องการลบแคมเปญสปอนเซอร์ "${name}" ใช่หรือไม่?`)) {
          const res = await deleteAdminSponsor(id);
          if (res.success) renderSponsors();
          else alert(res.message || "ลบแคมเปญไม่สำเร็จ");
        }
      });
    });
  };

  const openSponsorModal = (sponsor?: Sponsor) => {
    const existingModal = document.getElementById("sponsor-form-modal");
    if (existingModal) existingModal.remove();

    const overlay = document.createElement("div");
    overlay.id = "sponsor-form-modal";
    overlay.className = "auth-modal-overlay";

    const isEdit = !!sponsor;

    overlay.innerHTML = `
      <div class="auth-modal-card sponsor-modal-card">
        <button class="auth-modal-close" id="sponsor-close-btn">&times;</button>
        <h3 class="auth-modal-title">${isEdit ? "✏️ แก้ไขแคมเปญสปอนเซอร์" : "📢 เพิ่มแคมเปญสปอนเซอร์ใหม่"}</h3>
        
        <form class="auth-form" id="sponsor-form">
          <div class="auth-field">
            <label>ชื่อผู้สนับสนุน / แบรนด์ <span class="required">*</span></label>
            <input type="text" id="sp-name" value="${esc(sponsor?.sponsor_name || "")}" placeholder="เช่น Parker Thailand Official" required />
          </div>

          <div class="auth-field">
            <label>คีย์เวิร์ดเป้าหมาย (Target Keywords - ไม่เกิน 5 คีย์เวิร์ด) <span class="required">*</span></label>
            <input type="text" id="sp-keyword" value="${esc(sponsor?.target_keyword || "")}" placeholder="เช่น ปากกา, เครื่องเขียน, Parker, ดินสอ (คั่นด้วย , ไม่เกิน 5 คำ หรือใส่ *)" required />
            <small class="field-hint">ใส่ได้สูงสุด 5 คีย์เวิร์ด คั่นด้วยเครื่องหมายจุลภาค (,) หรือใส่ * เพื่อแสดงผลทุกคำค้นหา</small>
          </div>

          <div class="auth-field">
            <label>หัวข้อโฆษณา / โปรโมชั่น (Title) <span class="required">*</span></label>
            <input type="text" id="sp-title" value="${esc(sponsor?.title || "")}" placeholder="เช่น ปากกา Parker รุ่นพรีเมียม ลด 20%" required />
          </div>

          <div class="auth-field">
            <label>คำอธิบายสั้นๆ (Description)</label>
            <input type="text" id="sp-desc" value="${esc(sponsor?.description || "")}" placeholder="เช่น สั่งซื้อวันนี้ รับส่วนลดและจัดส่งฟรีทั่วประเทศ" />
          </div>

          <div class="auth-field">
            <label>URL ลิงก์ปลายทาง (Target URL) <span class="required">*</span></label>
            <input type="url" id="sp-target-url" value="${esc(sponsor?.target_url || "")}" placeholder="https://www.example.com/promo" required />
          </div>

          <div class="auth-field">
            <label>URL รูปภาพแบนเนอร์ / โลโก้</label>
            <input type="url" id="sp-image-url" value="${esc(sponsor?.image_url || "")}" placeholder="https://..." />
          </div>

          <div class="auth-field">
            <label>ข้อความป้ายกำกับ (Badge Text)</label>
            <input type="text" id="sp-badge-text" value="${esc(sponsor?.badge_text || "⭐ สปอนเซอร์")}" placeholder="⭐ สปอนเซอร์" />
          </div>

          <div class="auth-row-2">
            <div class="auth-field">
              <label>วัน/เวลา เริ่มเปิดแคมเปญ</label>
              <input type="datetime-local" id="sp-start" value="${formatDatetimeLocal(sponsor?.start_at)}" />
            </div>

            <div class="auth-field">
              <label>วัน/เวลา สิ้นสุดแคมเปญ</label>
              <input type="datetime-local" id="sp-end" value="${formatDatetimeLocal(sponsor?.end_at)}" />
            </div>
          </div>

          <div class="auth-field">
            <label>สถานะเปิดใช้งาน</label>
            <select id="sp-status">
              <option value="active" ${sponsor?.status !== "inactive" ? "selected" : ""}>🟢 Active (เปิดใช้งาน)</option>
              <option value="inactive" ${sponsor?.status === "inactive" ? "selected" : ""}>🔴 Inactive (ปิดใช้งาน)</option>
            </select>
          </div>

          <button type="submit" class="auth-submit-btn">
            ${isEdit ? "💾 บันทึกการแก้ไข" : "➕ สร้างแคมเปญสปอนเซอร์"}
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add("open"), 10);

    const closeBtn = overlay.querySelector<HTMLButtonElement>("#sponsor-close-btn")!;
    const form = overlay.querySelector<HTMLFormElement>("#sponsor-form")!;

    const closeModal = () => {
      overlay.classList.remove("open");
      setTimeout(() => overlay.remove(), 250);
    };

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const targetKw = (document.getElementById("sp-keyword") as HTMLInputElement).value.trim();
      const tags = targetKw.split(/[,，]/).map(t => t.trim()).filter(Boolean);

      if (tags.length > 5) {
        alert("กรุณากรอกคีย์เวิร์ดเป้าหมายไม่เกิน 5 คำ (คั่นด้วยเครื่องหมาย ,)");
        return;
      }

      const payload = {
        sponsor_name: (document.getElementById("sp-name") as HTMLInputElement).value.trim(),
        target_keyword: targetKw,
        title: (document.getElementById("sp-title") as HTMLInputElement).value.trim(),
        description: (document.getElementById("sp-desc") as HTMLInputElement).value.trim() || undefined,
        target_url: (document.getElementById("sp-target-url") as HTMLInputElement).value.trim(),
        image_url: (document.getElementById("sp-image-url") as HTMLInputElement).value.trim() || undefined,
        badge_text: (document.getElementById("sp-badge-text") as HTMLInputElement).value.trim() || "⭐ สปอนเซอร์",
        status: (document.getElementById("sp-status") as HTMLSelectElement).value as "active" | "inactive",
        start_at: (document.getElementById("sp-start") as HTMLInputElement).value || undefined,
        end_at: (document.getElementById("sp-end") as HTMLInputElement).value || undefined,
      };

      const submitBtn = form.querySelector<HTMLButtonElement>(".auth-submit-btn")!;
      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังบันทึก...";

      try {
        let res;
        if (isEdit) {
          res = await updateAdminSponsor({ ...payload, sponsor_id: sponsor.sponsor_id });
        } else {
          res = await createAdminSponsor(payload);
        }

        if (res.success) {
          closeModal();
          renderSponsors();
        } else {
          alert(res.message || "บันทึกไม่สำเร็จ");
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? "💾 บันทึกการแก้ไข" : "➕ สร้างแคมเปญสปอนเซอร์";
        }
      } catch {
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        submitBtn.disabled = false;
      }
    });
  };

  addSponsorBtn.addEventListener("click", () => openSponsorModal());

  const updateView = () => {
    if (activeTab === "logs") {
      pageTitle.textContent = "📜 Activity Audit Logs";
      actionChips.style.display = "flex";
      addSponsorBtn.style.display = "none";
      renderLogs();
    } else if (activeTab === "users") {
      pageTitle.textContent = "👥 จัดการสมาชิก (User Management)";
      actionChips.style.display = "none";
      addSponsorBtn.style.display = "none";
      renderUsers();
    } else {
      pageTitle.textContent = "📢 จัดการสปอนเซอร์ (Sponsor Management)";
      actionChips.style.display = "none";
      addSponsorBtn.style.display = "inline-flex";
      renderSponsors();
    }
  };

  navLogs.addEventListener("click", () => {
    activeTab = "logs";
    navLogs.classList.add("active");
    navUsers.classList.remove("active");
    navSponsors.classList.remove("active");
    updateView();
  });

  navUsers.addEventListener("click", () => {
    activeTab = "users";
    navUsers.classList.add("active");
    navLogs.classList.remove("active");
    navSponsors.classList.remove("active");
    updateView();
  });

  navSponsors.addEventListener("click", () => {
    activeTab = "sponsors";
    navSponsors.classList.add("active");
    navLogs.classList.remove("active");
    navUsers.classList.remove("active");
    updateView();
  });

  let debounceTimer: any;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = (e.target as HTMLInputElement).value;
      updateView();
    }, 250);
  });

  actionChips.querySelectorAll<HTMLButtonElement>(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      actionChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      actionFilter = chip.dataset.action!;
      updateView();
    });
  });

  updateView();
}

function actionBadge(act: string): string {
  switch (act) {
    case "CREATE_ENTITY": return "➕ เพิ่มรายการ";
    case "UPDATE_ENTITY": return "✏️ แก้ไขรายการ";
    case "DELETE_ENTITY": return "🗑️ ลบรายการ";
    case "VOTE": return "▲ โหวต";
    default: return act;
  }
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDatetimeLocal(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
