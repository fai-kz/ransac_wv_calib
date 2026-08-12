import { Check, Circle, Loader2 } from "lucide-react";
import type { CalibrationResult } from "../../lib/calibration";
import { getCopy, type Language } from "../../i18n";

interface ProcessingPipelineProps {
  isProcessing: boolean;
  progress: number;
  stage: string;
  result: CalibrationResult | null;
  language: Language;
}

const thresholds = [7, 22, 58, 86, 100];

export function ProcessingPipeline({ isProcessing, progress, stage, result, language }: ProcessingPipelineProps) {
  const hasStarted = progress > 0;
  const copy = getCopy(language).pipeline;
  const steps = copy.steps.map(([title, description], index) => ({ threshold: thresholds[index], title, description }));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{stage}</p>
        </div>
        <span className="font-mono text-sm font-semibold text-[#2B6CB0]">{Math.round(progress)}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#2B6CB0] transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-5">
        {steps.map((step, index) => {
          const complete = progress >= step.threshold;
          const active = isProcessing && progress < step.threshold && (index === 0 || progress >= steps[index - 1].threshold);
          return (
            <li key={step.title} className={`rounded-lg border p-3 ${complete ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="mb-2 flex items-center gap-2">
                {complete ? <Check className="h-4 w-4 text-[#2B6CB0]" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-[#2B6CB0]" /> : <Circle className="h-4 w-4 text-slate-300" />}
                <span className="text-xs font-semibold text-slate-800">{index + 1}</span>
              </div>
              <h3 className="text-xs font-medium text-slate-900">{step.title}</h3>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{step.description}</p>
            </li>
          );
        })}
      </ol>

      {!hasStarted && <p className="mt-4 text-xs text-slate-500">{copy.empty}</p>}
      {result && (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-5 sm:grid-cols-4">
          <Metric label={copy.peaks} value={`${result.summary.targetPeaks} / ${result.summary.referencePeaks}`} />
          <Metric label={copy.pairs} value={String(result.summary.dtwMatches)} />
          <Metric label={copy.inliers} value={`${result.summary.ransacInliers} ${copy.of} ${result.summary.dtwMatches}`} />
          <Metric label={copy.rms} value={`${format(result.summary.rmsAngstrom)} Å`} />
        </dl>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function format(value: number) {
  return Number.isFinite(value) ? value.toFixed(value < 1 ? 3 : 2) : "—";
}
