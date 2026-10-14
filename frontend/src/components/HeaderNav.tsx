import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "./ThemeToggle";

export function HeaderNav() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="site-header">
      <div className="header-context">
        <div className="context-breadcrumb"><span>AGC</span><b>/</b> Management kotoučů</div>
        <div className="header-meta">
          <div className="plant-chip"><span className="plant-dot" />Linky 1–3</div>
          <div className="signed-in-user"><strong>{user?.username}</strong><span>{user?.role === "mega_admin" ? "Mega admin" : user?.role === "admin" ? "Admin" : "Uživatel"}</span></div>
          <ThemeToggle />
          <button className="header-logout" onClick={() => void logout()}>Odhlásit</button>
          <button className="btn-header-add" onClick={() => navigate("/kotouce?novy=1")} title="Přidat kotouč do evidence">
            <span aria-hidden="true">＋</span> Přidat kotouč
          </button>
        </div>
      </div>
    </header>
  );
}
