import { useNavigate } from "react-router-dom";

export function HeaderNav() {
  const navigate = useNavigate();

  return (
    <header className="site-header">
      <div className="header-context">
        <div className="context-breadcrumb"><span>AGC</span><b>/</b> Evidence nástrojů</div>
        <div className="header-meta">
          <div className="plant-chip"><span className="plant-dot" />Linky 1–3</div>
          <button className="btn-header-add" onClick={() => navigate("/kotouce?novy=1")} title="Evidovat nový kotouč">
            <span aria-hidden="true">＋</span> Přijmout kotouč
          </button>
        </div>
      </div>
    </header>
  );
}
