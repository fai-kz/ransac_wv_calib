/// <reference lib="webworker" />

import internalReferenceRaw from "../data/reference_spectrum.txt?raw";
import {
  parseSpectrumFile,
  parseTextSpectrum,
  runCalibration,
  type CalibrationParameters,
} from "../lib/calibration";
import type { Language } from "../i18n";

interface CalibrationRequest {
  type: "calibrate";
  targetFile: File;
  referenceFile: File | null;
  useInternalReference: boolean;
  parameters: CalibrationParameters;
  language: Language;
}

self.onmessage = async (event: MessageEvent<CalibrationRequest>) => {
  if (event.data.type !== "calibrate") return;
  try {
    self.postMessage({ type: "progress", percent: 3, stageKey: "readingTarget" });
    const target = await parseSpectrumFile(event.data.targetFile, event.data.language);
    self.postMessage({ type: "progress", percent: 7, stageKey: "readingReference" });
    const reference = event.data.useInternalReference
      ? parseTextSpectrum(
          internalReferenceRaw,
          event.data.language === "ru" ? "Встроенный опорный спектр лампы" : "Built-in reference lamp spectrum",
          "internal",
          event.data.language,
        )
      : await parseSpectrumFile(event.data.referenceFile!, event.data.language);
    if (!event.data.useInternalReference && reference.metadata.axisSource === "generated") {
      throw new Error(
        event.data.language === "ru"
          ? "Опорному спектру необходима известная шкала длины волны: первая колонка текста или WCS в FITS."
          : "The reference spectrum needs a known wavelength axis: the first text column or FITS WCS.",
      );
    }
    const result = runCalibration(
      target,
      reference,
      event.data.parameters,
      event.data.useInternalReference,
      event.data.language,
      (percent, stageKey) => self.postMessage({ type: "progress", percent, stageKey }),
    );
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error
        ? error.message
        : event.data.language === "ru" ? "Неизвестная ошибка вычисления." : "Unknown calculation error.",
    });
  }
};

export {};
