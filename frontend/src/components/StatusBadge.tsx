import type { WheelStatus } from "../types";
import { STATUS_LABELS } from "../types";

const ICONS: Record<WheelStatus, string> = {
  sklad: "⚪",
  v_provozu: "🟢",
  na_reprofilaci: "🟠",
  vyrazen: "🔴",
};

export function StatusBadge({ status }: { status: WheelStatus }) {
  const cls =
    status === "v_provozu"
      ? "st-provoz"
      : status === "na_reprofilaci"
      ? "st-reprofilace"
      : status === "vyrazen"
      ? "st-vyrazen"
      : "st-sklad";

  return (
    <span className={`badge-status ${cls}`}>
      <span>{ICONS[status]}</span>
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}
