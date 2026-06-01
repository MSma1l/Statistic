import { useEffect, useRef } from "react";

export interface HeatPoint {
  x: number; // procent 0-100
  y: number; // procent 0-100
}

/**
 * Heatmap simplu pe canvas: fiecare punct desenează un gradient radial,
 * apoi aplicăm o paletă de culori în funcție de intensitate (densitate de click-uri).
 */
export default function HeatmapCanvas({
  points,
  width = 900,
  height = 600,
  radius = 28,
}: {
  points: HeatPoint[];
  width?: number;
  height?: number;
  radius?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 1) Desenăm intensitatea în alpha (alb pe negru transparent)
    ctx.globalCompositeOperation = "source-over";
    for (const p of points) {
      const x = (p.x / 100) * width;
      const y = (p.y / 100) * height;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(0,0,0,0.18)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2) Recolorăm pe baza alpha-ului acumulat
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      const t = Math.min(alpha / 255, 1);
      const [r, g, b] = palette(t);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.min(255, alpha * 3.5);
    }
    ctx.putImageData(img, 0, 0);
  }, [points, width, height, radius]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded-xl border border-slate-200 bg-slate-50"
    />
  );
}

// Paletă albastru → verde → galben → roșu
function palette(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [59, 130, 246]],
    [0.4, [34, 197, 94]],
    [0.7, [234, 179, 8]],
    [1.0, [239, 68, 68]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}
