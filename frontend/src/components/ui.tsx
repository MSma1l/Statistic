import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Access } from "../lib/api";

/**
 * Etichetă care arată cum ajunge utilizatorul curent la o resursă:
 * - `owner` → nimic (e a lui, nu are rost o etichetă).
 * - `admin` → „Al lui {owner_email}" (adminul vede resursele altora).
 * - `shared` → „Partajat" (+ „doar citire" dacă nu poate edita).
 */
export function AccessBadge({
  access,
  canEdit,
  ownerEmail,
}: {
  access?: Access;
  canEdit?: boolean;
  ownerEmail?: string;
}) {
  if (!access || access === "owner") return null;
  if (access === "admin") {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        Al lui {ownerEmail || "alt utilizator"}
      </span>
    );
  }
  // shared
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
        Partajat
      </span>
      {!canEdit && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          doar citire
        </span>
      )}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center text-slate-400">
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12 text-slate-400">
      Se încarcă…
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copiat!" : label || "Copiază"}
    </button>
  );
}
