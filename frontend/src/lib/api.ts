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

// ============================================================================
//  A/B Marketing + AI — tipuri partajate (răspunsurile router-ului /optimization)
// ============================================================================

/** O treaptă din pâlnie, forma editabilă (GET/PUT /funnel întoarce și id/position). */
export interface FunnelStep {
  kind: "page" | "custom_event";
  value: string;
  label: string;
  is_conversion: boolean;
}

/** O treaptă în rezultatul comparației: câți au atins-o + procentele de trecere. */
export interface FunnelStepResult extends FunnelStep {
  reached: number;
  pct_of_entries: number;
  pct_of_prev: number;
}

/** Un grup (landing sau campanie) în tabelul comparativ. */
export interface FunnelGroup {
  group: string;
  entries: number;
  engaged: number;
  engaged_pct: number;
  steps: FunnelStepResult[];
  conversions: number;
  conversion_rate: number;
  bounce_rate: number;
  avg_active_seconds: number;
  avg_scroll: number;
  enough_data: boolean;
  confidence: "ok" | "low";
}

/** Răspunsul complet de la GET /funnel-compare. */
export interface FunnelCompare {
  group_by: "landing" | "campaign";
  days: number;
  has_conversion_step: boolean;
  funnel_steps: FunnelStep[];
  groups: FunnelGroup[];
  winner: string | null;
}

/** O recomandare AI; câmpurile `blocked_*` apar doar dacă gardianul a respins-o. */
export interface AiRecommendation {
  element: string;
  problem: string;
  recommendation: string;
  severity: "low" | "medium" | "high";
  evidence?: string;
  blocked?: boolean;
  blocked_by?: string;
  blocked_reason?: string;
}

/** Răspunsul de la POST /ai-analyze (mereu are `available`). */
export interface AiAnalyzeResult {
  available: boolean;
  error?: boolean;
  message?: string;
  model?: string;
  recommendations: AiRecommendation[];
  blocked_count?: number;
}

/** O setare editabilă din admin (GET /api/admin/settings → câmpul `settings`). */
export interface AppSettingItem {
  key: string;
  value: any;
  kind: "text" | "number" | "json" | "bool";
  description: string;
  is_default: boolean;
  updated_at: string | null;
}

/** Răspunsul de la GET /api/admin/settings. */
export interface AdminSettings {
  ai: { enabled: boolean; model: string };
  settings: AppSettingItem[];
}

// ---- Landinguri găzduite + buclă de aplicare AI (Faza 2) -------------------

export interface Landing {
  id: number;
  path: string;
  label: string;
  published_version_id: number | null;
}

export interface LandingVersionMeta {
  id: number;
  version_no: number;
  source: "human" | "ai";
  note: string;
  status: "draft" | "published" | "archived";
  blocked: boolean;
  blocked_reason: string;
  created_at: string;
}

export interface LandingDetail {
  landing: Landing;
  published_version_id: number | null;
  public_url: string;
  versions: LandingVersionMeta[];
}

export interface VersionContent extends LandingVersionMeta {
  html: string;
  css: string;
  js: string;
}

/** Rezultatul generării AI: fie indisponibil/eroare, fie o versiune draft creată. */
export type GenerateResult =
  | { available: false; message: string }
  | { available: true; error: true; message: string }
  | ({ available: true } & VersionContent);

// ---- Orchestrare multi-agent: optimizează acum (§6.3) ----------------------

/** Un landing în clasamentul de oportunitate (rezultatul unui „agent"). */
export interface LandingRanking {
  path: string;
  conversion_rate: number | null;
  confidence: "ok" | "low" | null;
  opportunity_score: number;
  recommendation_count: number;
  blocked_count: number;
  report: AiAnalyzeResult;
}

/** Rezultatul rulării orchestratorului (POST /optimize-now sau o rulare stocată). */
export interface OptimizeResult {
  run_id?: number;
  created_at?: string;
  days: number;
  landing_count: number;
  ai_available: boolean;
  ranking: LandingRanking[];
}

/** Meta unei rulări din istoric (GET /optimization-runs). */
export interface OptimizationRunMeta {
  id: number;
  trigger: "manual" | "scheduled";
  days: number;
  landing_count: number;
  created_at: string;
}

// ---- Patch-uri DOM live aplicate de t.js (Faza 3) --------------------------

export interface LivePatch {
  id: number;
  path: string;
  label: string;
  selector: string;
  op: "text" | "style" | "attr";
  prop: string;
  value: string;
  risk: "low" | "medium" | "high";
  source: "human" | "ai";
  status: "draft" | "live" | "paused";
  auto_apply: boolean;
  blocked: boolean;
  blocked_reason: string;
  created_at: string;
}

/** Rezultatul generării AI a unui patch: indisponibil/eroare, sau patch-ul creat. */
export type PatchGenerateResult =
  | { available: false; message: string }
  | { available: true; error: true; message: string }
  | ({ available: true } & LivePatch);

// ---- Experimente A/B cu alocare bandit (viziune §6) ------------------------

export interface ExperimentArmDef {
  id: number;
  name: string;
  is_control: boolean;
  selector: string;
  op: "text" | "style" | "attr";
  prop: string;
  value: string;
}

export interface Experiment {
  id: number;
  path: string;
  name: string;
  status: "running" | "stopped";
  created_at: string;
  arms: ExperimentArmDef[];
}

/** Un braț în tabloul de statistici (GET /stats). */
export interface ArmStat {
  arm_id: number;
  name: string;
  is_control: boolean;
  patch: { selector: string; op: string; prop: string; value: string } | null;
  trials: number;
  conversions: number;
  conversion_rate: number;
  allocation_pct: number;
  enough_data: boolean;
  confidence: "ok" | "low";
  is_champion: boolean;
}

export interface ExperimentStats {
  id: number;
  path: string;
  name: string;
  status: "running" | "stopped";
  days: number;
  thresholds: { min_trials: number; min_conversions: number };
  arms: ArmStat[];
  champion_arm_id: number | null;
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
