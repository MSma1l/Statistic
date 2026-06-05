import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Pencil,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  api,
  type GenerateResult,
  type LandingDetail as LDetail,
  type LandingVersionMeta,
  type VersionContent,
} from "../../lib/api";
import { Spinner } from "../ui";

/** Asamblează documentul pentru previzualizare (la fel ca serverul: css în head, js la final). */
function assemble(v: { html: string; css: string; js: string }): string {
  return (
    `<!doctype html><html lang="ro"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>${v.css}</style></head><body>${v.html}<script>${v.js}<\/script></body></html>`
  );
}

/**
 * Detaliul unui landing: sursa editabilă, generare AI a unei versiuni noi,
 * lista versiunilor cu publicare/previzualizare. Bucla completă „AI propune →
 * verific → aprob/editez → se publică și se servește".
 */
export default function LandingDetail({
  siteId,
  landingId,
  onDeleted,
}: {
  siteId: number;
  landingId: number;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const base = `/api/landings/${siteId}/${landingId}`;
  const key = ["landing", siteId, landingId];

  const detailQ = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<LDetail>(base)).data,
  });

  // Editorul de sursă (pentru „dau versiunea mea" sau editez una existentă).
  const [src, setSrc] = useState({ html: "", css: "", js: "", note: "" });
  const [instruction, setInstruction] = useState("");
  const [genMsg, setGenMsg] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const saveVersion = useMutation({
    mutationFn: async () => api.post(`${base}/versions`, src),
    onSuccess: () => {
      setSrc({ html: "", css: "", js: "", note: "" });
      refresh();
    },
  });

  const generate = useMutation({
    mutationFn: async () =>
      (await api.post<GenerateResult>(`${base}/generate`, { instruction })).data,
    onSuccess: (data) => {
      if (!data.available) setGenMsg(data.message);
      else if ("error" in data && data.error) setGenMsg(data.message);
      else {
        setGenMsg(null);
        setInstruction("");
      }
      refresh();
    },
  });

  const publish = useMutation({
    mutationFn: async (versionId: number) =>
      api.post(`${base}/versions/${versionId}/publish`),
    onSuccess: refresh,
  });

  const del = useMutation({
    mutationFn: async () => api.delete(base),
    onSuccess: onDeleted,
  });

  async function preview(versionId: number) {
    const v = (await api.get<VersionContent>(`${base}/versions/${versionId}`)).data;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(assemble(v));
      w.document.close();
    }
  }

  async function loadIntoEditor(versionId: number) {
    const v = (await api.get<VersionContent>(`${base}/versions/${versionId}`)).data;
    setSrc({ html: v.html, css: v.css, js: v.js, note: `bazat pe v${v.version_no}` });
  }

  if (detailQ.isLoading) return <Spinner />;
  if (!detailQ.data) return <p className="text-sm text-slate-400">Landing inexistent.</p>;

  const d = detailQ.data;

  return (
    <div className="space-y-6">
      {/* Antet: path, URL public, ștergere */}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">
            {d.landing.label || d.landing.path}
          </div>
          <a
            href={d.public_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            {d.public_url} <ExternalLink size={13} />
          </a>
          <div className="mt-1 text-xs text-slate-400">
            {d.published_version_id
              ? "O versiune e publicată și servită."
              : "Nicio versiune publicată încă (URL-ul va da 404)."}
          </div>
        </div>
        <button
          className="btn-danger"
          onClick={() => {
            if (confirm("Ștergi acest landing și toate versiunile?")) del.mutate();
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Generare AI dintr-o recomandare */}
      <div className="card">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-fuchsia-500" />
          <h3 className="font-semibold text-slate-800">Aplică o recomandare cu AI</h3>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Lipește o recomandare (din tab-ul „Optimizare") sau scrie tu instrucțiunea.
          AI-ul generează o versiune nouă din cea publicată, trecută prin gardianul GDPR.
          O verifici și o publici tu.
        </p>
        <textarea
          className="input min-h-[80px] text-sm"
          placeholder="Ex: Mută butonul CTA deasupra fold-ului și mărește contrastul."
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            className="btn-primary"
            disabled={!instruction.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            <Sparkles size={16} />
            {generate.isPending ? "Generez…" : "Generează versiune"}
          </button>
          {genMsg && <span className="text-sm text-amber-700">{genMsg}</span>}
        </div>
      </div>

      {/* Versiuni */}
      <div className="card">
        <h3 className="mb-3 font-semibold text-slate-800">Versiuni</h3>
        <div className="space-y-2">
          {d.versions.map((v: LandingVersionMeta) => (
            <div
              key={v.id}
              className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                v.id === d.published_version_id
                  ? "border-emerald-200 bg-emerald-50/40"
                  : v.blocked
                    ? "border-red-200 bg-red-50/40"
                    : "border-slate-100"
              }`}
            >
              <span className="font-medium text-slate-700">v{v.version_no}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  v.source === "ai"
                    ? "bg-fuchsia-50 text-fuchsia-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {v.source === "ai" ? "AI" : "manual"}
              </span>
              {v.id === d.published_version_id && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  <CheckCircle2 size={12} /> publicată
                </span>
              )}
              <span className="flex-1 truncate text-sm text-slate-500">{v.note}</span>

              {v.blocked ? (
                <span className="inline-flex items-center gap-1 text-xs text-red-700">
                  <ShieldAlert size={13} /> blocată GDPR: {v.blocked_reason}
                </span>
              ) : (
                <>
                  <button className="btn-ghost" onClick={() => preview(v.id)}>
                    <Eye size={15} /> Preview
                  </button>
                  <button className="btn-ghost" onClick={() => loadIntoEditor(v.id)}>
                    <Pencil size={15} /> Editează
                  </button>
                  {v.id !== d.published_version_id && (
                    <button
                      className="btn-primary"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(v.id)}
                    >
                      Publică
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor de sursă (versiune manuală / editarea uneia existente) */}
      <div className="card">
        <h3 className="mb-1 font-semibold text-slate-800">Scrie / editează o versiune</h3>
        <p className="mb-3 text-sm text-slate-500">
          „Editează" pe o versiune o încarcă aici. Salvarea creează o versiune nouă
          (istoricul rămâne intact).
        </p>
        <div className="space-y-2">
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            placeholder="HTML (conținutul din <body>)"
            value={src.html}
            onChange={(e) => setSrc({ ...src, html: e.target.value })}
          />
          <textarea
            className="input min-h-[80px] font-mono text-xs"
            placeholder="CSS"
            value={src.css}
            onChange={(e) => setSrc({ ...src, css: e.target.value })}
          />
          <textarea
            className="input min-h-[80px] font-mono text-xs"
            placeholder="JS"
            value={src.js}
            onChange={(e) => setSrc({ ...src, js: e.target.value })}
          />
          <input
            className="input"
            placeholder="Notă (ex: am schimbat titlul)"
            value={src.note}
            onChange={(e) => setSrc({ ...src, note: e.target.value })}
          />
        </div>
        <button
          className="btn-primary mt-3"
          disabled={saveVersion.isPending}
          onClick={() => saveVersion.mutate()}
        >
          <Save size={16} /> Salvează versiune nouă
        </button>
      </div>
    </div>
  );
}
