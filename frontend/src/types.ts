export type WheelStatus = "sklad" | "v_provozu" | "na_reprofilaci" | "vyrazen";

export const STATUS_LABELS: Record<WheelStatus, string> = {
  sklad: "Sklad",
  v_provozu: "V provozu",
  na_reprofilaci: "Na reprofilaci",
  vyrazen: "Vyřazen",
};

export type LocationType = "sklad" | "linka" | "reprofilace";

export interface Manufacturer {
  id: number;
  name: string;
}

export interface Profile {
  id: number;
  code: string;
}

export interface Location {
  id: number;
  name: string;
  type: LocationType;
}

export interface UsageRecord {
  id: number;
  wheel_id: number;
  record_date: string;
  meters_ground: number;
  operator?: string | null;
  note?: string | null;
  created_at: string;
}

export interface Wheel {
  id: number;
  serial_number: string;
  manufacturer: Manufacturer;
  diameter: number;
  profile: Profile;
  status: WheelStatus;
  location: Location | null;
  max_lifetime_m: number | null;
  received_date: string | null;
  retired_date: string | null;
  note: string | null;
  total_meters_ground: number;
}

export interface WheelDetail extends Wheel {
  usage_records: UsageRecord[];
}

export interface DashboardCell {
  manufacturer: string;
  diameter: number;
  profile: string;
  count: number;
}

export interface DashboardSummary {
  total_wheels: number;
  by_status: Record<string, number>;
  matrix: DashboardCell[];
  wheels_near_end_of_life: number;
}

export interface WheelCreatePayload {
  serial_number: string;
  manufacturer: string;
  diameter: number;
  profile: string;
  status: WheelStatus;
  location_id?: number | null;
  max_lifetime_m?: number | null;
  received_date?: string | null;
  note?: string | null;
}
