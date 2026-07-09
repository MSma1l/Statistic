import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  api,
  createShare,
  deleteShare,
  extractError,
  listShares,
  updateShare,
  type ResourceType,
  type Share,
  type User,
} from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Panou de partajare per-resursă. Se afișează pe SiteDetail / LinkDetail doar
 * dacă utilizatorul curent poate gestiona resursa (`canManage`: admin sau owner).
 *
 * Lista de utilizatori (`GET /auth/users`) e disponibilă doar adminilor, așa că
 * selectorul de „adaugă utilizator" apare numai pentru admin. Un owner ne-admin
 * vede totuși partajările existente și le poate modifica / revoca.
 */
export default function SharePanel({
  resourceType,
  resourceId,
  ownerEmail,
  canManage,
}: {
  resourceType: ResourceType;
  resourceId: number;
  ownerEmail?: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [selUserId, setSelUserId] = useState("");
  const [newCanEdit, setNewCanEdit] = useState(false);
  const [error, setError] = useState("");

  const sharesKey = ["shares", resourceType, resourceId];

  const shares = useQuery({
    queryKey: sharesKey,
    queryFn: () => listShares(resourceType, resourceId),
    enabled: canManage,
  });

  // Doar adminii pot lista utilizatorii (pentru selectorul de partajare nouă).
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/auth/users")).data,
    enabled: canManage && isAdmin,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: sharesKey });
  }

  const addMut = useMutation({
    mutationFn: () =>
      createShare({
        resource_type: resourceType,
        resource_id: resourceId,
        user_id: Number(selUserId),
        can_edit: newCanEdit,
      }),
    onSuccess: () => {
      invalidate();
      setSelUserId("");
      setNewCanEdit(false);
      setError("");
    },
    onError: (err) => setError(extractError(err, "Nu s-a putut adăuga partajarea")),
  });

  const toggleMut = useMutation({
    mutationFn: (s: Share) => updateShare(s.id, !s.can_edit),
    onSuccess: invalidate,
    onError: (err) => setError(extractError(err)),
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => deleteShare(id),
    onSuccess: invalidate,
    onError: (err) => setError(extractError(err)),
  });

  if (!canManage) return null;

  const sharedList = shares.data ?? [];
  const sharedUserIds = new Set(sharedList.map((s) => s.user_id));
  const candidates = (usersQ.data ?? []).filter(
    (u) =>
      !sharedUserIds.has(u.id) &&
      u.email !== ownerEmail &&
      u.id !== user?.id
  );

  return (
    <div className="card mb-6">
      <div className="mb-1 flex items-center gap-2">
        <Share2 size={18} className="text-brand-600" />
        <h2 className="font-semibold text-slate-800">Partajează</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Dă acces altor utilizatori la această resursă. „Poate edita" permite și
        modificarea, altfel accesul e doar de vizualizare.
      </p>

      {/* Lista celor cu care e deja partajat */}
      {shares.isLoading ? (
        <p className="py-2 text-sm text-slate-400">Se încarcă…</p>
      ) : !sharedList.length ? (
        <p className="py-2 text-sm text-slate-400">
          Încă nu e partajată cu nimeni.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sharedList.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2"
              data-testid={`share-${s.id}`}
            >
              <span className="flex-1 truncate text-sm text-slate-700">
                {s.user_email}
              </span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={s.can_edit}
                  disabled={toggleMut.isPending}
                  onChange={() => toggleMut.mutate(s)}
                />
                Poate edita
              </label>
              <button
                type="button"
                className="btn-ghost"
                aria-label={`Revocă accesul pentru ${s.user_email}`}
                disabled={revokeMut.isPending}
                onClick={() => revokeMut.mutate(s.id)}
              >
                <Trash2 size={16} /> Revocă
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adaugă un utilizator (doar admin — are acces la /auth/users) */}
      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <select
            className="input max-w-xs"
            aria-label="Alege utilizator"
            value={selUserId}
            onChange={(e) => setSelUserId(e.target.value)}
          >
            <option value="">Alege un utilizator…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ? `${u.full_name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={newCanEdit}
              onChange={(e) => setNewCanEdit(e.target.checked)}
            />
            Poate edita
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={!selUserId || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            <UserPlus size={16} /> Adaugă
          </button>
        </div>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400">
          Doar un administrator poate adăuga utilizatori noi la partajare.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
