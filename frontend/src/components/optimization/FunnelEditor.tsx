import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { Spinner } from "../ui";

/** O treaptă din pâlnie, așa cum o editează UI-ul (forma de la GET/PUT /funnel). */
export interface Step {
  kind: "page" | "custom_event";
  value: string;
  label: string;
  is_conversion: boolean;
}

/**
 * Editorul de pâlnie: definește treptele + ce înseamnă „conversie" pentru site.
 * Salvarea înlocuiește toată lista (PUT), iar invalidarea reîmprospătează tabelul
 * comparativ care depinde de ea.
 */
export default function FunnelEditor({ siteId }: { siteId: number }) {
  const qc = useQueryClient();
  const funnelQ = useQuery({
    queryKey: ["funnel", siteId],
    queryFn: async () =>
      (await api.get<Step[]>(`/api/analytics/${siteId}/funnel`)).data,
  });

  // `draft` = lista editată local; cât e null, afișăm ce-a venit din server.
  const [draft, setDraft] = useState<Step[] | null>(null);
  const steps: Step[] = draft ?? funnelQ.data ?? [];
  const dirty = draft !== null;

  function patch(i: number, p: Partial<Step>) {
    setDraft(steps.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }
  function addStep() {
    setDraft([...steps, { kind: "page", value: "", label: "", is_conversion: false }]);
  }
  function removeStep(i: number) {
    setDraft(steps.filter((_, idx) => idx !== i));
  }

  const save = useMutation({
    mutationFn: async () =>
      api.put(
        `/api/analytics/${siteId}/funnel`,
        steps.filter((s) => s.value.trim())
      ),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["funnel", siteId] });
      qc.invalidateQueries({ queryKey: ["funnel-compare", siteId] });
    },
  });

  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-2">
        <Target size={18} className="text-brand-600" />
        <h2 className="font-semibold text-slate-800">Definește pâlnia & conversia</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Treptele prin care trece vizitatorul. „Conversie" = a atins orice treaptă
        bifată. O treaptă e fie o <b>pagină</b> (ex: <code>/multumim</code>), fie un{" "}
        <b>event custom</b> (numele din <code>window.statistic("buy")</code>). Fără
        nicio conversie bifată → se folosește engagement-ul (peste prag).
      </p>

      {funnelQ.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 p-2"
            >
              <div>
                <label className="label">Tip</label>
                <select
                  className="input w-36"
                  value={s.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as Step["kind"] })}
                >
                  <option value="page">Pagină</option>
                  <option value="custom_event">Event custom</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="label">
                  {s.kind === "page" ? "Path (ex: /multumim)" : "Nume event (ex: buy)"}
                </label>
                <input
                  className="input"
                  value={s.value}
                  onChange={(e) => patch(i, { value: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <label className="label">Etichetă (afișată)</label>
                <input
                  className="input"
                  value={s.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 px-1 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={s.is_conversion}
                  onChange={(e) => patch(i, { is_conversion: e.target.checked })}
                />
                Conversie
              </label>
              <button
                className="btn-ghost mb-1"
                title="Șterge treapta"
                onClick={() => removeStep(i)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <button className="btn-ghost" onClick={addStep}>
              <Plus size={16} /> Adaugă treaptă
            </button>
            {dirty && (
              <button
                className="btn-primary"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                <Save size={16} /> Salvează pâlnia
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
