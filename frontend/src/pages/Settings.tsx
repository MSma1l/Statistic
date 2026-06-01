import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Trash2, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader, Spinner } from "../components/ui";
import { api, extractError, type User } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Settings() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", is_admin: false });
  const [error, setError] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/auth/users")).data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/auth/users", form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm({ email: "", full_name: "", password: "", is_admin: false });
      setError("");
    },
    onError: (err) => setError(extractError(err)),
  });

  const delMut = useMutation({
    mutationFn: async (uid: number) => api.delete(`/auth/users/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <PageHeader
        title="Utilizatori"
        subtitle="Adaugă conturi (pe invitație — nu există înregistrare publică)."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Utilizator nou
          </button>
        }
      />

      {showForm && (
        <div className="card mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Nume complet</label>
              <input
                className="input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Parolă * (min. 6 caractere)</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_admin}
                onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
              />
              Drepturi de administrator
            </label>
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
        <div className="card divide-y divide-slate-100">
          {users?.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                {u.is_admin ? <Shield size={18} /> : <UserIcon size={18} />}
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900">
                  {u.full_name || u.email}
                  {u.is_admin && (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                      admin
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-400">{u.email}</div>
              </div>
              {u.id !== me?.id && (
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`Ștergi contul ${u.email}?`)) delMut.mutate(u.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
