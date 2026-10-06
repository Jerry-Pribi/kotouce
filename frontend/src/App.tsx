import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HeaderNav } from "./components/HeaderNav";
import { Dashboard } from "./pages/Dashboard";
import { Wheels } from "./pages/Wheels";
import { WheelDetailPage } from "./pages/WheelDetailPage";
import { Locations } from "./pages/Locations";

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <HeaderNav />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kotouce" element={<Wheels />} />
            <Route path="/kotouce/:id" element={<WheelDetailPage />} />
            <Route path="/lokace" element={<Locations />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
