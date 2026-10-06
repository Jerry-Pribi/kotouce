import { NavLink, useNavigate } from "react-router-dom";

export function HeaderNav() {
  const navigate = useNavigate();

  return (
    <header className="site-header">
      <div className="header-top">
        <div className="brand-section">
          <span className="brand-badge">AGC</span>
          <div className="brand-text">
            <span className="brand-title">Správa brusných kotoučů</span>
            <span className="brand-subtitle">AGC Automotive Czech a.s. · Závod Chudeřice</span>
          </div>
        </div>

        <div className="header-meta">
          <div className="plant-chip">
            <span className="plant-dot"></span>
            <span>Úsek broušení hran · Linky 1–3</span>
          </div>
          <button
            className="btn-header-add"
            onClick={() => navigate("/kotouce?novy=1")}
            title="Evidovat nový kotouč do systému"
          >
            + Příjem nového kotouče
          </button>
        </div>
      </div>

      <nav className="header-nav">
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
            Pult přehledu
          </NavLink>
          <NavLink to="/kotouce" className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
            Kotouče v oběhu
          </NavLink>
          <NavLink to="/lokace" className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
            Pracoviště a sklady
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
