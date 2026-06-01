import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { EmptyState, PageHeader, Spinner } from "../components/ui";
import {
  api,
  API_URL,
  extractError,
  formatBytes,
  type GalleryList,
} from "../lib/api";

export default function Gallery() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["gallery"],
    queryFn: async () => (await api.get<GalleryList>("/api/gallery")).data,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return (await api.post("/api/gallery", fd)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gallery"] });
      setError("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err) => setError(extractError(err, "Încărcare eșuată")),
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/gallery/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery"] }),
  });

  const used = data?.used_bytes ?? 0;
  const limit = data?.limit_bytes ?? 1;
  const pct = Math.min(100, (used / limit) * 100);

  return (
    <div>
      <PageHeader
        title="Galerie"
        subtitle="Imaginile tale (logo-uri pentru QR coduri). Maxim 25 MB în total."
        action={
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Încarcă imagine
          </button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadMut.mutate(f);
        }}
      />

      {/* Bară de utilizare */}
      <div className="card mb-6">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-slate-600">Spațiu folosit</span>
          <span className="font-medium text-slate-900">
            {formatBytes(used)} / {formatBytes(limit)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !data?.images.length ? (
        <EmptyState>
          <ImageIcon className="mb-3" size={32} />
          <p>Nicio imagine încă. Încarcă un logo ca să-l pui în centrul QR-urilor.</p>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {data.images.map((img) => (
            <div key={img.id} className="card group relative p-2">
              <img
                src={`${API_URL}/api/gallery/${img.id}/raw`}
                alt={img.filename}
                className="aspect-square w-full rounded-lg object-contain"
              />
              <div className="mt-2 truncate text-xs text-slate-500" title={img.filename}>
                {img.filename}
              </div>
              <div className="text-xs text-slate-400">{formatBytes(img.size_bytes)}</div>
              <button
                className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-red-600 opacity-0 shadow transition group-hover:opacity-100"
                onClick={() => {
                  if (confirm(`Ștergi imaginea ${img.filename}?`)) delMut.mutate(img.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
