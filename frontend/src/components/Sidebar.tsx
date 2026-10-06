import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Přehled", end: true },
  { to: "/kotouce", label: "Kotouče" },
  { to: "/lokace", label: "Lokace" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-title">Kotouč Manager</div>
        <div className="sidebar-brand-sub">AGC AUTOMOTIVE CZECH</div>
      </div>
      <nav className="sidebar-nav">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        Databáze diamantových brusných kotoučů — evidence počtu, typu, lokace,
        stavu a nabroušených metrů.
      </div>
    </aside>
  );
}
