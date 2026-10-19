import "./grating-regression";
import "./peak-matching-regression";
import { DEFAULT_PARAMETERS, parseSpectrumFile, parseTextSpectrum, runCalibration } from "../src/lib/calibration";
import targetText from "../src/data/example_target.txt";
import referenceText from "../src/data/reference_spectrum.txt";

const target = parseTextSpectrum(targetText, "example_target.txt", "text");
const reference = parseTextSpectrum(referenceText, "reference_spectrum.txt", "internal");

const textFixtures = [
  ["spectrum.txt", makeTextRows(" ")],
  ["spectrum.dat", makeTextRows("   ")],
  ["spectrum.csv", `x,intensity\n${makeTextRows(",")}`],
  ["spectrum.tsv", makeTextRows("\t")],
] as const;

for (const [name, content] of textFixtures) {
  const parsed = await parseSpectrumFile(new File([content], name, { type: "text/plain" }));
  if (parsed.x.length !== 16 || parsed.y.length !== 16) throw new Error(`${name} was not parsed correctly.`);
}

const oneColumn = await parseSpectrumFile(new File([makeOneColumnRows()], "intensity.txt", { type: "text/plain" }));
if (oneColumn.x[0] !== 1 || oneColumn.x[15] !== 16 || oneColumn.metadata.axisSource !== "generated") throw new Error("The generated axis for a one-column text file is incorrect.");

for (const bitpix of [8, 16, 32, 64, -32, -64]) {
  const fits = await parseSpectrumFile(makeSyntheticFits(bitpix));
  if (fits.metadata.format !== "fits" || fits.x.length !== 16 || fits.metadata.axisSource !== "fits-wcs") throw new Error(`FITS BITPIX=${bitpix} was not parsed correctly.`);
  if (fits.x[0] !== 5000 || fits.x[15] !== 5030) throw new Error(`FITS WCS is incorrect for BITPIX=${bitpix}.`);
}

const result = runCalibration(
  target,
  reference,
  DEFAULT_PARAMETERS,
  true,
  "en",
);

if (result.summary.ransacInliers < 4) throw new Error("Ожидалось не менее четырёх RANSAC inliers.");
if (!result.solution.coefficientsForInputCoordinate.every(Number.isFinite)) throw new Error("Коэффициенты не являются конечными числами.");
if (!(result.summary.wavelengthMax > result.summary.wavelengthMin)) throw new Error("Некорректный диапазон длин волн.");
if (result.calibratedSpectrum.length !== target.x.length) throw new Error("Потеряны точки выходного спектра.");

console.log(JSON.stringify({
  targetPeaks: result.summary.targetPeaks,
  referencePeaks: result.summary.referencePeaks,
  dtwMatches: result.summary.dtwMatches,
  ransacInliers: result.summary.ransacInliers,
  rmsAngstrom: result.summary.rmsAngstrom,
  wavelengthRange: [result.summary.wavelengthMin, result.summary.wavelengthMax],
  coefficients: result.solution.coefficientsForInputCoordinate,
  verifiedFormats: ["TXT", "DAT", "CSV", "TSV", "FITS BITPIX 8/16/32/64/-32/-64"],
}, null, 2));

function makeTextRows(separator: string) {
  return Array.from({ length: 16 }, (_, index) => `${index + 1}${separator}${10 + Math.sin(index)}`).join("\n");
}

function makeOneColumnRows() {
  return Array.from({ length: 16 }, (_, index) => String(10 + Math.sin(index))).join("\n");
}

function makeSyntheticFits(bitpix: number) {
  const cards = [
    fitsCard("SIMPLE", "T"),
    fitsCard("BITPIX", String(bitpix)),
    fitsCard("NAXIS", "1"),
    fitsCard("NAXIS1", "16"),
    fitsCard("CRVAL1", "5000.0"),
    fitsCard("CDELT1", "2.0"),
    fitsCard("CRPIX1", "1.0"),
    "END".padEnd(80, " "),
  ];
  const header = cards.join("").padEnd(2880, " ");
  const bytesPerValue = Math.abs(bitpix) / 8;
  const data = new ArrayBuffer(16 * bytesPerValue);
  const view = new DataView(data);
  for (let index = 0; index < 16; index += 1) {
    const value = 10 + index;
    const offset = index * bytesPerValue;
    if (bitpix === 8) view.setUint8(offset, value);
    else if (bitpix === 16) view.setInt16(offset, value, false);
    else if (bitpix === 32) view.setInt32(offset, value, false);
    else if (bitpix === 64) view.setBigInt64(offset, BigInt(value), false);
    else if (bitpix === -32) view.setFloat32(offset, value + 0.25, false);
    else view.setFloat64(offset, value + 0.25, false);
  }
  return new File([header, data], `synthetic-${bitpix}.fits`, { type: "application/fits" });
}

function fitsCard(key: string, value: string) {
  return `${key.padEnd(8, " ")}= ${value.padStart(20, " ")}`.padEnd(80, " ");
}
