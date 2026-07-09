import { http, HttpResponse } from "msw";
import type { User } from "../lib/api";

// URL-ul de bază folosit de instanța axios în teste (fallback-ul din api.ts când
// VITE_API_URL nu e setat).
export const BASE = "http://localhost:8000";

export const adminUser: User = {
  id: 1,
  email: "admin@test.ro",
  full_name: "Admin Test",
  is_admin: true,
  can_sites: true,
  can_links: true,
  can_qr: true,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

export function makeUser(overrides: Partial<User> = {}): User {
  return { ...adminUser, ...overrides };
}

// Handler-ele implicite acoperă „drumul fericit". Testele individuale le
// suprascriu cu server.use(...) pentru cazuri specifice (erori, date diferite).
export const handlers = [
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(adminUser)),
  http.post(`${BASE}/auth/login`, () => HttpResponse.json(adminUser)),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json({ ok: true })),
  http.get(`${BASE}/auth/users`, () => HttpResponse.json([adminUser])),

  http.get(`${BASE}/api/sites`, () => HttpResponse.json([])),
  http.get(`${BASE}/api/links`, () => HttpResponse.json([])),
  http.get(`${BASE}/api/gallery`, () =>
    HttpResponse.json({ images: [], used_bytes: 0, limit_bytes: 26214400 })
  ),
  http.get(`${BASE}/api/analytics/overview`, () =>
    HttpResponse.json({
      sites_count: 0,
      pageviews: 0,
      clicks: 0,
      visitors: 0,
      sessions: 0,
      top_sites: [],
      top_pages: [],
      timeseries: [],
    })
  ),
  http.get(`${BASE}/api/links/overview`, () =>
    HttpResponse.json({
      links_count: 0,
      total: 0,
      scans: 0,
      clicks: 0,
      top_links: [],
      top_qr: [],
      by_location: [],
      timeseries: [],
    })
  ),
];
