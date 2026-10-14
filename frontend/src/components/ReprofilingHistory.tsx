import { REPROFILING_LABELS } from "../types";
import type { WheelDetail } from "../types";

const formatTime = (value: string | null) => {
  if (!value) return "—";
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(iso).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
};
const formatCzk = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);

/** Karta kotouče v AGC: co hlásí firma reprofilace a kolikrát už kotouč reprofilací prošel. */
export function ReprofilingHistory({ wheel }: { wheel: WheelDetail }) {
  if (wheel.reprofilings.length === 0 && wheel.status !== "na_reprofilaci") return null;
  const state = wheel.reprofiling_state;
  const current = wheel.reprofilings.find((r) => !r.returned_at);

  return (
    <div className="card reprofiling-card">
      <div className="card-header">
        <div>
          <div className="card-title">Reprofilace <span className="count-chip">{wheel.reprofilings.filter((r) => r.result === "hotovo").length}×</span></div>
          <div className="card-subtitle">Kdy kotouč odešel na reprofilaci, co hlásí firma a kdy se vrátil.</div>
        </div>
      </div>

      {wheel.status === "na_reprofilaci" && (
        <div className={`reprofiling-state reprofiling-state-${state ?? "ceka"}`}>
          <strong>{REPROFILING_LABELS[state ?? "ceka"]}</strong>
          {current?.location_name ? ` · ${current.location_name}` : " · místo reprofilace zatím nevybrané"}
          {state === "hotovo" && " — po dodání změňte stav kotouče na Sklad."}
          {state === "nelze" && ` — ${current?.note ?? "firma kotouč nedokáže reprofilovat"}. Rozhodněte o vyřazení.`}
        </div>
      )}

      {wheel.reprofilings.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr><th>Odesláno</th><th>Firma / místo</th><th>Převzato firmou</th><th>Dokončeno</th><th>Výsledek</th><th>Cena</th><th>Poznámka</th><th>Vráceno</th></tr>
            </thead>
            <tbody>
              {wheel.reprofilings.map((r) => (
                <tr key={r.id}>
                  <td>{formatTime(r.sent_at)}<div className="muted-small">{r.sent_by_username}</div></td>
                  <td>{r.location_name ?? "—"}</td>
                  <td>{formatTime(r.accepted_at)}</td>
                  <td>{formatTime(r.finished_at)}</td>
                  <td>{r.result === "hotovo" ? "Hotovo" : r.result === "nelze" ? "Nelze" : "Rozpracováno"}</td>
                  <td>{formatCzk(r.cost)}</td>
                  <td>{r.note ?? "—"}</td>
                  <td>{formatTime(r.returned_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
