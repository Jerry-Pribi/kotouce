import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HeaderNav } from "./components/HeaderNav";
import { Sidebar } from "./components/Sidebar";
import { AuthProvider, useAuth } from "./components/AuthContext";
import { Dashboard } from "./pages/Dashboard";
import { Wheels } from "./pages/Wheels";
import { WheelDetailPage } from "./pages/WheelDetailPage";
import { Locations } from "./pages/Locations";
import { Login } from "./pages/Login";
import { AdminPanel } from "./pages/AdminPanel";

function Workspace() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading">Ověřuji přihlášení…</div>;
  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-panel">
        <HeaderNav />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kotouce" element={<Wheels />} />
            <Route path="/kotouce/:id" element={<WheelDetailPage />} />
            <Route path="/lokace" element={<Locations />} />
            <Route path="/admin" element={user.role === "admin" ? <AdminPanel /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return <BrowserRouter><AuthProvider><Workspace /></AuthProvider></BrowserRouter>;
}

export default App;
