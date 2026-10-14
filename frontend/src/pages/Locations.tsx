import { useEffect, useState } from "react";
import { api } from "../api";
import type { Location, LocationType } from "../types";
import { useAuth } from "../components/AuthContext";

const TYPE_LABELS: Record<LocationType, string> = {
  sklad: "Skladová hala",
  linka: "Výrobní brusná linka",
  reprofilace: "Pracoviště reprofilace",
};

export function Locations() {
  const { user } = useAuth();
  const isAdmin = user?.role !== "user";
  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("sklad");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.locations().then(setLocations);
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createLocation(name.trim(), type);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se stanoviště přidat.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="locations-page">
      {/* FORMULÁŘ PRO PŘIDÁNÍ STANOVIŠTĚ */}
      {!isAdmin && <div className="admin-only-note">Zakládání nových stanovišť spravuje administrátor.</div>}
      {isAdmin && <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nové stanoviště kotoučů</div>
            <div className="card-subtitle">
              Založení nové výrobní linky nebo meziskladu v závodě. Firmu reprofilace přidá megaAdmin v Administraci → Firmy reprofilace.
            </div>
          </div>
        </div>

        <form onSubmit={handleAdd}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr auto", gap: 12, alignItems: "flex-end" }}>
            <div className="filter-field">
              <label htmlFor="loc-name">Název stanoviště</label>
              <input
                id="loc-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Linka 4 - čelní skla nebo Sklad hala C"
                required
              />
            </div>

            <div className="filter-field">
              <label htmlFor="loc-type">Druh provozu</label>
              <select id="loc-type" value={type} onChange={(e) => setType(e.target.value as LocationType)}>
                {/* Firmy reprofilace se přidávají v Administraci (i s účtem firmy) */}
                {Object.entries(TYPE_LABELS).filter(([k]) => k !== "reprofilace").map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Ukládám…" : "+ Založit stanoviště"}
            </button>
          </div>
        </form>

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--st-vyrazen-bg)", color: "var(--st-vyrazen-color)", borderRadius: 4, fontSize: "12.5px" }}>
            {error}
          </div>
        )}
      </div>}

      {/* SEZNAM STANOVIŠŤ */}
      <div className="data-table-container">
        <div style={{ padding: "12px 16px", background: "var(--t-bg-f8fafc, #f8fafc)", borderBottom: "1px solid var(--border-light)" }}>
          <span className="locations-count-label" style={{ color: "var(--text-muted)", fontWeight: 700 }}>
            Aktivní pracoviště a sklady v Chudeřicích ({locations.length})
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "60%" }}>Označení stanoviště</th>
              <th>Typ provozu</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} style={{ cursor: "default" }}>
                <td style={{ fontWeight: 600, color: "var(--text-main)" }}>
                  <span className="location-chip">
                    <span className={`loc-dot ${l.type}`}></span>
                    {l.name}
                  </span>
                </td>
                <td>
                  <span className="location-type-label" style={{ color: "var(--text-muted)" }}>
                    {TYPE_LABELS[l.type]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
