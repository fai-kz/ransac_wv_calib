import { Download, FileJson2, Table2 } from "lucide-react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalibrationResult, PlotPoint } from "../../lib/calibration";
import { getCopy, type Language } from "../../i18n";

interface ResultsSectionProps {
  result: CalibrationResult;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  language: Language;
}

export function ResultsSection({ result, onDownloadJson, onDownloadCsv, language }: ResultsSectionProps) {
  const spectrumData = mergeSeries(result.plots.calibratedTarget, result.plots.referenceSpectrum);
  const inliers = result.matches.filter((match) => match.inlier).map((match) => ({ x: match.targetCoordinate, y: match.referenceWavelength }));
  const outliers = result.matches.filter((match) => !match.inlier).map((match) => ({ x: match.targetCoordinate, y: match.referenceWavelength }));
  const copy = getCopy(language).results;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {copy.range} {format(result.summary.wavelengthMin)}–{format(result.summary.wavelengthMax)} Å, RMS {format(result.summary.rmsAngstrom)} Å
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton icon={<FileJson2 className="h-4 w-4" />} label={copy.json} onClick={onDownloadJson} />
          <ExportButton icon={<Table2 className="h-4 w-4" />} label={copy.csv} onClick={onDownloadCsv} />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={copy.dtwMatches} value={String(result.summary.dtwMatches)} />
        <Metric label={copy.ransacInliers} value={`${result.summary.ransacInliers} (${percent(result.summary.ransacInliers, result.summary.dtwMatches)})`} />
        <Metric label={copy.residualRms} value={`${format(result.summary.rmsAngstrom)} Å`} />
        <Metric label={copy.maxResidual} value={`${format(result.summary.maxResidualAngstrom)} Å`} />
      </div>

      <ChartCard title={copy.spectraTitle} description={copy.spectraDescription}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={spectrumData} margin={{ top: 12, right: 18, bottom: 42, left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" dataKey="x" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} label={{ value: copy.wavelengthAxis, position: "insideBottom", offset: -22, fontSize: 12 }} />
            <YAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 11 }} label={{ value: copy.intensityAxis, angle: -90, position: "insideLeft", offset: -8, fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => format(value)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="linear" dataKey="target" name={copy.calibratedTarget} stroke="#2B6CB0" dot={false} strokeWidth={1.8} connectNulls />
            <Line type="linear" dataKey="reference" name={copy.reference} stroke="#DD6B20" dot={false} strokeWidth={1.5} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title={copy.solutionTitle} description={copy.solutionDescription}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart margin={{ top: 12, right: 18, bottom: 42, left: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" dataKey="x" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} label={{ value: copy.inputCoordinate, position: "insideBottom", offset: -22, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" domain={["auto", "auto"]} tick={{ fontSize: 11 }} label={{ value: copy.wavelengthAxis, angle: -90, position: "insideLeft", offset: -16, fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => format(value)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line data={result.plots.solutionCurve} dataKey="y" name={`${copy.polynomial} k=${result.solution.polynomialOrder}`} stroke="#DD6B20" dot={false} strokeWidth={2} />
                <Scatter data={inliers} name="Inliers" fill="#2B6CB0" />
                <Scatter data={outliers} name="Outliers" fill="#94A3B8" shape="cross" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title={copy.residualsTitle} description={copy.residualsDescription}>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 12, right: 18, bottom: 42, left: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} label={{ value: copy.coordinate, position: "insideBottom", offset: -22, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" tick={{ fontSize: 11 }} label={{ value: copy.residualAxis, angle: -90, position: "insideLeft", offset: -8, fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => format(value)} />
                <ReferenceLine y={0} stroke="#64748B" strokeDasharray="4 4" />
                <Scatter data={result.plots.residuals} fill="#2B6CB0" />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">{copy.coefficients}</h3>
        <p className="mt-1 text-xs text-slate-500">{copy.coefficientsDescription}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
              {result.solution.coefficientsForInputCoordinate.map((_, index) => <th key={index} className="px-2 py-2 font-medium">c{index} · X^{result.solution.polynomialOrder - index}</th>)}
            </tr></thead>
            <tbody><tr>
              {result.solution.coefficientsForInputCoordinate.map((coefficient, index) => <td key={index} className="px-2 py-2 font-mono text-xs text-slate-800">{coefficient.toExponential(8)}</td>)}
            </tr></tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const tooltipStyle = { backgroundColor: "white", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 12 };

function mergeSeries(first: PlotPoint[], second: PlotPoint[]) {
  return [
    ...first.map((point) => ({ x: point.x, target: point.y, reference: null as number | null })),
    ...second.map((point) => ({ x: point.x, target: null as number | null, reference: point.y })),
  ].sort((a, b) => a.x - b.x);
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-mono text-sm font-semibold text-slate-900">{value}</div></div>;
}

function ExportButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
      {icon ?? <Download className="h-4 w-4" />}
      {label}
    </button>
  );
}

function format(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(2);
  if (Math.abs(value) >= 10) return value.toFixed(3);
  return value.toFixed(4);
}

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round(value / total * 100)}%` : "—";
}
