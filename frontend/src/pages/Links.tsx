import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, MapPin, Plus, QrCode } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyButton, EmptyState, PageHeader, Spinner } from "../components/ui";
import {
  api,
  API_URL,
  extractError,
  type GalleryList,
  type TrackedLink,
} from "../lib/api";

const EMPTY = {
  slug: "",
  destination_url: "",
  name: "",
  location_label: "",
  description: "",
  kind: "link" as "link" | "qr",
  logo_image_id: null as number | null,
};

export default function Links() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState("");

  const { data: links, isLoading } = useQuery({
    queryKey: ["links"],
    queryFn: async () => (await api.get<TrackedLink[]>("/api/links")).data,
  });

  const { data: gallery } = useQuery({
    queryKey: ["gallery"],
    queryFn: async () => (await api.get<GalleryList>("/api/gallery")).data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post<TrackedLink>("/api/links", form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      setShowForm(false);
      setForm({ ...EMPTY });
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div>
      <PageHeader
        title="Linkuri & QR coduri"
        subtitle="Creează linkuri scurte personalizate și QR coduri permanente, cu statistici."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Creează
          </button>
        }
      />

      {showForm && (
        <div className="card mb-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Link / QR nou</h2>

          {/* Alegere tip */}
          <div>
            <label className="label">Tip</label>
            <div className="flex gap-2">
              {(["link", "qr"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("kind", k)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    form.kind === k
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {k === "link" ? <LinkIcon size={16} /> : <QrCode size={16} />}
                  {k === "link" ? "Link scurt" : "QR cod"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Slug personalizat * (ex: promo-vara)</label>
              <input
                className="input"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="promo-vara"
              />
            </div>
            <div>
              <label className="label">Destinație * (unde redirecționează)</label>
              <input
                className="input"
                value={form.destination_url}
                onChange={(e) => set("destination_url", e.target.value)}
                placeholder="https://exemplu.ro/pagina"
              />
            </div>
            <div>
              <label className="label">Nume</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Campanie vară"
              />
            </div>
            <div>
              <label className="label">Locație (unde e plasat)</label>
              <input
                className="input"
                value={form.location_label}
                onChange={(e) => set("location_label", e.target.value)}
                placeholder="Afiș stație autobuz"
              />
            </div>
          </div>

          {/* Logo pentru QR */}
          {form.kind === "qr" && (
            <div>
              <label className="label">Logo în centrul QR-ului (opțional, din galerie)</label>
              {!gallery?.images.length ? (
                <p className="text-sm text-slate-400">
                  Nu ai imagini în galerie.{" "}
                  <Link to="/gallery" className="text-brand-600 underline">
                    Încarcă una aici
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => set("logo_image_id", null)}
                    className={`flex h-16 w-16 items-center justify-center rounded-xl border text-xs ${
                      form.logo_image_id === null
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-400"
                    }`}
                  >
                    Fără
                  </button>
                  {gallery.images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => set("logo_image_id", img.id)}
                      className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${
                        form.logo_image_id === img.id
                          ? "border-brand-500"
                          : "border-transparent"
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
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!form.slug || !form.destination_url || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Creează
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              Anulează
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !links?.length ? (
        <EmptyState>
          <LinkIcon className="mb-3" size={32} />
          <p>Niciun link încă. Creează primul tău link sau QR.</p>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id} className="card flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                {l.kind === "qr" ? <QrCode size={22} /> : <LinkIcon size={22} />}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/links/${l.id}`}
                  className="font-semibold text-slate-900 hover:text-brand-700"
                >
                  {l.name || l.slug}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {l.kind === "qr" ? "QR" : "Link"}
                  </span>
                  {!l.is_active && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-normal text-red-500">
                      inactiv
                    </span>
                  )}
                </Link>
                <div className="truncate text-sm text-brand-600">{l.short_url}</div>
                <div className="truncate text-xs text-slate-400">
                  → {l.destination_url}
                  {l.location_label && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <MapPin size={12} /> {l.location_label}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{l.total_visits}</div>
                <div className="text-xs text-slate-400">intrări</div>
              </div>
              <CopyButton value={l.short_url} label="Link" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
