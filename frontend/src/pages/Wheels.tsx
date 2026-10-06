import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Wheel, WheelStatus, Location, Manufacturer, Profile } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { AddWheelModal } from "../components/AddWheelModal";

export function Wheels() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [wheels, setWheels] = useState<Wheel[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Filtry ze stavu / URL parametrů
  const search = searchParams.get("hledat") || "";
  const status = (searchParams.get("status") as WheelStatus | "") || "";
  const diameter = searchParams.get("prumer") || "";
  const manufacturer = searchParams.get("vyrobce") || "";
  const profile = searchParams.get("profil") || "";
  const locationId = searchParams.get("lokace") || "";

  // Kontrola otevření modálu z hlavičky (?novy=1)
  useEffect(() => {
    if (searchParams.get("novy") === "1") {
      setShowAdd(true);
      const next = new URLSearchParams(searchParams);
      next.delete("novy");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function loadReferenceData() {
    try {
      const [locs, mfrs, profs] = await Promise.all([
        api.locations(),
        api.manufacturers(),
        api.profiles(),
      ]);
      setLocations(locs);
      setManufacturers(mfrs);
      setProfiles(profs);
    } catch {
      // Číselníky
    }
  }

  async function load() {
    setLoading(true);
    try {
      const w = await api.wheels({
        search: search || undefined,
        status: status || undefined,
        diameter: diameter || undefined,
        manufacturer: manufacturer || undefined,
        profile: profile || undefined,
        location_id: locationId ? Number(locationId) : undefined,
      });
      setWheels(w);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, diameter, manufacturer, profile, locationId]);

  function updateParam(key: string, val: string) {
    const next = new URLSearchParams(searchParams);
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const hasActiveFilters = Boolean(search || status || diameter || manufacturer || profile || locationId);

  return (
    <div>
      {/* FILTRAČNÍ LIŠTA */}
      <div className="filter-bar">
        {/* Rychlé přepínání podle stavu v oběhu */}
        <div className="filter-status-pills">
          <button
            className={`pill-btn ${!status ? "active" : ""}`}
            onClick={() => updateParam("status", "")}
          >
            Všechny kotouče
          </button>
          <button
            className={`pill-btn ${status === "v_provozu" ? "active" : ""}`}
            onClick={() => updateParam("status", "v_provozu")}
          >
            🟢 V provozu na lince
          </button>
          <button
            className={`pill-btn ${status === "sklad" ? "active" : ""}`}
            onClick={() => updateParam("status", "sklad")}
          >
            ⚪ Skladem
          </button>
          <button
            className={`pill-btn ${status === "na_reprofilaci" ? "active" : ""}`}
            onClick={() => updateParam("status", "na_reprofilaci")}
          >
            🟠 Na reprofilaci
          </button>
          <button
            className={`pill-btn ${status === "vyrazen" ? "active" : ""}`}
            onClick={() => updateParam("status", "vyrazen")}
          >
            🔴 Vyřazené
          </button>
        </div>

        {/* Vyhledávání a selekce parametrů */}
        <div className="filter-controls">
          <div className="filter-field">
            <label htmlFor="f-search">Výrobní číslo kotouče</label>
            <input
              id="f-search"
              type="text"
              value={search}
              onChange={(e) => updateParam("hledat", e.target.value)}
              placeholder="např. 549012…"
            />
          </div>

          <div className="filter-field">
            <label htmlFor="f-mfr">Dodavatel / Výrobce</label>
            <select
              id="f-mfr"
              value={manufacturer}
              onChange={(e) => updateParam("vyrobce", e.target.value)}
            >
              <option value="">Všichni výrobci</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="f-diam">Průměr</label>
            <select
              id="f-diam"
              value={diameter}
              onChange={(e) => updateParam("prumer", e.target.value)}
            >
              <option value="">Všechny průměry</option>
              <option value="150">Ø 150 mm</option>
              <option value="250">Ø 250 mm</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="f-prof">Profil</label>
            <select
              id="f-prof"
              value={profile}
              onChange={(e) => updateParam("profil", e.target.value)}
            >
              <option value="">Všechny profily</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.code}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="f-loc">Aktuální stanoviště</label>
            <select
              id="f-loc"
              value={locationId}
              onChange={(e) => updateParam("lokace", e.target.value)}
            >
              <option value="">Všechna stanoviště</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button className="btn-reset" onClick={resetFilters} title="Zrušit všechny aplikované filtry">
              Zrušit filtry ✕
            </button>
          )}
        </div>
      </div>

      {/* DATOVÁ TABULKA */}
      <div className="data-table-container">
        <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: 600 }}>
            {loading ? "Vyhledávám…" : `Zobrazeno ${wheels.length} kotoučů`}
          </span>
          <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={() => setShowAdd(true)}>
            + Přijmout kotouč na sklad
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Výrobní číslo</th>
              <th>Výrobce a specifikace</th>
              <th>Aktuální stanoviště</th>
              <th>Stav oběhu</th>
              <th style={{ minWidth: 160 }}>Opotřebení nástroje</th>
              <th style={{ textAlign: "right" }}>Akce</th>
            </tr>
          </thead>
          <tbody>
            {wheels.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  {loading ? "Načítám data…" : "Žádný kotouč neodpovídá zvoleným filtrům."}
                </td>
              </tr>
            ) : (
              wheels.map((w) => {
                const total = w.total_meters_ground ?? 0;
                const max = w.max_lifetime_m;
                const pct = max ? Math.min(100, (total / max) * 100) : null;
                const pctClass = pct === null ? "" : pct >= 100 ? "danger" : pct >= 85 ? "warn" : "";

                return (
                  <tr key={w.id} onClick={() => navigate(`/kotouce/${w.id}`)}>
                    <td>
                      <span className="serial-tag">{w.serial_number}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{w.manufacturer.name}</div>
                      <div className="param-badge">
                        <span>Ø {w.diameter} mm</span>
                        <span>·</span>
                        <span>profil {w.profile.code}</span>
                      </div>
                    </td>
                    <td>
                      {w.location ? (
                        <span className="location-chip">
                          <span className={`loc-dot ${w.location.type}`}></span>
                          {w.location.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-subtle)", fontSize: "12px" }}>— neevidováno —</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="progress-cell">
                      {max ? (
                        <div>
                          <div className="progress-track">
                            <div
                              className={`progress-fill ${pctClass}`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="progress-text">
                            <span>{Math.round(total)} m</span>
                            <span style={{ fontWeight: pct && pct >= 85 ? 700 : 400 }}>
                              {pct ? `${Math.round(pct)} %` : "—"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}>
                          {Math.round(total)} m (bez limitu)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ color: "var(--agc-red)", fontWeight: 600, fontSize: "12px" }}>
                        Karta kotouče →
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddWheelModal
          locations={locations}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}
