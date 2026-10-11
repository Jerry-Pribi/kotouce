import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { AdminSession, AdminUser } from "../api";

function formatDate(value: string | null) {
  if (!value) return "Nikdy";
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  return date.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedLoginUser, setExpandedLoginUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextUsers, nextSessions] = await Promise.all([api.adminUsers(), api.adminSessions()]);
    setUsers(nextUsers);
    setSessions(nextSessions);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Administraci se nepodařilo načíst."));
    const timer = window.setInterval(() => {
      void api.adminSessions().then(setSessions).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api.createAdminUser({ username, password, role });
      setUsername(""); setPassword(""); setRole("user");
      setNotice("Uživatelský účet byl vytvořen.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Účet se nepodařilo vytvořit."); }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`Opravdu odstranit účet „${user.username}“? Přihlášené relace budou ukončeny.`)) return;
    setError(null); setNotice(null);
    try {
      await api.deleteAdminUser(user.id);
      setNotice(`Účet ${user.username} byl odstraněn.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Účet se nepodařilo odstranit."); }
  }

  const activeCount = new Set(sessions.filter((session) => session.is_active).map((session) => session.username)).size;
  const loginUsers = useMemo(() => {
    const grouped = new Map<string, AdminSession[]>();
    for (const session of sessions) {
      const userSessions = grouped.get(session.username) ?? [];
      userSessions.push(session);
      grouped.set(session.username, userSessions);
    }
    return Array.from(grouped, ([name, userSessions]) => ({
      name,
      sessions: userSessions,
      latest: userSessions[0],
      isActive: userSessions.some((session) => session.is_active),
    }));
  }, [sessions]);

  return (
    <div className="admin-page">
      <div className="page-heading">
        <div><span className="eyebrow">SPRÁVA PŘÍSTUPŮ</span><h1>Administrace</h1><p>Uživatelé, přístupy a přehled přihlášení.</p></div>
        <div className="admin-online-count"><span className="sidebar-status-dot" />{activeCount} {activeCount === 1 ? "uživatel aktivní" : activeCount < 5 ? "uživatelé aktivní" : "uživatelů aktivních"}</div>
      </div>

      {error && <div className="admin-message error" role="alert">{error}</div>}
      {notice && <div className="admin-message success" role="status">{notice}</div>}

      <section className="card admin-create-card">
        <div className="card-header"><div><div className="card-title">Přidat uživatele</div><div className="card-subtitle">Nový účet může používat evidenci; administrátor může spravovat také uživatele.</div></div></div>
        <form onSubmit={addUser} className="admin-user-form">
          <div className="filter-field"><label htmlFor="new-username">Uživatelské jméno</label><input id="new-username" autoComplete="off" minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="např. operator1" /></div>
          <div className="filter-field"><label htmlFor="new-password">Dočasné heslo (min. 10 znaků)</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <div className="filter-field"><label htmlFor="new-role">Oprávnění</label><select id="new-role" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}><option value="user">Běžný uživatel</option><option value="admin">Administrátor</option></select></div>
          <button className="btn btn-primary" type="submit">＋ Vytvořit účet</button>
        </form>
      </section>

      <section className="card admin-section">
        <div className="card-header"><div><div className="card-title">Uživatelské účty <span className="count-chip">{users.length}</span></div><div className="card-subtitle">Odebráním účtu se ukončí i jeho aktivní přihlášení.</div></div></div>
        <div className="data-table-container admin-table-container"><table className="data-table"><thead><tr><th>Uživatel</th><th>Role</th><th>Vytvořen</th><th>Poslední přihlášení</th><th>Akce</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username}</strong></td><td><span className={`role-pill ${user.role}`}>{user.role === "admin" ? "Administrátor" : "Uživatel"}</span></td><td>{formatDate(user.created_at)}</td><td>{formatDate(user.last_login_at)}</td><td><button className="btn-remove-user" onClick={() => void removeUser(user)}>Odstranit</button></td></tr>)}
            {users.length === 0 && <tr><td colSpan={5} className="admin-empty">Zatím tu nejsou žádné účty.</td></tr>}</tbody></table></div>
      </section>

      <section className="card admin-section">
        <div className="card-header"><div><div className="card-title">Přihlašující</div><div className="card-subtitle">Kliknutím na jméno rozbalíte jeho historii přihlášení.</div></div><span className="count-chip">{loginUsers.length} uživatelů</span></div>
        <div className="login-user-list">
          {loginUsers.map((loginUser) => {
            const expanded = expandedLoginUser === loginUser.name;
            return <div className="login-user-group" key={loginUser.name}>
              <button className={`login-user-row ${expanded ? "expanded" : ""}`} aria-expanded={expanded} onClick={() => setExpandedLoginUser(expanded ? null : loginUser.name)}>
                <span className={`session-state ${loginUser.isActive ? "online" : "offline"}`}><i />{loginUser.isActive ? "Aktivní" : "Neaktivní"}</span>
                <strong className="login-user-name">{loginUser.name}</strong>
                <span className="login-user-last">Poslední přihlášení <b>{formatDate(loginUser.latest.created_at)}</b></span>
                <span className="login-user-count">{loginUser.sessions.length}× <span>přihlášení</span></span>
                <span className={`login-user-chevron ${expanded ? "open" : ""}`} aria-hidden="true">⌄</span>
              </button>
              {expanded && <div className="login-history-wrap"><table className="data-table login-history-table"><thead><tr><th>Přihlášení</th><th>Poslední aktivita</th><th>Stav relace</th><th>IP adresa</th><th>Zařízení / prohlížeč</th></tr></thead>
                <tbody>{loginUser.sessions.map((session) => <tr key={session.id}><td>{formatDate(session.created_at)}</td><td>{formatDate(session.last_seen_at)}</td><td><span className={`session-state ${session.is_active ? "online" : "offline"}`}><i />{session.is_active ? "Aktivní" : session.ended_at ? "Odhlášen" : "Neaktivní"}</span></td><td>{session.ip_address ?? "—"}</td><td className="session-agent" title={session.user_agent ?? ""}>{session.user_agent ?? "Neznámé zařízení"}</td></tr>)}</tbody></table></div>}
            </div>;
          })}
          {loginUsers.length === 0 && <div className="admin-empty">Zatím nejsou zaznamenaná žádná přihlášení.</div>}
        </div>
      </section>
    </div>
  );
}
