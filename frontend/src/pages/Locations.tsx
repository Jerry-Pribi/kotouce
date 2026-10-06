import { useEffect, useState } from "react";
import { api } from "../api";
import type { Location, LocationType } from "../types";

const TYPE_LABELS: Record<LocationType, string> = {
  sklad: "Skladová hala",
  linka: "Výrobní brusná linka",
  reprofilace: "Pracoviště reprofilace",
};

export function Locations() {
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
    <div>
      {/* FORMULÁŘ PRO PŘIDÁNÍ STANOVIŠTĚ */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nové stanoviště kotoučů</div>
            <div className="card-subtitle">
              Založení nové výrobní linky, meziskladu nebo prostoru údržby v závodě
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
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
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
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#fef2f2", color: "#b91c1c", borderRadius: 4, fontSize: "12.5px" }}>
            {error}
          </div>
        )}
      </div>

      {/* SEZNAM STANOVIŠŤ */}
      <div className="data-table-container">
        <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid var(--border-light)" }}>
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: 600 }}>
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
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
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
