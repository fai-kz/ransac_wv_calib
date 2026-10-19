import { lazy, Suspense, useEffect, useRef, useState } from "react";
import exampleTargetRaw from "../data/example_target.txt?raw";
import { Header } from "./components/Header";
import { InputSection } from "./components/InputSection";
import { ProcessingPipeline } from "./components/ProcessingPipeline";
import { MethodsPanel } from "./components/MethodsPanel";
import { DTWQualityPlot } from "./components/DTWQualityPlot";
import { DEFAULT_PARAMETERS, type CalibrationParameters, type CalibrationResult } from "../lib/calibration";
import { getCopy, type Language, type StageKey } from "../i18n";

const ResultsSection = lazy(async () => {
  const module = await import("./components/ResultsSection");
  return { default: module.ResultsSection };
});

export default function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [useInternalReference, setUseInternalReference] = useState(true);
  const [parameters, setParameters] = useState<CalibrationParameters>(DEFAULT_PARAMETERS);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<StageKey>("waiting");
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = getCopy(language).header.title;
  }, [language]);

  const copy = getCopy(language);

  const runCalibration = () => {
    if (!targetFile || (!useInternalReference && !referenceFile)) return;
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/calibration.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setIsProcessing(true);
    setResult(null);
    setError(null);
    setProgress(1);
    setStage("preparing");

    worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        setProgress(event.data.percent);
        setStage(event.data.stageKey);
      } else if (event.data.type === "result") {
        setResult(event.data.result);
        setProgress(100);
        setStage("complete");
        setIsProcessing(false);
        worker.terminate();
        workerRef.current = null;
      } else if (event.data.type === "error") {
        setError(event.data.message);
        setStage("stopped");
        setIsProcessing(false);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setError(language === "ru" ? "Не удалось запустить вычислительный модуль." : "The calculation module could not be started.");
      setIsProcessing(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({
      type: "calibrate",
      targetFile,
      referenceFile,
      useInternalReference,
      parameters,
      language,
    });
  };

  const loadExample = () => {
    setTargetFile(new File([exampleTargetRaw], "example_target_spectrum.txt", { type: "text/plain" }));
    // Loading a different target must not discard the selected reference.
    if (!referenceFile) setUseInternalReference(true);
    setParameters(DEFAULT_PARAMETERS);
    setResult(null);
    setError(null);
    setProgress(0);
    setStage("exampleLoaded");
  };

  const applyParameters = (next: CalibrationParameters) => {
    setParameters(next);
    setResult(null);
    setError(null);
    setProgress(0);
    setStage("parametersUpdated");
  };

  const invalidateResult = (nextStage: StageKey) => {
    setResult(null);
    setError(null);
    setProgress(0);
    setStage(nextStage);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-900">
      <Header language={language} onLanguageChange={setLanguage} />
      <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <InputSection
              targetFile={targetFile}
              referenceFile={referenceFile}
              useInternalReference={useInternalReference}
              isProcessing={isProcessing}
              error={error}
              language={language}
              onTargetUpload={(file) => { setTargetFile(file); if (referenceFile) setUseInternalReference(false); invalidateResult("targetChanged"); }}
              onReferenceUpload={(file) => { setReferenceFile(file); setUseInternalReference(false); invalidateResult("referenceChanged"); }}
              onReferenceModeChange={(value) => { setUseInternalReference(value); invalidateResult("referenceSourceChanged"); }}
              onRunCalibration={runCalibration}
              onLoadExample={loadExample}
            />

            <ProcessingPipeline
              isProcessing={isProcessing}
              progress={progress}
              stage={copy.status[stage]}
              result={result}
              language={language}
            />

            {result && (
              <>
                <DTWQualityPlot result={result} language={language} />
                <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{copy.results.loadingCharts}</div>}>
                  <ResultsSection
                    result={result}
                    language={language}
                    onDownloadJson={() => downloadJson(result)}
                    onDownloadCsv={() => downloadCsv(result)}
                  />
                </Suspense>
              </>
            )}
          </div>

          <aside className="xl:col-span-4">
            <MethodsPanel
              parameters={parameters}
              onApplyParameters={applyParameters}
              isProcessing={isProcessing}
              language={language}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

function downloadJson(result: CalibrationResult) {
  downloadBlob(
    "wavelength_calibration_solution.json",
    JSON.stringify(result, null, 2),
    "application/json;charset=utf-8",
  );
}

function downloadCsv(result: CalibrationResult) {
  const header = "input_coordinate,wavelength_angstrom,intensity,normalized_intensity";
  const rows = result.calibratedSpectrum.map((point) =>
    [point.inputCoordinate, point.wavelength, point.intensity, point.normalizedIntensity].join(","),
  );
  downloadBlob("calibrated_spectrum.csv", `\uFEFF${[header, ...rows].join("\n")}`, "text/csv;charset=utf-8");
}

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
