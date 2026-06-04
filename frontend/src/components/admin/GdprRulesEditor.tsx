import { useMutation } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";

/** O regulă deterministă a gardianului: cuvinte-cheie + motivul blocării. */
interface Rule {
  match: string[];
  reason: string;
}

/**
 * Editor pentru `gdpr.rules` — primul filtru (determinist) al gardianului GDPR.
 * Fiecare regulă: dacă vreun cuvânt din `match` apare în recomandarea AI, e blocată
 * cu `reason`. `match` se editează ca text separat prin virgulă (ușor de scris).
 */
export default function GdprRulesEditor({
  setting,
  onSaved,
}: {
  setting: any;
  onSaved: () => void;
}) {
  const [rules, setRules] = useState<Rule[]>(setting.value ?? []);

  function patch(i: number, p: Partial<Rule>) {
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function add() {
    setRules([...rules, { match: [], reason: "" }]);
  }
  function remove(i: number) {
    setRules(rules.filter((_, idx) => idx !== i));
  }

  const save = useMutation({
    mutationFn: async () =>
      api.put(`/api/admin/settings/${setting.key}`, {
        // Curățăm regulile goale înainte de salvare.
        value: rules
          .map((r) => ({ match: r.match.filter(Boolean), reason: r.reason.trim() }))
          .filter((r) => r.match.length && r.reason),
      }),
    onSuccess: onSaved,
  });

  return (
    <div className="card">
      <div className="mb-1 flex items-center justify-between">
        <code className="text-sm font-semibold text-slate-800">{setting.key}</code>
        {setting.is_default && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            valoare implicită
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-500">{setting.description}</p>

      <div className="space-y-2">
        {rules.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 p-2"
          >
            <div className="flex-1">
              <label className="label">Cuvinte declanșatoare (separate prin virgulă)</label>
              <input
                className="input"
                value={r.match.join(", ")}
                onChange={(e) =>
                  patch(i, {
                    match: e.target.value.split(",").map((x) => x.trim()),
                  })
                }
              />
            </div>
            <div className="flex-1">
              <label className="label">Motivul blocării</label>
              <input
                className="input"
                value={r.reason}
                onChange={(e) => patch(i, { reason: e.target.value })}
              />
            </div>
            <button
              className="btn-ghost mb-1"
              title="Șterge regula"
              onClick={() => remove(i)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="btn-ghost" onClick={add}>
          <Plus size={16} /> Adaugă regulă
        </button>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          <Save size={16} /> Salvează regulile
        </button>
        {save.isSuccess && <span className="text-sm text-emerald-600">Salvat ✓</span>}
      </div>
    </div>
  );
}
