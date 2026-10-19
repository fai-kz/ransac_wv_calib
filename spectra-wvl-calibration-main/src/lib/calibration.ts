import { makeSpectrumAgreement } from "./spectrumAgreement";
import { matchPeaks, type PeakMatch } from "./peakMatching";
import type { Language, StageKey } from "../i18n";

export interface CalibrationParameters {
  peakProminence: number;
  dtwWindow: number;
  polynomialOrder: number;
  ransacIterations: number;
  ransacTolerance: number;
}

export const DEFAULT_PARAMETERS: CalibrationParameters = {
  peakProminence: 0.01,
  dtwWindow: 45,
  polynomialOrder: 3,
  ransacIterations: 3000,
  ransacTolerance: 5,
};

export interface SpectrumMetadata {
  name: string;
  format: "text" | "fits" | "internal";
  pointCount: number;
  xMin: number;
  xMax: number;
  xUnit: string;
  axisSource: "provided" | "generated" | "fits-wcs";
  objectName?: string;
  observationDate?: string;
  instrument?: string;
  exposure?: string;
}

export interface Spectrum {
  x: number[];
  y: number[];
  metadata: SpectrumMetadata;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface MatchResult {
  targetIndex: number;
  referenceIndex: number;
  targetCoordinate: number;
  targetNormalizedPosition: number;
  referenceNormalizedPosition: number;
  targetNormalizedIntensity: number;
  referenceNormalizedIntensity: number;
  referenceWavelength: number;
  predictedWavelength: number;
  residual: number;
  dtwDistance: number;
  inlier: boolean;
}

export interface CalibrationResult {
  version: 1;
  createdAt: string;
  parameters: CalibrationParameters;
  input: {
    target: SpectrumMetadata;
    reference: SpectrumMetadata;
    usedInternalReference: boolean;
  };
  summary: {
    targetPeaks: number;
    referencePeaks: number;
    dtwMatches: number;
    ransacInliers: number;
    ransacOutliers: number;
    rmsAngstrom: number;
    maxResidualAngstrom: number;
    wavelengthMin: number;
    wavelengthMax: number;
  };
  solution: {
    polynomialOrder: number;
    coefficientOrder: "highest-degree-first";
    coefficientsForInputCoordinate: number[];
    coefficientsForNormalizedCoordinate: number[];
    inputCoordinateOrigin: number;
    inputCoordinateScale: number;
    formula: string;
  };
  matches: MatchResult[];
  plots: {
    targetNormalized: PlotPoint[];
    referenceNormalized: PlotPoint[];
    calibratedTarget: PlotPoint[];
    referenceSpectrum: PlotPoint[];
    solutionCurve: PlotPoint[];
    residuals: PlotPoint[];
    targetPeakIndices: number[];
    referencePeakIndices: number[];
  };
  calibratedSpectrum: Array<{
    inputCoordinate: number;
    wavelength: number;
    intensity: number;
    normalizedIntensity: number;
  }>;
}

export type ProgressCallback = (percent: number, stageKey: StageKey) => void;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_POINTS = 100_000;
const MAX_PEAKS = 350;

export async function parseSpectrumFile(file: File, language: Language = "en"): Promise<Spectrum> {
  const messages = getCalibrationMessages(language);
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(messages.fileTooLarge);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "fits" || extension === "fit" || extension === "fts") {
    return parseFitsSpectrum(await file.arrayBuffer(), file.name, language);
  }

  return parseTextSpectrum(await file.text(), file.name, "text", language);
}

