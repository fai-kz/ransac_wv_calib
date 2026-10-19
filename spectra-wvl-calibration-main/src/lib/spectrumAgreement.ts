/** Compare an entire candidate-calibrated spectrum, not just the fitted pairs.
 * Median background removal and square-root contrast reduce sensitivity to
 * continuum and line brightness. This is a selection diagnostic, not an
 * independent wavelength-accuracy estimate.
 */
export function makeSpectrumAgreement(
  targetX: number[], targetY: number[], referenceX: number[], referenceY: number[],
): (coefficients: number[]) => number {
  const count = Math.min(2048, targetX.length, referenceX.length);
  const targetGrid = Array.from({length: count}, (_, i) => i / (count - 1));
  const low = referenceX[0], span = referenceX[referenceX.length - 1] - low;
  const referenceGrid = targetGrid.map(x => low + x * span);
  const radius = Math.max(3, Math.round(count * 0.025));
  const targetContrast = removeBackground(interpolate(targetX, targetY, targetGrid), radius);
  const referenceContrast = smooth(removeBackground(interpolate(referenceX, referenceY, referenceGrid), radius), 2).map(Math.sqrt);
  const totalReferenceEnergy = referenceContrast.reduce((sum, y) => sum + y * y, 0);
  return coefficients => {
    const wavelengths = targetGrid.map(x => coefficients.reduce((sum, c) => sum * x + c, 0));
    if (wavelengths.some((x, i) => !Number.isFinite(x) || (i > 0 && x <= wavelengths[i - 1]))) return -Infinity;
    const target = smooth(interpolate(wavelengths, targetContrast, referenceGrid), 2).map(Math.sqrt);
    const cosine = (start: number, end: number) => {
      let dot = 0, a = 0, b = 0;
      for (let i = start; i < end; i++) { dot += target[i] * referenceContrast[i]; a += target[i] ** 2; b += referenceContrast[i] ** 2; }
      return {score: a > 0 && b > 0 ? dot / Math.sqrt(a * b) : 0, energy: b};
    };
    const local = Array.from({length: 4}, (_, i) => cosine(Math.floor(i * count / 4), Math.floor((i + 1) * count / 4)))
      .filter(part => part.energy > totalReferenceEnergy * 0.01);
    return 0.5 * cosine(0, count).score + 0.5 * (local.length ? local.reduce((sum, part) => sum + part.score, 0) / local.length : 0);
  };
}

function interpolate(x: number[], y: number[], grid: number[]): number[] {
  let j = 0;
  return grid.map(value => {
    if (value < x[0] || value > x[x.length - 1]) return 0;
    while (j + 1 < x.length - 1 && x[j + 1] < value) j++;
    const weight = (value - x[j]) / (x[j + 1] - x[j]);
    return y[j] * (1 - weight) + y[j + 1] * weight;
  });
}

function removeBackground(values: number[], radius: number): number[] {
  return values.map((value, i) => {
    const window = values.slice(Math.max(0, i - radius), Math.min(values.length, i + radius + 1)).sort((a, b) => a - b);
    return Math.max(0, value - window[Math.floor(window.length / 2)]);
  });
}

function smooth(values: number[], sigma: number): number[] {
  const radius = Math.ceil(3 * sigma);
  const weights = Array.from({length: radius * 2 + 1}, (_, j) => Math.exp(-0.5 * ((j - radius) / sigma) ** 2));
  const total = weights.reduce((a, b) => a + b, 0);
  return values.map((_, i) => weights.reduce((sum, w, j) => sum + w * values[Math.max(0, Math.min(values.length - 1, i + j - radius))], 0) / total);
}
