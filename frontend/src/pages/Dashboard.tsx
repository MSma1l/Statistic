import { useQuery } from "@tanstack/react-query";
import { Globe, LinkIcon, MapPin, MousePointerClick, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard } from "../components/ui";
import { api, can, canLinksArea, type Site } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Overview {
  links_count: number;
  total: number;
  scans: number;
  clicks: number;
  top_links: { id: number; name: string; slug: string; location_label: string; kind: string; visits: number }[];
  by_location: { location: string; count: number }[];
  timeseries: { day: string; visits: number }[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const showSites = can(user, "sites");
  const showLinks = canLinksArea(user);
  const sites = useQuery({
    queryKey: ["sites"],
    enabled: showSites,
    queryFn: async () => (await api.get<Site[]>("/api/sites")).data,
  });
  const ov = useQuery({
    queryKey: ["links-overview"],
    enabled: showLinks,
    queryFn: async () => (await api.get<Overview>("/api/links/overview?days=30")).data,
  });

  return (
    <div>
      <PageHeader
        title={`Salut, ${user?.full_name || user?.email} 👋`}
        subtitle="Privire de ansamblu asupra tracking-ului tău (ultimele 30 de zile)."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {showSites && (
          <StatCard label="Site-uri urmărite" value={sites.data?.length ?? "—"} icon={<Globe size={18} />} />
        )}
        {showLinks && (
          <>
            <StatCard label="Linkuri & QR" value={ov.data?.links_count ?? "—"} icon={<LinkIcon size={18} />} />
            <StatCard label="Total intrări" value={ov.data?.total ?? "—"} icon={<MousePointerClick size={18} />} />
            <StatCard label="Scanări QR" value={ov.data?.scans ?? "—"} icon={<QrCode size={18} />} />
          </>
        )}
      </div>

      {!showLinks && (
        <div className="card text-sm text-slate-500">
          Contul tău are acces la {showSites ? "statistica pe site-uri (pixel)" : "secțiuni limitate"}.
          Folosește meniul din stânga.
        </div>
      )}

      {/* Evoluție intrări */}
      {showLinks && (
      <>
      <div className="card mb-6">
        <h2 className="mb-4 font-semibold text-slate-800">Intrări pe linkuri (în timp)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={ov.data?.timeseries ?? []}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1f47f5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1f47f5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="visits" name="Intrări" stroke="#1f47f5" strokeWidth={2} fill="url(#g)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top linkuri */}
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">
            🏆 Top linkuri (cele mai multe lead-uri)
          </h2>
          {!ov.data?.top_links.length || ov.data.top_links.every((l) => l.visits === 0) ? (
            <p className="text-sm text-slate-400">Încă nu sunt intrări.</p>
          ) : (
            <div className="space-y-2">
              {ov.data.top_links
                .filter((l) => l.visits > 0)
                .map((l, i) => (
                  <Link
                    key={l.id}
                    to={`/links/${l.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50"
                  >
                    <span className="w-5 text-center font-bold text-slate-300">{i + 1}</span>
                    <span className="text-brand-600">
                      {l.kind === "qr" ? <QrCode size={16} /> : <LinkIcon size={16} />}
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-700">{l.name}</span>
                    <span className="font-semibold text-slate-900">{l.visits}</span>
                  </Link>
                ))}
            </div>
          )}
        </div>

        {/* Unde s-au deschis cel mai mult */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <MapPin size={18} /> Unde s-au deschis cel mai mult
          </h2>
          {!ov.data?.by_location.length ? (
            <p className="text-sm text-slate-400">Încă nu sunt intrări.</p>
          ) : (
            <RankList
              items={ov.data.by_location.map((b) => ({ label: b.location, value: b.count }))}
            />
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function RankList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex justify-between text-sm">
            <span className="truncate pr-2 text-slate-700">{it.label}</span>
            <span className="font-medium text-slate-900">{it.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