export function parseTextSpectrum(
  text: string,
  name = "spectrum.txt",
  format: SpectrumMetadata["format"] = "text",
  language: Language = "en",
): Spectrum {
  const messages = getCalibrationMessages(language);
  const rows: number[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const values = line
      .replace(/([0-9.])[dD]([+-]?\d+)/g, "$1e$2")
      .split(/[\s,;]+/)
      .map(Number)
      .filter(Number.isFinite);

    if (values.length > 0) rows.push(values);
    if (rows.length > MAX_POINTS) {
      throw new Error(messages.tooManyPoints(MAX_POINTS));
    }
  }

  if (rows.length < 8) {
    throw new Error(messages.tooFewRows);
  }

  const twoColumnRows = rows.filter((row) => row.length >= 2);
  const x: number[] = [];
  const y: number[] = [];
  let axisSource: SpectrumMetadata["axisSource"];

  if (twoColumnRows.length >= Math.max(8, Math.floor(rows.length * 0.8))) {
    axisSource = "provided";
    for (const row of twoColumnRows) {
      x.push(row[0]);
      y.push(row[1]);
    }
  } else if (rows.every((row) => row.length === 1)) {
    axisSource = "generated";
    rows.forEach((row, index) => {
      x.push(index + 1);
      y.push(row[0]);
    });
  } else {
    throw new Error(messages.columnsNotDetected);
  }

  return makeSpectrum(x, y, {
    name,
    format,
    xUnit: format === "internal" ? "Å" : inferXUnit(x),
    axisSource,
  }, language);
}

