import { useMutation } from "@tanstack/react-query";
import { ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { Spinner } from "../ui";

const SEV: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

/** Un card de recomandare; cele blocate de gardian sunt marcate vizibil (roșu). */
function RecommendationCard({ r }: { r: any }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        r.blocked ? "border-red-200 bg-red-50/40" : "border-slate-200"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800">{r.element}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${SEV[r.severity] || SEV.low}`}>
          {r.severity}
        </span>
      </div>
      <p className="text-sm text-slate-600">
        <b>Problemă:</b> {r.problem}
      </p>
      <p className="text-sm text-slate-600">
        <b>Recomandare:</b> {r.recommendation}
      </p>
      {r.evidence && <p className="mt-1 text-xs text-slate-400">📊 {r.evidence}</p>}
      {r.blocked && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-100 p-2 text-xs text-red-800">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            <b>Blocată de gardianul GDPR</b> ({r.blocked_by}): {r.blocked_reason}
          </span>
        </div>
      )}
    </div>
  );
}

/** Rezultatul analizei: tratează stările „indisponibil", „eroare", „gol" și lista de carduri. */
function Result({ data }: { data: any }) {
  if (!data.available || data.error)
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {data.message || "AI indisponibil."}
      </div>
    );

  const recs: any[] = data.recommendations ?? [];
  if (!recs.length)
    return (
      <p className="mt-4 text-sm text-slate-400">
        AI-ul nu a întors recomandări pentru acest landing.
      </p>
    );

  return (
    <div className="mt-4 space-y-3">
      {data.blocked_count > 0 && (
        <p className="text-xs text-slate-500">
          {data.blocked_count} recomandare(i) blocate de gardianul GDPR (marcate mai jos).
        </p>
      )}
      {recs.map((r, i) => (
        <RecommendationCard key={i} r={r} />
      ))}
    </div>
  );
}

/**
 * Cardul de analiză AI: alegi un landing, ceri analiza, primești recomandări deja
 * trecute prin gardianul GDPR. Dacă lipsește cheia API, backend-ul răspunde
 * `available=false` și afișăm un mesaj clar (fără să crape nimic).
 */
export default function AiRecommendations({
  siteId,
  days,
  paths,
}: {
  siteId: number;
  days: number;
  paths: { path: string }[];
}) {
  const [path, setPath] = useState("");
  const analyze = useMutation({
    mutationFn: async () =>
      (await api.post(`/api/analytics/${siteId}/ai-analyze`, { path, days })).data,
  });

  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={18} className="text-fuchsia-500" />
        <h2 className="font-semibold text-slate-800">Optimizare cu AI</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Alege un landing; AI-ul citește agregatele (pâlnie, scroll, heatmap, elemente)
        și propune îmbunătățiri concrete. Recomandările trec printr-un gardian GDPR
        care respinge dark patterns.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input max-w-xs"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        >
          <option value="">Alege un landing…</option>
          {paths.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          disabled={!path || analyze.isPending}
          onClick={() => analyze.mutate()}
        >
          <Sparkles size={16} />
          {analyze.isPending ? "Analizez…" : "Analizează cu AI"}
        </button>
      </div>

      {analyze.isPending && (
        <div className="pt-4">
          <Spinner />
        </div>
      )}
      {analyze.data && <Result data={analyze.data} />}
    </div>
  );
}
