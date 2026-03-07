import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ToastProvider } from "./components/ui/toast";
import { DashboardPage } from "./pages/DashboardPage";
import { RifaDetailPage } from "./pages/RifaDetailPage";
import { RifaParticipantsPage } from "./pages/RifaParticipantsPage";
import { SorteioPage } from "./pages/SorteioPage";

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/rifas/:id" element={<RifaDetailPage />} />
            <Route path="/rifas/:id/participantes" element={<RifaParticipantsPage />} />
            <Route path="/sorteio" element={<SorteioPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