export function runCalibration(
  target: Spectrum,
  reference: Spectrum,
  rawParameters: CalibrationParameters,
  usedInternalReference: boolean,
  language: Language = "en",
  onProgress: ProgressCallback = () => undefined,
): CalibrationResult {
  const messages = getCalibrationMessages(language);
  const parameters = validateParameters(rawParameters, language);
  onProgress(12, "normalizing");

  const targetXNorm = normalizeAxis(target.x);
  const referenceXNorm = normalizeAxis(reference.x);
  const targetYNorm = normalizeIntensity(target.y);
  const referenceYNorm = normalizeIntensity(reference.y);

  onProgress(22, "findingPeaks");
  const targetPeaks = findPeaks(targetYNorm, parameters.peakProminence);
  const referencePeaks = findPeaks(referenceYNorm, parameters.peakProminence);
  const minimumMatches = parameters.polynomialOrder + 1;

  if (targetPeaks.length < minimumMatches) {
    throw new Error(messages.targetPeaks(targetPeaks.length));
  }
  if (referencePeaks.length < minimumMatches) {
    throw new Error(messages.referencePeaks(referencePeaks.length));
  }

  onProgress(35, "matchingDtw");
  const agreement = makeSpectrumAgreement(targetXNorm, targetYNorm, reference.x, referenceYNorm);
  type Candidate = { matches: PeakMatch[]; fit: ReturnType<typeof fitRansac>; score: number };
  const candidates: Candidate[] = [];
  const evaluate = (matches: PeakMatch[]): Candidate | null => {
    if (matches.length < minimumMatches) return null;
    try {
      const fit = fitRansac(matches, targetXNorm, reference.x, parameters, () => undefined, language);
      const refLow = reference.x[0], refSpan = reference.x[reference.x.length - 1] - refLow;
      const low = (evaluatePolynomial(fit.coefficients, 0) - refLow) / refSpan;
      const high = (evaluatePolynomial(fit.coefficients, 1) - refLow) / refSpan;
      if (low < -0.2 || low > 0.2 || high < 0.8 || high > 1.2) return null;
      return {matches, fit, score: agreement(fit.coefficients)};
    } catch { return null; }
  };
  onProgress(58, "ransacSearch");
  // Keep position-led and shape-led hypotheses. Different line widths and a
  // nonlinear dispersion can make either initial assignment unreliable.
  for (const strategy of ["position", "shape", "local"] as const) {
    const matches = matchPeaks(targetPeaks, referencePeaks, targetXNorm, referenceXNorm,
      targetYNorm, referenceYNorm, parameters.dtwWindow, {strategy});
    let candidate = evaluate(matches);
    if (!candidate) continue;
    if (strategy !== "local") candidates.push(candidate);
    const span = reference.x[reference.x.length - 1] - reference.x[0];
    const radius = Math.max(3 / Math.min(target.x.length, reference.x.length),
      Math.min(0.02, 1.5 * parameters.ransacTolerance / span));
    // Revisit correspondences around the nonlinear solution, rather than
    // committing permanently to the initial affine registration.
    for (let iteration = 0; iteration < 3; iteration++) {
      const predictedPositions = targetXNorm.map(x =>
        (evaluatePolynomial(candidate!.fit.coefficients, x) - reference.x[0]) / span);
      const refined = evaluate(matchPeaks(targetPeaks, referencePeaks, targetXNorm, referenceXNorm,
        targetYNorm, referenceYNorm, parameters.dtwWindow, {predictedPositions, radius}));
      if (!refined) break;
      if (strategy === "local" && iteration === 0) candidates.push(refined);
      if (refined.score <= candidate.score + 1e-6) break;
      candidates.push(refined);
      candidate = refined;
    }
  }
  if (!candidates.length) throw new Error(messages.ransacFailed);
  // Do not replace a working solution for a negligible profile-score change.
  const best = candidates.reduce((selected, candidate) =>
    candidate.score > selected.score + 0.005 ? candidate : selected);
  const { matches: initialMatches, fit: ransac } = best;

  onProgress(86, "buildingSpectrum");
  const xOrigin = target.x[0];
  const xScale = target.x[target.x.length - 1] - xOrigin;
  const coefficientsForInputCoordinate = convertNormalizedPolynomial(
    ransac.coefficients,
    xOrigin,
    xScale,
  );

  const matchResults: MatchResult[] = initialMatches.map((match) => {
    const predicted = evaluatePolynomial(ransac.coefficients, targetXNorm[match.targetIndex]);
    const actual = reference.x[match.referenceIndex];
    return {
      targetIndex: match.targetIndex,
      referenceIndex: match.referenceIndex,
      targetCoordinate: target.x[match.targetIndex],
      targetNormalizedPosition: targetXNorm[match.targetIndex],
      referenceNormalizedPosition: referenceXNorm[match.referenceIndex],
      targetNormalizedIntensity: targetYNorm[match.targetIndex],
      referenceNormalizedIntensity: referenceYNorm[match.referenceIndex],
      referenceWavelength: actual,
      predictedWavelength: predicted,
      residual: actual - predicted,
      dtwDistance: match.cost,
      inlier: ransac.inlierKeys.has(matchKey(match)),
    };
  });

  const inlierResiduals = matchResults.filter((match) => match.inlier).map((match) => match.residual);
  const rms = Math.sqrt(inlierResiduals.reduce((sum, value) => sum + value * value, 0) / inlierResiduals.length);
  const maxResidual = Math.max(...inlierResiduals.map(Math.abs));

  const calibratedSpectrum = target.x.map((inputCoordinate, index) => ({
    inputCoordinate,
    wavelength: evaluatePolynomial(ransac.coefficients, targetXNorm[index]),
    intensity: target.y[index],
    normalizedIntensity: targetYNorm[index],
  }));

  const solutionCurve = Array.from({ length: 241 }, (_, index) => {
    const xNormalized = index / 240;
    return { x: target.x[0] + xNormalized * xScale, y: evaluatePolynomial(ransac.coefficients, xNormalized) };
  });

  const calibratedTarget = downsamplePoints(
    calibratedSpectrum.map((point) => ({ x: point.wavelength, y: point.normalizedIntensity })),
  );
  const referenceSpectrum = downsamplePoints(reference.x.map((x, index) => ({ x, y: referenceYNorm[index] })));
  const wavelengthValues = calibratedSpectrum.map((point) => point.wavelength);

  onProgress(100, "ready");
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    parameters,
    input: {
      target: target.metadata,
      reference: reference.metadata,
      usedInternalReference,
    },
    summary: {
      targetPeaks: targetPeaks.length,
      referencePeaks: referencePeaks.length,
      dtwMatches: initialMatches.length,
      ransacInliers: inlierResiduals.length,
      ransacOutliers: initialMatches.length - inlierResiduals.length,
      rmsAngstrom: rms,
      maxResidualAngstrom: maxResidual,
      wavelengthMin: Math.min(...wavelengthValues),
      wavelengthMax: Math.max(...wavelengthValues),
    },
    solution: {
      polynomialOrder: parameters.polynomialOrder,
      coefficientOrder: "highest-degree-first",
      coefficientsForInputCoordinate,
      coefficientsForNormalizedCoordinate: ransac.coefficients,
      inputCoordinateOrigin: xOrigin,
      inputCoordinateScale: xScale,
      formula: "λ(x) = c₀·x^k + c₁·x^(k−1) + … + cₖ",
    },
    matches: matchResults,
    plots: {
      targetNormalized: downsamplePoints(targetXNorm.map((x, index) => ({ x, y: targetYNorm[index] })), 1400),
      referenceNormalized: downsamplePoints(referenceXNorm.map((x, index) => ({ x, y: referenceYNorm[index] })), 1400),
      calibratedTarget,
      referenceSpectrum,
      solutionCurve,
      residuals: matchResults.filter((match) => match.inlier).map((match) => ({
        x: match.targetCoordinate,
        y: match.residual,
      })),
      targetPeakIndices: targetPeaks,
      referencePeakIndices: referencePeaks,
    },
    calibratedSpectrum,
  };
}

