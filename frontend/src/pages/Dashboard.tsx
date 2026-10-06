import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { DashboardSummary } from "../types";

export function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  const { manufacturers, diameters, profilesByDiameter } = useMemo(() => {
    if (!data) return { manufacturers: [], diameters: [], profilesByDiameter: {} as Record<number, string[]> };
    const mfrs = Array.from(new Set(data.matrix.map((c) => c.manufacturer))).sort();
    const diams = Array.from(new Set(data.matrix.map((c) => c.diameter))).sort((a, b) => a - b);
    const byDiam: Record<number, string[]> = {};
    for (const cell of data.matrix) {
      byDiam[cell.diameter] = byDiam[cell.diameter] ?? [];
      if (!byDiam[cell.diameter].includes(cell.profile)) byDiam[cell.diameter].push(cell.profile);
    }
    Object.values(byDiam).forEach((arr) => arr.sort());
    return { manufacturers: mfrs, diameters: diams, profilesByDiameter: byDiam };
  }, [data]);

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px" }}>
        <p style={{ color: "var(--st-vyrazen-color)", fontWeight: 600 }}>Nepodařilo se načíst provozní data: {error}</p>
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>Zkusit znovu</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>
        Načítám stav skladu a oběhu kotoučů…
      </div>
    );
  }

  const cellCount = (mfr: string, diam: number, prof: string) =>
    data.matrix.find((c) => c.manufacturer === mfr && c.diameter === diam && c.profile === prof)?.count ?? 0;

  return (
    <div>
      {/* 1. ŽIVOTNÍ CYKLUS KOTOUČŮ (WORKFLOW) */}
      <div className="workflow-container">
        <div className="section-label">Aktuální oběh nástrojů v závodě (celkem {data.total_wheels} ks)</div>
        <div className="workflow-strip">
          <div
            className="workflow-step step-sklad"
            onClick={() => navigate("/kotouce?status=sklad")}
            title="Zobrazit kotouče připravené na skladě"
          >
            <div className="step-num">1. PŘÍJEM & SKLAD</div>
            <div className="step-header">
              <span className="step-title">Skladem</span>
              <span className="step-count">{data.by_status.sklad ?? 0}</span>
            </div>
            <div className="step-desc">Nové a zreprofilované kotouče připravené k nasazení na linku.</div>
          </div>

          <div
            className="workflow-step step-provoz"
            onClick={() => navigate("/kotouce?status=v_provozu")}
            title="Zobrazit kotouče aktivně nasazené na výrobních linkách"
          >
            <div className="step-num">2. PROVOZ NA LINCE</div>
            <div className="step-header">
              <span className="step-title">V provozu</span>
              <span className="step-count">{data.by_status.v_provozu ?? 0}</span>
            </div>
            <div className="step-desc">Aktivně brousí na linkách 1–3 v hale.</div>
          </div>

          <div
            className="workflow-step step-reprof"
            onClick={() => navigate("/kotouce?status=na_reprofilaci")}
            title="Zobrazit kotouče předané k přebroušení"
          >
            <div className="step-num">3. OŽIVENÍ PROFILU</div>
            <div className="step-header">
              <span className="step-title">Na reprofilaci</span>
              <span className="step-count">{data.by_status.na_reprofilaci ?? 0}</span>
            </div>
            <div className="step-desc">Předáno k obnově geometrie brusného profilu.</div>
          </div>

          <div
            className="workflow-step step-vyrazen"
            onClick={() => navigate("/kotouce?status=vyrazen")}
            title="Zobrazit vyřazené kotouče"
          >
            <div className="step-num">4. KONEC ŽIVOTNOSTI</div>
            <div className="step-header">
              <span className="step-title">Vyřazeno</span>
              <span className="step-count">{data.by_status.vyrazen ?? 0}</span>
            </div>
            <div className="step-desc">Dosaženo maximálního opotřebení diamantu.</div>
          </div>
        </div>
      </div>

      {/* 2. UPOZORNĚNÍ PRO ÚDRŽBU A NÁKUP (PREDIKCE ZE SLIDU 5 & 11) */}
      {data.wheels_near_end_of_life > 0 && (
        <div className="alert-banner">
          <div className="alert-content">
            <div className="alert-icon">!</div>
            <div>
              <div className="alert-title">
                Plánování výměny: {data.wheels_near_end_of_life} {data.wheels_near_end_of_life === 1 ? "kotouč" : data.wheels_near_end_of_life < 5 ? "kotouče" : "kotoučů"} se blíží limitu opotřebení
              </div>
              <div className="alert-text">
                Nástroje mají nabroušeno přes 85 % své maximální kapacity. Je potřeba připravit náhradní kus ze skladu nebo zadat reprofilaci.
              </div>
            </div>
          </div>
          <Link to="/kotouce?status=v_provozu" className="alert-action">
            Zkontrolovat nasazené kotouče →
          </Link>
        </div>
      )}

      {/* 3. SKLADOVÁ MATICE (VÝROBCE × PRŮMĚR × PROFIL) */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Matice skladových zásob podle parametrů</div>
            <div className="card-subtitle">
              Počty kusů podle dodavatele, průměru kotouče a geometrického profilu
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate("/kotouce")}>
            Otevřít kompletní seznam →
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th rowSpan={2} className="mfr-col" style={{ minWidth: 160 }}>Výrobce / Dodavatel</th>
                {diameters.map((d) => (
                  <th key={d} colSpan={profilesByDiameter[d]?.length ?? 1} style={{ borderBottom: "2px solid #cbd5e1" }}>
                    Průměr Ø {d} mm
                  </th>
                ))}
              </tr>
              <tr>
                {diameters.flatMap((d) =>
                  (profilesByDiameter[d] ?? []).map((p) => (
                    <th key={`${d}-${p}`} style={{ minWidth: 50, fontFamily: "var(--font-mono)" }}>
                      {p}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {manufacturers.map((m) => (
                <tr key={m}>
                  <td className="mfr-col" style={{ fontWeight: 600 }}>{m}</td>
                  {diameters.flatMap((d) =>
                    (profilesByDiameter[d] ?? []).map((p) => {
                      const count = cellCount(m, d, p);
                      return (
                        <td
                          key={`${m}-${d}-${p}`}
                          className={count > 0 ? "matrix-cell-has" : "matrix-cell-empty"}
                          style={{
                            cursor: count > 0 ? "pointer" : "default",
                            fontFamily: "var(--font-mono)",
                          }}
                          onClick={() => {
                            if (count > 0) {
                              navigate(`/kotouce?vyrobce=${encodeURIComponent(m)}&profil=${encodeURIComponent(p)}&prumer=${d}`);
                            }
                          }}
                          title={count > 0 ? `${m} Ø${d} ${p}: ${count} ks (kliknutím filtrovat)` : "0 ks"}
                        >
                          {count > 0 ? count : "·"}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
