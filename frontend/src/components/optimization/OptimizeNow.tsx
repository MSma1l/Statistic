import { useMutation, useQuery } from "@tanstack/react-query";
import { Rocket, ChevronDown, ChevronRight, ShieldAlert, History } from "lucide-react";
import { useState } from "react";
import {
  api,
  type LandingRanking,
  type OptimizeResult,
  type OptimizationRunMeta,
} from "../../lib/api";
import { Spinner } from "../ui";

const SEV: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

/**
 * Orchestrare multi-agent (§6.3): apeși „Optimizează acum" și backend-ul rulează
 * câte un agent AI per landing IN PARALEL, apoi le clasează după oportunitate
 * (câte îmbunătățiri reale are fiecare). Aici declanșezi rularea, vezi clasamentul
 * și poți reciti rulări anterioare din istoric — fără să reconsumi tokeni.
 */
export default function OptimizeNow({
  siteId,
  days,
}: {
  siteId: number;
  days: number;
}) {
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const runs = useQuery({
    queryKey: ["optimization-runs", siteId],
    queryFn: async () =>
      (await api.get<OptimizationRunMeta[]>(`/api/analytics/${siteId}/optimization-runs`))
        .data,
  });

  const run = useMutation({
    mutationFn: async () =>
      (await api.post<OptimizeResult>(`/api/analytics/${siteId}/optimize-now?days=${days}`))
        .data,
    onSuccess: (d) => {
      setResult(d);
      runs.refetch();
    },
  });

  const loadRun = useMutation({
    mutationFn: async (id: number) =>
      (await api.get<OptimizeResult>(`/api/analytics/${siteId}/optimization-runs/${id}`))
        .data,
    onSuccess: (d) => setResult(d),
  });

  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-2">
        <Rocket size={18} className="text-brand-600" />
        <h2 className="font-semibold text-slate-800">Optimizează tot site-ul (multi-agent)</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Rulează câte un agent AI per landing, în paralel, și clasează paginile după
        oportunitate (câte îmbunătățiri reale are fiecare). Poate dura câteva secunde.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>
          <Rocket size={16} />
          {run.isPending ? "Rulez agenții…" : "Optimizează acum"}
        </button>

        {!!runs.data?.length && (
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <History size={14} />
            <select
              className="input max-w-[220px]"
              defaultValue=""
              onChange={(e) => e.target.value && loadRun.mutate(Number(e.target.value))}
            >
              <option value="">Istoric rulări…</option>
              {runs.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString("ro-RO", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {r.trigger === "scheduled" ? "auto" : "manual"} · {r.landing_count} LP
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {(run.isPending || loadRun.isPending) && (
        <div className="pt-4">
          <Spinner />
        </div>
      )}

      {result && !run.isPending && (
        <div className="mt-4 space-y-3">
          {!result.ai_available && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              AI indisponibil (lipsă cheie) — clasamentul arată landingurile, dar fără recomandări.
            </div>
          )}
          {!result.ranking.length ? (
            <p className="text-sm text-slate-400">Niciun landing cu trafic în perioada aleasă.</p>
          ) : (
            result.ranking.map((r, i) => <RankingRow key={r.path} rank={i + 1} item={r} />)
          )}
        </div>
      )}
    </div>
  );
}

function RankingRow({ rank, item }: { rank: number; item: LandingRanking }) {
  const [open, setOpen] = useState(rank === 1);
  const recs = item.report?.recommendations ?? [];

  return (
    <div className="rounded-xl border border-slate-200">
      <button
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-mono text-xs text-slate-400">#{rank}</span>
        <code className="font-medium text-slate-800">{item.path}</code>
        {item.conversion_rate != null && (
          <span className="text-xs text-slate-500">
            conv {item.conversion_rate}%
            {item.confidence === "low" && (
              <span className="ml-1 rounded bg-amber-50 px-1 text-amber-600">date insuf.</span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
            scor {item.opportunity_score}
          </span>
          <span className="text-slate-400">{item.recommendation_count} recom.</span>
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {!recs.length ? (
            <p className="text-sm text-slate-400">
              {item.report?.message || "Nicio recomandare pentru acest landing."}
            </p>
          ) : (
            recs.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-2 text-sm ${
                  r.blocked ? "border-red-200 bg-red-50/40" : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{r.element}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${SEV[r.severity] || SEV.low}`}>
                    {r.severity}
                  </span>
                </div>
                <p className="text-slate-600">
                  <b>Problemă:</b> {r.problem}
                </p>
                <p className="text-slate-600">
                  <b>Recomandare:</b> {r.recommendation}
                </p>
                {r.evidence && <p className="mt-1 text-xs text-slate-400">📊 {r.evidence}</p>}
                {r.blocked && (
                  <div className="mt-1 flex items-start gap-1 rounded bg-red-100 p-1.5 text-xs text-red-800">
                    <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                    <span>
                      <b>Blocat de gardianul GDPR</b> ({r.blocked_by}): {r.blocked_reason}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