function parseFitsSpectrum(buffer: ArrayBuffer, name: string, language: Language): Spectrum {
  const messages = getCalibrationMessages(language);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("ascii");
  const header: Record<string, string | number | boolean> = {};
  let offset = 0;
  let foundEnd = false;

  while (offset + 80 <= bytes.length && offset < 2 * 1024 * 1024) {
    const card = decoder.decode(bytes.subarray(offset, offset + 80));
    offset += 80;
    const key = card.slice(0, 8).trim();
    if (key === "END") {
      foundEnd = true;
      break;
    }
    if (card[8] === "=") header[key] = parseFitsValue(card.slice(10));
  }

  if (!foundEnd || header.SIMPLE !== true) {
    throw new Error(messages.invalidFits);
  }

  const dataOffset = Math.ceil(offset / 2880) * 2880;
  const naxis = Number(header.NAXIS ?? 0);
  const dimensions = Array.from({ length: naxis }, (_, index) => Number(header[`NAXIS${index + 1}`] ?? 0));
  if (naxis < 1 || dimensions[0] < 8 || dimensions.slice(1).some((size) => size !== 1)) {
    throw new Error(messages.fitsPrimaryOnly);
  }

  const count = dimensions.reduce((product, size) => product * size, 1);
  if (count > MAX_POINTS) throw new Error(messages.fitsTooManyPoints(MAX_POINTS));
  const bitpix = Number(header.BITPIX);
  const bytesPerValue = Math.abs(bitpix) / 8;
  if (![8, 16, 32, 64, -32, -64].includes(bitpix) || dataOffset + count * bytesPerValue > buffer.byteLength) {
    throw new Error(messages.unsupportedFits(bitpix));
  }

  const view = new DataView(buffer, dataOffset);
  const bscale = Number(header.BSCALE ?? 1);
  const bzero = Number(header.BZERO ?? 0);
  const y: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const byteOffset = index * bytesPerValue;
    let value: number;
    switch (bitpix) {
      case 8: value = view.getUint8(byteOffset); break;
      case 16: value = view.getInt16(byteOffset, false); break;
      case 32: value = view.getInt32(byteOffset, false); break;
      case 64: value = Number(view.getBigInt64(byteOffset, false)); break;
      case -32: value = view.getFloat32(byteOffset, false); break;
      case -64: value = view.getFloat64(byteOffset, false); break;
      default: value = Number.NaN;
    }
    y.push(value * bscale + bzero);
  }

  const hasWcs = Number.isFinite(Number(header.CRVAL1)) && Number.isFinite(Number(header.CDELT1 ?? header.CD1_1));
  const crval = Number(header.CRVAL1 ?? 1);
  const cdelt = Number(header.CDELT1 ?? header.CD1_1 ?? 1);
  const crpix = Number(header.CRPIX1 ?? 1);
  const x = y.map((_, index) => hasWcs ? crval + (index + 1 - crpix) * cdelt : index + 1);

  return makeSpectrum(x, y, {
    name,
    format: "fits",
    xUnit: String(header.CUNIT1 ?? (hasWcs ? "Å" : "pixel")),
    axisSource: hasWcs ? "fits-wcs" : "generated",
    objectName: optionalString(header.OBJECT),
    observationDate: optionalString(header["DATE-OBS"]),
    instrument: optionalString(header.INSTRUME),
    exposure: header.EXPTIME === undefined ? undefined : String(header.EXPTIME),
  }, language);
}

