import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Shield, Trash2, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader, Spinner } from "../components/ui";
import { api, extractError, type User } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Perms {
  is_admin: boolean;
  can_sites: boolean;
  can_links: boolean;
  can_qr: boolean;
}

const PRESETS: { label: string; perms: Perms }[] = [
  { label: "Administrator", perms: { is_admin: true, can_sites: true, can_links: true, can_qr: true } },
  { label: "Tot (premium)", perms: { is_admin: false, can_sites: true, can_links: true, can_qr: true } },
  { label: "Doar site (pixel)", perms: { is_admin: false, can_sites: true, can_links: false, can_qr: false } },
  { label: "Link + QR", perms: { is_admin: false, can_sites: false, can_links: true, can_qr: true } },
  { label: "Doar QR", perms: { is_admin: false, can_sites: false, can_links: false, can_qr: true } },
  { label: "Doar Link", perms: { is_admin: false, can_sites: false, can_links: true, can_qr: false } },
];

const PERM_FIELDS: { key: keyof Perms; label: string }[] = [
  { key: "is_admin", label: "Administrator (gestionează utilizatori)" },
  { key: "can_sites", label: "Site-uri / Pixel" },
  { key: "can_links", label: "Linkuri" },
  { key: "can_qr", label: "QR coduri" },
];

function PermissionEditor({
  perms,
  onChange,
}: {
  perms: Perms;
  onChange: (p: Perms) => void;
}) {
  function eq(a: Perms, b: Perms) {
    return (
      a.is_admin === b.is_admin &&
      a.can_sites === b.can_sites &&
      a.can_links === b.can_links &&
      a.can_qr === b.can_qr
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ ...p.perms })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              eq(perms, p.perms)
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {PERM_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={perms[f.key]}
              onChange={(e) => onChange({ ...perms, [f.key]: e.target.checked })}
            />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function permBadges(u: User) {
  if (u.is_admin) return [{ t: "admin", c: "bg-brand-50 text-brand-700" }];
  const b: { t: string; c: string }[] = [];
  if (u.can_sites) b.push({ t: "site", c: "bg-emerald-50 text-emerald-700" });
  if (u.can_links) b.push({ t: "link", c: "bg-sky-50 text-sky-700" });
  if (u.can_qr) b.push({ t: "QR", c: "bg-amber-50 text-amber-700" });
  if (!b.length) b.push({ t: "fără acces", c: "bg-slate-100 text-slate-500" });
  return b;
}

export default function Settings() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [perms, setPerms] = useState<Perms>({
    is_admin: false,
    can_sites: true,
    can_links: true,
    can_qr: true,
  });
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editPerms, setEditPerms] = useState<Perms>({
    is_admin: false,
    can_sites: false,
    can_links: false,
    can_qr: false,
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/auth/users")).data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/auth/users", { ...form, ...perms })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm({ email: "", full_name: "", password: "" });
      setPerms({ is_admin: false, can_sites: true, can_links: true, can_qr: true });
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  const editMut = useMutation({
    mutationFn: async () => api.patch(`/auth/users/${editId}`, editPerms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditId(null);
    },
  });

  const delMut = useMutation({
    mutationFn: async (uid: number) => api.delete(`/auth/users/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <PageHeader
        title="Utilizatori"
        subtitle="Adaugă conturi și setează exact ce poate accesa fiecare (pe invitație, fără înregistrare publică)."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Utilizator nou
          </button>
        }
      />

      {showForm && (
        <div className="card mb-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Email *</label>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Nume complet</label>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Parolă * (min. 6)</label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Permisiuni</label>
            <PermissionEditor perms={perms} onChange={setPerms} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!form.email || form.password.length < 6 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Creează
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              Anulează
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {users?.map((u) => (
            <div key={u.id} className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  {u.is_admin ? <Shield size={18} /> : <UserIcon size={18} />}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{u.full_name || u.email}</div>
                  <div className="text-sm text-slate-400">{u.email}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {permBadges(u).map((b, i) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${b.c}`}>
                      {b.t}
                    </span>
                  ))}
                </div>
                {u.id !== me?.id && (
                  <>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setEditId(editId === u.id ? null : u.id);
                        setEditPerms({
                          is_admin: u.is_admin,
                          can_sites: u.can_sites,
                          can_links: u.can_links,
                          can_qr: u.can_qr,
                        });
                      }}
                    >
                      <Pencil size={15} /> Permisiuni
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => {
                        if (confirm(`Ștergi contul ${u.email}?`)) delMut.mutate(u.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>

              {editId === u.id && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <PermissionEditor perms={editPerms} onChange={setEditPerms} />
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary" onClick={() => editMut.mutate()} disabled={editMut.isPending}>
                      Salvează permisiunile
                    </button>
                    <button className="btn-ghost" onClick={() => setEditId(null)}>
                      Anulează
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
