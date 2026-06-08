import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Link2, Save, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { Spinner } from "../ui";

// Tipuri locale (modul adițional — nu atingem lib/api.ts).
interface Template {
  id: string;
  name: string;
  description: string;
}
interface AssetLink {
  slug: string;
  name: string;
  destination_url: string;
  short_url: string;
  qr_scan_url: string;
}
interface Assets {
  site_key: string;
  pixel_snippet: string;
  links: AssetLink[];
}
type GenResult =
  | { available: false; message: string }
  | { available: true; error: true; message: string }
  | {
      available: true;
      html: string;
      css: string;
      js: string;
      note: string;
      blocked: boolean;
      blocked_reason: string;
    };

/** Asamblează pentru previzualizare (css în head, js la final, html în body). */
function assemble(v: { html: string; css: string; js: string }): string {
  // Dacă AI-ul a întors deja un document complet, îl folosim ca atare.
  if (v.html.trim().toLowerCase().startsWith("<!doctype") || v.html.includes("<html"))
    return v.html;
  return (
    `<!doctype html><html lang="ro"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>${v.css}</style></head><body>${v.html}<script>${v.js}<\/script></body></html>`
  );
}

/**
 * Tab „Generator": construiește de la zero o pagină de vânzări cu AI, conectând
 * automat pixelul site-ului și linkurile scurte (CTA-uri trackuibile). Pagina
 * generată se salvează ca landing (refolosește zona „Landinguri" pentru publicare).
 */
export default function LandingGenerator({ siteId }: { siteId: number }) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("sales");
  const [brief, setBrief] = useState("");
  const [includePixel, setIncludePixel] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<GenResult | null>(null);

  const templatesQ = useQuery({
    queryKey: ["lg-templates"],
    queryFn: async () => (await api.get<Template[]>("/api/landing-generator/templates")).data,
  });
  const assetsQ = useQuery({
    queryKey: ["lg-assets", siteId],
    queryFn: async () =>
      (await api.get<Assets>(`/api/landing-generator/${siteId}/assets`)).data,
  });

  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post<GenResult>(`/api/landing-generator/${siteId}/generate`, {
          brief,
          template_id: templateId,
          link_slugs: chosen,
          include_pixel: includePixel,
        })
      ).data,
    onSuccess: (data) => setResult(data),
  });

  const save = useMutation({
    mutationFn: async (vars: { path: string; label: string }) => {
      const r = result;
      if (!r || !("html" in r)) return;
      return api.post(`/api/landings/${siteId}`, {
        path: vars.path,
        label: vars.label,
        html: r.html,
        css: r.css,
        js: r.js,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["landings", siteId] }),
  });

  function toggleLink(slug: string) {
    setChosen((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : [...c, slug]));
  }

  function preview() {
    if (!result || !("html" in result)) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(assemble(result));
      w.document.close();
    }
  }

  function doSave() {
    const path = prompt("Path public pentru pagină (ex: /oferta):", "/oferta");
    if (!path) return;
    const label = prompt("Etichetă (nume intern):", "Landing generat") || "Landing generat";
    save.mutate({ path, label });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-fuchsia-500" />
          <h2 className="font-semibold text-slate-800">Generează o pagină de vânzări cu AI</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Descrie ce vinzi; AI-ul construiește pagina de la un șablon și o stilează ca
          să convertească. Conectează automat pixelul de tracking și butoanele la
          linkurile tale scurte. Apoi o salvezi în „Landinguri" și o publici.
        </p>

        {/* Șablon */}
        <label className="label">Șablon de bază</label>
        <select
          className="input mb-3 max-w-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {(templatesQ.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.description}
            </option>
          ))}
        </select>

        {/* Brief */}
        <label className="label">Brief (ce vinzi, pentru cine, ton, beneficii)</label>
        <textarea
          className="input mb-3 min-h-[110px] text-sm"
          placeholder="Ex: Vând un curs online de fotografie pentru începători. Ton prietenos. Beneficii: înveți în 30 de zile, acces pe viață, comunitate. CTA: înscrie-te acum."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />

        {/* Pixel */}
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includePixel}
            onChange={(e) => setIncludePixel(e.target.checked)}
          />
          Include pixelul de tracking (recomandat — pagina e urmărită din prima)
        </label>

        {/* Linkuri de conectat */}
        <label className="label">Conectează butoane la linkurile tale (CTA trackuibile)</label>
        {assetsQ.isLoading ? (
          <Spinner />
        ) : !assetsQ.data?.links.length ? (
          <p className="mb-3 text-sm text-slate-400">
            Niciun link scurt încă. Creează-le în secțiunea „Linkuri & QR" și revino.
          </p>
        ) : (
          <div className="mb-3 space-y-1">
            {assetsQ.data.links.map((l) => (
              <label
                key={l.slug}
                className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(l.slug)}
                  onChange={() => toggleLink(l.slug)}
                />
                <Link2 size={14} className="text-brand-500" />
                <span className="font-medium text-slate-700">{l.name}</span>
                <span className="truncate text-xs text-slate-400">→ {l.destination_url}</span>
              </label>
            ))}
          </div>
        )}

        <button
          className="btn-primary"
          disabled={!brief.trim() || generate.isPending}
          onClick={() => generate.mutate()}
        >
          <Sparkles size={16} />
          {generate.isPending ? "Construiesc…" : "Generează pagina"}
        </button>
      </div>

      {/* Rezultat */}
      {generate.isPending && <Spinner />}
      {result && <ResultCard result={result} onPreview={preview} onSave={doSave} saving={save.isPending} saved={save.isSuccess} />}
    </div>
  );
}

function ResultCard({
  result,
  onPreview,
  onSave,
  saving,
  saved,
}: {
  result: GenResult;
  onPreview: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  if (!result.available || "error" in result)
    return (
      <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
        {result.message || "AI indisponibil."}
      </div>
    );

  if (result.blocked)
    return (
      <div className="card border-red-200 bg-red-50/40">
        <div className="flex items-start gap-2 text-sm text-red-800">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            <b>Blocat de gardianul GDPR:</b> {result.blocked_reason}. Reformulează brieful
            și încearcă din nou.
          </span>
        </div>
      </div>
    );

  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-600" />
        <h3 className="font-semibold text-slate-800">Pagină generată</h3>
      </div>
      <p className="mb-3 text-sm text-slate-500">{result.note}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={onPreview}>
          <Eye size={15} /> Previzualizează
        </button>
        <button className="btn-primary" disabled={saving} onClick={onSave}>
          <Save size={16} /> Salvează ca landing
        </button>
        {saved && (
          <span className="self-center text-sm text-emerald-600">
            Salvat ✓ — mergi la „Landinguri" ca să publici.
          </span>
        )}
      </div>
    </div>
  );
}