function parseFitsValue(raw: string): string | number | boolean {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    return trimmed.slice(1, end === -1 ? undefined : end).trim();
  }
  const token = trimmed.split("/")[0].trim();
  if (token === "T") return true;
  if (token === "F") return false;
  const numeric = Number(token.replace(/[dD]/, "E"));
  return Number.isFinite(numeric) ? numeric : token;
}

function optionalString(value: string | number | boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function makeSpectrum(
  rawX: number[],
  rawY: number[],
  metadata: Pick<SpectrumMetadata, "name" | "format" | "xUnit" | "axisSource"> & Partial<SpectrumMetadata>,
  language: Language,
): Spectrum {
  const messages = getCalibrationMessages(language);
  const points = rawX
    .map((x, index) => ({ x, y: rawY[index] }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);

  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x);
  if (unique.length < 8) throw new Error(messages.tooFewValidPoints);
  const x = unique.map((point) => point.x);
  const y = unique.map((point) => point.y);
  if (x[0] === x[x.length - 1]) throw new Error(messages.zeroAxisRange);
  if (Math.max(...y) === Math.min(...y)) throw new Error(messages.constantIntensity);

  return {
    x,
    y,
    metadata: {
      ...metadata,
      pointCount: x.length,
      xMin: x[0],
      xMax: x[x.length - 1],
    },
  };
}

function inferXUnit(x: number[]): string {
  const range = x[x.length - 1] - x[0];
  return x[0] > 100 && range > 100 ? "Å" : "input units";
}

function validateParameters(parameters: CalibrationParameters, language: Language): CalibrationParameters {
  const messages = getCalibrationMessages(language);
  const validated = {
    peakProminence: Number(parameters.peakProminence),
    dtwWindow: Math.round(Number(parameters.dtwWindow)),
    polynomialOrder: Math.round(Number(parameters.polynomialOrder)),
    ransacIterations: Math.round(Number(parameters.ransacIterations)),
    ransacTolerance: Number(parameters.ransacTolerance),
  };
  if (!(validated.peakProminence > 0 && validated.peakProminence <= 1)) throw new Error(messages.invalidProminence);
  if (!(validated.dtwWindow >= 7 && validated.dtwWindow <= 501)) throw new Error(messages.invalidWindow);
  if (!(validated.polynomialOrder >= 1 && validated.polynomialOrder <= 5)) throw new Error(messages.invalidOrder);
  if (!(validated.ransacIterations >= 10 && validated.ransacIterations <= 20_000)) throw new Error(messages.invalidIterations);
  if (!(validated.ransacTolerance > 0 && Number.isFinite(validated.ransacTolerance))) throw new Error(messages.invalidTolerance);
  if (validated.dtwWindow % 2 === 0) validated.dtwWindow += 1;
  return validated;
}

function normalizeAxis(values: number[]): number[] {
  const min = values[0];
  const range = values[values.length - 1] - min;
  return values.map((value) => (value - min) / range);
}

function normalizeIntensity(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((value) => (value - min) / range);
}

function findPeaks(values: number[], minimumProminence: number): number[] {
  const differences = values.slice(1).map((value, i) => value - values[i]);
  const median = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; };
  const centre = median(differences);
  const noise = 1.4826 * median(differences.map(value => Math.abs(value - centre))) / Math.sqrt(2);
  const threshold = Math.max(minimumProminence, 4.5 * noise);
  const candidates: Array<{ index: number; prominence: number; height: number }> = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    if (!(values[index] > values[index - 1] && values[index] >= values[index + 1])) continue;
    const prominence = calculateProminence(values, index);
    if (prominence >= threshold) candidates.push({ index, prominence, height: values[index] });
  }

  if (candidates.length > MAX_PEAKS) {
    candidates.sort((a, b) => b.prominence - a.prominence || b.height - a.height);
    candidates.length = MAX_PEAKS;
  }
  return candidates.map((candidate) => candidate.index).sort((a, b) => a - b);
}

