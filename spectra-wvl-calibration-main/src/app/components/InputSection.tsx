import { useId, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, FlaskConical, Play, Upload } from "lucide-react";
import { getCopy, type Language } from "../../i18n";

interface InputSectionProps {
  targetFile: File | null;
  referenceFile: File | null;
  useInternalReference: boolean;
  isProcessing: boolean;
  error: string | null;
  language: Language;
  onTargetUpload: (file: File) => void;
  onReferenceUpload: (file: File) => void;
  onReferenceModeChange: (useInternal: boolean) => void;
  onRunCalibration: () => void;
  onLoadExample: () => void;
}

export function InputSection({
  targetFile,
  referenceFile,
  useInternalReference,
  isProcessing,
  error,
  language,
  onTargetUpload,
  onReferenceUpload,
  onReferenceModeChange,
  onRunCalibration,
  onLoadExample,
}: InputSectionProps) {
  const canRun = Boolean(targetFile && (useInternalReference || referenceFile) && !isProcessing);
  const copy = getCopy(language).input;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {copy.formats}
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadExample}
          disabled={isProcessing}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          {copy.loadExample}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UploadCard
          title={copy.targetTitle}
          description={copy.targetDescription}
          file={targetFile}
          disabled={isProcessing}
          onFile={onTargetUpload}
          language={language}
        />
        <UploadCard
          title={copy.customReferenceTitle}
          description={useInternalReference ? copy.customReferenceOptional : copy.customReferenceDescription}
          file={referenceFile}
          disabled={isProcessing}
          onFile={onReferenceUpload}
          language={language}
        />
      </div>

      <fieldset className="mt-5 border-t border-slate-200 pt-5">
        <legend className="sr-only">{copy.referenceSource}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReferenceChoice
            checked={useInternalReference}
            title={copy.builtInTitle}
            description={copy.builtInDescription}
            onChange={() => onReferenceModeChange(true)}
          />
          <ReferenceChoice
            checked={!useInternalReference}
            title={copy.customTitle}
            description={copy.customDescription}
            onChange={() => onReferenceModeChange(false)}
          />
        </div>
      </fieldset>

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" aria-live="polite" className="min-w-0 break-all text-sm text-slate-700">
          <span className="font-medium">{language === "ru" ? "Эталон для следующего расчёта" : "Reference for next calibration"}: </span>
          {useInternalReference ? copy.builtInTitle : referenceFile?.name ?? (language === "ru" ? "Загрузите эталон" : "Upload a reference")}
        </p>
        <button
          type="button"
          onClick={onRunCalibration}
          disabled={!canRun}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2B6CB0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#245c94] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Play className="h-4 w-4" />
          {isProcessing ? copy.running : copy.run}
        </button>
      </div>
    </section>
  );
}

function UploadCard({
  title,
  description,
  file,
  disabled,
  onFile,
  language,
}: {
  title: string;
  description: string;
  file: File | null;
  disabled: boolean;
  onFile: (file: File) => void;
  language: Language;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const copy = getCopy(language).input;
  const choose = (files: FileList | null) => {
    if (!disabled && files?.[0]) onFile(files[0]);
  };

  return (
    <div className={`rounded-lg border p-4 ${disabled ? "border-slate-200 bg-slate-50 opacity-65" : "border-slate-200 bg-white"}`}>
      <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      <label
        htmlFor={inputId}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files); }}
        className={`mt-3 flex min-h-28 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition ${
          dragging ? "border-[#2B6CB0] bg-blue-50" : "border-slate-300 bg-slate-50"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-[#2B6CB0] hover:bg-blue-50/50"}`}
      >
        <Upload className="mb-2 h-6 w-6 text-slate-400" />
        <span className="text-sm text-slate-700">{copy.dropBefore} <span className="font-medium text-[#2B6CB0]">{copy.browse}</span></span>
        <span className="mt-1 text-xs text-slate-500">{copy.maxSize}</span>
        <input
          id={inputId}
          type="file"
          accept=".txt,.dat,.csv,.tsv,.fits,.fit,.fts,text/plain,text/csv"
          disabled={disabled}
          className="sr-only"
          onChange={(event) => choose(event.target.files)}
        />
      </label>
      {file && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-slate-100 p-2.5">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          <span title={file.name} className="min-w-0 flex-1 truncate text-xs text-slate-700">{file.name}</span>
          <span className="text-xs text-slate-500">{formatBytes(file.size, language)}</span>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        </div>
      )}
    </div>
  );
}

function ReferenceChoice({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${checked ? "border-[#2B6CB0] bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-[#2B6CB0]" />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function formatBytes(bytes: number, language: Language) {
  const copy = getCopy(language).input;
  if (bytes < 1024) return `${bytes} ${copy.bytes}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${copy.kilobytes}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${copy.megabytes}`;
}
