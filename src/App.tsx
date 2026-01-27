import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthCallback } from "./pages/AuthCallback";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";

export default function App() {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const callbackPath = `${normalizedBase}auth/callback`;

  if (window.location.pathname === callbackPath && !window.location.hash) {
    const target = `${normalizedBase}#/auth/callback${window.location.search}`;
    window.location.replace(target);
    return null;
  }

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
