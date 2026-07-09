import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  LinkIcon,
  MousePointerClick,
  QrCode,
  Save,
  Trash2,
} from "lucide-react";
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
import SharePanel from "../components/SharePanel";
import { CopyButton, Spinner, StatCard } from "../components/ui";
import {
  api,
  API_URL,
  extractError,
  type GalleryList,
  type TrackedLink,
} from "../lib/api";
import { useAuth } from "../lib/auth";

export default function LinkDetail() {
  const { id } = useParams();
  const linkId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({
    destination_url: "",
    name: "",
    location_label: "",
    description: "",
    kind: "link" as "link" | "qr",
    logo_image_id: null as number | null,
    is_active: true,
  });
  const [error, setError] = useState("");
  const [qrVersion, setQrVersion] = useState(0);

  const link = useQuery({
    queryKey: ["link", linkId],
    queryFn: async () => (await api.get<TrackedLink>(`/api/links/${linkId}`)).data,
  });
  const stats = useQuery({
    queryKey: ["link-stats", linkId],
    queryFn: async () => (await api.get(`/api/links/${linkId}/stats`)).data,
  });
  const gallery = useQuery({
    queryKey: ["gallery"],
    queryFn: async () => (await api.get<GalleryList>("/api/gallery")).data,
  });

  useEffect(() => {
    if (link.data) {
      setForm({
        destination_url: link.data.destination_url,
        name: link.data.name,
        location_label: link.data.location_label,
        description: link.data.description,
        kind: link.data.kind,
        logo_image_id: link.data.logo_image_id,
        is_active: link.data.is_active,
      });
    }
  }, [link.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        destination_url: form.destination_url,
        name: form.name,
        location_label: form.location_label,
        description: form.description,
        kind: form.kind,
        is_active: form.is_active,
      };
      if (form.logo_image_id === null) payload.clear_logo = true;
      else payload.logo_image_id = form.logo_image_id;
      return api.patch(`/api/links/${linkId}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["link", linkId] });
      qc.invalidateQueries({ queryKey: ["links"] });
      setQrVersion((v) => v + 1); // forțează reîncărcarea imaginii QR
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

  const [copied, setCopied] = useState(false);

  async function downloadQr(fmt: "png" | "svg") {
    const res = await api.get(`/api/links/${linkId}/qr.${fmt}`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${link.data?.slug || "qr"}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyQrImage() {
    try {
      const res = await api.get(`/api/links/${linkId}/qr.png`, { responseType: "blob" });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": res.data }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Browserul nu permite copierea imaginii. Folosește butonul Descarcă PNG.");
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (link.isLoading) return <Spinner />;
  if (!link.data) return <p>Link inexistent.</p>;

  // Drepturi asupra resursei. Câmpurile de partajare pot lipsi (backend vechi) →
  // presupunem permis, ca înainte de partajare.
  const canEdit = link.data.can_edit !== false;
  const isShared = link.data.access === "shared";
  const canManage = !!user?.is_admin || link.data.access === "owner";
  const notMine =
    link.data.access === "admin" || link.data.access === "shared";

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
      <div className="flex items-center gap-2 text-sm">
        <span className="text-brand-600">{link.data.short_url}</span>
        <CopyButton value={link.data.short_url} label="Link" />
      </div>
      {notMine && link.data.owner_email && (
        <p className="mt-1 text-xs text-slate-400">
          Proprietar: {link.data.owner_email}
          {isShared && !canEdit ? " · doar citire" : ""}
        </p>
      )}
      <div className="mb-6" />

      <SharePanel
        resourceType="link"
        resourceId={linkId}
        ownerEmail={link.data.owner_email}
        canManage={canManage}
      />

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
            src={`${API_URL}/api/links/${linkId}/qr.png?v=${qrVersion}`}
            alt="QR"
            className="aspect-square w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white p-2"
          />
          {link.data.location_label && (
            <p className="mt-2 text-sm text-slate-500">📍 {link.data.location_label}</p>
          )}
          <div className="mt-4 flex w-full flex-col gap-2">
            <button className="btn-primary w-full" onClick={copyQrImage}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copiat!" : "Copiază imaginea"}
            </button>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => downloadQr("png")}>
                <Download size={16} /> PNG
              </button>
              <button className="btn-ghost flex-1" onClick={() => downloadQr("svg")}>
                <Download size={16} /> SVG
              </button>
            </div>
          </div>
        </div>

        {/* Editare completă (doar dacă ai drept de editare) */}
        {!canEdit ? (
          <div className="card col-span-2 flex items-center justify-center text-center text-sm text-slate-400">
            Ai acces doar de vizualizare la acest link.
          </div>
        ) : (
        <div className="card col-span-2 space-y-3">
          <h2 className="font-semibold text-slate-800">Editează</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nume</label>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className="label">Locație</label>
              <input
                className="input"
                value={form.location_label}
                onChange={(e) => set("location_label", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Destinație (slug-ul rămâne pe viață)</label>
            <input
              className="input"
              value={form.destination_url}
              onChange={(e) => set("destination_url", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Descriere</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <div>
              <label className="label">Tip</label>
              <div className="flex gap-2">
                {(["link", "qr"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("kind", k)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${
                      form.kind === k
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {k === "link" ? <LinkIcon size={14} /> : <QrCode size={14} />}
                    {k === "link" ? "Link" : "QR"}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              Activ
            </label>
          </div>

          {/* Logo */}
          <div>
            <label className="label">Logo în centrul QR-ului (din galerie)</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => set("logo_image_id", null)}
                className={`flex h-14 w-14 items-center justify-center rounded-xl border text-xs ${
                  form.logo_image_id === null
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-400"
                }`}
              >
                Fără
              </button>
              {(gallery.data?.images ?? []).map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => set("logo_image_id", img.id)}
                  className={`h-14 w-14 overflow-hidden rounded-xl border-2 ${
                    form.logo_image_id === img.id ? "border-brand-500" : "border-transparent"
                  }`}
                >
                  <img
                    src={`${API_URL}/api/gallery/${img.id}/raw`}
                    alt={img.filename}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save size={16} /> Salvează
            </button>
            {!isShared && (
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm("Ștergi acest link și statisticile lui?")) delMut.mutate();
                }}
              >
                <Trash2 size={16} /> Șterge
              </button>
            )}
          </div>
        </div>
        )}
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
