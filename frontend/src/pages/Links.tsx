import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, MapPin, Plus, QrCode } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyButton, EmptyState, PageHeader, Spinner } from "../components/ui";
import { api, extractError, type TrackedLink } from "../lib/api";

export default function Links() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    destination_url: "",
    name: "",
    location_label: "",
    description: "",
  });
  const [error, setError] = useState("");

  const { data: links, isLoading } = useQuery({
    queryKey: ["links"],
    queryFn: async () => (await api.get<TrackedLink[]>("/api/links")).data,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      (await api.post<TrackedLink>("/api/links", form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      setShowForm(false);
      setForm({ slug: "", destination_url: "", name: "", location_label: "", description: "" });
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
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
                <QrCode size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/links/${l.id}`}
                  className="font-semibold text-slate-900 hover:text-brand-700"
                >
                  {l.name || l.slug}
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
