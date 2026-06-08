import AiRecommendations from "./AiRecommendations";
import FunnelCompareTable from "./FunnelCompareTable";
import FunnelEditor from "./FunnelEditor";
import OptimizeNow from "./OptimizeNow";

/**
 * Secțiunea „Optimizare" din pagina unui site. Doar orchestrează cele trei carduri
 * independente (editor pâlnie → comparație → analiză AI). Fiecare card își ține
 * singur datele; aici doar le punem în ordine și le pasăm contextul (site, zile, pagini).
 */
export default function OptimizationSection({
  siteId,
  days,
  paths,
}: {
  siteId: number;
  days: number;
  paths: { path: string }[];
}) {
  return (
    <div className="space-y-6">
      <OptimizeNow siteId={siteId} days={days} />
      <FunnelEditor siteId={siteId} />
      <FunnelCompareTable siteId={siteId} days={days} />
      <AiRecommendations siteId={siteId} days={days} paths={paths} />
    </div>
  );
}
