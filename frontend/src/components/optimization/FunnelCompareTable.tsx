import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { Spinner } from "../ui";

/** Badge de încredere: verde = destule date, ambar = prea puține (nu declarăm câștigător). */
function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === "ok")
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
        date suficiente
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
      <AlertTriangle size={12} /> date insuficiente
    </span>
  );
}

/** Tabelul propriu-zis (separat ca să rămână ușor de citit). */
function Table({ data }: { data: any }) {
  const steps: any[] = data.funnel_steps ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
            <th className="py-2 pr-3">Grup</th>
            <th className="py-2 pr-3 text-right">Intrări</th>
            <th className="py-2 pr-3 text-right">Angajați</th>
            {steps.map((s, i) => (
              <th key={i} className="py-2 pr-3 text-right">
                {s.label}
              </th>
            ))}
            <th className="py-2 pr-3 text-right">Conversii</th>
            <th className="py-2 pr-3 text-right">Rată</th>
            <th className="py-2 pr-3 text-right">Bounce</th>
            <th className="py-2 pr-3 text-right">Timp activ</th>
            <th className="py-2 pr-3 text-right">Scroll</th>
            <th className="py-2 pr-3">Încredere</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g: any) => (
            <tr
              key={g.group}
              className={`border-b border-slate-50 ${
                data.winner === g.group ? "bg-emerald-50/40" : ""
              }`}
            >
              <td className="max-w-[200px] truncate py-2 pr-3 font-medium text-slate-700">
                {data.winner === g.group && "🏆 "}
                <code className="text-xs">{g.group}</code>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.entries}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {g.engaged}{" "}
                <span className="text-xs text-slate-400">({g.engaged_pct}%)</span>
              </td>
              {g.steps.map((st: any, i: number) => (
                <td key={i} className="py-2 pr-3 text-right tabular-nums">
                  {st.reached}{" "}
                  <span className="text-xs text-slate-400">({st.pct_of_entries}%)</span>
                </td>
              ))}
              <td className="py-2 pr-3 text-right font-medium tabular-nums">
                {g.conversions}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.conversion_rate}%</td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.bounce_rate}%</td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.avg_active_seconds}s</td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.avg_scroll}%</td>
              <td className="py-2 pr-3">
                <ConfidenceBadge confidence={g.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Cardul de comparație: comută între grupare pe landing și pe campanie, apoi
 * afișează pâlnia fiecărui grup. „Câștigătorul" (🏆) e marcat doar dacă are
 * destule date — niciodată pe zgomot statistic.
 */
export default function FunnelCompareTable({
  siteId,
  days,
}: {
  siteId: number;
  days: number;
}) {
  const [groupBy, setGroupBy] = useState<"landing" | "campaign">("landing");
  const compareQ = useQuery({
    queryKey: ["funnel-compare", siteId, days, groupBy],
    queryFn: async () =>
      (
        await api.get(
          `/api/analytics/${siteId}/funnel-compare?days=${days}&group_by=${groupBy}`
        )
      ).data,
  });

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">
          Comparație pâlnie pe {groupBy === "landing" ? "landing-uri" : "campanii"}
        </h2>
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          {(["landing", "campaign"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 text-sm ${
                groupBy === g
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {g === "landing" ? "Landing" : "Campanie"}
            </button>
          ))}
        </div>
      </div>

      {compareQ.isLoading ? (
        <Spinner />
      ) : !compareQ.data?.groups?.length ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Încă nu sunt destule date pentru o comparație.
        </p>
      ) : (
        <Table data={compareQ.data} />
      )}
    </div>
  );
}
