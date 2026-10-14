import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { RepairSummary, RepairWheel, ReprofilingState } from "../types";
import { currentJob, daysLabel, daysSince, formatCzk, JobActions } from "./repairUi";

const COLUMNS: { state: ReprofilingState; title: string; cls: string; empty: string }[] = [
  { state: "ceka", title: "Ke převzetí", cls: "rp-col-wait", empty: "AGC zatím nic neposlalo." },
  { state: "prevzato", title: "V práci", cls: "rp-col-work", empty: "Žádný kotouč se teď nebrousí." },
  { state: "hotovo", title: "Hotovo – k odvozu", cls: "rp-col-done", empty: "Nic nečeká na odvoz." },
];
const LATE_DAYS = 14;

/** Zakázky jako nástěnka: Ke převzetí → V práci → Hotovo. Na každé kartě jedno velké tlačítko na další krok. */
export function RepairBoard({ summary, onChanged }: { summary: RepairSummary | null; onChanged: () => void }) {
  const [wheels, setWheels] = useState<RepairWheel[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.repair.wheels("aktivni", search || undefined)
        .then((w) => { setWheels(w); setError(null); })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  function changed(updated: RepairWheel) {
    setWheels((list) => list?.map((w) => (w.id === updated.id ? updated : w)) ?? null);
    onChanged();
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await api.repair.exportExcel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const failed = wheels?.filter((w) => w.state === "nelze") ?? [];
  const total = summary ? summary.waiting + summary.in_progress + summary.done : 0;

  return (
    <div>
      <div className="rp-head">
        <div>
          <h1>Zakázky</h1>
          <p>
            {summary ? `U vás je ${total} ${total === 1 ? "kotouč" : total >= 2 && total <= 4 ? "kotouče" : "kotoučů"} od AGC. ` : ""}
            Když kotouč dorazí, převezměte ho. Po přebroušení klikněte „Reprofilace hotová“.
          </p>
        </div>
        <div className="rp-head-actions">
          <button className="rp-btn rp-btn-excel" onClick={() => void exportExcel()} disabled={exporting}>
            ⬇ {exporting ? "Připravuji…" : "Stáhnout Excel"}
          </button>
        </div>
      </div>

      <div className="rp-search">
        <input type="search" aria-label="Hledat kotouč" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat číslo kotouče nebo výrobce" />
      </div>

      {error && <div className="rp-error">{error}</div>}
      {!wheels ? (
        <div className="rp-empty">Načítám zakázky…</div>
      ) : (
        <>
          <div className="rp-board">
            {COLUMNS.map((col) => {
              const items = wheels.filter((w) => w.state === col.state);
              return (
                <section key={col.state} className={`rp-col ${col.cls}`} aria-label={col.title}>
                  <div className="rp-col-head">
                    <span className="rp-col-dot" aria-hidden="true" />
                    <span className="rp-col-title">{col.title}</span>
                    <span className="rp-col-count">{items.length}</span>
                  </div>
                  {items.length === 0 && <div className="rp-col-empty">{search ? "Nic neodpovídá hledání." : col.empty}</div>}
                  {items.map((w) => <JobCard key={w.id} wheel={w} onChanged={changed} />)}
                </section>
              );
            })}
          </div>

          {failed.length > 0 && (
            <section className="rp-failed">
              <h2>Nelze reprofilovat ({failed.length}) — čeká na rozhodnutí AGC</h2>
              <div className="rp-failed-list">
                {failed.map((w) => <JobCard key={w.id} wheel={w} onChanged={changed} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function JobCard({ wheel, onChanged }: { wheel: RepairWheel; onChanged: (w: RepairWheel) => void }) {
  const job = currentJob(wheel);
  const days = daysSince(wheel.sent_at);
  const late = days !== null && days > LATE_DAYS && wheel.state !== "hotovo";
  const colors: Record<string, string> = { ceka: "var(--rp-amber)", prevzato: "var(--rp-blue)", hotovo: "var(--rp-green)", nelze: "var(--rp-red)" };

  return (
    <article className="rp-job" style={{ ["--c" as string]: colors[wheel.state ?? ""] }}>
      <div className="rp-job-top">
        <Link to={`/kotouc/${wheel.id}`} className="rp-job-serial">{wheel.serial_number}</Link>
        {days !== null && <span className={`rp-job-days${late ? " late" : ""}`}>u vás {daysLabel(days)}</span>}
      </div>
      <div className="rp-chips">
        <span className="rp-chip"><b>{wheel.manufacturer}</b></span>
        <span className="rp-chip">Ø <b>{wheel.diameter}</b> mm</span>
        <span className="rp-chip">profil <b>{wheel.profile}</b></span>
        {wheel.reprofilings_here > 0 && <span className="rp-chip">u vás už <b>{wheel.reprofilings_here}×</b></span>}
      </div>
      {wheel.state === "hotovo" && job && (
        <div className="rp-job-note">{job.cost != null ? formatCzk(job.cost) : "Cena zatím nezadaná"}{job.note ? ` · ${job.note}` : ""}</div>
      )}
      {wheel.state === "nelze" && job?.note && <div className="rp-job-note">{job.note}</div>}
      <JobActions wheel={wheel} onChanged={onChanged} />
    </article>
  );
}
