import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api";
import type { WheelDetail, WheelStatus, Location } from "../types";
import { STATUS_LABELS } from "../types";
import { StatusBadge } from "../components/StatusBadge";

export function WheelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wheel, setWheel] = useState<WheelDetail | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [meters, setMeters] = useState("");
  const [operator, setOperator] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!id) return;
    const [w, l] = await Promise.all([api.wheel(Number(id)), api.locations()]);
    setWheel(w);
    setLocations(l);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px" }}>
        <p style={{ color: "var(--st-vyrazen-color)" }}>Chyba při načítání karty kotouče: {error}</p>
        <Link to="/kotouce" className="btn btn-secondary">Zpět na seznam kotoučů</Link>
      </div>
    );
  }

  if (!wheel) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>
        Načítám kartu kotouče…
      </div>
    );
  }

  const totalMeters = wheel.total_meters_ground ?? 0;
  const maxMeters = wheel.max_lifetime_m;
  const remainingMeters = maxMeters ? Math.max(0, maxMeters - totalMeters) : null;
  const lifePct = maxMeters ? Math.min(100, (totalMeters / maxMeters) * 100) : null;
  const lifeClass = lifePct === null ? "" : lifePct >= 100 ? "danger" : lifePct >= 85 ? "warn" : "";

  async function updateStatus(newStatus: WheelStatus) {
    if (!wheel) return;
    const updated = await api.updateWheel(wheel.id, {
      status: newStatus,
      retired_date: newStatus === "vyrazen" ? new Date().toISOString().slice(0, 10) : undefined,
    });
    setWheel({ ...wheel, ...updated });
  }

  async function updateLocation(locationId: string) {
    if (!wheel) return;
    const updated = await api.updateWheel(wheel.id, {
      location_id: locationId ? Number(locationId) : null,
    });
    setWheel({ ...wheel, ...updated });
  }

  async function submitUsage(e: React.FormEvent) {
    e.preventDefault();
    if (!wheel || !meters) return;
    setSubmitting(true);
    try {
      await api.addUsage(wheel.id, {
        record_date: recordDate,
        meters_ground: Number(meters),
        operator: operator.trim() || undefined,
      });
      setMeters("");
      setOperator("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!wheel) return;
    if (!confirm(`Opravdu chcete vyřadit a smazat kotouč číslo ${wheel.serial_number} z evidence?`)) return;
    await api.deleteWheel(wheel.id);
    navigate("/kotouce");
  }

  return (
    <div>
      {/* ODKAZ ZPĚT */}
      <div style={{ marginBottom: 12 }}>
        <Link to="/kotouce" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "12.5px", fontWeight: 600 }}>
          ← Zpět na seznam kotoučů
        </Link>
      </div>

      {/* HLAVIČKA KARTY KOTOUČE */}
      <div className="card-sheet" style={{ marginBottom: 20 }}>
        <div className="sheet-header">
          <div className="sheet-identity">
            <div>
              <span className="serial-tag" style={{ fontSize: "18px", padding: "4px 10px" }}>
                {wheel.serial_number}
              </span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)" }}>
                {wheel.manufacturer.name}
              </div>
              <div className="sheet-spec">
                Průměr: <strong>Ø {wheel.diameter} mm</strong> · Geometrie profilu: <strong>{wheel.profile.code}</strong>
                {wheel.received_date && <span> · Zavedeno: {wheel.received_date}</span>}
              </div>
            </div>
          </div>

          <div className="sheet-actions">
            <StatusBadge status={wheel.status} />
            <button className="btn btn-danger" onClick={handleDelete} title="Odstranit záznam kotouče">
              Smazat z evidence
            </button>
          </div>
        </div>

        {/* PARAMETRY A STAV */}
        <div className="sheet-grid">
          {/* LEVÝ SLOUPEC: UMÍSTĚNÍ A ZMĚNA STAVU */}
          <div className="info-block">
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: "13.5px", color: "var(--text-main)" }}>
              Aktuální oběh a stanoviště
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                Fáze životního cyklu
              </label>
              <select
                value={wheel.status}
                onChange={(e) => updateStatus(e.target.value as WheelStatus)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border-medium)" }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                Přiřazené stanoviště v závodě
              </label>
              <select
                value={wheel.location?.id ?? ""}
                onChange={(e) => updateLocation(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border-medium)" }}
              >
                <option value="">— Bez přiřazeného stanoviště —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {wheel.note && (
              <div style={{ background: "#fff", padding: "10px", borderRadius: 4, border: "1px solid var(--border-light)", fontSize: "12.5px" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Poznámka: </span>
                {wheel.note}
              </div>
            )}
          </div>

          {/* PRAVÝ SLOUPEC: OPOTŘEBENÍ DIAMANTU */}
          <div className="info-block">
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: "13.5px", color: "var(--text-main)" }}>
              Opotřebení diamantové vrstvy
            </div>

            <div className="info-row">
              <span className="info-label">Celkem nabroušeno</span>
              <span className="info-val" style={{ fontFamily: "var(--font-mono)", fontSize: "15px" }}>
                {Math.round(totalMeters).toLocaleString("cs-CZ")} m
              </span>
            </div>

            {maxMeters ? (
              <>
                <div className="info-row">
                  <span className="info-label">Limit životnosti kotouče</span>
                  <span className="info-val" style={{ fontFamily: "var(--font-mono)" }}>
                    {Math.round(maxMeters).toLocaleString("cs-CZ")} m
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Zbývající kapacita</span>
                  <span className="info-val" style={{ fontFamily: "var(--font-mono)", color: lifePct && lifePct >= 85 ? "var(--st-vyrazen-color)" : "inherit" }}>
                    {remainingMeters !== null ? Math.round(remainingMeters).toLocaleString("cs-CZ") : "—"} m
                  </span>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="progress-track" style={{ height: 10, borderRadius: 5 }}>
                    <div className={`progress-fill ${lifeClass}`} style={{ width: `${lifePct}%` }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                    <span>0 m</span>
                    <span style={{ fontWeight: 700, color: lifePct && lifePct >= 85 ? "var(--st-vyrazen-color)" : "inherit" }}>
                      Vyčerpáno {Math.round(lifePct ?? 0)} %
                    </span>
                    <span>{Math.round(maxMeters)} m</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: 10 }}>
                Kotouč nemá stanoven pevný limit životnosti.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FORMULÁŘ PRO ZÁPIS SMĚNY (DÍLENSKÁ PRŮVODKA) */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Zápis broušení na směně</div>
            <div className="card-subtitle">
              Digitální náhrada papírového lístku — záznam odvedené práce operátora
            </div>
          </div>
        </div>

        <form onSubmit={submitUsage}>
          <div className="usage-form-grid">
            <div className="filter-field">
              <label htmlFor="r-date">Datum směny</label>
              <input
                id="r-date"
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                required
              />
            </div>

            <div className="filter-field">
              <label htmlFor="r-meters">Nabroušené metry (m)</label>
              <input
                id="r-meters"
                type="number"
                step="0.1"
                min="0.1"
                value={meters}
                onChange={(e) => setMeters(e.target.value)}
                placeholder="např. 48.5"
                required
              />
            </div>

            <div className="filter-field">
              <label htmlFor="r-operator">Brusič / Operátor</label>
              <input
                id="r-operator"
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="příjmení nebo číslo směny"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Ukládám…" : "+ Zapsat směnu"}
            </button>
          </div>
        </form>
      </div>

      {/* HISTORIE BROUŠENÍ (PROVOZNÍ DENÍK) */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "14px" }}>Provozní deník broušení</div>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Celkem {wheel.usage_records.length} {wheel.usage_records.length === 1 ? "záznam" : wheel.usage_records.length < 5 ? "záznamy" : "záznamů"}
          </span>
        </div>

        {wheel.usage_records.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            Zatím nebyl zapsán žádný provozní záznam o broušení pro tento kotouč.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Datum směny</th>
                <th>Nabroušeno</th>
                <th>Operátor směny</th>
                <th style={{ width: 180, textAlign: "right" }}>Čas zápisu</th>
              </tr>
            </thead>
            <tbody>
              {[...wheel.usage_records].reverse().map((r) => (
                <tr key={r.id} style={{ cursor: "default" }}>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.record_date}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
                    +{r.meters_ground.toFixed(1)} m
                  </td>
                  <td>{r.operator || <span style={{ color: "var(--text-subtle)" }}>— neuvedeno —</span>}</td>
                  <td style={{ textAlign: "right", color: "var(--text-subtle)", fontSize: "11.5px" }}>
                    {r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
