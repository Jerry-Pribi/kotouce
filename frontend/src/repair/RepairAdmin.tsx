import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { AdminSession, AdminUser, UserDeletionAudit } from "../api";
import { useAuth } from "../components/AuthContext";
import { formatTime } from "./repairUi";

const ROLE = { mega_admin: "MegaAdmin", admin: "Administrátor", user: "Uživatel" } as Record<string, string>;

/**
 * Administrace firmy reprofilace — stejné funkce jako v AGC (účty, hesla, přihlášení, audit),
 * ale jen účty této firmy. AGC sem nevidí a firma nevidí účty AGC.
 */
export function RepairAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [deletions, setDeletions] = useState<UserDeletionAudit[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [openId, setOpenId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const isMega = me?.role === "mega_admin";

  const load = useCallback(async () => {
    const [u, s, d] = await Promise.all([api.repair.admin.users(), api.repair.admin.sessions(), api.repair.admin.deletions()]);
    setUsers(u);
    setSessions(s);
    setDeletions(d);
  }, []);

  useEffect(() => {
    void load().catch((e) => setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) }));
    const timer = window.setInterval(() => void api.repair.admin.sessions().then(setSessions).catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Stejná pravidla jako v AGC: megaAdmin spravuje všechny kromě sebe, admin jen běžné uživatele
  const canManage = (u: AdminUser) => u.id !== me?.id && u.role !== "mega_admin" && (isMega || u.role === "user");

  async function run(action: () => Promise<unknown>, ok: string) {
    setNotice(null);
    try {
      await action();
      setNotice({ ok: true, text: ok });
      await load();
      return true;
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.repair.admin.createUser({ username, password, role }), `Účet „${username.trim().toLowerCase()}“ je založený.`)) {
      setUsername(""); setPassword(""); setRole("user");
    }
  }

  const activeCount = new Set(sessions.filter((s) => s.is_active).map((s) => s.username)).size;

  return (
    <div>
      <div className="rp-head">
        <div>
          <h1>Administrace firmy</h1>
          <p>Účty vaší firmy. Jsou oddělené od AGC — AGC je nevidí a vy nevidíte účty AGC. {isMega ? "Jako megaAdmin spravujete i administrátory." : "Jako administrátor spravujete běžné uživatele."}</p>
        </div>
        <span className="rp-online on">{activeCount} {activeCount === 1 ? "uživatel teď pracuje" : "uživatelů teď pracuje"}</span>
      </div>

      {notice && <div className={`rp-notice ${notice.ok ? "ok" : "err"}`} role="status">{notice.text}</div>}

      <div className="rp-admin-grid">
        <section className="rp-panel">
          <h2>Nový účet</h2>
          <p>Uživatel vidí a hlásí zakázky. Administrátor navíc spravuje účty.</p>
          <form className="rp-form-row" onSubmit={create}>
            <div className="rp-field">
              <label htmlFor="ra-user">Uživatelské jméno</label>
              <input id="ra-user" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="např. brusic1" />
            </div>
            <div className="rp-field">
              <label htmlFor="ra-pass">Heslo (min. 10 znaků)</label>
              <input id="ra-pass" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="rp-field">
              <label htmlFor="ra-role">Oprávnění</label>
              <select id="ra-role" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
                <option value="user">Uživatel</option>
                {isMega && <option value="admin">Administrátor</option>}
              </select>
            </div>
            <button className="rp-btn rp-btn-amber" type="submit">＋ Založit účet</button>
          </form>
        </section>

        <section className="rp-panel">
          <h2>Účty firmy ({users.length})</h2>
          <p>Kliknutím na „Upravit“ změníte jméno nebo heslo. Změna hesla odhlásí daný účet ze všech zařízení.</p>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Účet</th><th>Oprávnění</th><th>Založen</th><th>Naposledy přihlášen</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.id}>
                    <tr>
                      <td><strong>{u.username}</strong>{u.id === me?.id && <span className="rp-muted"> (vy)</span>}</td>
                      <td><span className={`rp-role ${u.role}`}>{ROLE[u.role] ?? u.role}</span></td>
                      <td>{formatTime(u.created_at)}</td>
                      <td>{u.last_login_at ? formatTime(u.last_login_at) : "nikdy"}</td>
                      <td className="num">
                        {canManage(u) && (
                          <>
                            <button className="rp-btn rp-btn-line rp-btn-sm" onClick={() => { setOpenId(openId === u.id ? null : u.id); setNewName(u.username); setNewPassword(""); }}>Upravit</button>{" "}
                            <button className="rp-btn rp-btn-danger rp-btn-sm" onClick={() => {
                              if (window.confirm(`Opravdu odstranit účet „${u.username}“?`)) void run(() => api.repair.admin.deleteUser(u.id), `Účet ${u.username} je odstraněný.`);
                            }}>Odstranit</button>
                          </>
                        )}
                      </td>
                    </tr>
                    {openId === u.id && (
                      <tr>
                        <td colSpan={5}>
                          <form className="rp-inline-form" onSubmit={(e) => { e.preventDefault(); void run(() => api.repair.admin.rename(u.id, newName), "Jméno účtu je změněné.").then((ok) => ok && setOpenId(null)); }}>
                            <label htmlFor={`ra-name-${u.id}`}>Jméno</label>
                            <input id={`ra-name-${u.id}`} value={newName} onChange={(e) => setNewName(e.target.value)} required minLength={3} maxLength={32} />
                            <button className="rp-btn rp-btn-line rp-btn-sm" type="submit">Uložit jméno</button>
                          </form>
                          <form className="rp-inline-form" onSubmit={(e) => { e.preventDefault(); void run(() => api.repair.admin.resetPassword(u.id, newPassword), "Heslo je změněné, účet byl odhlášen.").then((ok) => ok && setOpenId(null)); }}>
                            <label htmlFor={`ra-pw-${u.id}`}>Nové heslo</label>
                            <input id={`ra-pw-${u.id}`} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
                            <button className="rp-btn rp-btn-line rp-btn-sm" type="submit">Uložit heslo</button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rp-panel">
          <h2>Přihlášení</h2>
          <p>Kdo se kdy přihlásil a z jakého zařízení (posledních 250 přihlášení vaší firmy).</p>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Účet</th><th>Stav</th><th>Přihlášen</th><th>Naposledy aktivní</th><th>Zařízení</th></tr></thead>
              <tbody>
                {sessions.slice(0, 50).map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.username}</strong></td>
                    <td><span className={`rp-online${s.is_active ? " on" : ""}`}>{s.is_active ? "pracuje" : s.ended_at ? "odhlášen" : "neaktivní"}</span></td>
                    <td>{formatTime(s.created_at)}</td>
                    <td>{formatTime(s.last_seen_at)}</td>
                    <td className="rp-muted" title={s.user_agent ?? ""}>{(s.user_agent ?? "neznámé").slice(0, 48)}</td>
                  </tr>
                ))}
                {sessions.length === 0 && <tr><td colSpan={5} className="rp-empty">Zatím žádné přihlášení.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rp-panel">
          <h2>Odstraněné účty</h2>
          <p>Kdo a kdy odstranil účet vaší firmy.</p>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Odstranil</th><th>Odstraněný účet</th><th>Oprávnění</th><th>Kdy</th></tr></thead>
              <tbody>
                {deletions.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.actor_username}</strong></td>
                    <td>{d.deleted_username}</td>
                    <td><span className={`rp-role ${d.deleted_role}`}>{ROLE[d.deleted_role] ?? d.deleted_role}</span></td>
                    <td>{formatTime(d.deleted_at)}</td>
                  </tr>
                ))}
                {deletions.length === 0 && <tr><td colSpan={4} className="rp-empty">Žádný účet zatím nebyl odstraněn.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
