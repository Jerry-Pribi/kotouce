import { NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext";

const LINKS = [
  { to: "/", label: "Přehled", end: true, icon: "◫" },
  { to: "/kotouce", label: "Evidence kotoučů", icon: "◉" },
  { to: "/lokace", label: "Lokace a pracoviště", icon: "⌖" },
];

export function Sidebar() {
  const { user } = useAuth();
  const links = user?.role !== "user" ? [...LINKS, { to: "/admin", label: "Administrace", icon: "⚙" }] : LINKS;
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-mark">AGC</div>
        <div><div className="sidebar-brand-title">Management kotoučů</div>
        <div className="sidebar-brand-sub">CHUDEŘICE · BROUŠENÍ</div></div>
      </div>
      <div className="sidebar-section-label">SPRÁVA PROVOZU</div>
      <nav className="sidebar-nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            title={l.label}
            aria-label={l.label}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
          >
            <span className="sidebar-icon" aria-hidden="true">{l.icon}</span>
            <span>{l.label}</span>
            <span className="sidebar-arrow" aria-hidden="true">›</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-status-dot" /> Systém evidence nástrojů
      </div>
    </aside>
  );
}
