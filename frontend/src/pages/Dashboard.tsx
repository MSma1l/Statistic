import { useQuery } from "@tanstack/react-query";
import { Globe, LinkIcon, MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatCard } from "../components/ui";
import { api, type Site, type TrackedLink } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Dashboard() {
  const { user } = useAuth();
  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/api/sites")).data,
  });
  const links = useQuery({
    queryKey: ["links"],
    queryFn: async () => (await api.get<TrackedLink[]>("/api/links")).data,
  });

  const totalVisits = (links.data ?? []).reduce((a, l) => a + l.total_visits, 0);

  return (
    <div>
      <PageHeader
        title={`Salut, ${user?.full_name || user?.email} 👋`}
        subtitle="Privire de ansamblu asupra tracking-ului tău."
      />

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Site-uri urmărite" value={sites.data?.length ?? "—"} icon={<Globe size={18} />} />
        <StatCard label="Linkuri & QR" value={links.data?.length ?? "—"} icon={<LinkIcon size={18} />} />
        <StatCard label="Total intrări linkuri" value={totalVisits} icon={<MousePointerClick size={18} />} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link to="/sites" className="card transition hover:border-brand-300 hover:shadow-md">
          <div className="mb-2 flex items-center gap-2 text-brand-600">
            <Globe size={20} />
            <span className="font-semibold text-slate-900">Site-uri (Pixel)</span>
          </div>
          <p className="text-sm text-slate-500">
            Generează scriptul de tracking, vezi vizitatori, click-uri și heatmap.
          </p>
        </Link>
        <Link to="/links" className="card transition hover:border-brand-300 hover:shadow-md">
          <div className="mb-2 flex items-center gap-2 text-brand-600">
            <LinkIcon size={20} />
            <span className="font-semibold text-slate-900">Linkuri & QR</span>
          </div>
          <p className="text-sm text-slate-500">
            Creează linkuri scurte și QR coduri permanente cu statistici de intrări.
          </p>
        </Link>
      </div>
    </div>
  );
}
