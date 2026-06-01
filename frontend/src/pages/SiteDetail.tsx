import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MousePointerClick, Pencil, Trash2, Users, Eye, Activity } from "lucide-react";
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
import HeatmapCanvas from "../components/HeatmapCanvas";
import { CopyButton, Spinner, StatCard } from "../components/ui";
import { api, type Site } from "../lib/api";

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
  const [heatPath, setHeatPath] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", domain: "" });

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
                    setEdit({ name: site.data!.name, domain: site.data!.domain });
                    setEditing(true);
                  }}
                >
                  <Pencil size={16} />
                </button>
              </h1>
              <p className="text-sm text-slate-500">{site.data.domain || "—"}</p>
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
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Vizualizări" value={summary.data?.pageviews ?? "—"} icon={<Eye size={18} />} />
        <StatCard label="Vizitatori unici" value={summary.data?.visitors ?? "—"} icon={<Users size={18} />} />
        <StatCard label="Sesiuni" value={summary.data?.sessions ?? "—"} icon={<Activity size={18} />} />
        <StatCard label="Click-uri" value={summary.data?.clicks ?? "—"} icon={<MousePointerClick size={18} />} />
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
            Selectează o pagină pentru a vedea unde apasă vizitatorii.
          </p>
        ) : heatmap.isLoading ? (
          <Spinner />
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate-500">
              {heatmap.data?.count ?? 0} click-uri pe <code>{heatPath}</code>.
              Pozițiile sunt relative la dimensiunea paginii.
            </p>
            <HeatmapCanvas points={heatmap.data?.points ?? []} />
          </div>
        )}
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
