import { useMemo } from "react";
import type { CalibrationResult, PlotPoint } from "../../lib/calibration";
import { getCopy, type Language } from "../../i18n";

export function DTWQualityPlot({ result, language }: { result: CalibrationResult; language: Language }) {
  const width = 960;
  const height = 430;
  const pad = { left: 62, right: 24, top: 28, bottom: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const mapX = (value: number) => pad.left + value * innerWidth;
  const mapY = (value: number) => pad.top + (1 - value) * innerHeight;
  const targetPath = useMemo(() => toPolyline(result.plots.targetNormalized, mapX, mapY), [result]);
  const referencePath = useMemo(() => toPolyline(result.plots.referenceNormalized, mapX, mapY), [result]);
  const copy = getCopy(language).dtw;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <Legend color="#2B6CB0" label={copy.target} />
          <Legend color="#DD6B20" label={copy.reference} />
          <Legend color="#16A34A" label="Inlier" />
          <Legend color="#94A3B8" label="Outlier" dashed />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <svg className="min-w-[720px]" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={copy.ariaLabel}>
          <rect width={width} height={height} fill="white" />
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={mapY(tick)} y2={mapY(tick)} stroke="#E2E8F0" />
              <text x={pad.left - 10} y={mapY(tick) + 4} textAnchor="end" fontSize="11" fill="#64748B">{tick.toFixed(2)}</text>
              <line x1={mapX(tick)} x2={mapX(tick)} y1={pad.top} y2={height - pad.bottom} stroke="#F1F5F9" />
              <text x={mapX(tick)} y={height - pad.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748B">{tick.toFixed(2)}</text>
            </g>
          ))}

          {result.matches.map((match) => (
            <line
              key={`${match.targetIndex}-${match.referenceIndex}`}
              x1={mapX(match.targetNormalizedPosition)}
              y1={mapY(match.targetNormalizedIntensity)}
              x2={mapX(match.referenceNormalizedPosition)}
              y2={mapY(match.referenceNormalizedIntensity)}
              stroke={match.inlier ? "#16A34A" : "#94A3B8"}
              strokeDasharray={match.inlier ? undefined : "4 4"}
              strokeWidth={match.inlier ? 1.3 : 1}
              opacity={match.inlier ? 0.68 : 0.5}
            />
          ))}

          <polyline points={targetPath} fill="none" stroke="#2B6CB0" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          <polyline points={referencePath} fill="none" stroke="#DD6B20" strokeWidth="1.8" opacity="0.9" vectorEffect="non-scaling-stroke" />
          <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#94A3B8" />
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} stroke="#94A3B8" />
          <text x={width / 2} y={height - 14} textAnchor="middle" fontSize="12" fill="#475569">{copy.normalizedCoordinate}</text>
          <text x="16" y={height / 2} textAnchor="middle" fontSize="12" fill="#475569" transform={`rotate(-90 16 ${height / 2})`}>{copy.normalizedIntensity}</text>
        </svg>
      </div>
    </section>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`block h-0 w-5 border-t-2 ${dashed ? "border-dashed" : ""}`} style={{ borderColor: color }} />
      {label}
    </span>
  );
}

function toPolyline(points: PlotPoint[], mapX: (value: number) => number, mapY: (value: number) => number) {
  return points.map((point) => `${mapX(point.x).toFixed(2)},${mapY(point.y).toFixed(2)}`).join(" ");
}
