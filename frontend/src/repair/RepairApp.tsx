import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../components/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";
import type { RepairSummary } from "../types";
import { RepairAdmin } from "./RepairAdmin";
import { RepairBoard } from "./RepairBoard";
import { RepairHistory } from "./RepairHistory";
import { RepairWheelPage } from "./RepairWheelPage";
import "./repair.css";

const ROLE_LABELS = { mega_admin: "MegaAdmin firmy", admin: "Administrátor", user: "Uživatel" } as Record<string, string>;

/**
 * Aplikace pro firmu, která pro AGC přebrušuje kotouče.
 * Vidí jen kotouče, které má u sebe (a historii svých reprofilací), a má vlastní účty a administraci.
 */
export function RepairApp() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [summary, setSummary] = useState<RepairSummary | null>(null);
  const isAdmin = user?.role === "admin" || user?.role === "mega_admin";

  const reloadSummary = useCallback(() => {
    api.repair.summary().then(setSummary).catch(() => undefined);
  }, []);

  useEffect(() => {
    reloadSummary();
  }, [reloadSummary, pathname]);

  const open = summary ? summary.waiting + summary.in_progress : 0;
  const company = user?.location?.name ?? summary?.location ?? "Firma reprofilace";
  const links = [
    { to: "/", label: "Zakázky", icon: "▦", count: open, end: true },
    { to: "/historie", label: "Historie", icon: "☰", count: 0, end: false },
    ...(isAdmin ? [{ to: "/administrace", label: "Administrace", icon: "⚙", count: 0, end: false }] : []),
  ];
  const nav = (
    <>
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `rp-nav-link${isActive ? " active" : ""}`}>
          <span className="rp-nav-icon" aria-hidden="true">{l.icon}</span>
          <span>{l.label}</span>
          {l.count > 0 && <span className="rp-nav-count">{l.count}</span>}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="rp-app">
      <aside className="rp-side" aria-label="Menu">
        <div className="rp-brand">
          <span className="rp-brand-mark" aria-hidden="true" />
          <div>
            <div className="rp-brand-name">{company}</div>
            <div className="rp-brand-sub">Reprofilace kotoučů pro AGC</div>
          </div>
        </div>
        <nav>{nav}</nav>
        <div className="rp-side-foot">
          <div className="rp-me">
            <span className="rp-me-avatar" aria-hidden="true">{user?.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user?.username}</strong>
              <span>{ROLE_LABELS[user?.role ?? "user"]}</span>
            </div>
          </div>
          <div className="rp-side-buttons">
            <ThemeToggle className="theme-toggle rp-side-btn" />
            <button className="rp-side-btn" onClick={() => void logout()}>Odhlásit se</button>
          </div>
        </div>
      </aside>

      <header className="rp-mobile-top">
        <span className="rp-brand-mark" aria-hidden="true" />
        <div>
          <div className="rp-brand-name">{company}</div>
          <div className="rp-brand-sub">{user?.username}</div>
        </div>
        <ThemeToggle className="theme-toggle rp-side-btn" />
        <button className="rp-side-btn" onClick={() => void logout()}>Odhlásit</button>
      </header>

      <main className="rp-main">
        <Routes>
          <Route path="/" element={<RepairBoard summary={summary} onChanged={reloadSummary} />} />
          <Route path="/historie" element={<RepairHistory />} />
          <Route path="/kotouc/:id" element={<RepairWheelPage onChanged={reloadSummary} />} />
          {isAdmin && <Route path="/administrace" element={<RepairAdmin />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="rp-tabbar" aria-label="Menu">{nav}</nav>
    </div>
  );
}