function calculateProminence(values: number[], peakIndex: number): number {
  const peakValue = values[peakIndex];
  let leftMin = peakValue;
  for (let index = peakIndex - 1; index >= 0; index -= 1) {
    leftMin = Math.min(leftMin, values[index]);
    if (values[index] > peakValue) break;
  }
  let rightMin = peakValue;
  for (let index = peakIndex + 1; index < values.length; index += 1) {
    rightMin = Math.min(rightMin, values[index]);
    if (values[index] > peakValue) break;
  }
  return peakValue - Math.max(leftMin, rightMin);
}

function fitRansac(
  matches: PeakMatch[],
  targetXNormalized: number[],
  referenceWavelength: number[],
  parameters: CalibrationParameters,
  onProgress: (fraction: number) => void,
  language: Language,
): { coefficients: number[]; inlierKeys: Set<string> } {
  const messages = getCalibrationMessages(language);
  const x = matches.map((match) => targetXNormalized[match.targetIndex]);
  const y = matches.map((match) => referenceWavelength[match.referenceIndex]);
  const sampleSize = Math.min(matches.length, Math.max(parameters.polynomialOrder + 1, 5));
  const random = mulberry32(seedFromData(x, y, parameters));
  let bestIndices: number[] = [];
  let bestCoefficients: number[] | null = null;
  let bestRms = Number.POSITIVE_INFINITY;

  for (let iteration = 0; iteration < parameters.ransacIterations; iteration += 1) {
    const sample = randomSample(matches.length, sampleSize, random);
    let coefficients: number[];
    try {
      coefficients = polynomialFit(
        sample.map((index) => x[index]),
        sample.map((index) => y[index]),
        parameters.polynomialOrder,
        language,
      );
    } catch {
      continue;
    }
    if (!isIncreasingPolynomial(coefficients)) continue;

    const inliers = x
      .map((value, index) => ({ index, residual: Math.abs(y[index] - evaluatePolynomial(coefficients, value)) }))
      .filter((item) => item.residual <= parameters.ransacTolerance);
    const rms = inliers.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.sqrt(inliers.reduce((sum, item) => sum + item.residual * item.residual, 0) / inliers.length);

    if (inliers.length > bestIndices.length || (inliers.length === bestIndices.length && rms < bestRms)) {
      bestIndices = inliers.map((item) => item.index);
      bestCoefficients = coefficients;
      bestRms = rms;
    }
    if (iteration % 250 === 0) onProgress(iteration / parameters.ransacIterations);
  }

  if (!bestCoefficients || bestIndices.length < parameters.polynomialOrder + 1) {
    throw new Error(messages.ransacFailed);
  }

  let coefficients = polynomialFit(
    bestIndices.map((index) => x[index]),
    bestIndices.map((index) => y[index]),
    parameters.polynomialOrder,
    language,
  );
  const refinedIndices = x
    .map((value, index) => ({ index, residual: Math.abs(y[index] - evaluatePolynomial(coefficients, value)) }))
    .filter((item) => item.residual <= parameters.ransacTolerance)
    .map((item) => item.index);

  if (refinedIndices.length >= parameters.polynomialOrder + 1) {
    coefficients = polynomialFit(
      refinedIndices.map((index) => x[index]),
      refinedIndices.map((index) => y[index]),
      parameters.polynomialOrder,
      language,
    );
    bestIndices = refinedIndices;
  }
  if (!isIncreasingPolynomial(coefficients)) throw new Error(messages.nonMonotonic);

  // Recompute labels for the final refit: an earlier membership set can be
  // stale after coefficients change.
  const finalIndices = x.map((value, index) => ({index, residual: Math.abs(y[index] - evaluatePolynomial(coefficients, value))}))
    .filter(item => item.residual <= parameters.ransacTolerance).map(item => item.index);
  if (finalIndices.length < parameters.polynomialOrder + 1) throw new Error(messages.ransacFailed);
  return {
    coefficients,
    inlierKeys: new Set(finalIndices.map((index) => matchKey(matches[index]))),
  };
}

