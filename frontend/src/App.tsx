import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { can, canLinksArea } from "./lib/api";
import { useAuth } from "./lib/auth";

// Lazy-load pe pagini: chunk-ul inițial (login + shell) rămâne mic, iar paginile
// grele (SiteDetail cu Recharts) se descarcă doar la nevoie.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Links = lazy(() => import("./pages/Links"));
const LinkDetail = lazy(() => import("./pages/LinkDetail"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const SiteDetail = lazy(() => import("./pages/SiteDetail"));
const Sites = lazy(() => import("./pages/Sites"));

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
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          {can(user, "sites") && <Route path="/sites" element={<Sites />} />}
          {can(user, "sites") && <Route path="/sites/:id" element={<SiteDetail />} />}
          {canLinksArea(user) && <Route path="/links" element={<Links />} />}
          {canLinksArea(user) && <Route path="/links/:id" element={<LinkDetail />} />}
          {canLinksArea(user) && <Route path="/gallery" element={<Gallery />} />}
          {user.is_admin && <Route path="/settings" element={<Settings />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
