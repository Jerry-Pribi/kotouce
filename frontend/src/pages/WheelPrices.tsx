import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import type { WheelPrice } from "../api";
import type { Manufacturer, Profile } from "../types";

const formatCzk = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
const formatDate = (value: string) => new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
  .toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
const parseNumber = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));

const EMPTY = { manufacturer: "", diameter: "", profile: "", price: "" };
type Draft = typeof EMPTY;

/**
 * Ceny nových kotoučů (jen megaAdmin). Cena platí pro všechny kotouče stejného typu
 * (výrobce + průměr + profil) a analýza útrat z ní počítá, kolik ušetřila reprofilace.
 */
export function WheelPrices() {
  const [prices, setPrices] = useState<WheelPrice[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  // Filtr tabulky
  const [fManufacturer, setFManufacturer] = useState("");
  const [fDiameter, setFDiameter] = useState("");
  const [fProfile, setFProfile] = useState("");
  const [fPriceFrom, setFPriceFrom] = useState("");
  const [fPriceTo, setFPriceTo] = useState("");

  const load = () => api.analytics.prices().then(setPrices)
    .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Ceny se nepodařilo načíst." }));
  useEffect(() => {
    void load();
    api.manufacturers().then(setManufacturers).catch(() => undefined);
    api.profiles().then(setProfiles).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const from = fPriceFrom.trim() ? parseNumber(fPriceFrom) : null;
    const to = fPriceTo.trim() ? parseNumber(fPriceTo) : null;
    return prices.filter((p) =>
      (!fManufacturer || p.manufacturer === fManufacturer)
      && (!fDiameter || p.diameter === Number(fDiameter))
      && (!fProfile || p.profile === fProfile)
      && (from === null || Number.isNaN(from) || p.price >= from)
      && (to === null || Number.isNaN(to) || p.price <= to));
  }, [prices, fManufacturer, fDiameter, fProfile, fPriceFrom, fPriceTo]);

  const filterOptions = useMemo(() => ({
    manufacturers: [...new Set(prices.map((p) => p.manufacturer))].sort((a, b) => a.localeCompare(b, "cs")),
    diameters: [...new Set(prices.map((p) => p.diameter))].sort((a, b) => a - b),
    profiles: [...new Set(prices.map((p) => p.profile))].sort((a, b) => a.localeCompare(b, "cs")),
  }), [prices]);
  const filterActive = Boolean(fManufacturer || fDiameter || fProfile || fPriceFrom || fPriceTo);

  function toInput(d: Draft) {
    const diameter = parseNumber(d.diameter);
    const price = parseNumber(d.price);
    if (!d.manufacturer.trim() || !d.profile.trim()) throw new Error("Vyplňte výrobce i profil.");
    if (!Number.isInteger(diameter) || diameter <= 0) throw new Error("Průměr musí být celé kladné číslo v mm.");
    if (Number.isNaN(price) || price <= 0) throw new Error("Cena musí být kladné číslo v Kč.");
    return { manufacturer: d.manufacturer.trim(), diameter, profile: d.profile.trim(), price };
  }

  async function save(action: () => Promise<WheelPrice>, done: (p: WheelPrice) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await action();
      setMessage({ ok: true, text: done(saved) });
      await load();
      api.manufacturers().then(setManufacturers).catch(() => undefined);
      api.profiles().then(setProfiles).catch(() => undefined);
      return true;
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Nepodařilo se uložit." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const label = (p: WheelPrice) => `${p.manufacturer} · Ø ${p.diameter} mm · ${p.profile}`;

  async function add(event: FormEvent) {
    event.preventDefault();
    let input;
    try { input = toInput(draft); } catch (err) { setMessage({ ok: false, text: (err as Error).message }); return; }
    if (await save(() => api.analytics.createPrice(input), (p) => `Uloženo: ${label(p)} = ${formatCzk(p.price)}.`)) setDraft(EMPTY);
  }

  async function saveEdit(event: FormEvent, id: number) {
    event.preventDefault();
    let input;
    try { input = toInput(editDraft); } catch (err) { setMessage({ ok: false, text: (err as Error).message }); return; }
    if (await save(() => api.analytics.updatePrice(id, input), (p) => `Změněno: ${label(p)} = ${formatCzk(p.price)}.`)) setEditId(null);
  }

  async function remove(p: WheelPrice) {
    if (!window.confirm(`Opravdu smazat cenu pro ${label(p)}? Analýza pak u těchto kotoučů úsporu nespočítá.`)) return;
    setMessage(null);
    try {
      await api.analytics.deletePrice(p.id);
      setMessage({ ok: true, text: `Cena pro ${label(p)} byla smazána.` });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Nepodařilo se smazat." });
    }
  }

  function startEdit(p: WheelPrice) {
    setEditId(p.id);
    setEditDraft({ manufacturer: p.manufacturer, diameter: String(p.diameter), profile: p.profile, price: String(p.price) });
    setMessage(null);
  }

  const clearFilter = () => { setFManufacturer(""); setFDiameter(""); setFProfile(""); setFPriceFrom(""); setFPriceTo(""); };

  return (
    <div>
      <section className="dashboard-intro">
        <div>
          <span className="eyebrow">JEN MEGAADMIN</span>
          <h1>Ceny kotoučů</h1>
          <p>Kolik stojí nový kotouč daného typu. Z těchto cen počítá Analýza útrat úsporu reprofilace.</p>
        </div>
        <div className="dashboard-total"><span>Zadaných cen</span><strong>{prices.length}</strong><small>typů kotoučů</small></div>
      </section>

      <datalist id="price-manufacturers">{manufacturers.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      <datalist id="price-profiles">{profiles.map((p) => <option key={p.id} value={p.code} />)}</datalist>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <div className="card-title">Přidat cenu nového kotouče</div>
            <div className="card-subtitle">Výrobce a profil vyberte ze seznamu, nebo napište nový. Každý typ kotouče může mít jen jednu cenu.</div>
          </div>
        </div>
        {message && <div className={`admin-message ${message.ok ? "success" : "error"}`} role="status">{message.text}</div>}
        <form className="admin-user-form prices-form" onSubmit={(e) => void add(e)}>
          <div className="filter-field">
            <label htmlFor="price-manufacturer">Výrobce</label>
            <input id="price-manufacturer" list="price-manufacturers" value={draft.manufacturer} maxLength={50} required autoComplete="off"
              onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} placeholder="např. Tyrolit" />
          </div>
          <div className="filter-field">
            <label htmlFor="price-diameter">Průměr (mm)</label>
            <input id="price-diameter" inputMode="numeric" value={draft.diameter} required autoComplete="off"
              onChange={(e) => setDraft({ ...draft, diameter: e.target.value })} placeholder="např. 250" />
          </div>
          <div className="filter-field">
            <label htmlFor="price-profile">Profil</label>
            <input id="price-profile" list="price-profiles" value={draft.profile} maxLength={20} required autoComplete="off"
              onChange={(e) => setDraft({ ...draft, profile: e.target.value })} placeholder="např. C3" />
          </div>
          <div className="filter-field">
            <label htmlFor="price-price">Cena nového kotouče (Kč)</label>
            <input id="price-price" inputMode="decimal" value={draft.price} required autoComplete="off"
              onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="např. 18 000" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Ukládám…" : "Uložit"}</button>
        </form>
      </section>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <div className="card-title">Uložené ceny <span className="count-chip">{filterActive ? `${filtered.length} / ${prices.length}` : prices.length}</span></div>
            <div className="card-subtitle">Upravit můžete kterýkoli údaj. Sloupec „V evidenci“ ukazuje, kolik kotoučů tohoto typu máte.</div>
          </div>
          <button className="btn btn-secondary" type="button" disabled={prices.length === 0}
            onClick={() => void api.analytics.exportPrices().catch((err) => setMessage({ ok: false, text: err.message }))}>
            Stáhnout Excel
          </button>
        </div>

        <div className="admin-user-form prices-filter">
          <div className="filter-field">
            <label htmlFor="f-manufacturer">Výrobce</label>
            <select id="f-manufacturer" value={fManufacturer} onChange={(e) => setFManufacturer(e.target.value)}>
              <option value="">Všichni</option>
              {filterOptions.manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="f-diameter">Průměr</label>
            <select id="f-diameter" value={fDiameter} onChange={(e) => setFDiameter(e.target.value)}>
              <option value="">Všechny</option>
              {filterOptions.diameters.map((d) => <option key={d} value={d}>Ø {d} mm</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="f-profile">Profil</label>
            <select id="f-profile" value={fProfile} onChange={(e) => setFProfile(e.target.value)}>
              <option value="">Všechny</option>
              {filterOptions.profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="f-price-from">Cena od (Kč)</label>
            <input id="f-price-from" inputMode="decimal" value={fPriceFrom} onChange={(e) => setFPriceFrom(e.target.value)} placeholder="0" />
          </div>
          <div className="filter-field">
            <label htmlFor="f-price-to">Cena do (Kč)</label>
            <input id="f-price-to" inputMode="decimal" value={fPriceTo} onChange={(e) => setFPriceTo(e.target.value)} placeholder="bez omezení" />
          </div>
          <button className="btn btn-secondary" type="button" onClick={clearFilter} disabled={!filterActive}>Zrušit filtr</button>
        </div>

        <div className="data-table-container admin-table-container" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr><th>Výrobce</th><th>Průměr</th><th>Profil</th><th className="num">Cena nového</th><th className="num">V evidenci</th><th>Naposledy změnil</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((p) => editId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={7}>
                    <form className="admin-user-form prices-form" onSubmit={(e) => void saveEdit(e, p.id)}>
                      <div className="filter-field">
                        <label htmlFor={`e-m-${p.id}`}>Výrobce</label>
                        <input id={`e-m-${p.id}`} list="price-manufacturers" value={editDraft.manufacturer} maxLength={50} required
                          onChange={(e) => setEditDraft({ ...editDraft, manufacturer: e.target.value })} />
                      </div>
                      <div className="filter-field">
                        <label htmlFor={`e-d-${p.id}`}>Průměr (mm)</label>
                        <input id={`e-d-${p.id}`} inputMode="numeric" value={editDraft.diameter} required
                          onChange={(e) => setEditDraft({ ...editDraft, diameter: e.target.value })} />
                      </div>
                      <div className="filter-field">
                        <label htmlFor={`e-p-${p.id}`}>Profil</label>
                        <input id={`e-p-${p.id}`} list="price-profiles" value={editDraft.profile} maxLength={20} required
                          onChange={(e) => setEditDraft({ ...editDraft, profile: e.target.value })} />
                      </div>
                      <div className="filter-field">
                        <label htmlFor={`e-c-${p.id}`}>Cena (Kč)</label>
                        <input id={`e-c-${p.id}`} inputMode="decimal" value={editDraft.price} required autoFocus
                          onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} />
                      </div>
                      <button className="btn btn-primary" type="submit" disabled={busy}>Uložit změny</button>
                      <button className="btn btn-secondary" type="button" onClick={() => setEditId(null)}>Zrušit</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td><strong>{p.manufacturer}</strong></td>
                  <td>Ø {p.diameter} mm</td>
                  <td>{p.profile}</td>
                  <td className="num"><strong>{formatCzk(p.price)}</strong></td>
                  <td className="num">{p.wheels}</td>
                  <td>{p.updated_by_username} · {formatDate(p.updated_at)}</td>
                  <td className="prices-actions">
                    <button className="btn btn-secondary" type="button" onClick={() => startEdit(p)}>Upravit</button>
                    <button className="btn btn-danger" type="button" onClick={() => void remove(p)}>Smazat</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="admin-empty">{prices.length === 0 ? "Zatím žádná cena. Přidejte první nahoře." : "Filtru neodpovídá žádná cena."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
