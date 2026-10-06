import { useState } from "react";
import type { Location, WheelStatus } from "../types";
import { STATUS_LABELS } from "../types";
import { api } from "../api";

interface Props {
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}

const STATUSES: WheelStatus[] = ["sklad", "v_provozu", "na_reprofilaci", "vyrazen"];

export function AddWheelModal({ locations, onClose, onCreated }: Props) {
  const [serial, setSerial] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [diameter, setDiameter] = useState(150);
  const [profile, setProfile] = useState("");
  const [status, setStatus] = useState<WheelStatus>("sklad");
  const [locationId, setLocationId] = useState<string>("");
  const [maxLifetime, setMaxLifetime] = useState<string>("1000");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serial.trim() || !manufacturer.trim() || !profile.trim()) {
      setError("Vyplňte prosím výrobní číslo, výrobce i profil kotouče.");
      return;
    }
    setSaving(true);
    try {
      await api.createWheel({
        serial_number: serial.trim(),
        manufacturer: manufacturer.trim(),
        diameter,
        profile: profile.trim(),
        status,
        location_id: locationId ? Number(locationId) : null,
        max_lifetime_m: maxLifetime ? Number(maxLifetime) : null,
        received_date: new Date().toISOString().slice(0, 10),
        note: note.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se kotouč zaevidovat.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Příjem kotouče do evidence</h3>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>
              Zápis nového nástroje do závodu AGC Chudeřice
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="filter-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="serial">Výrobní číslo z vyraženého štítku *</label>
                <input
                  id="serial"
                  type="text"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="např. 549105 nebo 13832259-2"
                  autoFocus
                  required
                />
              </div>

              <div className="filter-field">
                <label htmlFor="manufacturer">Dodavatel / Výrobce *</label>
                <input
                  id="manufacturer"
                  type="text"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="např. Tesch, Wendt, Asahi"
                  required
                />
              </div>

              <div className="filter-field">
                <label htmlFor="diameter">Průměr těla</label>
                <select
                  id="diameter"
                  value={diameter}
                  onChange={(e) => setDiameter(Number(e.target.value))}
                >
                  <option value={150}>Ø 150 mm</option>
                  <option value={250}>Ø 250 mm</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="profile">Brusný profil *</label>
                <input
                  id="profile"
                  type="text"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="např. C3,5, G1,6, U3"
                  required
                />
              </div>

              <div className="filter-field">
                <label htmlFor="status">Počáteční stav</label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as WheelStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="location">Uložení na stanovišti</label>
                <select
                  id="location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">— Vyberte sklad nebo výrobní linku —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="lifetime">Předpokládaná max. životnost (m)</label>
                <input
                  id="lifetime"
                  type="number"
                  value={maxLifetime}
                  onChange={(e) => setMaxLifetime(e.target.value)}
                  placeholder="obvykle 1000 až 1500 m"
                />
              </div>

              <div className="filter-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="note">Poznámka</label>
                <textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="např. určení pro přední autoskla, speciální směs..."
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border-medium)" }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#fef2f2", color: "#b91c1c", borderRadius: 4, fontSize: "12.5px" }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Zrušit
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Ukládám…" : "Zaevidovat kotouč"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
