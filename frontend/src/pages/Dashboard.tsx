import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Eye,
  Globe,
  LinkIcon,
  MapPin,
  MousePointerClick,
  QrCode,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
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

interface TopItem {
  id: number;
  name: string;
  slug: string;
  location_label: string;
  kind: string;
  visits: number;
}
interface LinksOverview {
  links_count: number;
  total: number;
  scans: number;
  clicks: number;
  top_links: TopItem[];
  top_qr: TopItem[];
  by_location: { location: string; count: number }[];
  timeseries: { day: string; visits: number }[];
}
interface PixelOverview {
  sites_count: number;
  pageviews: number;
  clicks: number;
  visitors: number;
  sessions: number;
  top_sites: { id: number; name: string; domain: string; views: number }[];
  top_pages: { path: string; views: number }[];
  timeseries: { day: string; pageviews: number; clicks: number }[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const showSites = can(user, "sites");
  const showLinks = canLinksArea(user);
  const [tab, setTab] = useState<"pixel" | "links">(showSites ? "pixel" : "links");

  const pix = useQuery({
    queryKey: ["pixel-overview"],
    enabled: showSites,
    queryFn: async () =>
      (await api.get<PixelOverview>("/api/analytics/overview?days=30")).data,
  });
  const sites = useQuery({
    queryKey: ["sites"],
    enabled: showSites,
    queryFn: async () => (await api.get<Site[]>("/api/sites")).data,
  });
  const ov = useQuery({
    queryKey: ["links-overview"],
    enabled: showLinks,
    queryFn: async () =>
      (await api.get<LinksOverview>("/api/links/overview?days=30")).data,
  });

  // Pagini de top apar DOAR după ce apeși pe un site anume.
  const [selectedSite, setSelectedSite] = useState<{ id: number; name: string } | null>(
    null
  );
  const sitePages = useQuery({
    queryKey: ["site-top-pages", selectedSite?.id],
    enabled: !!selectedSite,
    queryFn: async () =>
      (
        await api.get<{ path: string; views: number }[]>(
          `/api/analytics/${selectedSite!.id}/top-pages?days=30`
        )
      ).data,
  });

  const tabs: { key: "pixel" | "links"; label: string; icon: ReactNode }[] = [];
  if (showSites) tabs.push({ key: "pixel", label: "Pixel", icon: <Globe size={16} /> });
  if (showLinks) tabs.push({ key: "links", label: "Linkuri & QR", icon: <LinkIcon size={16} /> });

  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  return (
    <div>
      <PageHeader
        title={`Salut, ${user?.full_name || user?.email} 👋`}
        subtitle="Privire de ansamblu (ultimele 30 de zile)."
      />

      {/* Taburi */}
      {tabs.length > 1 && (
        <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                active === t.key
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ===== TAB PIXEL ===== */}
      {active === "pixel" && showSites && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Site-uri" value={pix.data?.sites_count ?? sites.data?.length ?? "—"} icon={<Globe size={18} />} />
            <StatCard label="Vizualizări" value={pix.data?.pageviews ?? "—"} icon={<Eye size={18} />} />
            <StatCard label="Vizitatori unici" value={pix.data?.visitors ?? "—"} icon={<Users size={18} />} />
            <StatCard label="Click-uri" value={pix.data?.clicks ?? "—"} icon={<MousePointerClick size={18} />} />
          </div>

          <div className="card">
            <h2 className="mb-4 font-semibold text-slate-800">Trafic în timp (toate site-urile)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={pix.data?.timeseries ?? []}>
                <defs>
                  <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1f47f5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1f47f5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="pageviews" name="Vizualizări" stroke="#1f47f5" strokeWidth={2} fill="url(#gp)" />
                <Area type="monotone" dataKey="clicks" name="Click-uri" stroke="#22c55e" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h2 className="mb-1 font-semibold text-slate-800">🏆 Site-uri de top</h2>
              <p className="mb-3 text-xs text-slate-400">Apasă pe un site ca să-i vezi paginile de top.</p>
              {!pix.data?.top_sites.some((s) => s.views > 0) ? (
                <p className="text-sm text-slate-400">Încă nu sunt vizualizări.</p>
              ) : (
                <div className="space-y-1">
                  {pix.data.top_sites
                    .filter((s) => s.views > 0)
                    .map((s, i) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSite({ id: s.id, name: s.name })}
                        className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                          selectedSite?.id === s.id
                            ? "bg-brand-50 ring-1 ring-brand-200"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-5 text-center font-bold text-slate-300">{i + 1}</span>
                        <Globe size={16} className="text-brand-600" />
                        <span className="flex-1 truncate text-sm text-slate-700">
                          {s.name}
                          {s.domain && <span className="ml-1 text-slate-400">({s.domain})</span>}
                        </span>
                        <span className="font-semibold text-slate-900">{s.views}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Frame Pagini de top — apare DOAR după ce alegi un site */}
            <div className="card">
              {!selectedSite ? (
                <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center text-sm text-slate-400">
                  <Globe size={24} className="mb-2 text-slate-300" />
                  Selectează un site din stânga ca să-i vezi paginile de top.
                </div>
              ) : (
                <>
                  <h2 className="mb-3 font-semibold text-slate-800">
                    📄 Pagini de top — {selectedSite.name}
                  </h2>
                  {sitePages.isLoading ? (
                    <p className="text-sm text-slate-400">Se încarcă…</p>
                  ) : !sitePages.data?.length ? (
                    <p className="text-sm text-slate-400">Acest site nu are încă vizualizări.</p>
                  ) : (
                    <RankList items={sitePages.data.map((p) => ({ label: p.path, value: p.views }))} />
                  )}
                  <Link
                    to={`/sites/${selectedSite.id}`}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-white transition hover:bg-brand-700"
                  >
                    <BarChart3 size={26} className="shrink-0" />
                    <span className="flex-1 text-left">
                      <span className="block text-base font-semibold">
                        Vezi toată statistica site-ului
                      </span>
                      <span className="block text-xs text-brand-100">
                        vizitatori, heatmap, sesiuni, surse de trafic, scroll, campanii
                      </span>
                    </span>
                    <ArrowRight size={20} className="shrink-0" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB LINKURI & QR ===== */}
      {active === "links" && showLinks && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Linkuri & QR" value={ov.data?.links_count ?? "—"} icon={<LinkIcon size={18} />} />
            <StatCard label="Total intrări" value={ov.data?.total ?? "—"} icon={<MousePointerClick size={18} />} />
            <StatCard label="Click-uri link" value={ov.data?.clicks ?? "—"} icon={<LinkIcon size={18} />} />
            <StatCard label="Scanări QR" value={ov.data?.scans ?? "—"} icon={<QrCode size={18} />} />
          </div>

          <div className="card">
            <h2 className="mb-4 font-semibold text-slate-800">Intrări pe linkuri (în timp)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={ov.data?.timeseries ?? []}>
                <defs>
                  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1f47f5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1f47f5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="visits" name="Intrări" stroke="#1f47f5" strokeWidth={2} fill="url(#gl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TopLinkList title="🏆 Top Linkuri" items={ov.data?.top_links ?? []} icon={<LinkIcon size={16} />} />
            <TopLinkList title="🏆 Top QR coduri" items={ov.data?.top_qr ?? []} icon={<QrCode size={16} />} />
          </div>

          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <MapPin size={18} /> Unde s-au deschis cel mai mult
            </h2>
            {!ov.data?.by_location.length ? (
              <p className="text-sm text-slate-400">Încă nu sunt intrări.</p>
            ) : (
              <RankList items={ov.data.by_location.map((b) => ({ label: b.location, value: b.count }))} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TopLinkList({ title, items, icon }: { title: string; items: TopItem[]; icon: ReactNode }) {
  const visible = items.filter((l) => l.visits > 0);
  return (
    <div className="card">
      <h2 className="mb-4 font-semibold text-slate-800">{title}</h2>
      {!visible.length ? (
        <p className="text-sm text-slate-400">Încă nu sunt intrări.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((l, i) => (
            <Link key={l.id} to={`/links/${l.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
              <span className="w-5 text-center font-bold text-slate-300">{i + 1}</span>
              <span className="text-brand-600">{icon}</span>
              <span className="flex-1 truncate text-sm text-slate-700">{l.name}</span>
              <span className="font-semibold text-slate-900">{l.visits}</span>
            </Link>
          ))}
        </div>
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
