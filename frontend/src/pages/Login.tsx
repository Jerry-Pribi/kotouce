import { useState } from "react";
import type { FormEvent } from "react";
import type { Portal } from "../api";
import { useAuth } from "../components/AuthContext";
import { PasswordField } from "../components/PasswordField";
import { ThemeToggle } from "../components/ThemeToggle";

const PORTAL_KEY = "kotouc_portal";

const PORTALS: Record<Portal, { eyebrow: string; title: string; lead: string; submit: string }> = {
  agc: {
    eyebrow: "AGC · CHUDEŘICE",
    title: "Management kotoučů",
    lead: "Přihlaste se pro pokračování do evidence.",
    submit: "Přihlásit se",
  },
  reprofilace: {
    eyebrow: "REPROFILACE · DODAVATEL",
    title: "Kotouče na reprofilaci",
    lead: "Účet pro firmu, která pro AGC přebrušuje kotouče.",
    submit: "Přihlásit se do reprofilace",
  },
};

function savedPortal(): Portal {
  try {
    return localStorage.getItem(PORTAL_KEY) === "reprofilace" ? "reprofilace" : "agc";
  } catch {
    return "agc";
  }
}

export function Login() {
  const { login } = useAuth();
  const [portal, setPortal] = useState<Portal>(savedPortal);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = PORTALS[portal];

  function choose(next: Portal) {
    setPortal(next);
    setError(null);
    try {
      localStorage.setItem(PORTAL_KEY, next);
    } catch {
      // bez úložiště se volba jen nezapamatuje
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try { await login(username, password, portal); }
    catch (err) { setError(err instanceof Error ? err.message : "Přihlášení se nezdařilo."); }
    finally { setBusy(false); }
  }

  return (
    <main className={`login-screen login-${portal}`}>
      <ThemeToggle className="theme-toggle login-theme" />
      <section className="login-card">
        <div className="login-portals" role="tablist" aria-label="Sekce">
          <button type="button" role="tab" aria-selected={portal === "agc"} className={portal === "agc" ? "active" : ""} onClick={() => choose("agc")}>
            <span className="login-portal-mark">AGC</span> AGC
          </button>
          <button type="button" role="tab" aria-selected={portal === "reprofilace"} className={portal === "reprofilace" ? "active" : ""} onClick={() => choose("reprofilace")}>
            <span className="login-portal-mark">⟳</span> Reprofilace
          </button>
        </div>
        <span className="eyebrow">{text.eyebrow}</span>
        <h1>{text.title}</h1>
        <p>{text.lead}</p>
        <form onSubmit={submit} className="login-form">
          <label className="filter-field"><span>Uživatelské jméno</span>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <PasswordField id="login-password" label="Heslo" autoComplete="current-password" value={password} onChange={setPassword} required />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn btn-primary login-submit" disabled={busy}>{busy ? "Ověřuji…" : text.submit}</button>
        </form>
      </section>
    </main>
  );
}
