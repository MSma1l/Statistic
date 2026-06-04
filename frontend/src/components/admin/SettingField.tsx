import { useMutation } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";

/**
 * Câmp generic pentru o setare de tip TEXT sau NUMĂR (prompturi, praguri).
 * Ține o valoare locală editabilă și o salvează prin PUT /api/admin/settings/{key}.
 * Regulile GDPR (kind="json") au editor propriu (vezi GdprRulesEditor).
 */
export default function SettingField({
  setting,
  onSaved,
}: {
  setting: any;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(setting.value);
  const dirty = value !== setting.value;

  const save = useMutation({
    mutationFn: async () =>
      api.put(`/api/admin/settings/${setting.key}`, { value }),
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

      {setting.kind === "number" ? (
        <input
          type="number"
          className="input w-40"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      ) : (
        <textarea
          className="input min-h-[160px] font-mono text-xs leading-relaxed"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          className="btn-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save size={16} /> Salvează
        </button>
        {dirty && (
          <button className="btn-ghost" onClick={() => setValue(setting.value)}>
            <RotateCcw size={16} /> Anulează modificările
          </button>
        )}
        {save.isSuccess && !dirty && (
          <span className="text-sm text-emerald-600">Salvat ✓</span>
        )}
      </div>
    </div>
  );
}
