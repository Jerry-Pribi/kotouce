import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api";
import type { WheelDetail, WheelStatus, Location } from "../types";
import { STATUS_LABELS } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { ReprofilingHistory } from "../components/ReprofilingHistory";

const formatMeters = (value: number) => value.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
  const [returnPanelOpen, setReturnPanelOpen] = useState(false);
  const [returnLineId, setReturnLineId] = useState("");
  const [returnStockId, setReturnStockId] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [checkoutPanelOpen, setCheckoutPanelOpen] = useState(false);
  const [checkoutLineId, setCheckoutLineId] = useState("");
  const [takenByName, setTakenByName] = useState("");
  const [legacyTakenByName, setLegacyTakenByName] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
  const availableReturnLines = locations.filter((location) => location.type === "linka");
  const availableStockLocations = locations.filter((location) => location.type === "sklad");
  const activeCycle = wheel.cycles.find((cycle) => !cycle.returned_at);
  const matchingLocations = locations.filter((location) =>
    wheel.status === "sklad" ? location.type === "sklad" && location.id !== wheel.location?.id
      : wheel.status === "v_provozu" ? location.type === "linka" && location.id !== wheel.location?.id
        : wheel.status === "na_reprofilaci" ? location.type === "reprofilace"
          : true
  );
  const displayedStatus: WheelStatus = checkoutPanelOpen ? "v_provozu" : returnPanelOpen ? "sklad" : wheel.status;
  const displayedLocationId = checkoutPanelOpen ? checkoutLineId : returnPanelOpen ? returnStockId : String(wheel.location?.id ?? "");
  const displayedLocations = checkoutPanelOpen ? availableReturnLines : returnPanelOpen ? availableStockLocations : matchingLocations;
  const diaryEntries = [
    ...wheel.usage_records.map((record) => ({
      key: `grinding-${record.id}`,
      timestamp: record.created_at || `${record.record_date}T00:00:00`,
      event: "Broušení",
      location: "—",
      person: record.operator || "Neuvedeno",
      meters: record.meters_ground,
      shiftDate: record.record_date,
    })),
    ...wheel.cycles.flatMap((cycle) => [
      {
        key: `checkout-${cycle.id}`,
        timestamp: cycle.taken_at,
        event: "Předání na linku",
        location: cycle.used_on_location_name,
        person: cycle.taken_by_name,
        meters: null,
        shiftDate: null,
      },
      ...(cycle.returned_at ? [{
        key: `return-${cycle.id}`,
        timestamp: cycle.returned_at,
        event: "Návrat do skladu",
        location: cycle.returned_to_location_name ?? "Sklad neuveden",
        person: cycle.returned_by_username ?? "Neuvedeno",
        meters: null,
        shiftDate: null,
      }] : []),
    ]),
    ...wheel.return_records
      .filter((record) => !wheel.cycles.some((cycle) => cycle.used_on_location_name === record.used_on_location_name
        && cycle.returned_to_location_name === record.returned_to_location_name
        && cycle.returned_by_username === record.returned_by_username))
      .map((record) => ({
        key: `legacy-return-${record.id}`,
        timestamp: record.returned_at,
        event: "Návrat do skladu",
        location: record.returned_to_location_name,
        person: record.returned_by_username,
        meters: null,
        shiftDate: null,
      })),
  ].sort((a, b) => Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(b.timestamp) ? b.timestamp : `${b.timestamp}Z`)
    - Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(a.timestamp) ? a.timestamp : `${a.timestamp}Z`));
  const formatDiaryTime = (value: string) => new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
    .toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });

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

  async function handleStatusChange(newStatus: WheelStatus) {
    if (newStatus === wheel?.status && (checkoutPanelOpen || returnPanelOpen)) {
      setCheckoutPanelOpen(false);
      setReturnPanelOpen(false);
      setActionError(null);
      return;
    }
    setCheckoutPanelOpen(false);
    setReturnPanelOpen(false);
    if (wheel?.status === "sklad" && newStatus === "v_provozu") {
      setCheckoutLineId("");
      setTakenByName("");
      setActionError(null);
      setCheckoutPanelOpen(true);
      return;
    }
    if (wheel?.status === "v_provozu" && newStatus === "sklad") {
      setReturnLineId(activeCycle?.used_on_location_id ? String(activeCycle.used_on_location_id) : wheel.location?.type === "linka" ? String(wheel.location.id) : "");
      setReturnStockId("");
      setLegacyTakenByName("");
      setActionError(null);
      setReturnPanelOpen(true);
      return;
    }
    setActionError(null);
    try { await updateStatus(newStatus); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Stav kotouče se nepodařilo změnit."); }
  }

  async function submitCheckout(event: React.FormEvent) {
    event.preventDefault();
    if (!wheel || !checkoutLineId || !takenByName.trim()) return;
    setCheckoutSubmitting(true);
    setActionError(null);
    try {
      const updated = await api.updateWheel(wheel.id, {
        status: "v_provozu",
        location_id: Number(checkoutLineId),
        taken_by_name: takenByName.trim(),
      });
      setWheel({ ...wheel, ...updated });
      setCheckoutPanelOpen(false);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Vydání kotouče na linku se nepodařilo uložit.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  async function submitReturnToStock(event: React.FormEvent) {
    event.preventDefault();
    if (!wheel || !returnLineId || !returnStockId) return;
    setReturnSubmitting(true);
    setActionError(null);
    try {
      const updated = await api.updateWheel(wheel.id, {
        status: "sklad",
        location_id: Number(returnStockId),
        returned_from_location_id: Number(returnLineId),
        taken_by_name: legacyTakenByName.trim() || undefined,
      });
      setWheel({ ...wheel, ...updated });
      setReturnPanelOpen(false);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Vrácení kotouče na sklad se nepodařilo uložit.");
    } finally {
      setReturnSubmitting(false);
    }
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
            <StatusBadge status={displayedStatus} />
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
                value={displayedStatus}
                onChange={(e) => void handleStatusChange(e.target.value as WheelStatus)}
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
                value={displayedLocationId}
                onChange={(e) => updateLocation(e.target.value)}
                disabled={checkoutPanelOpen || returnPanelOpen || (wheel.status === "v_provozu" && Boolean(activeCycle))}
                title={wheel.status === "v_provozu" && activeCycle ? "Linka je zaznamenaná u aktivního použití kotouče." : undefined}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border-medium)" }}
              >
                <option value="">— Bez přiřazeného stanoviště —</option>
                {displayedLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {wheel.status === "v_provozu" && activeCycle && <small className="cycle-subtext">Linku lze změnit při vrácení a novém vydání kotouče.</small>}
            </div>

            {checkoutPanelOpen && <form className="wheel-return-form" onSubmit={(event) => void submitCheckout(event)}>
              <strong>Vydat kotouč na linku</strong>
              <span>Zaznamenáme osobu, linku a následné broušení až do vrácení na sklad.</span>
              <label htmlFor="checkout-person">Kdo přebírá kotouč? *</label>
              <input id="checkout-person" value={takenByName} onChange={(event) => setTakenByName(event.target.value)} maxLength={100} required placeholder="Jméno pracovníka" />
              <label htmlFor="checkout-line">Na jakou linku? *</label>
              <select id="checkout-line" value={checkoutLineId} onChange={(event) => setCheckoutLineId(event.target.value)} required>
                <option value="">Vyberte výrobní linku</option>
                {availableReturnLines.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              {actionError && <div className="wheel-action-error" role="alert">{actionError}</div>}
              <div className="wheel-return-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setCheckoutPanelOpen(false); setActionError(null); }}>Zrušit</button>
                <button type="submit" className="btn btn-primary" disabled={checkoutSubmitting || !checkoutLineId || !takenByName.trim()}>{checkoutSubmitting ? "Ukládám…" : "Potvrdit vydání"}</button>
              </div>
            </form>}

            {returnPanelOpen && <form className="wheel-return-form" onSubmit={(event) => void submitReturnToStock(event)}>
              <strong>Vrátit kotouč na sklad</strong>
              <span>Uveďte linku, na které byl kotouč používán, a cílový sklad.</span>
              <label htmlFor="return-line">Používal se na lince *</label>
              <select id="return-line" value={returnLineId} onChange={(event) => setReturnLineId(event.target.value)} required>
                <option value="">Vyberte výrobní linku</option>
                {availableReturnLines.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <label htmlFor="return-stock">Vrátit do skladu *</label>
              <select id="return-stock" value={returnStockId} onChange={(event) => setReturnStockId(event.target.value)} required>
                <option value="">Vyberte sklad</option>
                {availableStockLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              {!activeCycle && <><label htmlFor="return-person">Kdo kotouč používal? *</label><input id="return-person" value={legacyTakenByName} onChange={(event) => setLegacyTakenByName(event.target.value)} maxLength={100} required placeholder="Jméno pracovníka" /></>}
              {actionError && <div className="wheel-action-error" role="alert">{actionError}</div>}
              <div className="wheel-return-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setReturnPanelOpen(false); setActionError(null); }}>Zrušit</button>
                <button type="submit" className="btn btn-primary" disabled={returnSubmitting || !returnLineId || !returnStockId || (!activeCycle && !legacyTakenByName.trim())}>{returnSubmitting ? "Ukládám…" : "Potvrdit vrácení"}</button>
              </div>
            </form>}
            {actionError && !returnPanelOpen && <div className="wheel-action-error" role="alert">{actionError}</div>}

            {wheel.note && (
              <div style={{ background: "var(--bg-card)", padding: "10px", borderRadius: 4, border: "1px solid var(--border-light)", fontSize: "12.5px" }}>
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
                {formatMeters(totalMeters)} m
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
                    {remainingMeters !== null ? formatMeters(remainingMeters) : "—"} m
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

      {/* REPROFILACE: hlášení firmy a historie */}
      <ReprofilingHistory wheel={wheel} />

      {(wheel.cycles.length > 0 || wheel.return_records.length > 0) && <div className="card wheel-return-history">
        <div className="card-header"><div><div className="card-title">Historie předání kotouče</div><div className="card-subtitle">Odkud kotouč odešel, kdo a kdy ho převzal, na které lince pracoval a do kterého skladu se vrátil.</div></div></div>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Odkud</th><th>Převzal</th><th>Linka</th><th>Nabroušeno</th><th>Vydáno</th><th>Vráceno do skladu</th><th>Čas návratu</th></tr></thead><tbody>
          {wheel.cycles.map((cycle) => <tr key={`cycle-${cycle.id}`}>
            <td>{cycle.taken_from_location_name ?? "Pořízen přímo na lince"}</td>
            <td><strong>{cycle.taken_by_name}</strong><small className="cycle-subtext">Vydal v aplikaci: {cycle.taken_by_username}</small></td>
            <td>{cycle.used_on_location_name}</td>
            <td><strong>{formatMeters(cycle.meters_ground)} m</strong></td>
            <td>{new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(cycle.taken_at) ? cycle.taken_at : `${cycle.taken_at}Z`).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}</td>
            <td>{cycle.returned_to_location_name ?? (cycle.returned_at ? "Sklad neuveden" : "Stále na lince")}</td>
            <td>{cycle.returned_at ? new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(cycle.returned_at) ? cycle.returned_at : `${cycle.returned_at}Z`).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" }) : "—"}{cycle.returned_by_username && <small className="cycle-subtext">Zapsal: {cycle.returned_by_username}</small>}</td>
          </tr>)}
          {wheel.return_records.filter((record) => !wheel.cycles.some((cycle) => cycle.used_on_location_name === record.used_on_location_name && cycle.returned_to_location_name === record.returned_to_location_name && cycle.returned_by_username === record.returned_by_username)).map((record) => <tr key={`legacy-return-${record.id}`}>
            <td>Neuvedeno<small className="cycle-subtext">Starší záznam</small></td><td>Neuvedeno<small className="cycle-subtext">Starší záznam</small></td><td>{record.used_on_location_name}</td><td>—</td><td>—</td><td>{record.returned_to_location_name}</td><td>{new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(record.returned_at) ? record.returned_at : `${record.returned_at}Z`).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}<small className="cycle-subtext">Zapsal: {record.returned_by_username}</small></td>
          </tr>)}
        </tbody></table></div>
      </div>}

      {/* FORMULÁŘ PRO ZÁPIS SMĚNY (DÍLENSKÁ PRŮVODKA) */}
      {wheel.status === "v_provozu" ? <div className="card">
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
      </div> : <div className="card grinding-entry-disabled">
        <div className="card-title">Zápis broušení není dostupný</div>
        <div className="card-subtitle">Metry broušení lze přidávat pouze v době, kdy je kotouč na výrobní lince. Historické záznamy zůstávají zachované.</div>
      </div>}

      {/* HISTORIE BROUŠENÍ (PROVOZNÍ DENÍK) */}
      <div className="card grinding-diary" style={{ padding: 0 }}>
        <div style={{ padding: "14px 20px", background: "var(--t-bg-f8fafc, #f8fafc)", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "14px" }}>Provozní deník broušení</div>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Celkem {diaryEntries.length} {diaryEntries.length === 1 ? "událost" : diaryEntries.length < 5 ? "události" : "událostí"}</span>
        </div>

        {diaryEntries.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            Zatím nebyla zapsána žádná událost broušení, předání na linku ani návratu do skladu.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Událost</th>
                <th>Datum a čas</th>
                <th>Linka / sklad</th>
                <th>Osoba</th>
                <th>Nabroušeno</th>
              </tr>
            </thead>
            <tbody>
              {diaryEntries.map((entry) => (
                <tr key={entry.key} style={{ cursor: "default" }}>
                  <td><strong>{entry.event}</strong>{entry.shiftDate && <small className="cycle-subtext">Směna: {entry.shiftDate}</small>}</td>
                  <td>{formatDiaryTime(entry.timestamp)}</td>
                  <td>{entry.location}</td>
                  <td>{entry.person}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
                    {entry.meters === null ? "—" : `+${formatMeters(entry.meters)} m`}
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
