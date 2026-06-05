import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileCode, Plus } from "lucide-react";
import { useState } from "react";
import { api, type Landing } from "../../lib/api";
import { Spinner } from "../ui";
import LandingDetail from "./LandingDetail";

/**
 * Tab-ul „Landinguri": găzduiește paginile aduse în sistem și e locul unde AI-ul
 * chiar APLICĂ schimbările (cu aprobarea ta). Listă → selectezi unul → detaliu.
 */
export default function LandingsTab({ siteId }: { siteId: number }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ path: "", label: "", html: "", css: "", js: "" });

  const listQ = useQuery({
    queryKey: ["landings", siteId],
    queryFn: async () => (await api.get<Landing[]>(`/api/landings/${siteId}`)).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post(`/api/landings/${siteId}`, form)).data,
    onSuccess: (lp: Landing) => {
      setAdding(false);
      setForm({ path: "", label: "", html: "", css: "", js: "" });
      qc.invalidateQueries({ queryKey: ["landings", siteId] });
      setSelected(lp.id);
    },
  });

  // Vizualizarea unui landing selectat.
  if (selected !== null) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> Înapoi la landinguri
        </button>
        <LandingDetail
          siteId={siteId}
          landingId={selected}
          onDeleted={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["landings", siteId] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Adaugă landing-urile tale (HTML/CSS/JS). Versiunea aprobată e servită
          automat de Statistic la URL-ul ei, cu pixelul de tracking inclus.
        </p>
        <button className="btn-primary" onClick={() => setAdding((s) => !s)}>
          <Plus size={16} /> Landing nou
        </button>
      </div>

      {adding && (
        <div className="card space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Path public (ex: /oferta)</label>
              <input
                className="input"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Etichetă</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
          </div>
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            placeholder="HTML (conținutul din <body>)"
            value={form.html}
            onChange={(e) => setForm({ ...form, html: e.target.value })}
          />
          <textarea
            className="input min-h-[70px] font-mono text-xs"
            placeholder="CSS"
            value={form.css}
            onChange={(e) => setForm({ ...form, css: e.target.value })}
          />
          <textarea
            className="input min-h-[70px] font-mono text-xs"
            placeholder="JS"
            value={form.js}
            onChange={(e) => setForm({ ...form, js: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!form.path.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Creează
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              Anulează
            </button>
          </div>
        </div>
      )}

      {listQ.isLoading ? (
        <Spinner />
      ) : !listQ.data?.length ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Niciun landing încă. Adaugă unul ca să-l poți optimiza cu AI.
        </p>
      ) : (
        <div className="space-y-2">
          {listQ.data.map((lp) => (
            <button
              key={lp.id}
              onClick={() => setSelected(lp.id)}
              className="card flex w-full items-center gap-3 text-left hover:bg-slate-50"
            >
              <FileCode size={18} className="text-brand-600" />
              <div className="flex-1">
                <div className="font-medium text-slate-800">{lp.label || lp.path}</div>
                <code className="text-xs text-slate-400">{lp.path}</code>
              </div>
              {lp.published_version_id ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  publicat
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  nepublicat
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
