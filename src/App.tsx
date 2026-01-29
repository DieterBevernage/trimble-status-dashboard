import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthCallback } from "./pages/AuthCallback";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