function matchKey(match: PeakMatch): string {
  return `${match.targetIndex}:${match.referenceIndex}`;
}

function polynomialFit(x: number[], y: number[], degree: number, language: Language): number[] {
  const messages = getCalibrationMessages(language);
  if (x.length < degree + 1) throw new Error(messages.notEnoughFitPoints);
  const matrix = Array.from({ length: degree + 1 }, () => Array(degree + 1).fill(0));
  const vector = Array(degree + 1).fill(0);
  for (let row = 0; row <= degree; row += 1) {
    for (let column = 0; column <= degree; column += 1) {
      matrix[row][column] = x.reduce((sum, value) => sum + value ** (row + column), 0);
    }
    vector[row] = x.reduce((sum, value, index) => sum + y[index] * value ** row, 0);
  }
  return solveLinearSystem(matrix, vector, language).reverse();
}

function solveLinearSystem(matrix: number[][], vector: number[], language: Language): number[] {
  const messages = getCalibrationMessages(language);
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error(messages.singularSystem);
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    for (let item = column; item <= n; item += 1) augmented[column][item] /= pivotValue;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= n; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  const result = augmented.map((row) => row[n]);
  if (result.some((value) => !Number.isFinite(value))) throw new Error(messages.coefficientsFailed);
  return result;
}

function evaluatePolynomial(coefficients: number[], value: number): number {
  return coefficients.reduce((result, coefficient) => result * value + coefficient, 0);
}

function isIncreasingPolynomial(coefficients: number[]): boolean {
  let previous = evaluatePolynomial(coefficients, 0);
  for (let index = 1; index <= 40; index += 1) {
    const current = evaluatePolynomial(coefficients, index / 40);
    if (!Number.isFinite(current) || current <= previous) return false;
    previous = current;
  }
  return true;
}

function convertNormalizedPolynomial(coefficientsDescending: number[], origin: number, scale: number): number[] {
  const degree = coefficientsDescending.length - 1;
  const ascending = Array(degree + 1).fill(0);
  const a = 1 / scale;
  const b = -origin / scale;
  coefficientsDescending.forEach((coefficient, index) => {
    const power = degree - index;
    for (let xPower = 0; xPower <= power; xPower += 1) {
      ascending[xPower] += coefficient * binomial(power, xPower) * a ** xPower * b ** (power - xPower);
    }
  });
  return ascending.reverse();
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let index = 1; index <= k; index += 1) result = result * (n - index + 1) / index;
  return result;
}

function randomSample(length: number, count: number, random: () => number): number[] {
  const values = Array.from({ length }, (_, index) => index);
  for (let index = values.length - 1; index > values.length - 1 - count; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [values[index], values[selected]] = [values[selected], values[index]];
  }
  return values.slice(length - count);
}

