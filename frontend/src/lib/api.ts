import axios from "axios";

// `??` (nu `||`): un string GOL e valid și înseamnă „same-origin" (cereri
// relative `/api/...`, rezolvate de nginx-ul dispecer din producție). Doar
// `undefined` (variabila nesetată la build) cade pe fallback-ul local.
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_admin: boolean;
  can_sites: boolean;
  can_links: boolean;
  can_qr: boolean;
  is_active: boolean;
  created_at: string;
}

/** Capabilitate efectivă: adminul le are pe toate. */
export function can(user: User | null, cap: "sites" | "links" | "qr"): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  return cap === "sites" ? user.can_sites : cap === "links" ? user.can_links : user.can_qr;
}

/** Are acces la zona Linkuri/QR/Galerie (cel puțin una). */
export function canLinksArea(user: User | null): boolean {
  return can(user, "links") || can(user, "qr");
}

export interface Site {
  id: number;
  site_key: string;
  name: string;
  domain: string;
  min_engagement_seconds: number;
  created_at: string;
  snippet?: string;
}

export interface TrackedLink {
  id: number;
  slug: string;
  destination_url: string;
  name: string;
  description: string;
  location_label: string;
  kind: "link" | "qr";
  logo_image_id: number | null;
  is_active: boolean;
  created_at: string;
  short_url: string;
  qr_url: string;
  total_visits: number;
}

export interface GalleryImage {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface GalleryList {
  images: GalleryImage[];
  used_bytes: number;
  limit_bytes: number;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Secunde -> „1m 23s" / „45s" / „2h 5m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function extractError(err: unknown, fallback = "A apărut o eroare"): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  }
  return fallback;
}
