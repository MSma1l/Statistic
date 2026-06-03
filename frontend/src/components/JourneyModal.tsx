import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  MousePointerClick,
  ArrowDownWideNarrow,
  Clock,
  Sparkles,
  X,
} from "lucide-react";
import { api, formatDuration } from "../lib/api";
import { Spinner } from "./ui";

interface JourneyEvent {
  at: string;
  type: string;
  path: string;
  text: string;
  selector: string;
  scroll_depth: number | null;
  duration_s: number | null;
  referrer: string;
  props: { href?: string; tag?: string } | null;
}

/** Iconița + descrierea unui pas din traseu, în limbaj de marketing. */
function describe(ev: JourneyEvent): { icon: JSX.Element; text: JSX.Element } {
  switch (ev.type) {
    case "pageview":
      return {
        icon: <Eye size={16} className="text-brand-600" />,
        text: (
          <>
            A vizitat <code className="text-slate-800">{ev.path}</code>
          </>
        ),
      };
    case "click":
      return {
        icon: <MousePointerClick size={16} className="text-emerald-600" />,
        text: (
          <>
            A dat click pe{" "}
            <span className="font-medium text-slate-800">
              {ev.text || ev.selector || "(element)"}
            </span>
            {ev.props?.href ? (
              <span className="text-slate-400"> → {ev.props.href}</span>
            ) : null}
          </>
        ),
      };
    case "scroll":
      return {
        icon: <ArrowDownWideNarrow size={16} className="text-indigo-500" />,
        text: <>A derulat până la {ev.scroll_depth}% din pagină</>,
      };
    case "engagement":
      return {
        icon: <Clock size={16} className="text-amber-500" />,
        text: (
          <>
            A stat <span className="font-medium">{formatDuration(ev.duration_s || 0)}</span>{" "}
            pe <code className="text-slate-800">{ev.path}</code>
            {ev.scroll_depth ? ` (scroll max ${ev.scroll_depth}%)` : ""}
          </>
        ),
      };
    default:
      return {
        icon: <Sparkles size={16} className="text-fuchsia-500" />,
        text: (
          <>
            Eveniment <span className="font-medium">{ev.text || ev.type}</span>
          </>
        ),
      };
  }
}

export default function JourneyModal({
  siteId,
  sessionId,
  onClose,
}: {
  siteId: number;
  sessionId: string;
  onClose: () => void;
}) {
  const journey = useQuery({
    queryKey: ["journey", siteId, sessionId],
    queryFn: async () =>
      (
        await api.get<JourneyEvent[]>(
          `/api/analytics/${siteId}/journey?session_id=${encodeURIComponent(sessionId)}`
        )
      ).data,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Traseul vizitatorului</h2>
            <p className="text-xs text-slate-400">Sesiune {sessionId}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {journey.isLoading ? (
            <Spinner />
          ) : !journey.data?.length ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Niciun eveniment pentru această sesiune.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {journey.data.map((ev, i) => {
                const d = describe(ev);
                const time = new Date(ev.at).toLocaleTimeString("ro-RO");
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2 ring-slate-100">
                      {d.icon}
                    </span>
                    <div className="text-sm text-slate-600">{d.text}</div>
                    <div className="text-xs text-slate-400">{time}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
