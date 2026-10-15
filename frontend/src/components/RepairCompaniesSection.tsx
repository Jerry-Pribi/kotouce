import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { RepairCompany } from "../api";
import { PasswordField } from "./PasswordField";

/**
 * Administrace AGC (jen megaAdmin): firmy reprofilace.
 * Novou firmu přidá jedním krokem i s jejím prvním účtem (megaAdmin firmy);
 * další účty si firma spravuje sama ve své administraci — AGC je nevidí.
 */
export function RepairCompaniesSection() {
  const [companies, setCompanies] = useState<RepairCompany[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Nová firma
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // První účet pro firmu, která už existuje (např. přidaná dřív v Lokacích)
  const [openId, setOpenId] = useState<number | null>(null);
  const [firstUser, setFirstUser] = useState("");
  const [firstPassword, setFirstPassword] = useState("");

  const load = () => api.repairCompanies().then(setCompanies).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const created = (firm: string, user: string) =>
    setMessage({ ok: true, text: `Firma ${firm} má účet „${user.trim().toLowerCase()}“ (megaAdmin firmy). Přihlásí se v sekci Reprofilace a další účty si založí sama.` });
  const failed = (err: unknown) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Nepodařilo se uložit." });

  async function addCompany(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await api.createRepairCompany(name, username, password);
      created(name.trim(), username);
      setName(""); setUsername(""); setPassword("");
      await load();
    } catch (err) { failed(err); }
  }

  async function addFirstAccount(event: FormEvent, company: RepairCompany) {
    event.preventDefault();
    setMessage(null);
    try {
      await api.createCompanyFirstAdmin(company.id, firstUser, firstPassword);
      created(company.name, firstUser);
      setOpenId(null); setFirstUser(""); setFirstPassword("");
      await load();
    } catch (err) { failed(err); }
  }

  async function endCooperation(company: RepairCompany) {
    const confirmed = window.confirm(
      `Opravdu ukončit spolupráci s firmou „${company.name}“? Její přihlášené relace se ukončí a její účty se nebudou moci přihlásit. Účty, kotouče a historie zůstanou zachované.`,
    );
    if (!confirmed) return;
    setMessage(null);
    try {
      await api.endRepairCompanyCooperation(company.id);
      setMessage({ ok: true, text: `Spolupráce s firmou ${company.name} byla ukončena.` });
      await load();
    } catch (err) { failed(err); }
  }

  async function restoreCooperation(company: RepairCompany) {
    setMessage(null);
    try {
      await api.restoreRepairCompanyCooperation(company.id);
      setMessage({ ok: true, text: `Spolupráce s firmou ${company.name} byla obnovena. Její uživatelé se mohou znovu přihlásit.` });
      await load();
    } catch (err) { failed(err); }
  }

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <div className="card-title">Firmy reprofilace <span className="count-chip">{companies.length}</span></div>
          <div className="card-subtitle">
            Jen pro megaAdmina AGC. Firma, která kotouče přebrušuje, má vlastní účty oddělené od AGC. Tady ji přidáte i s prvním účtem
            (jejím megaAdminem) — další účty si firma spravuje sama. Ukončením spolupráce zablokujete její přístup a odeberete ji z výběru firem;
            účty a historie zůstanou zachované a spolupráci lze obnovit.
          </div>
        </div>
      </div>
      {message && <div className={`admin-message ${message.ok ? "success" : "error"}`} role="status">{message.text}</div>}

      <form onSubmit={(e) => void addCompany(e)} className="admin-user-form">
        <div className="filter-field">
          <label htmlFor="firm-name">Název firmy</label>
          <input id="firm-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} placeholder="např. Tesch servis s.r.o." autoComplete="off" />
        </div>
        <div className="filter-field">
          <label htmlFor="firm-user">Uživatelské jméno prvního účtu</label>
          <input id="firm-user" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" placeholder="např. tesch-vedouci" autoComplete="off" />
        </div>
        <PasswordField id="firm-pass" label="Heslo (min. 10 znaků)" autoComplete="new-password" minLength={10} value={password} onChange={setPassword} required />
        <button className="btn btn-primary" type="submit">＋ Přidat firmu</button>
      </form>

      <div className="data-table-container admin-table-container repair-companies-table" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Firma</th><th>Účty firmy</th><th>Spolupráce</th><th /></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "repair-company-inactive"}>
                <td><strong>{c.name}</strong></td>
                <td>{c.accounts > 0 ? `${c.accounts} — spravuje si je firma` : "zatím žádný účet"}</td>
                <td><span className={`repair-company-status ${c.is_active ? "active" : "inactive"}`}>{c.is_active ? "Aktivní" : "Ukončená"}</span></td>
                <td>
                  {c.is_active && c.accounts === 0 && openId !== c.id && (
                    <button className="btn btn-secondary" onClick={() => { setOpenId(c.id); setMessage(null); }}>Založit první účet</button>
                  )}
                  {openId === c.id && (
                    <form className="admin-user-form" onSubmit={(e) => void addFirstAccount(e, c)}>
                      <div className="filter-field">
                        <label htmlFor={`firm-user-${c.id}`}>Uživatelské jméno</label>
                        <input id={`firm-user-${c.id}`} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" value={firstUser} onChange={(e) => setFirstUser(e.target.value)} required autoComplete="off" />
                      </div>
                      <PasswordField id={`firm-pass-${c.id}`} label="Heslo (min. 10 znaků)" autoComplete="new-password" minLength={10} value={firstPassword} onChange={setFirstPassword} required />
                      <button className="btn btn-primary" type="submit">Založit</button>
                      <button className="btn btn-secondary" type="button" onClick={() => setOpenId(null)}>Zrušit</button>
                    </form>
                  )}
                  {c.is_active
                    ? <button className="btn btn-danger" type="button" onClick={() => void endCooperation(c)}>Ukončit spolupráci</button>
                    : <button className="btn btn-secondary" type="button" onClick={() => void restoreCooperation(c)}>Obnovit spolupráci</button>}
                </td>
              </tr>
            ))}
            {companies.length === 0 && <tr><td colSpan={4} className="admin-empty">Zatím žádná firma reprofilace.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
