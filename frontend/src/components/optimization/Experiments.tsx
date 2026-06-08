import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, Trash2, Trophy, Plus, FlaskConical } from "lucide-react";
import { useState } from "react";
import {
  api,
  type Experiment,
  type ExperimentStats,
  type ArmStat,
} from "../../lib/api";
import { Spinner } from "../ui";

/**
 * Experimente A/B cu alocare bandit (viziune §6). Fiecare experiment are un
 * „control" (pagina neatinsă) + variante (patch-uri). Serverul (Thompson sampling)
 * trimite dinamic mai mult trafic spre brațul care convertește (campionul), dar
 * explorează în continuare. Aici creezi/pornești experimente și vezi cum curge traficul.
 */
export default function Experiments({
  siteId,
  paths,
}: {
  siteId: number;
  paths: { path: string }[];
}) {
  const qc = useQueryClient();
  const key = ["experiments", siteId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get<Experiment[]>(`/api/experiments/${siteId}`)).data,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const start = useMutation({
    mutationFn: async (id: number) =>
      api.post(`/api/experiments/${siteId}/${id}/start`),
    onSuccess: invalidate,
  });
  const stop = useMutation({
    mutationFn: async (id: number) =>
      api.post(`/api/experiments/${siteId}/${id}/stop`),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async (id: number) =>
      api.delete(`/api/experiments/${siteId}/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <CreateExperiment siteId={siteId} paths={paths} onDone={invalidate} />

      <div className="card">
        <h2 className="mb-4 font-semibold text-slate-800">
          Experimente ({list.data?.length ?? 0})
        </h2>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Niciun experiment încă. Creează unul mai sus (control + cel puțin o variantă).
          </p>
        ) : (
          <div className="space-y-4">
            {list.data.map((e) => (
              <ExperimentRow
                key={e.id}
                siteId={siteId}
                exp={e}
                onStart={() => start.mutate(e.id)}
                onStop={() => stop.mutate(e.id)}
                onDelete={() => {
                  if (confirm("Ștergi experimentul și datele lui?")) del.mutate(e.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExperimentRow({
  siteId,
  exp,
  onStart,
  onStop,
  onDelete,
}: {
  siteId: number;
  exp: Experiment;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const stats = useQuery({
    queryKey: ["exp-stats", siteId, exp.id],
    queryFn: async () =>
      (
        await api.get<ExperimentStats>(
          `/api/experiments/${siteId}/${exp.id}/stats`
        )
      ).data,
    refetchInterval: exp.status === "running" ? 10000 : false,
  });

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FlaskConical size={16} className="text-brand-600" />
        <span className="font-medium text-slate-800">{exp.name}</span>
        <code className="text-xs text-slate-400">{exp.path}</code>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            exp.status === "running"
              ? "bg-green-100 text-green-800"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {exp.status === "running" ? "● rulează" : "oprit"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {exp.status === "running" ? (
            <button className="btn-ghost text-amber-600" onClick={onStop}>
              <Square size={14} /> Oprește
            </button>
          ) : (
            <button className="btn-primary" onClick={onStart}>
              <Play size={14} /> Pornește
            </button>
          )}
          <button className="btn-ghost text-red-500" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {stats.isLoading ? (
        <Spinner />
      ) : stats.data ? (
        <ArmsTable arms={stats.data.arms} />
      ) : null}
    </div>
  );
}

function ArmsTable({ arms }: { arms: ArmStat[] }) {
  return (
    <div className="space-y-2">
      {arms.map((a) => (
        <div key={a.arm_id} className="flex items-center gap-3 text-sm">
          <span className="flex w-40 shrink-0 items-center gap-1 truncate">
            {a.is_champion && <Trophy size={14} className="text-amber-500" />}
            <span className={a.is_champion ? "font-semibold text-slate-800" : "text-slate-700"}>
              {a.name}
            </span>
            {a.is_control && <span className="text-xs text-slate-400">(control)</span>}
          </span>

          {/* Bara de alocare a traficului (cât trimite banditul spre acest braț) */}
          <div className="h-5 flex-1 overflow-hidden rounded-lg bg-slate-100">
            <div
              className={`flex h-full items-center justify-end rounded-lg px-2 text-xs font-medium text-white ${
                a.is_champion ? "bg-amber-500" : "bg-brand-500"
              }`}
              style={{ width: `${Math.max(a.allocation_pct, 4)}%` }}
            >
              {a.allocation_pct}%
            </div>
          </div>

          <span className="w-44 shrink-0 text-right text-xs text-slate-500">
            {a.conversions}/{a.trials} ·{" "}
            <b className="text-slate-700">{a.conversion_rate}%</b>
            {a.confidence === "low" && (
              <span className="ml-1 rounded bg-amber-50 px-1 text-amber-600">
                date insuf.
              </span>
            )}
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-slate-400">
        Alocarea (%) = cât trafic trimite banditul spre fiecare braț acum. „Campionul"
        e cea mai bună rată dintre brațele cu destule date — restul sunt explorate.
      </p>
    </div>
  );
}

type VariantForm = {
  name: string;
  selector: string;
  op: "text" | "style" | "attr";
  prop: string;
  value: string;
};

/** Formular: pagina + nume + variante. Controlul e adăugat automat ca prim braț. */
function CreateExperiment({
  siteId,
  paths,
  onDone,
}: {
  siteId: number;
  paths: { path: string }[];
  onDone: () => void;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [variants, setVariants] = useState<VariantForm[]>([
    { name: "Variantă A", selector: "", op: "text", prop: "", value: "" },
  ]);

  const create = useMutation({
    mutationFn: async () =>
      api.post(`/api/experiments/${siteId}`, {
        path,
        name,
        arms: [
          { name: "Control", is_control: true, op: "text" },
          ...variants.map((v) => ({ ...v, is_control: false })),
        ],
      }),
    onSuccess: () => {
      setName("");
      setVariants([{ name: "Variantă A", selector: "", op: "text", prop: "", value: "" }]);
      onDone();
    },
  });

  const setV = (i: number, patch: Partial<VariantForm>) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const valid = path && variants.every((v) => v.selector.trim());

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold text-slate-800">Experiment nou</h2>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <select className="input" value={path} onChange={(e) => setPath(e.target.value)}>
          <option value="">Alege pagina…</option>
          {paths.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Nume experiment (ex: test CTA)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <p className="mb-2 text-xs text-slate-500">
        Brațul „Control" (pagina neatinsă) e adăugat automat. Adaugă una sau mai multe
        variante; fiecare e un patch DOM aplicat de t.js celor care nimeresc brațul.
      </p>

      <div className="space-y-2">
        {variants.map((v, i) => (
          <div key={i} className="rounded-lg border border-slate-100 p-2">
            <div className="mb-1 flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Nume variantă"
                value={v.name}
                onChange={(e) => setV(i, { name: e.target.value })}
              />
              {variants.length > 1 && (
                <button
                  className="btn-ghost text-red-500"
                  onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input
                className="input col-span-2"
                placeholder="Selector (ex: #cta)"
                value={v.selector}
                onChange={(e) => setV(i, { selector: e.target.value })}
              />
              <select
                className="input"
                value={v.op}
                onChange={(e) => setV(i, { op: e.target.value as VariantForm["op"] })}
              >
                <option value="text">text</option>
                <option value="style">style</option>
                <option value="attr">attr</option>
              </select>
              <input
                className="input"
                placeholder={v.op === "text" ? "(gol)" : "prop"}
                disabled={v.op === "text"}
                value={v.prop}
                onChange={(e) => setV(i, { prop: e.target.value })}
              />
            </div>
            <input
              className="input mt-2"
              placeholder="Valoarea (text nou / valoare CSS / atribut)"
              value={v.value}
              onChange={(e) => setV(i, { value: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          className="btn-ghost"
          onClick={() =>
            setVariants((vs) => [
              ...vs,
              {
                name: `Variantă ${String.fromCharCode(65 + vs.length)}`,
                selector: "",
                op: "text",
                prop: "",
                value: "",
              },
            ])
          }
        >
          <Plus size={14} /> Mai adaugă o variantă
        </button>
        <button
          className="btn-primary ml-auto"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          <FlaskConical size={16} />
          {create.isPending ? "Creez…" : "Creează experiment"}
        </button>
      </div>
    </div>
  );
}
