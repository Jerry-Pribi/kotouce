import type {
  Wheel,
  WheelDetail,
  WheelCreatePayload,
  WheelStatus,
  Manufacturer,
  Profile,
  Location,
  DashboardSummary,
  UsageRecord,
  RepairSummary,
  RepairWheel,
} from "./types";

const TOKEN_KEY = "kotouc_access_token";
let accessToken = localStorage.getItem(TOKEN_KEY);

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken() {
  return accessToken;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/auth/login") {
      window.dispatchEvent(new Event("auth:expired"));
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Chyba požadavku");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string, portal: Portal = "agc") =>
    request<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, portal }) }),
  me: () => request<AppUser>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  adminUsers: () => request<AdminUser[]>("/api/admin/users"),
  createAdminUser: (data: { username: string; password: string; role: "user" | "admin" }) =>
    request<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  deleteAdminUser: (id: number) => request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  resetAdminUserPassword: (id: number, password: string) => request<void>(`/api/admin/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),
  renameAdminUser: (id: number, username: string) => request<AdminUser>(`/api/admin/users/${id}/username`, { method: "PUT", body: JSON.stringify({ username }) }),
  adminSessions: () => request<AdminSession[]>("/api/admin/sessions"),
  adminUserDeletionAudits: () => request<UserDeletionAudit[]>("/api/admin/audits/user-deletions"),
  /** Firmy reprofilace: AGC jen založí první účet firmy, dál si firma účty spravuje sama. */
  repairCompanies: () => request<RepairCompany[]>("/api/admin/repair-companies"),
  /** Nová firma jedním krokem: místo reprofilace + její první účet (megaAdmin firmy). */
  createRepairCompany: (name: string, username: string, password: string) =>
    request<RepairCompany>("/api/admin/repair-companies", { method: "POST", body: JSON.stringify({ name, username, password }) }),
  createCompanyFirstAdmin: (locationId: number, username: string, password: string) =>
    request<RepairCompany>(`/api/admin/repair-companies/${locationId}/first-admin`, { method: "POST", body: JSON.stringify({ username, password }) }),
  adminWheelCreationAudits: () => request<WheelCreationAudit[]>("/api/admin/audits/wheel-creations"),
  dashboard: () => request<DashboardSummary>("/api/dashboard"),

  manufacturers: () => request<Manufacturer[]>("/api/manufacturers"),
  createManufacturer: (name: string) =>
    request<Manufacturer>("/api/manufacturers", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  profiles: () => request<Profile[]>("/api/profiles"),
  createProfile: (code: string) =>
    request<Profile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  locations: () => request<Location[]>("/api/locations"),
  createLocation: (name: string, type: string) =>
    request<Location>("/api/locations", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  wheels: (params?: Record<string, string | number | undefined>) => {
    const query = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
          .join("&")
      : "";
    return request<Wheel[]>(`/api/wheels${query}`);
  },
  wheel: (id: number) => request<WheelDetail>(`/api/wheels/${id}`),
  createWheel: (data: WheelCreatePayload) =>
    request<Wheel>("/api/wheels", { method: "POST", body: JSON.stringify(data) }),
  updateWheel: (
    id: number,
    data: Partial<{
      status: WheelStatus;
      location_id: number | null;
      max_lifetime_m: number | null;
      retired_date: string | null;
      note: string | null;
      returned_from_location_id: number | null;
      taken_by_name: string | null;
    }>
  ) => request<Wheel>(`/api/wheels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWheel: (id: number) => request<void>(`/api/wheels/${id}`, { method: "DELETE" }),

  addUsage: (
    wheelId: number,
    data: { record_date: string; meters_ground: number; operator?: string; note?: string }
  ) =>
    request<UsageRecord>(`/api/wheels/${wheelId}/usage`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Část Reprofilace (firma, která kotouče přebrušuje) — vidí jen své kotouče. */
  repair: {
    summary: () => request<RepairSummary>("/api/repair/summary"),
    wheels: (scope: "aktivni" | "historie", search?: string) =>
      request<RepairWheel[]>(`/api/repair/wheels?scope=${scope}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    wheel: (id: number) => request<RepairWheel>(`/api/repair/wheels/${id}`),
    accept: (id: number) => request<RepairWheel>(`/api/repair/wheels/${id}/prevzato`, { method: "POST" }),
    done: (id: number, data: { note?: string | null; cost?: number | null }) =>
      request<RepairWheel>(`/api/repair/wheels/${id}/hotovo`, { method: "POST", body: JSON.stringify(data) }),
    failed: (id: number, reason: string) =>
      request<RepairWheel>(`/api/repair/wheels/${id}/nelze`, { method: "POST", body: JSON.stringify({ reason }) }),
    /** Stáhne Excel: kolikrát byl kotouč na reprofilaci, u jakých firem, ceny. */
    exportExcel: () => download("/api/repair/export.xlsx"),
    /** Administrace firmy — stejná jako v AGC, ale jen účty této firmy. */
    admin: {
      users: () => request<AdminUser[]>("/api/repair/admin/users"),
      createUser: (data: { username: string; password: string; role: "user" | "admin" }) =>
        request<AdminUser>("/api/repair/admin/users", { method: "POST", body: JSON.stringify(data) }),
      deleteUser: (id: number) => request<void>(`/api/repair/admin/users/${id}`, { method: "DELETE" }),
      resetPassword: (id: number, password: string) =>
        request<void>(`/api/repair/admin/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),
      rename: (id: number, username: string) =>
        request<AdminUser>(`/api/repair/admin/users/${id}/username`, { method: "PUT", body: JSON.stringify({ username }) }),
      sessions: () => request<AdminSession[]>("/api/repair/admin/sessions"),
      deletions: () => request<UserDeletionAudit[]>("/api/repair/admin/audits/user-deletions"),
    },
  },
};

/** Stažení souboru s přihlašovacím tokenem (odkaz <a> neumí poslat hlavičku). */
async function download(path: string) {
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error("Soubor se nepodařilo stáhnout");
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "export.xlsx";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface RepairCompany {
  id: number;
  name: string;
  accounts: number;
}

/** Sekce na přihlašovací stránce. */
export type Portal = "agc" | "reprofilace";
export type UserRole = "user" | "admin" | "mega_admin" | "reprofilace";

export interface AppUser {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  /** firma účtu: null = AGC, jinak firma reprofilace (její místo reprofilace) */
  location?: Location | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AppUser;
}

export interface AdminUser extends AppUser {}

export interface AdminSession {
  id: number;
  username: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ended_at: string | null;
  is_active: boolean;
}

export interface UserDeletionAudit {
  id: number;
  actor_username: string;
  deleted_username: string;
  deleted_role: UserRole;
  deleted_at: string;
}

export interface WheelCreationAudit {
  id: number;
  wheel_id: number | null;
  wheel_serial_number: string;
  manufacturer_name: string;
  diameter: number;
  profile_code: string;
  initial_status: WheelStatus;
  initial_location_name: string | null;
  created_by_username: string;
  created_at: string;
}
