import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, extractError, type Site } from "../lib/api";
import { AccessBadge, EmptyState, PageHeader, Spinner } from "../components/ui";

export default function Sites() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");

  const { data: sites, isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/api/sites")).data,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      (await api.post<Site>("/api/sites", { name, domain })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      setShowForm(false);
      setName("");
      setDomain("");
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  return (
    <div>
      <PageHeader
        title="Site-uri (Pixel)"
        subtitle="Creează un site, copiază scriptul de tracking și analizează vizitatorii."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Site nou
          </button>
        }
      />

      {showForm && (
        <div className="card mb-6">
          <h2 className="mb-4 font-semibold text-slate-800">Adaugă un site</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nume *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Site-ul meu"
              />
            </div>
            <div>
              <label className="label">Domeniu (opțional)</label>
              <input
                className="input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="exemplu.ro"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              className="btn-primary"
              disabled={!name || createMut.isPending}
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
      ) : !sites?.length ? (
        <EmptyState>
          <Globe className="mb-3" size={32} />
          <p>Niciun site încă. Creează primul tău site pentru tracking.</p>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {sites.map((s) => (
            <Link
              key={s.id}
              to={`/sites/${s.id}`}
              className="card transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-brand-600">
                <Globe size={18} />
                <span className="font-semibold text-slate-900">{s.name}</span>
              </div>
              <div className="mt-2">
                <AccessBadge
                  access={s.access}
                  canEdit={s.can_edit}
                  ownerEmail={s.owner_email}
                />
              </div>
              <p className="mt-1 text-sm text-slate-500">{s.domain || "—"}</p>
              <p className="mt-3 font-mono text-xs text-slate-400">
                {s.site_key.slice(0, 12)}…
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
