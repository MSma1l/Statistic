import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2, Clock, Search } from "lucide-react";
import { useState } from "react";
import { api, type Site } from "../../lib/api";

/**
 * GDPR platformă Nivel 1: configurezi consimțământul și retenția per site și ai o
 * unealtă pentru „dreptul la ștergere" (cauți și ștergi tot ce ține de un visitor_id).
 */
export default function PrivacyTab({ site }: { site: Site }) {
  const qc = useQueryClient();
  const siteId = site.id;
  const [consent, setConsent] = useState(site.consent_required);
  const [retention, setRetention] = useState(site.retention_days);

  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/api/sites/${siteId}`, {
        consent_required: consent,
        retention_days: retention,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site", siteId] }),
  });

  return (
    <div className="space-y-6">
      {/* Setări consimțământ + retenție */}
      <div className="card">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-800">Consimțământ & retenție</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Controlează cum respectă pixelul GDPR-ul pe acest site.
        </p>

        <label className="mb-4 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            <b>Cere consimțământ înainte de tracking.</b>{" "}
            <span className="text-slate-500">
              Snippetul va purta <code>data-consent="required"</code>, iar pixelul NU
              urmărește și NU creează niciun identificator până la apelul{" "}
              <code>window.statistic.consent('grant')</code> (îl chemi din banner-ul tău
              de cookie-uri).
            </span>
          </span>
        </label>

        <div className="mb-4 flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          <span className="text-sm text-slate-700">Șterge evenimentele brute după</span>
          <input
            type="number"
            min={0}
            max={3650}
            className="input w-24"
            value={retention}
            onChange={(e) => setRetention(Math.max(0, Number(e.target.value) || 0))}
          />
          <span className="text-sm text-slate-500">zile (0 = păstrează la nesfârșit)</span>
        </div>

        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Salvez…" : "Salvează setările"}
        </button>
        {save.isSuccess && <span className="ml-2 text-sm text-emerald-600">Salvat ✓</span>}
      </div>

      <EraseTool siteId={siteId} />

      <div className="card text-sm text-slate-500">
        <p className="mb-1 font-medium text-slate-700">Drept la ștergere — self-service</p>
        Vizitatorul își poate șterge singur datele apelând{" "}
        <code>window.statistic.forget()</code> în browser — șterge evenimentele de pe
        server și curăță identificatorii locali. Identificatorii sunt anonimi (fără
        nume/email), iar IP-ul nu e stocat în clar. Vezi și{" "}
        <code>docs/DPA-TEMPLATE.md</code>.
      </div>
    </div>
  );
}

/** Unealtă owner: caută câte evenimente are un visitor_id, apoi îl șterge. */
function EraseTool({ siteId }: { siteId: number }) {
  const [vid, setVid] = useState("");
  const [count, setCount] = useState<number | null>(null);

  const preview = useMutation({
    mutationFn: async () =>
      (
        await api.get<{ events: number }>(
          `/api/sites/${siteId}/privacy/visitor/${encodeURIComponent(vid)}`
        )
      ).data,
    onSuccess: (d) => setCount(d.events),
  });

  const erase = useMutation({
    mutationFn: async () =>
      (
        await api.delete<{ deleted_events: number }>(
          `/api/sites/${siteId}/privacy/visitor/${encodeURIComponent(vid)}`
        )
      ).data,
    onSuccess: () => setCount(0),
  });

  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-2">
        <Trash2 size={18} className="text-red-500" />
        <h2 className="font-semibold text-slate-800">Ștergere după visitor_id (cerere manuală)</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Pentru o cerere de ștergere primită de la un vizitator: caută-i datele după
        identificator, apoi șterge-le definitiv.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input flex-1"
          placeholder="visitor_id"
          value={vid}
          onChange={(e) => {
            setVid(e.target.value);
            setCount(null);
          }}
        />
        <button
          className="btn-ghost"
          disabled={!vid || preview.isPending}
          onClick={() => preview.mutate()}
        >
          <Search size={16} /> Caută
        </button>
        <button
          className="btn-danger"
          disabled={!vid || erase.isPending || count === 0}
          onClick={() => {
            if (confirm("Ștergi definitiv toate datele acestui vizitator?")) erase.mutate();
          }}
        >
          <Trash2 size={16} /> Șterge
        </button>
      </div>

      {count !== null && (
        <p className="mt-3 text-sm text-slate-600">
          {erase.isSuccess
            ? "✓ Datele au fost șterse."
            : `Acest vizitator are ${count} evenimente.`}
        </p>
      )}
    </div>
  );
}
