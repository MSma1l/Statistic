import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, MousePointerClick, QrCode, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CopyButton, Spinner, StatCard } from "../components/ui";
import { api, API_URL, extractError, type TrackedLink } from "../lib/api";

export default function LinkDetail() {
  const { id } = useParams();
  const linkId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [dest, setDest] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  const link = useQuery({
    queryKey: ["link", linkId],
    queryFn: async () => (await api.get<TrackedLink>(`/api/links/${linkId}`)).data,
  });
  const stats = useQuery({
    queryKey: ["link-stats", linkId],
    queryFn: async () => (await api.get(`/api/links/${linkId}/stats`)).data,
  });

  useEffect(() => {
    if (link.data) {
      setDest(link.data.destination_url);
      setActive(link.data.is_active);
    }
  }, [link.data]);

  const saveMut = useMutation({
    mutationFn: async () =>
      api.patch(`/api/links/${linkId}`, { destination_url: dest, is_active: active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["link", linkId] });
      qc.invalidateQueries({ queryKey: ["links"] });
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  const delMut = useMutation({
    mutationFn: async () => api.delete(`/api/links/${linkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      nav("/links");
    },
  });

  async function downloadQr(fmt: "png" | "svg") {
    const res = await api.get(`/api/links/${linkId}/qr.${fmt}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${link.data?.slug || "qr"}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (link.isLoading) return <Spinner />;
  if (!link.data) return <p>Link inexistent.</p>;

  return (
    <div>
      <button
        onClick={() => nav("/links")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={16} /> Înapoi la linkuri
      </button>

      <h1 className="text-2xl font-bold text-slate-900">
        {link.data.name || link.data.slug}
      </h1>
      <div className="mb-6 flex items-center gap-2 text-sm">
        <span className="text-brand-600">{link.data.short_url}</span>
        <CopyButton value={link.data.short_url} label="Link" />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Total intrări" value={stats.data?.total ?? "—"} icon={<MousePointerClick size={18} />} />
        <StatCard label="Scanări QR" value={stats.data?.scans ?? "—"} icon={<QrCode size={18} />} />
        <StatCard label="Click-uri link" value={stats.data?.clicks ?? "—"} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {/* QR */}
        <div className="card flex flex-col items-center">
          <h2 className="mb-3 w-full font-semibold text-slate-800">QR Code</h2>
          <img
            src={`${API_URL}/api/links/${linkId}/qr.png`}
            alt="QR"
            className="h-44 w-44 rounded-xl border border-slate-200"
          />
          {link.data.location_label && (
            <p className="mt-2 text-sm text-slate-500">📍 {link.data.location_label}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn-ghost" onClick={() => downloadQr("png")}>
              <Download size={16} /> PNG
            </button>
            <button className="btn-ghost" onClick={() => downloadQr("svg")}>
              <Download size={16} /> SVG
            </button>
          </div>
        </div>

        {/* Editare */}
        <div className="card col-span-2">
          <h2 className="mb-3 font-semibold text-slate-800">Setări</h2>
          <label className="label">Destinație (editabilă — slug-ul rămâne pe viață)</label>
          <input className="input" value={dest} onChange={(e) => setDest(e.target.value)} />
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Link activ
          </label>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save size={16} /> Salvează
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm("Ștergi acest link și statisticile lui?")) delMut.mutate();
              }}
            >
              <Trash2 size={16} /> Șterge
            </button>
          </div>
        </div>
      </div>

      {/* Evoluție vizite */}
      <div className="card">
        <h2 className="mb-4 font-semibold text-slate-800">Intrări în timp</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stats.data?.timeseries ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="visits" name="Intrări" fill="#1f47f5" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
