import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, Trash2, Sparkles, ShieldAlert, Zap, Plus } from "lucide-react";
import { useState } from "react";
import { api, type LivePatch, type PatchGenerateResult } from "../../lib/api";
import { Spinner } from "../ui";

const RISK: Record<string, string> = {
  low: "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};
const STATUS: Record<string, string> = {
  live: "bg-green-100 text-green-800",
  draft: "bg-slate-100 text-slate-600",
  paused: "bg-amber-100 text-amber-700",
};

/**
 * Faza 3 — Aplicare LIVE. Aici creezi/aprobi patch-uri DOM mici (text/culoare/atribut)
 * pe care `t.js` le aplică pe pagina reală a clientului, fără ca el să atingă codul.
 *
 * POARTA din §9 a viziunii e vizibilă: fiecare patch are un RISC, un verdict GDPR
 * (blocatele NU pot trece live), iar auto-aplicarea e permisă doar pentru risc mic.
 */
export default function LivePatches({
  siteId,
  paths,
}: {
  siteId: number;
  paths: { path: string }[];
}) {
  const qc = useQueryClient();
  const key = ["live-patches", siteId];
  const patches = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get<LivePatch[]>(`/api/live-patches/${siteId}`)).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  // --- mutații de stare (publish/pause/auto-apply/delete) ---
  const publish = useMutation({
    mutationFn: async (id: number) =>
      api.post(`/api/live-patches/${siteId}/${id}/publish`),
    onSuccess: invalidate,
  });
  const pause = useMutation({
    mutationFn: async (id: number) =>
      api.post(`/api/live-patches/${siteId}/${id}/pause`),
    onSuccess: invalidate,
  });
  const autoApply = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.post(`/api/live-patches/${siteId}/${id}/auto-apply?enabled=${enabled}`),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async (id: number) =>
      api.delete(`/api/live-patches/${siteId}/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <CreatePatch siteId={siteId} paths={paths} onDone={invalidate} />

      <div className="card">
        <h2 className="mb-4 font-semibold text-slate-800">Patch-uri ({patches.data?.length ?? 0})</h2>
        {patches.isLoading ? (
          <Spinner />
        ) : !patches.data?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Niciun patch încă. Creează unul manual sau generează-l cu AI mai sus.
          </p>
        ) : (
          <div className="space-y-3">
            {patches.data.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${
                  p.blocked ? "border-red-200 bg-red-50/40" : "border-slate-200"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[p.status]}`}>
                    {p.status === "live" ? "● LIVE" : p.status}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${RISK[p.risk]}`}>
                    risc {p.risk}
                  </span>
                  {p.source === "ai" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-700">
                      <Sparkles size={12} /> AI
                    </span>
                  )}
                  {p.auto_apply && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      <Zap size={12} /> auto
                    </span>
                  )}
                  <code className="ml-auto text-xs text-slate-400">{p.path}</code>
                </div>

                <p className="text-sm font-medium text-slate-800">{p.label || "(fără etichetă)"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <code className="rounded bg-slate-100 px-1">{p.selector}</code>{" "}
                  → <b>{p.op}</b>
                  {p.prop ? ` [${p.prop}]` : ""} = <code className="rounded bg-slate-100 px-1">{p.value}</code>
                </p>

                {p.blocked && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-100 p-2 text-xs text-red-800">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                    <span>
                      <b>Blocat de gardianul GDPR</b>: {p.blocked_reason}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.status === "live" ? (
                    <button className="btn-ghost text-amber-600" onClick={() => pause.mutate(p.id)}>
                      <Pause size={14} /> Oprește
                    </button>
                  ) : (
                    <button
                      className="btn-primary disabled:opacity-40"
                      disabled={p.blocked}
                      title={p.blocked ? "Blocat de gardianul GDPR" : "Pune live"}
                      onClick={() => publish.mutate(p.id)}
                    >
                      <Play size={14} /> Pune live
                    </button>
                  )}
                  {p.risk === "low" && !p.blocked && (
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={p.auto_apply}
                        onChange={(e) =>
                          autoApply.mutate({ id: p.id, enabled: e.target.checked })
                        }
                      />
                      auto-aplicare
                    </label>
                  )}
                  <button
                    className="btn-ghost ml-auto text-red-500"
                    onClick={() => {
                      if (confirm("Ștergi acest patch?")) del.mutate(p.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cardul de creare: fie manual (selector + operație), fie generat de AI dintr-o recomandare. */
function CreatePatch({
  siteId,
  paths,
  onDone,
}: {
  siteId: number;
  paths: { path: string }[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [path, setPath] = useState("");

  // manual
  const [form, setForm] = useState({
    label: "",
    selector: "",
    op: "text" as "text" | "style" | "attr",
    prop: "",
    value: "",
  });
  const createManual = useMutation({
    mutationFn: async () =>
      api.post(`/api/live-patches/${siteId}`, { ...form, path }),
    onSuccess: () => {
      setForm({ label: "", selector: "", op: "text", prop: "", value: "" });
      onDone();
    },
  });

  // AI
  const [instruction, setInstruction] = useState("");
  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post<PatchGenerateResult>(
          `/api/live-patches/${siteId}/generate`,
          { path, instruction }
        )
      ).data,
    onSuccess: (d) => {
      if ("available" in d && d.available && !("error" in d)) {
        setInstruction("");
        onDone();
      }
    },
  });
  const genErr =
    generate.data && (!generate.data.available || "error" in generate.data)
      ? (generate.data as any).message
      : null;

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold text-slate-800">Patch nou</h2>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200 text-sm">
          {(["manual", "ai"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 ${
                mode === m ? "bg-brand-600 text-white" : "bg-white text-slate-600"
              }`}
            >
              {m === "manual" ? "Manual" : "Cu AI"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label className="label">Pagina</label>
        <select className="input max-w-xs" value={path} onChange={(e) => setPath(e.target.value)}>
          <option value="">Alege o pagină…</option>
          {paths.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
            </option>
          ))}
        </select>
      </div>

      {mode === "manual" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Selector CSS (ex: #cta)"
              value={form.selector}
              onChange={(e) => setForm({ ...form, selector: e.target.value })}
            />
            <input
              className="input"
              placeholder="Etichetă (ex: CTA verde)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select
              className="input"
              value={form.op}
              onChange={(e) => setForm({ ...form, op: e.target.value as any })}
            >
              <option value="text">text</option>
              <option value="style">style</option>
              <option value="attr">attr</option>
            </select>
            <input
              className="input"
              placeholder={form.op === "text" ? "(gol)" : "proprietate"}
              disabled={form.op === "text"}
              value={form.prop}
              onChange={(e) => setForm({ ...form, prop: e.target.value })}
            />
            <input
              className="input"
              placeholder="valoare"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!path || !form.selector || createManual.isPending}
            onClick={() => createManual.mutate()}
          >
            <Plus size={16} /> {createManual.isPending ? "Creez…" : "Creează patch"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Descrie schimbarea; AI-ul alege un selector real din traficul paginii și
            o transformă în patch (trecut prin gardianul GDPR).
          </p>
          <textarea
            className="input h-20"
            placeholder="Ex: Fă butonul CTA verde și textul „Cumpără acum"."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!path || !instruction || generate.isPending}
            onClick={() => generate.mutate()}
          >
            <Sparkles size={16} /> {generate.isPending ? "Generez…" : "Generează cu AI"}
          </button>
          {genErr && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {genErr}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
