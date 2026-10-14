import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { RepairWheel } from "../types";
import { currentJob, formatCzk, formatTime, JobActions, stateClass, stateLabel } from "./repairUi";

const RESULT = { hotovo: "Hotovo", nelze: "Nelze reprofilovat" } as Record<string, string>;

/** Karta kotouče pro firmu: průběh zakázky, údaje a historie reprofilací u této firmy. */
export function RepairWheelPage({ onChanged }: { onChanged: () => void }) {
  const { id } = useParams();
  const [wheel, setWheel] = useState<RepairWheel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.repair.wheel(Number(id)).then(setWheel).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <div className="rp-panel rp-empty">{error} · <Link to="/">Zpět na zakázky</Link></div>;
  if (!wheel) return <div className="rp-empty">Načítám kotouč…</div>;

  const job = currentJob(wheel);
  const failed = job?.result === "nelze";
  // Průběh aktuální zakázky (u vráceného kotouče poslední reprofilace)
  const shown = job ?? wheel.reprofilings[0] ?? null;
  const steps = [
    { label: "Odesláno z AGC", time: shown?.sent_at ?? null },
    { label: "Převzato", time: shown?.accepted_at ?? null },
    { label: failed ? "Nelze reprofilovat" : "Hotovo", time: shown?.finished_at ?? null, fail: failed },
    { label: "Vráceno do AGC", time: shown?.returned_at ?? null },
  ];
  const nowIndex = steps.findIndex((s) => !s.time);
  const doneCost = wheel.reprofilings.filter((r) => r.result === "hotovo").reduce((sum, r) => sum + (r.cost ?? 0), 0);

  return (
    <div>
      <Link to={wheel.at_us ? "/" : "/historie"} className="rp-back">← {wheel.at_us ? "Zakázky" : "Historie"}</Link>

      <section className="rp-hero">
        <div>
          <span className={`rp-status ${stateClass(wheel.state)}`}>{stateLabel(wheel.state)}</span>
          <div className="rp-hero-serial" style={{ marginTop: 10 }}>{wheel.serial_number}</div>
          <div className="rp-chips rp-hero-spec">
            <span className="rp-chip"><b>{wheel.manufacturer}</b></span>
            <span className="rp-chip">Ø <b>{wheel.diameter}</b> mm</span>
            <span className="rp-chip">profil <b>{wheel.profile}</b></span>
          </div>
        </div>
        {wheel.at_us && (
          <div className="rp-hero-action">
            <JobActions wheel={wheel} onChanged={(w) => { setWheel(w); onChanged(); }} />
          </div>
        )}
      </section>

      {shown && (
        <ol className="rp-steps" aria-label="Průběh zakázky">
          {steps.map((s, i) => (
            <li key={s.label} className={`rp-step${s.time ? (s.fail ? " fail" : " done") : ""}${i === nowIndex && wheel.at_us ? " now" : ""}`}>
              <div className="rp-step-label"><i>{s.time ? (s.fail ? "✕" : "✓") : i + 1}</i>{s.label}</div>
              <div className="rp-step-time">{s.time ? formatTime(s.time) : i === nowIndex && wheel.at_us ? "teď na řadě" : "—"}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="rp-facts">
        <div className="rp-fact"><span>Reprofilováno u vás</span><b>{wheel.reprofilings_here}×</b></div>
        <div className="rp-fact"><span>Cena u vás celkem</span><b>{formatCzk(doneCost)}</b></div>
        <div className="rp-fact"><span>Nabroušeno celkem</span><b>{Math.round(wheel.total_meters_ground)} m</b></div>
        <div className="rp-fact"><span>Teď</span><b>{wheel.at_us ? "u vás" : "v AGC"}</b></div>
      </div>

      <section className="rp-panel">
        <h2>Reprofilace u vás</h2>
        <p>Každá cesta kotouče k vám, s cenou a poznámkou.</p>
        {wheel.reprofilings.length === 0 ? <div className="rp-empty">Zatím žádný záznam.</div> : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr><th>Odesláno</th><th>Převzato</th><th>Dokončeno</th><th>Výsledek</th><th className="num">Cena</th><th>Poznámka</th><th>Vráceno do AGC</th></tr>
              </thead>
              <tbody>
                {wheel.reprofilings.map((r) => (
                  <tr key={r.id}>
                    <td>{formatTime(r.sent_at)}</td>
                    <td>{formatTime(r.accepted_at)}</td>
                    <td>{formatTime(r.finished_at)}</td>
                    <td>{r.result ? RESULT[r.result] : <span className="rp-muted">rozpracováno</span>}</td>
                    <td className="num">{formatCzk(r.cost)}</td>
                    <td>{r.note ?? "—"}</td>
                    <td>{formatTime(r.returned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
