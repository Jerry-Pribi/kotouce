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
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Chyba požadavku");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
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
};
