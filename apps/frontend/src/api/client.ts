import type { SearchResult, VoteResult, TrendingQuery, AuthResponse, RegisterPayload, LoginPayload, UserProfile, AddEntityPayload, UpdateEntityPayload, ActivityLog, Entity } from "@top5/shared";

const BASE_URL = import.meta.env.DEV ? "" : "https://top5-worker.jimwar02.workers.dev";
const TOKEN_KEY = "top5_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function search(
  query: string,
  coords?: { lat: number; lng: number }
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query });
  if (coords) {
    params.set("lat", String(coords.lat));
    params.set("lng", String(coords.lng));
  }
  const res = await fetch(`${BASE_URL}/api/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function vote(
  entityId: string,
  query: string
): Promise<VoteResult & { top5?: unknown[]; challenger_pool?: unknown[] }> {
  const res = await fetch(`${BASE_URL}/api/vote`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ entity_id: entityId, query }),
  });
  if (!res.ok) throw new Error(`Vote failed: ${res.status}`);
  return res.json();
}

export async function getTrending(): Promise<TrendingQuery[]> {
  const res = await fetch(`${BASE_URL}/api/trending`);
  if (!res.ok) return [];
  const data = await res.json() as { trending: TrendingQuery[] };
  return data.trending ?? [];
}

// ─────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as AuthResponse;
  if (data.success && data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as AuthResponse;
  if (data.success && data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export async function getMe(): Promise<UserProfile | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      setStoredToken(null);
      return null;
    }
    const data = (await res.json()) as { success: boolean; user?: UserProfile };
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch { /* ignore */ }
  }
  setStoredToken(null);
}

export async function addCustomEntity(payload: AddEntityPayload): Promise<{
  success: boolean;
  message?: string;
  top5?: unknown[];
  challenger_pool?: unknown[];
}> {
  const res = await fetch(`${BASE_URL}/api/entities/add`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getUserEntities(): Promise<Entity[]> {
  const res = await fetch(`${BASE_URL}/api/user/entities`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { success: boolean; entities?: Entity[] };
  return data.entities ?? [];
}

export async function updateCustomEntity(payload: UpdateEntityPayload): Promise<{
  success: boolean;
  message?: string;
}> {
  const res = await fetch(`${BASE_URL}/api/entities/update`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getAdminLogs(search?: string): Promise<ActivityLog[]> {
  const params = search ? `?q=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${BASE_URL}/api/admin/logs${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { success: boolean; logs?: ActivityLog[] };
  return data.logs ?? [];
}

export async function getAdminUsers(search?: string): Promise<UserProfile[]> {
  const params = search ? `?q=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${BASE_URL}/api/admin/users${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { success: boolean; users?: UserProfile[] };
  return data.users ?? [];
}

export async function updateUserRoleAdmin(
  target_user_id: string,
  role: "user" | "admin"
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/admin/users/role`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ target_user_id, role }),
  });
  return res.json();
}

export async function deleteEntityAdmin(entity_id: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/admin/entities`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    body: JSON.stringify({ entity_id }),
  });
  return res.json();
}



export function subscribeSSE(
  query: string,
  onEvent: (data: unknown) => void
): EventSource {
  const es = new EventSource(`${BASE_URL}/api/sse?q=${encodeURIComponent(query)}`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type !== "heartbeat") onEvent(data);
    } catch { /* ignore */ }
  };
  es.onerror = () => {
    // Graceful silent reconnection on stream cycle
  };
  return es;
}

