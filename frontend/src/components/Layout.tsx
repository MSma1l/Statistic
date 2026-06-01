import {
  BarChart3,
  Globe,
  ImageIcon,
  LinkIcon,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-brand-50 text-brand-700"
      : "text-slate-600 hover:bg-slate-100",
  ].join(" ");
}

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BarChart3 size={20} />
          </div>
          <span className="text-lg font-bold text-slate-800">Statistic</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavLink to="/" end className={navClass}>
            <BarChart3 size={18} /> Tablou de bord
          </NavLink>
          <NavLink to="/sites" className={navClass}>
            <Globe size={18} /> Site-uri (Pixel)
          </NavLink>
          <NavLink to="/links" className={navClass}>
            <LinkIcon size={18} /> Linkuri & QR
          </NavLink>
          <NavLink to="/gallery" className={navClass}>
            <ImageIcon size={18} /> Galerie
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/settings" className={navClass}>
              <SettingsIcon size={18} /> Utilizatori
            </NavLink>
          )}
        </nav>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="px-2 text-sm font-medium text-slate-700">
            {user?.full_name || user?.email}
          </div>
          <div className="mb-3 px-2 text-xs text-slate-400">{user?.email}</div>
          <button onClick={() => logout()} className="btn-ghost w-full">
            <LogOut size={16} /> Delogare
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
