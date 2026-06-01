import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import Links from "./pages/Links";
import LinkDetail from "./pages/LinkDetail";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import SiteDetail from "./pages/SiteDetail";
import Sites from "./pages/Sites";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Se încarcă…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/:id" element={<SiteDetail />} />
        <Route path="/links" element={<Links />} />
        <Route path="/links/:id" element={<LinkDetail />} />
        {user.is_admin && <Route path="/settings" element={<Settings />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
