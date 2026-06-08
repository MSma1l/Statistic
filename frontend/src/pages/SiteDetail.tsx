import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MousePointerClick,
  Pencil,
  Trash2,
  Users,
  Eye,
  Activity,
  Clock,
  TrendingDown,
  Megaphone,
  Smartphone,
  Monitor,
  Tablet,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import HeatmapOverlay from "../components/HeatmapOverlay";
import JourneyModal from "../components/JourneyModal";
import LandingsTab from "../components/landing/LandingsTab";
import LivePatches from "../components/optimization/LivePatches";
import OptimizationSection from "../components/optimization/OptimizationSection";
import { CopyButton, Spinner, StatCard } from "../components/ui";
import { api, formatDuration, type Site } from "../lib/api";

const RANGES = [
  { label: "7 zile", value: 7 },
  { label: "30 zile", value: 30 },
  { label: "90 zile", value: 90 },
];

export default function SiteDetail() {
  const { id } = useParams();
  const siteId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  // Tab activ: dashboard-urile clasice („Analize") vs noul strat „Optimizare".
  const [tab, setTab] = useState<"analytics" | "optimize" | "landings" | "live">(
    "analytics"
  );
  const [heatPath, setHeatPath] = useState<string>("");
  const [scrollPath, setScrollPath] = useState<string>("");
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", domain: "", min_engagement_seconds: 5 });

  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: async () => (await api.get<Site>(`/api/sites/${siteId}`)).data,
  });

  const summary = useQuery({
    queryKey: ["summary", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/summary?days=${days}`)).data,
  });
  const ts = useQuery({
    queryKey: ["ts", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/timeseries?days=${days}`)).data,
  });
  const pages = useQuery({
    queryKey: ["pages", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/top-pages?days=${days}`)).data,
  });
  const elements = useQuery({
    queryKey: ["elements", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/top-elements?days=${days}`)).data,
  });
  const breakdown = useQuery({
    queryKey: ["breakdown", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/breakdown?days=${days}`)).data,
  });
  const paths = useQuery({
    queryKey: ["paths", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/paths?days=${days}`)).data,
  });
  const heatmap = useQuery({
    queryKey: ["heatmap", siteId, heatPath, days],
    enabled: !!heatPath,
    queryFn: async () =>
      (
        await api.get(
          `/api/analytics/${siteId}/heatmap?days=${days}&path=${encodeURIComponent(
            heatPath
          )}`
        )
      ).data,
  });
  const sessionsQ = useQuery({
    queryKey: ["sessions", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/sessions?days=${days}`)).data,
  });
  const engagementQ = useQuery({
    queryKey: ["engagement", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/engagement?days=${days}`)).data,
  });
  const campaignsQ = useQuery({
    queryKey: ["campaigns", siteId, days],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/campaigns?days=${days}`)).data,
  });
  const scrollmap = useQuery({
    queryKey: ["scrollmap", siteId, scrollPath, days],
    enabled: !!scrollPath,
    queryFn: async () =>
      (
        await api.get(
          `/api/analytics/${siteId}/scrollmap?days=${days}&path=${encodeURIComponent(
            scrollPath
          )}`
        )
      ).data,
  });

  const delMut = useMutation({
    mutationFn: async () => api.delete(`/api/sites/${siteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      nav("/sites");
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => api.patch(`/api/sites/${siteId}`, edit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site", siteId] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      setEditing(false);
    },
  });

  if (site.isLoading) return <Spinner />;
  if (!site.data) return <p>Site inexistent.</p>;

  return (
    <div>
      <button
        onClick={() => nav("/sites")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={16} /> Înapoi la site-uri
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          {editing ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label">Nume</label>
                <input
                  className="input"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Domeniu</label>
                <input
                  className="input"
                  value={edit.domain}
                  onChange={(e) => setEdit({ ...edit, domain: e.target.value })}
                />
              </div>
              <div>
                <label className="label" title="Vizitele cu timp activ sub această valoare nu se numără la timpul mediu / engagement">
                  Prag atenție (sec)
                </label>
                <input
                  type="number"
                  min={0}
                  max={600}
                  className="input w-28"
                  value={edit.min_engagement_seconds}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      min_engagement_seconds: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
              <button className="btn-primary" onClick={() => updateMut.mutate()}>
                Salvează
              </button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>
                Anulează
              </button>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                {site.data.name}
                <button
                  className="text-slate-300 hover:text-brand-600"
                  title="Editează"
                  onClick={() => {
                    setEdit({
                      name: site.data!.name,
                      domain: site.data!.domain,
                      min_engagement_seconds: site.data!.min_engagement_seconds,
                    });
                    setEditing(true);
                  }}
                >
                  <Pencil size={16} />
                </button>
              </h1>
              <p className="text-sm text-slate-500">
                {site.data.domain || "—"}
                <span className="ml-2 text-slate-400">
                  · prag atenție: {site.data.min_engagement_seconds}s
                </span>
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-slate-200">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-3 py-1.5 text-sm ${
                  days === r.value
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm("Ștergi acest site și toate datele lui?")) delMut.mutate();
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Tab-uri: separă dashboard-urile clasice de stratul de optimizare. */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {([
          { key: "analytics", label: "Analize" },
          { key: "optimize", label: "Optimizare" },
          { key: "landings", label: "Landinguri" },
          { key: "live", label: "Aplicare live" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "analytics" && (
        <>
      {/* Snippet de instalat */}
      <div className="card mb-6">
        <h2 className="mb-2 font-semibold text-slate-800">
          Cod de instalare (pune-l în &lt;head&gt; pe site-ul tău)
        </h2>
        <div className="flex items-center gap-3">
          <code className="flex-1 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-100">
            {site.data.snippet}
          </code>
          <CopyButton value={site.data.snippet || ""} />
        </div>
      </div>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Vizualizări" value={summary.data?.pageviews ?? "—"} icon={<Eye size={18} />} />
        <StatCard label="Vizitatori unici" value={summary.data?.visitors ?? "—"} icon={<Users size={18} />} />
        <StatCard label="Sesiuni" value={summary.data?.sessions ?? "—"} icon={<Activity size={18} />} />
        <StatCard label="Click-uri" value={summary.data?.clicks ?? "—"} icon={<MousePointerClick size={18} />} />
        <StatCard
          label="Timp mediu / pagină"
          value={summary.data ? formatDuration(summary.data.avg_seconds ?? 0) : "—"}
          icon={<Clock size={18} />}
        />
        <StatCard
          label="Bounce rate"
          value={summary.data ? `${summary.data.bounce_rate ?? 0}%` : "—"}
          icon={<TrendingDown size={18} />}
        />
      </div>

      {/* Evoluție în timp */}
      <div className="card mb-6">
        <h2 className="mb-4 font-semibold text-slate-800">Evoluție în timp</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={ts.data ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="pageviews" name="Vizualizări" stroke="#1f47f5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="clicks" name="Click-uri" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        {/* Top pagini */}
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Pagini populare</h2>
          <RankList
            items={(pages.data ?? []).map((p: any) => ({
              label: p.path,
              value: p.views,
            }))}
          />
        </div>
        {/* Top elemente apăsate */}
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Cele mai apăsate elemente</h2>
          <RankList
            items={(elements.data ?? []).map((e: any) => ({
              label: e.text || e.selector,
              value: e.clicks,
            }))}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Surse de trafic</h2>
          <RankList
            items={(breakdown.data?.referrers ?? []).map((r: any) => ({
              label: r.referrer,
              value: r.count,
            }))}
          />
        </div>
        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Dispozitive</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={breakdown.data?.devices ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="device" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Evenimente" fill="#1f47f5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sesiuni & vizitatori — povestea fiecărui om */}
      <div className="card mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Users size={18} className="text-brand-600" />
          <h2 className="font-semibold text-slate-800">Sesiuni & vizitatori</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Click pe o sesiune ca să vezi traseul detaliat: ce pagini a parcurs, unde a
          dat click, cât a stat și ce l-a interesat.
        </p>
        {sessionsQ.isLoading ? (
          <Spinner />
        ) : !sessionsQ.data?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Nicio sesiune încă.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">Când</th>
                  <th className="py-2 pr-3">Landing</th>
                  <th className="py-2 pr-3">Sursă</th>
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 pr-3 text-right">Pagini</th>
                  <th className="py-2 pr-3 text-right">Click-uri</th>
                  <th className="py-2 pr-3 text-right">Timp activ</th>
                </tr>
              </thead>
              <tbody>
                {(sessionsQ.data ?? []).map((s: any) => (
                  <tr
                    key={s.session_id}
                    onClick={() => setOpenSession(s.session_id)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="py-2 pr-3 text-slate-500">
                      {new Date(s.last_seen).toLocaleString("ro-RO", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="max-w-[180px] truncate py-2 pr-3 text-slate-700">
                      <code className="text-xs">{s.landing}</code>
                    </td>
                    <td className="max-w-[160px] truncate py-2 pr-3 text-slate-500">
                      {s.utm_campaign
                        ? `${s.utm_source} · ${s.utm_campaign}`
                        : s.referrer}
                    </td>
                    <td className="py-2 pr-3">
                      <DeviceBadge device={s.device} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.pageviews}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.clicks}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                      {formatDuration(s.active_s)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Timp pe pagină (engagement) */}
        <div className="card">
          <div className="mb-1 flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            <h2 className="font-semibold text-slate-800">Timp mediu pe pagină</h2>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Vizitele sub {site.data.min_engagement_seconds}s de atenție nu se numără
            (modifici pragul din ✏️ de lângă numele site-ului).
          </p>
          {!engagementQ.data?.length ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Încă nu s-a strâns timp de engagement.
            </p>
          ) : (
            <div className="space-y-2">
              {(engagementQ.data ?? []).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <code className="truncate pr-2 text-slate-700">{e.path}</code>
                  <span className="shrink-0 font-medium text-slate-900">
                    {formatDuration(e.avg_seconds)}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      · {e.views} vizite
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campanii (UTM) */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone size={18} className="text-fuchsia-500" />
            <h2 className="font-semibold text-slate-800">Campanii (UTM)</h2>
          </div>
          {!campaignsQ.data?.length ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Nicio campanie încă. Adaugă <code>?utm_source=…&utm_campaign=…</code> în
              linkurile tale.
            </p>
          ) : (
            <div className="space-y-2">
              {(campaignsQ.data ?? []).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700">
                    {c.source}
                    <span className="text-slate-400">
                      {" "}
                      · {c.medium} · {c.campaign}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-slate-900">
                    {c.sessions} ses.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Harta de atenție pe scroll */}
      <div className="card mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Atenție pe pagină (scroll)</h2>
          <select
            className="input max-w-xs"
            value={scrollPath}
            onChange={(e) => setScrollPath(e.target.value)}
          >
            <option value="">Alege o pagină…</option>
            {(pages.data ?? []).map((p: any) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
        </div>
        {!scrollPath ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Selectează o pagină ca să vezi până unde derulează vizitatorii.
          </p>
        ) : scrollmap.isLoading ? (
          <Spinner />
        ) : (
          <ScrollCurve data={scrollmap.data} />
        )}
      </div>

      {/* Heatmap */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Hartă de click-uri (heatmap)</h2>
          <select
            className="input max-w-xs"
            value={heatPath}
            onChange={(e) => setHeatPath(e.target.value)}
          >
            <option value="">Alege o pagină…</option>
            {(paths.data ?? []).map((p: any) => (
              <option key={p.path} value={p.path}>
                {p.path} ({p.clicks} click-uri)
              </option>
            ))}
          </select>
        </div>
        {!heatPath ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Selectează o pagină pentru a vedea unde apasă vizitatorii, peste pagina reală.
          </p>
        ) : heatmap.isLoading ? (
          <Spinner />
        ) : (
          <HeatmapOverlay
            siteId={siteId}
            path={heatPath}
            domain={site.data.domain}
            data={heatmap.data}
          />
        )}
      </div>

        </>
      )}

      {/* Optimizare (A/B Marketing + AI) — pâlnie, comparație, recomandări */}
      {tab === "optimize" && (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            Compară landing-uri și campanii pe pâlnia de conversie și cere AI-ului
            recomandări concrete, ancorate în datele tale.
          </p>
          <OptimizationSection siteId={siteId} days={days} paths={pages.data ?? []} />
        </div>
      )}

      {/* Landinguri găzduite + buclă de aplicare AI */}
      {tab === "landings" && <LandingsTab siteId={siteId} />}

      {/* Faza 3 — patch-uri DOM live aplicate de t.js pe pagina reală */}
      {tab === "live" && (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            Aplică schimbări mici (text/culoare/atribut) direct pe pagina reală a
            site-ului tău, prin pixel — fără să atingi codul. Fiecare patch trece prin
            poarta risc × gardian GDPR; cele blocate nu pot fi puse live.
          </p>
          <LivePatches siteId={siteId} paths={pages.data ?? []} />
        </div>
      )}

      {openSession && (
        <JourneyModal
          siteId={siteId}
          sessionId={openSession}
          onClose={() => setOpenSession(null)}
        />
      )}
    </div>
  );
}

function DeviceBadge({ device }: { device: string }) {
  const icon =
    device === "mobile" ? (
      <Smartphone size={14} />
    ) : device === "tablet" ? (
      <Tablet size={14} />
    ) : device === "desktop" ? (
      <Monitor size={14} />
    ) : (
      <Activity size={14} />
    );
  return (
    <span className="inline-flex items-center gap-1 text-slate-500">
      {icon}
      <span className="text-xs capitalize">{device}</span>
    </span>
  );
}

function ScrollCurve({ data }: { data: any }) {
  const curve: { depth: number; pct: number; sessions: number }[] = data?.curve ?? [];
  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Din {data?.base_sessions ?? 0} sesiuni care au deschis pagina, câte ajung la
        fiecare adâncime. Acolo unde procentul scade brusc, vizitatorii „abandonează".
      </p>
      <div className="space-y-3">
        {curve.map((c) => (
          <div key={c.depth} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-right text-sm font-medium text-slate-600">
              {c.depth}%
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
              <div
                className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-brand-400 to-brand-600 px-2 text-xs font-medium text-white transition-all"
                style={{ width: `${Math.max(c.pct, 3)}%` }}
              >
                {c.pct}%
              </div>
            </div>
            <span className="w-16 shrink-0 text-xs text-slate-400">
              {c.sessions} ses.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankList({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length)
    return <p className="text-sm text-slate-400">Niciun date încă.</p>;
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
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
