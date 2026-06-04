import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, XCircle } from "lucide-react";
import GdprRulesEditor from "../components/admin/GdprRulesEditor";
import SettingField from "../components/admin/SettingField";
import { PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";

/**
 * Pagina admin „AI & GDPR" — frame-urile editabile cerute:
 *   - promptul consultantului CRO și promptul gardianului GDPR;
 *   - catalogul de reguli deterministe GDPR;
 *   - pragurile statistice (sesiuni/conversii minime).
 * Cheia API și modelul vin din .env (secrete) → doar afișate, nu editate aici.
 */
export default function AdminAI() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => (await api.get("/api/admin/settings")).data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-settings"] });

  if (isLoading) return <Spinner />;

  const settings: any[] = data?.settings ?? [];
  const ai = data?.ai ?? { enabled: false, model: "" };

  return (
    <div>
      <PageHeader
        title="AI & GDPR"
        subtitle="Reglează prompturile, regulile gardianului și pragurile. Modificările se aplică imediat, fără redeploy."
      />

      {/* Starea cheii API (din .env, doar citită — niciodată trimisă spre client). */}
      <div className="card mb-6 flex items-center gap-3">
        <Bot size={20} className="text-brand-600" />
        <div className="flex-1">
          <div className="font-medium text-slate-800">Status AI</div>
          <div className="text-sm text-slate-500">
            Model: <code>{ai.model || "—"}</code>
          </div>
        </div>
        {ai.enabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
            <CheckCircle2 size={16} /> activ (cheie setată)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
            <XCircle size={16} /> inactiv — setează ANTHROPIC_API_KEY în .env
          </span>
        )}
      </div>

      <div className="space-y-4">
        {settings.map((s) =>
          s.kind === "json" ? (
            <GdprRulesEditor key={s.key} setting={s} onSaved={refresh} />
          ) : (
            <SettingField key={s.key} setting={s} onSaved={refresh} />
          )
        )}
      </div>
    </div>
  );
}
