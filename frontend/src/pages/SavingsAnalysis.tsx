import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { RepairCompany, SavingsAnalysis as Analysis, SavingsFirm } from "../api";

const SAVED = "#16a34a";
const SPENT = "#e4a33d";
// Barvy firem v grafu po měsících (porovnání firem) — co nejvíc odlišné od sebe
const FIRM_COLORS = ["#2563eb", "#f97316", "#10b981", "#e11d48", "#8b5cf6", "#facc15", "#06b6d4", "#78716c"];
const MONTHS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

const czk = (value: number) => `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
const shortCzk = (value: number) => Math.abs(value) >= 1000 ? `${Math.round(value / 1000).toLocaleString("cs-CZ")} tis.` : String(Math.round(value));
const monthLabel = (key: string) => { const [y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; };
const days = (n: number) => {
  const text = n.toLocaleString("cs-CZ");
  if (!Number.isInteger(n)) return `${text} dne`;
  return `${text} ${n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní"}`;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Preset = "rok" | "minuly" | "12m" | "vse" | "vlastni";
type Mode = "porovnani" | "firma";
type Metric = "saved" | "spent" | "count";
const METRICS: [Metric, string][] = [["saved", "Ušetřeno"], ["spent", "Utraceno"], ["count", "Počet reprofilací"]];

function presetRange(preset: Preset): [string, string] {
  const today = new Date();
  const y = today.getFullYear();
  if (preset === "rok") return [`${y}-01-01`, iso(today)];
  if (preset === "minuly") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (preset === "12m") return [iso(new Date(y - 1, today.getMonth(), today.getDate() + 1)), iso(today)];
  return ["", ""];
}

const tooltipStyle = { background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-main)" };
const axisTick = { fill: "var(--text-muted)", fontSize: 12 };

function FirmTable({ firms, color }: { firms: SavingsFirm[]; color?: (name: string, i: number) => string }) {
  const ranked = firms.length > 1;
  return (
    <div className="data-table-container admin-table-container">
      <table className="data-table">
        <thead>
          <tr>{ranked && <th>#</th>}<th>Firma</th><th className="num">Hotovo</th><th className="num">Nešlo</th><th className="num">Úspěšnost</th>
            <th className="num">Průměrná cena</th><th className="num">Průměrná doba</th><th className="num">Utraceno</th><th className="num">Ušetřeno</th></tr>
        </thead>
        <tbody>
          {firms.map((f, i) => (
            <tr key={f.name}>
              {ranked && <td>{i + 1}.</td>}
              <td><strong>{color && <span className="savings-dot" style={{ background: color(f.name, i) }} />}{f.name}</strong></td>
              <td className="num">{f.done}</td>
              <td className="num">{f.failed}</td>
              <td className="num">{f.success_rate.toLocaleString("cs-CZ")} %</td>
              <td className="num">{f.avg_cost != null ? czk(f.avg_cost) : "—"}</td>
              <td className="num">{f.avg_days != null ? days(f.avg_days) : "—"}</td>
              <td className="num">{czk(f.spent)}</td>
              <td className="num savings-cell"><strong>{czk(f.saved)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Analýza útrat (jen megaAdmin): kolik ušetřila reprofilace oproti novým kotoučům.
 * Režim „Porovnání firem“ staví firmy vedle sebe (i po měsících), režim „Jedna firma“ ukáže jen vybranou firmu.
 */
export function SavingsAnalysis() {
  const [preset, setPreset] = useState<Preset>("rok");
  const [[dateFrom, dateTo], setRange] = useState<[string, string]>(presetRange("rok"));
  const [mode, setMode] = useState<Mode>("porovnani");
  const [metric, setMetric] = useState<Metric>("saved");
  const [firmId, setFirmId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [firms, setFirms] = useState<RepairCompany[]>([]);
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firm = mode === "firma" ? firms.find((f) => String(f.id) === firmId) : undefined;
  const queryFirm = firm ? firm.id : undefined;

  useEffect(() => {
    api.repairCompanies().then((list) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "cs"));
      setFirms(sorted);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode === "firma" && !queryFirm) return; // čeká, až uživatel vybere firmu
    setError(null);
    api.analytics.savings(dateFrom || undefined, dateTo || undefined, queryFirm).then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Analýzu se nepodařilo načíst."));
  }, [dateFrom, dateTo, mode, queryFirm]);

  function choose(p: Preset) {
    setPreset(p);
    if (p !== "vlastni") setRange(presetRange(p));
  }

  function chooseMode(m: Mode) {
    if (m === mode) return; // stejný režim znovu — data zůstanou (jinak by se už nenačetla)
    setMode(m);
    setData(null);
    setPickerOpen(m === "firma" && !firmId);
  }

  function pickFirm(id: number) {
    setPickerOpen(false);
    if (String(id) === firmId) return; // stejná firma znovu — data zůstanou
    setFirmId(String(id));
    setData(null);
  }

  const firmsChart = data?.firms.map((f) => ({ name: f.name, Ušetřeno: Math.round(f.saved), Utraceno: Math.round(f.spent) })) ?? [];
  const monthsChart = data?.months.map((m) => ({ name: monthLabel(m.month), Ušetřeno: Math.round(m.saved), Utraceno: Math.round(m.spent) })) ?? [];
  // Porovnání po měsících: řádek = měsíc, sloupec = firma (hodnota podle vybrané veličiny)
  const firmNames = data?.firms.map((f) => f.name) ?? [];
  const firmMonthsChart = data?.months.map((m) => {
    const row: Record<string, string | number> = { name: monthLabel(m.month) };
    for (const name of firmNames) {
      const fm = data.firm_months.find((x) => x.month === m.month && x.firm === name);
      row[name] = fm ? Math.round(fm[metric]) : 0;
    }
    return row;
  }) ?? [];
  // Stálá barva firmy (podle abecedního seznamu firem), ať se nemění s obdobím
  const firmColor = (name: string, fallback: number) => {
    const index = firms.findIndex((f) => f.name === name);
    return FIRM_COLORS[(index >= 0 ? index : firms.length + fallback) % FIRM_COLORS.length];
  };
  const formatMetric = (v: unknown) => metric === "count" ? `${Number(v)}×` : czk(Number(v));
  const best = data?.firms.find((f) => f.saved > 0);
  const empty = data && data.done + data.failed === 0;

  return (
    <div>
      <section className="dashboard-intro">
        <div>
          <span className="eyebrow">JEN MEGAADMIN</span>
          <h1>Analýza útrat</h1>
          <p>Kolik AGC ušetřilo reprofilací místo nákupu nových kotoučů a která firma reprofilace je nejvýhodnější.</p>
        </div>
        <div className="dashboard-total"><span>Ušetřeno</span><strong className="savings-total">{data && !(mode === "firma" && !firm) ? czk(data.saved) : "…"}</strong><small>{firm ? firm.name : mode === "firma" ? "vyberte firmu" : "všechny firmy"}</small></div>
      </section>

      <div className="filter-bar savings-filter">
        <div className="savings-mode" role="tablist" aria-label="Režim analýzy">
          <button type="button" role="tab" aria-selected={mode === "porovnani"} className={mode === "porovnani" ? "active" : ""} onClick={() => chooseMode("porovnani")}>
            Porovnání firem
          </button>
          <button type="button" role="tab" aria-selected={mode === "firma"} className={mode === "firma" ? "active" : ""} onClick={() => chooseMode("firma")}>
            Jedna firma
          </button>
        </div>
        <div className="filter-status-pills">
          {([["rok", "Tento rok"], ["minuly", "Minulý rok"], ["12m", "Posledních 12 měsíců"], ["vse", "Vše"], ["vlastni", "Vlastní období"]] as [Preset, string][]).map(([key, text]) => (
            <button key={key} type="button" className={`pill-btn ${preset === key ? "active" : ""}`} onClick={() => choose(key)}>{text}</button>
          ))}
        </div>
        <div className="savings-filter-row">
          {mode === "firma" && (
            <div className="filter-field savings-firm">
              <label htmlFor="sav-firm">Firma reprofilace</label>
              <button id="sav-firm" type="button" className={`savings-firm-button ${firm ? "" : "empty"}`} aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(!pickerOpen)}>
                <span>{firm ? firm.name : "Vybrat firmu"}</span><span aria-hidden="true">▾</span>
              </button>
            </div>
          )}
          <div className="filter-field">
            <label htmlFor="sav-from">Od</label>
            <input id="sav-from" type="date" value={dateFrom} onChange={(e) => { setPreset("vlastni"); setRange([e.target.value, dateTo]); }} />
          </div>
          <div className="filter-field">
            <label htmlFor="sav-to">Do</label>
            <input id="sav-to" type="date" value={dateTo} onChange={(e) => { setPreset("vlastni"); setRange([dateFrom, e.target.value]); }} />
          </div>
          <button className="btn btn-secondary" type="button" disabled={!data}
            onClick={() => void api.analytics.exportSavings(dateFrom || undefined, dateTo || undefined, queryFirm).catch((err) => setError(err.message))}>
            Stáhnout Excel
          </button>
        </div>
      </div>

      {mode === "firma" && pickerOpen && (
        <div className="card savings-picker" role="listbox" aria-label="Vyberte firmu reprofilace">
          <div className="savings-picker-head">
            <strong>Vyberte jednu firmu</strong>
            {firm && <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(false)}>Zavřít</button>}
          </div>
          {firms.length === 0 ? <div className="savings-empty">Zatím není žádná firma reprofilace.</div> : (
            <div className="savings-picker-list">
              {firms.map((f) => (
                <button key={f.id} type="button" role="option" aria-selected={f.id === firm?.id}
                  className={`savings-picker-item ${f.id === firm?.id ? "active" : ""}`} onClick={() => pickFirm(f.id)}>
                  <strong>{f.name}</strong>
                  <small>{f.is_active ? "Aktivní spolupráce" : "Spolupráce ukončena"}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="admin-message error" role="alert">{error}</div>}
      {mode === "firma" && !firm && !pickerOpen && (
        <div className="card savings-empty">Klikněte na <strong>Vybrat firmu</strong> a vyberte firmu, kterou chcete zobrazit.</div>
      )}
      {!data && !error && !(mode === "firma" && !firm) && <div className="card savings-empty">Počítám úspory…</div>}

      {data && !(mode === "firma" && !firm) && (
        <>
          <div className="savings-kpis">
            <div className="savings-kpi saved"><span>Ušetřeno reprofilací</span><strong>{czk(data.saved)}</strong><small>cena nových − cena reprofilací</small></div>
            <div className="savings-kpi spent"><span>Utraceno za reprofilace</span><strong>{czk(data.spent)}</strong><small>{data.done} dokončených reprofilací</small></div>
            <div className="savings-kpi"><span>Nové kotouče by stály</span><strong>{czk(data.new_value)}</strong><small>podle tabulky Ceny kotoučů</small></div>
            <div className="savings-kpi"><span>Reprofilací</span><strong>{data.done}</strong><small>{data.failed > 0 ? `+ ${data.failed}× nešlo reprofilovat` : "žádná neúspěšná"}</small></div>
          </div>

          {(data.without_price > 0 || data.without_cost > 0) && (
            <div className="alert-banner savings-warning">
              <div className="alert-text">
                {data.without_price > 0 && <>U {data.without_price} reprofilací chybí cena nového kotouče, takže se do úspory nepočítají.
                  {" "}Doplňte ji v <Link to="/ceny">Cenách kotoučů</Link>:{" "}
                  {data.missing_prices.map((m) => `${m.manufacturer} Ø ${m.diameter} ${m.profile} (${m.count}×)`).join(", ")}. </>}
                {data.without_cost > 0 && <>{data.without_cost} starších reprofilací nemá zadanou cenu reprofilace.</>}
              </div>
            </div>
          )}

          {empty ? (
            <div className="card savings-empty">{firm ? `Firma ${firm.name} nemá ve vybraném období žádnou dokončenou reprofilaci.` : "Ve vybraném období není žádná dokončená reprofilace."}</div>
          ) : mode === "porovnani" ? (
            <>
              <section className="card savings-chart-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Porovnání firem reprofilace</div>
                    <div className="card-subtitle">{best ? `Nejvíc ušetřila firma ${best.name}: ${czk(best.saved)}.` : "Zatím bez spočítané úspory."}</div>
                  </div>
                </div>
                <div className="savings-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={firmsChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="name" tick={axisTick} />
                      <YAxis tickFormatter={shortCzk} tick={axisTick} width={60} />
                      <Tooltip formatter={(v) => czk(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "var(--border-light)", opacity: 0.4 }} />
                      <Legend />
                      <Bar dataKey="Ušetřeno" fill={SAVED} radius={[4, 4, 0, 0]} maxBarSize={70} />
                      <Bar dataKey="Utraceno" fill={SPENT} radius={[4, 4, 0, 0]} maxBarSize={70} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <FirmTable firms={data.firms} color={firmColor} />
              </section>

              <section className="card savings-chart-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Po měsících podle firem</div>
                    <div className="card-subtitle">Každá firma má svou barvu. Podle data, kdy firma reprofilaci dokončila.</div>
                  </div>
                  <div className="savings-metric" role="group" aria-label="Co porovnávat">
                    {METRICS.map(([key, text]) => (
                      <button key={key} type="button" className={`pill-btn ${metric === key ? "active" : ""}`} onClick={() => setMetric(key)}>{text}</button>
                    ))}
                  </div>
                </div>
                <div className="savings-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={firmMonthsChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="name" tick={axisTick} />
                      <YAxis tickFormatter={metric === "count" ? undefined : shortCzk} allowDecimals={false} tick={axisTick} width={60} />
                      <Tooltip formatter={formatMetric} contentStyle={tooltipStyle} cursor={{ fill: "var(--border-light)", opacity: 0.4 }} />
                      <Legend />
                      {firmNames.map((name, i) => (
                        <Bar key={name} dataKey={name} fill={firmColor(name, i)} stroke="var(--bg-card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="card savings-chart-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Firma {firm?.name}</div>
                    <div className="card-subtitle">Ušetřeno a utraceno po měsících · podle data, kdy firma reprofilaci dokončila.</div>
                  </div>
                </div>
                <div className="savings-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthsChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="name" tick={axisTick} />
                      <YAxis tickFormatter={shortCzk} tick={axisTick} width={60} />
                      <Tooltip formatter={(v) => czk(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "var(--border-light)", opacity: 0.4 }} />
                      <Legend />
                      <Bar dataKey="Ušetřeno" fill={SAVED} radius={[4, 4, 0, 0]} maxBarSize={70} />
                      <Bar dataKey="Utraceno" fill={SPENT} radius={[4, 4, 0, 0]} maxBarSize={70} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <FirmTable firms={data.firms} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
