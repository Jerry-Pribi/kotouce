import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../components/AuthContext";

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try { await login(username, password); }
    catch (err) { setError(err instanceof Error ? err.message : "Přihlášení se nezdařilo."); }
    finally { setBusy(false); }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-mark">AGC</div>
        <span className="eyebrow">AGC · CHUDEŘICE</span>
        <h1>Management kotoučů</h1>
        <p>Přihlaste se pro pokračování do evidence.</p>
        <form onSubmit={submit} className="login-form">
          <label className="filter-field"><span>Uživatelské jméno</span>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <label className="filter-field"><span>Heslo</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn btn-primary login-submit" disabled={busy}>{busy ? "Ověřuji…" : "Přihlásit se"}</button>
        </form>
      </section>
    </main>
  );
}