function seedFromData(x: number[], y: number[], parameters: CalibrationParameters): number {
  let seed = parameters.ransacIterations ^ (parameters.polynomialOrder << 16);
  const stride = Math.max(1, Math.floor(x.length / 12));
  for (let index = 0; index < x.length; index += stride) {
    seed = Math.imul(seed ^ Math.round(x[index] * 1e6), 16777619);
    seed = Math.imul(seed ^ Math.round(y[index] * 10), 16777619);
  }
  return seed >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function downsamplePoints(points: PlotPoint[], maxPoints = 1000): PlotPoint[] {
  if (points.length <= maxPoints) return points;
  const result: PlotPoint[] = [];
  const stride = (points.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) result.push(points[Math.round(index * stride)]);
  return result;
}

function getCalibrationMessages(language: Language) {
  if (language === "ru") {
    return {
      fileTooLarge: "Файл слишком большой. Максимальный размер — 25 МБ.",
      tooManyPoints: (maximum: number) => `Слишком много точек. Поддерживается не более ${maximum.toLocaleString("ru-RU")}.`,
      tooFewRows: "В файле должно быть не менее 8 числовых строк.",
      columnsNotDetected: "Не удалось определить колонки. Используйте X и intensity либо одну колонку intensity.",
      targetPeaks: (count: number) => `В целевом спектре найдено только ${count} пиков. Уменьшите prominence или выберите порядок полинома ниже.`,
      referencePeaks: (count: number) => `В опорном спектре найдено только ${count} пиков. Уменьшите prominence или выберите порядок полинома ниже.`,
      dtwMatches: (count: number) => `DTW сопоставил только ${count} пиков. Попробуйте уменьшить prominence или изменить размер DTW-окна.`,
      invalidFits: "Не найден корректный первичный FITS HDU.",
      fitsPrimaryOnly: "Поддерживается одномерный FITS-спектр в первичном HDU.",
      fitsTooManyPoints: (maximum: number) => `FITS содержит больше ${maximum.toLocaleString("ru-RU")} точек.`,
      unsupportedFits: (bitpix: number) => `Неподдерживаемый или повреждённый FITS (BITPIX=${bitpix}).`,
      tooFewValidPoints: "После удаления некорректных значений осталось меньше 8 точек.",
      zeroAxisRange: "Координатная ось спектра имеет нулевой диапазон.",
      constantIntensity: "Интенсивность спектра постоянна; пики определить невозможно.",
      invalidProminence: "Prominence должен быть в диапазоне (0, 1].",
      invalidWindow: "DTW-окно должно быть от 7 до 501 точки.",
      invalidOrder: "Порядок полинома должен быть от 1 до 5.",
      invalidIterations: "Число RANSAC-итераций должно быть от 10 до 20 000.",
      invalidTolerance: "Допуск RANSAC должен быть положительным.",
      ransacFailed: "RANSAC не нашёл устойчивое решение. Проверьте опорный спектр или увеличьте допуск.",
      nonMonotonic: "Полученное решение немонотонно. Проверьте входные данные и параметры.",
      notEnoughFitPoints: "Недостаточно точек для полиномиальной аппроксимации.",
      singularSystem: "Вырожденная система уравнений.",
      coefficientsFailed: "Не удалось вычислить коэффициенты.",
    };
  }

  return {
    fileTooLarge: "The file is too large. The maximum size is 25 MB.",
    tooManyPoints: (maximum: number) => `Too many data points. The maximum supported count is ${maximum.toLocaleString("en-US")}.`,
    tooFewRows: "The file must contain at least 8 numeric rows.",
    columnsNotDetected: "The columns could not be detected. Use X and intensity columns, or one intensity column.",
    targetPeaks: (count: number) => `Only ${count} peaks were found in the target spectrum. Lower prominence or select a lower polynomial order.`,
    referencePeaks: (count: number) => `Only ${count} peaks were found in the reference spectrum. Lower prominence or select a lower polynomial order.`,
    dtwMatches: (count: number) => `DTW matched only ${count} peaks. Try lowering prominence or changing the DTW window size.`,
    invalidFits: "A valid primary FITS HDU was not found.",
    fitsPrimaryOnly: "Only a one-dimensional FITS spectrum in the primary HDU is supported.",
    fitsTooManyPoints: (maximum: number) => `The FITS spectrum contains more than ${maximum.toLocaleString("en-US")} data points.`,
    unsupportedFits: (bitpix: number) => `The FITS file is unsupported or damaged (BITPIX=${bitpix}).`,
    tooFewValidPoints: "Fewer than 8 data points remain after invalid values were removed.",
    zeroAxisRange: "The spectrum coordinate axis has zero range.",
    constantIntensity: "The spectrum intensity is constant, so peaks cannot be detected.",
    invalidProminence: "Prominence must be in the range (0, 1].",
    invalidWindow: "The DTW window must contain between 7 and 501 samples.",
    invalidOrder: "The polynomial order must be between 1 and 5.",
    invalidIterations: "RANSAC iterations must be between 10 and 20,000.",
    invalidTolerance: "RANSAC tolerance must be positive.",
    ransacFailed: "RANSAC could not find a robust solution. Check the reference spectrum or increase the tolerance.",
    nonMonotonic: "The resulting solution is not monotonic. Check the input data and parameters.",
    notEnoughFitPoints: "There are not enough points for polynomial fitting.",
    singularSystem: "The polynomial system is singular.",
    coefficientsFailed: "The polynomial coefficients could not be calculated.",
  };
}
