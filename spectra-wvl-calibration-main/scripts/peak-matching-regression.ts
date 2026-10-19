import assert from 'node:assert/strict';
import { matchPeaks } from '../src/lib/peakMatching';
import { DEFAULT_PARAMETERS, parseTextSpectrum, runCalibration } from '../src/lib/calibration';

const n = 2049;
const axis = Array.from({ length: n }, (_, i) => i / (n - 1));
const positions = [0.08, 0.175, 0.202, 0.338, 0.372, 0.462, 0.568, 0.621, 0.67, 0.842, 0.918, 0.968];
const index = (x: number) => Math.round(x * (n - 1));
const shape = (centres: number[], heights: number[], width: number) => axis.map(x =>
  centres.reduce((sum, centre, j) => sum + heights[j] * Math.exp(-0.5 * ((x - centre) / width) ** 2), 0));
const forward = (x: number) => 0.012 + 0.975 * x + 0.032 * x * (1 - x);
const heights = positions.map((_, i) => [0.1, 0.6, 1, 0.25][i % 4]);
const referenceHeights = heights.map((h, i) => h * [3, 0.2, 0.7, 2][i % 4]);

for (const missing of [false, true]) {
  const targetPositions = positions.filter((_, i) => !missing || i !== 4);
  // Include an unmatched reference line and an unmatched target line.
  const t = missing ? [...targetPositions, 0.73].sort((a, b) => a - b) : targetPositions;
  const r = [...positions.map(forward), ...(missing ? [0.79] : [])].sort((a, b) => a - b);
  const ty = shape(t, t.map((_, i) => heights[i % heights.length]), 0.0008);
  const ry = shape(r, r.map((_, i) => referenceHeights[i % heights.length]), 0.003);
  const pairs = matchPeaks(t.map(index), r.map(index), axis, axis, ty, ry, 45);
  assert.equal(pairs.length, targetPositions.length, 'Missing/extra lines must be skipped');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    assert.ok(Math.abs(axis[pair.referenceIndex] - forward(axis[pair.targetIndex])) < 0.001,
      `Wrong identification: ${axis[pair.targetIndex]} -> ${axis[pair.referenceIndex]}`);
    if (i) {
      assert.ok(pair.targetIndex > pairs[i - 1].targetIndex);
      assert.ok(pair.referenceIndex > pairs[i - 1].referenceIndex);
    }
  }
}
assert.deepEqual(matchPeaks([], [], axis, axis, axis, axis, 45), []);

// End-to-end check against the known wavelength relation, rather than training RMS.
const targetFlux = shape(positions, heights, 0.0008);
const referenceFlux = shape(positions.map(forward), referenceHeights, 0.002);
const text = (x: number[], y: number[]) => x.map((value, i) => `${value} ${y[i]}`).join('\n');
const target = parseTextSpectrum(text(axis.map(x => x * (n - 1)), targetFlux), 'synthetic-target.txt', 'text');
const reference = parseTextSpectrum(text(axis.map(x => 4700 + 500 * x), referenceFlux), 'synthetic-reference.txt', 'text');
const result = runCalibration(target, reference, { ...DEFAULT_PARAMETERS, polynomialOrder: 2, ransacTolerance: 0.8 }, false);
assert.ok(result.summary.ransacInliers >= 11, 'The main lines must survive RANSAC');
for (const x of [0.08, 0.3, 0.57, 0.8, 0.96]) {
  const calibrated = result.calibratedSpectrum[index(x)];
  const truth = 4700 + 500 * forward(axis[index(x)]);
  assert.ok(Math.abs(calibrated.wavelength - truth) < 0.4, `Wavelength error at ${x}: ${calibrated.wavelength - truth}`);
}
console.log('Peak matching regression: changed brightness/width, nonlinear dispersion, missing/extra lines, unique ordered pairs, known wavelengths passed.');

// Numerous small noise maxima must not dominate a sparse line pattern.
const noisyFlux = targetFlux.map((y, i) => y + 0.012 * Math.sin(i * 1.73) + 0.009 * Math.sin(i * 2.41));
const noisyTarget = parseTextSpectrum(text(axis.map(x => x * (n - 1)), noisyFlux), 'noisy-target.txt', 'text');
const noisyResult = runCalibration(noisyTarget, reference, { ...DEFAULT_PARAMETERS, polynomialOrder: 2, ransacTolerance: 0.8 }, false);
assert.ok(noisyResult.summary.targetPeaks <= positions.length + 3, 'Noise maxima should not swamp the line list');
for (const x of [0.3, 0.57, 0.8]) {
  assert.ok(Math.abs(noisyResult.calibratedSpectrum[index(x)].wavelength - (4700 + 500 * forward(axis[index(x)]))) < 0.5,
    'Noise filtering must retain a correct wavelength relation');
}
console.log('Noisy-spectrum regression passed.');
