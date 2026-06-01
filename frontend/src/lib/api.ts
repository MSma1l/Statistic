import axios from "axios";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Site {
  id: number;
  site_key: string;
  name: string;
  domain: string;
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

export function extractError(err: unknown, fallback = "A apărut o eroare"): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  }
  return fallback;
}
