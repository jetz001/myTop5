// ─────────────────────────────────────────────────────────────
//  AdminPage Component — Admin Dashboard (/admin)
// ─────────────────────────────────────────────────────────────
import { getAdminLogs, getAdminUsers, updateUserRoleAdmin, deleteEntityAdmin, getMe } from "../api/client";
import type { ActivityLog, UserProfile } from "@top5/shared";

export async function renderAdminPage(
  container: HTMLElement,
  onBackToHome: () => void
): Promise<void> {
  container.innerHTML = "";

  const me = await getMe();
  if (!me || me.role !== "admin") {
    container.innerHTML = `
      <div class="admin-page">
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
  page.className = "admin-page";

  page.innerHTML = `
    <header class="admin-header">
      <div class="admin-header-inner">
        <div class="admin-title-wrap">
          <span class="admin-logo" id="admin-logo-btn">Top5</span>
          <span class="admin-badge">⚙️ Admin Dashboard</span>
        </div>
        <button class="back-home-btn" id="admin-back-btn">⬅️ กลับหน้าหลัก</button>
      </div>
    </header>

    <main class="admin-body">
      <div class="admin-tabs-bar">
        <button class="admin-tab-btn active" id="tab-logs">
          📜 Activity Audit Logs (ประวัติการป้อน/แก้ไข)
        </button>
        <button class="admin-tab-btn" id="tab-users">
          👥 จัดการสมาชิก (User Management)
        </button>
      </div>

      <div class="admin-filter-bar">
        <div class="admin-search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="admin-search-input" placeholder="พิมพ์เพื่อค้นหา (ชื่อสมาชิก, ชื่อรายการ, Action)..." />
        </div>
        <div class="admin-action-chips" id="action-chips">
          <button class="chip active" data-action="all">ทั้งหมด</button>
          <button class="chip" data-action="CREATE_ENTITY">➕ เพิ่มรายการ</button>
          <button class="chip" data-action="UPDATE_ENTITY">✏️ แก้ไขรายการ</button>
          <button class="chip" data-action="DELETE_ENTITY">🗑️ ลบรายการ</button>
        </div>
      </div>

      <div class="admin-content-area" id="admin-content-area">
        <div class="loading-spinner">กำลังดึงข้อมูล...</div>
      </div>
    </main>
  `;

  container.appendChild(page);

  page.querySelector("#admin-logo-btn")?.addEventListener("click", onBackToHome);
  page.querySelector("#admin-back-btn")?.addEventListener("click", onBackToHome);

  let activeTab: "logs" | "users" = "logs";
  let currentSearch = "";
  let actionFilter = "all";

  const tabLogs = page.querySelector<HTMLButtonElement>("#tab-logs")!;
  const tabUsers = page.querySelector<HTMLButtonElement>("#tab-users")!;
  const searchInput = page.querySelector<HTMLInputElement>("#admin-search-input")!;
  const actionChips = page.querySelector<HTMLElement>("#action-chips")!;
  const contentArea = page.querySelector<HTMLElement>("#admin-content-area")!;

  const renderLogs = async () => {
    contentArea.innerHTML = `<div class="loading-spinner">กำลังโหลดประวัติการทำงาน...</div>`;
    const logs = await getAdminLogs(currentSearch);
    
    const filtered = actionFilter === "all"
      ? logs
      : logs.filter((l) => l.action === actionFilter);

    if (filtered.length === 0) {
      contentArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
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
              <th>ผู้ป้อน/ผู้แก้ไข</th>
              <th>Action</th>
              <th>ชื่อรายการ</th>
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
                  ${log.entity_id ? `<button class="admin-del-btn" data-entity-id="${log.entity_id}" data-name="${esc(log.entity_name || "")}">🗑️ ลบรายการ</button>` : "-"}
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
          if (res.success) {
            renderLogs();
          } else {
            alert(res.message || "ลบรายการไม่สำเร็จ");
          }
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
          if (res.success) {
            renderUsers();
          } else {
            alert(res.message || "ไม่สามารถเปลี่ยนสิทธิ์ได้");
          }
        }
      });
    });
  };

  const updateView = () => {
    if (activeTab === "logs") {
      actionChips.style.display = "flex";
      renderLogs();
    } else {
      actionChips.style.display = "none";
      renderUsers();
    }
  };

  tabLogs.addEventListener("click", () => {
    activeTab = "logs";
    tabLogs.classList.add("active");
    tabUsers.classList.remove("active");
    updateView();
  });

  tabUsers.addEventListener("click", () => {
    activeTab = "users";
    tabUsers.classList.add("active");
    tabLogs.classList.remove("active");
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
