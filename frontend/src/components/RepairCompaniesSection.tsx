import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { RepairCompany } from "../api";
import { PasswordField } from "./PasswordField";

/**
 * Administrace AGC: firmy reprofilace. AGC firmě založí jen první účet (jejího megaAdmina);
 * další účty si firma spravuje sama ve své administraci — AGC je nevidí.
 */
export function RepairCompaniesSection() {
  const [companies, setCompanies] = useState<RepairCompany[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api.repairCompanies().then(setCompanies).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent, company: RepairCompany) {
    event.preventDefault();
    setMessage(null);
    try {
      await api.createCompanyFirstAdmin(company.id, username, password);
      setMessage({ ok: true, text: `Firma ${company.name} má účet „${username.trim().toLowerCase()}“ (megaAdmin firmy). Přihlásí se v sekci Reprofilace a další účty si založí sama.` });
      setOpenId(null);
      setUsername("");
      setPassword("");
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Účet se nepodařilo založit." });
    }
  }

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <div className="card-title">Firmy reprofilace <span className="count-chip">{companies.length}</span></div>
          <div className="card-subtitle">
            Jen pro megaAdmina AGC. Firma, která kotouče přebrušuje, má vlastní účty oddělené od AGC. Tady jí založíte jen první účet (jejího megaAdmina) —
            další si spravuje sama. Novou firmu přidáte v Lokace a pracoviště jako stanoviště typu Reprofilace.
          </div>
        </div>
      </div>
      {message && <div className={`admin-message ${message.ok ? "success" : "error"}`} role="status">{message.text}</div>}
      <div className="data-table-container admin-table-container">
        <table className="data-table">
          <thead><tr><th>Firma / místo reprofilace</th><th>Účty firmy</th><th /></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.accounts > 0 ? `${c.accounts} — spravuje si je firma` : "zatím žádný účet"}</td>
                <td>
                  {c.accounts === 0 && openId !== c.id && (
                    <button className="btn btn-secondary" onClick={() => { setOpenId(c.id); setMessage(null); }}>Založit první účet</button>
                  )}
                  {openId === c.id && (
                    <form className="admin-user-form" onSubmit={(e) => void create(e, c)}>
                      <div className="filter-field">
                        <label htmlFor={`firm-user-${c.id}`}>Uživatelské jméno</label>
                        <input id={`firm-user-${c.id}`} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
                      </div>
                      <PasswordField id={`firm-pass-${c.id}`} label="Heslo (min. 10 znaků)" autoComplete="new-password" minLength={10} value={password} onChange={setPassword} required />
                      <button className="btn btn-primary" type="submit">Založit</button>
                      <button className="btn btn-secondary" type="button" onClick={() => setOpenId(null)}>Zrušit</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {companies.length === 0 && <tr><td colSpan={3} className="admin-empty">Zatím žádné místo reprofilace.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
