import { BarChart3, UserCircle, X } from "lucide-react";
import { useState } from "react";
import { extractError } from "../lib/api";
import {
  getSavedAccounts,
  removeAccount,
  saveAccount,
  type SavedAccount,
} from "../lib/accounts";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>(getSavedAccounts());

  async function doLogin(em: string, pw: string, save: boolean) {
    setError("");
    setBusy(true);
    try {
      await login(em, pw);
      if (save) {
        saveAccount({ email: em, password: pw });
      }
    } catch (err) {
      setError(extractError(err, "Autentificare eșuată"));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(email, password, remember);
  }

  function forget(em: string) {
    removeAccount(em);
    setAccounts(getSavedAccounts());
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <BarChart3 size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Statistic</h1>
          <p className="text-sm text-slate-500">Analytics & Tracking</p>
        </div>

        {/* Conturi salvate — login cu un click */}
        {accounts.length > 0 && (
          <div className="card mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Conturi salvate</p>
            <div className="space-y-2">
              {accounts.map((a) => (
                <div key={a.email} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => doLogin(a.email, a.password, true)}
                    className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                  >
                    <UserCircle className="text-brand-500" size={26} />
                    <span className="truncate text-sm font-medium text-slate-800">
                      {a.email}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Uită contul"
                    onClick={() => forget(a.email)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">— sau autentifică-te —</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Parolă</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Ține minte acest cont pe acest dispozitiv (login rapid)
          </label>
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Se autentifică…" : "Autentificare"}
          </button>
        </form>
      </div>
    </div>
  );
}
