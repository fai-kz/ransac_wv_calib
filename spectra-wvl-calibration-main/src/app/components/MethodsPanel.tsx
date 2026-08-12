import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_PARAMETERS, type CalibrationParameters } from "../../lib/calibration";
import { getCopy, type Language } from "../../i18n";

interface MethodsPanelProps {
  parameters: CalibrationParameters;
  onApplyParameters: (parameters: CalibrationParameters) => void;
  isProcessing: boolean;
  language: Language;
}

export function MethodsPanel({ parameters, onApplyParameters, isProcessing, language }: MethodsPanelProps) {
  const [draft, setDraft] = useState(parameters);
  useEffect(() => setDraft(parameters), [parameters]);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(parameters), [draft, parameters]);
  const copy = getCopy(language).methods;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
      <div className="mb-5 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#2B6CB0]" />
        <h2 className="text-base font-semibold text-slate-950">{copy.title}</h2>
      </div>

      <div className="space-y-4">
        <NumberField
          label={copy.prominence}
          hint={copy.prominenceHint}
          value={draft.peakProminence}
          min={0.001}
          max={1}
          step={0.005}
          onChange={(value) => setDraft((current) => ({ ...current, peakProminence: value }))}
        />
        <NumberField
          label={copy.window}
          hint={copy.windowHint}
          value={draft.dtwWindow}
          min={7}
          max={501}
          step={2}
          integer
          onChange={(value) => setDraft((current) => ({ ...current, dtwWindow: value }))}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="poly-order">{copy.polynomialOrder}</label>
          <select
            id="poly-order"
            value={draft.polynomialOrder}
            disabled={isProcessing}
            onChange={(event) => setDraft((current) => ({ ...current, polynomialOrder: Number(event.target.value) }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2B6CB0] focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            {[1, 2, 3, 4, 5].map((order) => <option key={order} value={order}>{order}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{copy.polynomialHint}</p>
        </div>
        <NumberField
          label={copy.iterations}
          hint={copy.iterationsHint}
          value={draft.ransacIterations}
          min={10}
          max={20000}
          step={100}
          integer
          onChange={(value) => setDraft((current) => ({ ...current, ransacIterations: value }))}
        />
        <NumberField
          label={copy.tolerance}
          hint={copy.toleranceHint}
          value={draft.ransacTolerance}
          min={0.01}
          max={100}
          step={0.25}
          onChange={(value) => setDraft((current) => ({ ...current, ransacTolerance: value }))}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-5">
        <button
          type="button"
          disabled={!isDirty || isProcessing}
          onClick={() => onApplyParameters(draft)}
          className="rounded-lg bg-[#2B6CB0] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#245c94] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copy.apply}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => setDraft(DEFAULT_PARAMETERS)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {copy.defaults}
        </button>
      </div>
      {isDirty && <p className="mt-2 text-xs text-amber-700">{copy.unsaved}</p>}

      <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
        <MethodInfo title={copy.peakTitle}>
          {copy.peakText}
        </MethodInfo>
        <MethodInfo title={copy.dtwTitle}>
          {copy.dtwText}
        </MethodInfo>
        <MethodInfo title={copy.ransacTitle}>
          {copy.ransacText}
        </MethodInfo>
      </div>
    </section>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = integer ? Number.parseInt(event.target.value, 10) : Number.parseFloat(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-[#2B6CB0] focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function MethodInfo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-800">
        {title}
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <p className="border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-600">{children}</p>
    </details>
  );
}
