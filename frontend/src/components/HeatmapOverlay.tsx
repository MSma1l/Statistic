import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, ImageIcon, Upload, Trash2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, api } from "../lib/api";
import HeatmapCanvas, { type HeatPoint } from "./HeatmapCanvas";

interface HeatData {
  points: HeatPoint[];
  count: number;
  doc_w: number | null;
  doc_h: number | null;
}

/** Măsoară lățimea/înălțimea reală a unui element (pentru a scala suprapunerea). */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function defaultUrl(domain: string, path: string): string {
  if (!domain) return "";
  const hasScheme = /^https?:\/\//.test(domain);
  const isLocal = /localhost|127\.0\.0\.1/.test(domain);
  const base = hasScheme ? domain : (isLocal ? "http://" : "https://") + domain;
  return base.replace(/\/$/, "") + path;
}

/** Cel mai dens „spot": împărțim pagina în celule și luăm câte click-uri are cea mai aglomerată. */
function densityMax(points: HeatPoint[], binPct = 4): number {
  if (!points.length) return 1;
  const bins = new Map<string, number>();
  for (const p of points) {
    const k = `${Math.floor(p.x / binPct)},${Math.floor(p.y / binPct)}`;
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  return Math.max(1, ...bins.values());
}

export default function HeatmapOverlay({
  siteId,
  path,
  domain,
  data,
}: {
  siteId: number;
  path: string;
  domain: string;
  data: HeatData | undefined;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"live" | "image">("live");
  const [wrapRef, size] = useElementSize();
  const fileRef = useRef<HTMLInputElement>(null);

  const points = data?.points ?? [];
  const docW = data?.doc_w || 1280;
  const docH = data?.doc_h || Math.round(docW * 1.6);
  const maxDensity = useMemo(() => densityMax(points), [points]);

  // URL pentru modul „Live", editabil și reținut local per (site, pagină).
  const storeKey = `st_preview_url_${siteId}_${path}`;
  const [url, setUrl] = useState(() => {
    return localStorage.getItem(storeKey) || defaultUrl(domain, path);
  });
  const [liveUrl, setLiveUrl] = useState(url);
  useEffect(() => {
    // La schimbarea paginii, resetează ȘI URL-ul afișat, ȘI cel încărcat în
    // iframe — altfel heatmap-ul noii pagini ar apărea peste pagina veche.
    const next = localStorage.getItem(storeKey) || defaultUrl(domain, path);
    setUrl(next);
    setLiveUrl(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  // Acceptă DOAR http(s) (blochează javascript:/data: în src-ul iframe-ului).
  const isHttp = /^https?:\/\//i.test(liveUrl);
  const previewUrl = isHttp
    ? liveUrl + (liveUrl.includes("?") ? "&" : "?") + "_st_preview=1"
    : "";

  // Captura încărcată (modul „Imagine").
  const snap = useQuery({
    queryKey: ["snapshot", siteId, path],
    queryFn: async () =>
      (await api.get(`/api/analytics/${siteId}/snapshot?path=${encodeURIComponent(path)}`))
        .data,
  });
  const [bust, setBust] = useState(0);
  const rawUrl = `${API_URL}/api/analytics/${siteId}/snapshot/raw?path=${encodeURIComponent(
    path
  )}&v=${bust}`;

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post(
        `/api/analytics/${siteId}/snapshot?path=${encodeURIComponent(path)}`,
        fd
      );
    },
    onSuccess: () => {
      setBust((b) => b + 1);
      qc.invalidateQueries({ queryKey: ["snapshot", siteId, path] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: async () =>
      api.delete(`/api/analytics/${siteId}/snapshot?path=${encodeURIComponent(path)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot", siteId, path] }),
  });

  const scale = size.w && mode === "live" ? size.w / docW : 1;
  const liveContentH = mode === "live" ? docH * scale : 0;
  const radius = Math.max(16, size.w * 0.025);

  return (
    <div>
      {/* Comutator mod + acțiuni */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          <button
            onClick={() => setMode("live")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
              mode === "live" ? "bg-brand-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            <Monitor size={15} /> Live
          </button>
          <button
            onClick={() => setMode("image")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
              mode === "image" ? "bg-brand-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            <ImageIcon size={15} /> Imagine
          </button>
        </div>

        {mode === "live" ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              className="input flex-1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://site-ul-tau.ro/pagina"
            />
            <button
              className="btn-ghost"
              onClick={() => {
                localStorage.setItem(storeKey, url);
                setLiveUrl(url);
              }}
            >
              <RefreshCw size={15} /> Încarcă
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMut.mutate(f);
                e.target.value = "";
              }}
            />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> {snap.data?.has ? "Înlocuiește" : "Încarcă"} captura
            </button>
            {snap.data?.has && (
              <button className="btn-ghost text-red-500" onClick={() => deleteMut.mutate()}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zona de suprapunere */}
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        style={mode === "live" ? { height: liveContentH || 400 } : undefined}
      >
        {mode === "live" ? (
          previewUrl ? (
            <iframe
              title="preview"
              src={previewUrl}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              style={{
                width: docW,
                height: docH,
                transform: `scale(${scale})`,
                transformOrigin: "0 0",
                border: 0,
                pointerEvents: "none",
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
              Scrie URL-ul paginii mai sus și apasă „Încarcă".
            </div>
          )
        ) : snap.data?.has ? (
          <img src={rawUrl} alt="captură pagină" className="block w-full" />
        ) : (
          <div className="flex items-center justify-center p-12 text-center text-sm text-slate-400">
            Încarcă o captură (screenshot) a paginii ca să vezi heatmap-ul peste ea.
          </div>
        )}

        {/* Heatmap-ul, suprapus, non-interactiv */}
        {points.length > 0 && (mode === "live" ? size.w > 0 : snap.data?.has) && (
          <HeatmapCanvas
            points={points}
            width={Math.max(1, Math.round(size.w))}
            height={Math.max(1, Math.round(size.h))}
            radius={radius}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        )}
      </div>

      {/* Legendă: culori -> câte click-uri */}
      <Legend total={data?.count ?? 0} max={maxDensity} />

      {mode === "live" && (
        <p className="mt-2 text-xs text-slate-400">
          Modul „Live" încarcă pagina ta reală în timp real (nu afectează statisticile —
          tracker-ul se dezactivează cu <code>_st_preview</code>). Dacă pagina nu apare,
          site-ul tău blochează încărcarea în iframe — folosește modul „Imagine".
        </p>
      )}
    </div>
  );
}

function Legend({ total, max }: { total: number; max: number }) {
  // 4 praguri de la 1 la „max click-uri într-un punct", deduplicate.
  const raw = [1, Math.round(max * 0.4), Math.round(max * 0.7), max];
  const ticks = Array.from(new Set(raw.map((n) => Math.max(1, n))));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500">Click-uri / zonă:</span>
        <div className="flex flex-col">
          <div
            className="h-3 w-48 rounded-full"
            style={{
              background:
                "linear-gradient(to right, #3b82f6, #22c55e, #eab308, #ef4444)",
            }}
          />
          <div className="mt-1 flex w-48 justify-between text-[11px] text-slate-500">
            {ticks.map((t, i) => (
              <span key={i}>{t === max && max > 1 ? `${t}` : t}</span>
            ))}
          </div>
          <div className="flex w-48 justify-between text-[10px] text-slate-400">
            <span>puține</span>
            <span>multe</span>
          </div>
        </div>
      </div>
      <div className="text-sm text-slate-600">
        Total: <span className="font-semibold text-slate-900">{total}</span> click-uri pe
        pagină
      </div>
    </div>
  );
}
