import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { RepairWheel } from "../types";
import { formatCzk, formatTime } from "./repairUi";

/** Kotouče, které firma už reprofilovala a AGC si je odvezlo. */
export function RepairHistory() {
  const navigate = useNavigate();
  const [wheels, setWheels] = useState<RepairWheel[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.repair.wheels("historie", search || undefined)
        .then((w) => { setWheels(w); setError(null); })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

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

  return (
    <div>
      <div className="rp-head">
        <div>
          <h1>Historie</h1>
          <p>Kotouče, které jste reprofilovali a AGC je převzalo zpátky. Kliknutím otevřete kartu kotouče.</p>
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

      <div className="rp-panel">
        {!wheels ? <div className="rp-empty">Načítám…</div> : wheels.length === 0 ? (
          <div className="rp-empty">{search ? "Nic neodpovídá hledání." : "Zatím žádné dokončené reprofilace."}</div>
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Číslo kotouče</th><th>Výrobce</th><th>Ø / profil</th>
                  <th className="num">Reprofilováno u vás</th><th>Naposledy hotovo</th><th className="num">Cena celkem</th>
                </tr>
              </thead>
              <tbody>
                {wheels.map((w) => {
                  const done = w.reprofilings.filter((r) => r.result === "hotovo");
                  const last = done.map((r) => r.finished_at).filter(Boolean).sort().at(-1) ?? null;
                  const cost = done.reduce((sum, r) => sum + (r.cost ?? 0), 0);
                  return (
                    <tr key={w.id} className="click" onClick={() => navigate(`/kotouc/${w.id}`)}>
                      <td className="mono">{w.serial_number}</td>
                      <td>{w.manufacturer}</td>
                      <td>Ø {w.diameter} mm · {w.profile}</td>
                      <td className="num">{w.reprofilings_here}×</td>
                      <td>{formatTime(last)}</td>
                      <td className="num">{done.some((r) => r.cost != null) ? formatCzk(cost) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
