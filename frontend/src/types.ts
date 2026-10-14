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
  current_taken_by_name?: string | null;
  current_taken_by_username?: string | null;
  current_line_name?: string | null;
  current_taken_at?: string | null;
  /** kolikrát byl kotouč na reprofilaci */
  reprofiling_count: number;
  /** průběh reprofilace, jen když je kotouč na reprofilaci */
  reprofiling_state?: ReprofilingState | null;
}

/** ceka = odesláno, firma ještě nepotvrdila · prevzato · hotovo · nelze */
export type ReprofilingState = "ceka" | "prevzato" | "hotovo" | "nelze";

export const REPROFILING_LABELS: Record<ReprofilingState, string> = {
  ceka: "Čeká na převzetí firmou",
  prevzato: "Firma reprofiluje",
  hotovo: "Hotovo – k odvozu",
  nelze: "Nelze reprofilovat",
};

/** Jedna cesta kotouče na reprofilaci. */
export interface WheelReprofiling {
  id: number;
  wheel_id: number;
  location_id: number | null;
  location_name: string | null;
  sent_at: string;
  sent_by_username: string;
  meters_before: number;
  accepted_at: string | null;
  accepted_by_username: string | null;
  finished_at: string | null;
  finished_by_username: string | null;
  result: "hotovo" | "nelze" | null;
  note: string | null;
  cost: number | null;
  returned_at: string | null;
  returned_by_username: string | null;
}

/** Kotouč, jak ho vidí firma reprofilace. */
export interface RepairWheel {
  id: number;
  serial_number: string;
  manufacturer: string;
  diameter: number;
  profile: string;
  status: WheelStatus;
  at_us: boolean;
  state: ReprofilingState | null;
  sent_at: string | null;
  total_meters_ground: number;
  reprofilings_here: number;
  reprofilings: WheelReprofiling[];
}

export interface RepairSummary {
  location: string | null;
  waiting: number;
  in_progress: number;
  done: number;
  failed: number;
}

export interface WheelDetail extends Wheel {
  usage_records: UsageRecord[];
  return_records: WheelReturn[];
  cycles: WheelCycle[];
  reprofilings: WheelReprofiling[];
}

export interface WheelReturn {
  id: number;
  wheel_id: number;
  used_on_location_id: number | null;
  used_on_location_name: string;
  returned_to_location_name: string;
  returned_by_username: string;
  returned_at: string;
}

export interface WheelCycle {
  id: number;
  wheel_id: number;
  taken_by_name: string;
  taken_by_username: string;
  taken_from_location_id: number | null;
  taken_from_location_name: string | null;
  used_on_location_id: number | null;
  used_on_location_name: string;
  taken_at: string;
  returned_to_location_id: number | null;
  returned_to_location_name: string | null;
  returned_by_username: string | null;
  returned_at: string | null;
  meters_ground: number;
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
  taken_by_name?: string;
}
