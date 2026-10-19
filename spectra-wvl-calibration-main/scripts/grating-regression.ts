import assert from 'node:assert/strict';
import fixtures from './fixtures/grating-regression.json';
import {DEFAULT_PARAMETERS, parseTextSpectrum, runCalibration} from '../src/lib/calibration';
import {makeSpectrumAgreement} from '../src/lib/spectrumAgreement';
for (const fixture of fixtures.cases) {
  const target = parseTextSpectrum(fixture.flux.map((y, i) => `${i} ${y}`).join('\n'), fixture.name, 'text');
  const rows = fixtures.references[fixture.grid as '1800' | '2400'];
  const reference = parseTextSpectrum(rows.map(row => row.join(' ')).join('\n'), `lamp${fixture.grid}`, 'text');
  const result = runCalibration(target, reference, DEFAULT_PARAMETERS, false);
  const coefficients = result.solution.coefficientsForNormalizedCoordinate;
  for (let i = 1; i < result.matches.length; i++) {
    assert.ok(result.matches[i].targetIndex > result.matches[i-1].targetIndex);
    assert.ok(result.matches[i].referenceIndex > result.matches[i-1].referenceIndex);
  }
  assert.ok(result.matches.filter(pair => pair.inlier).every(pair => Math.abs(pair.residual) <= DEFAULT_PARAMETERS.ransacTolerance));
  if (fixture.grid === '1800') {
    coefficients.forEach((c, i) => assert.ok(Math.abs(c - fixture.previousCoefficients[i]) < 1e-8,
      'Preserve the working 1800 solution'));
  } else {
    const normalizedX = target.x.map(x => x / (target.x.length - 1));
    const score = makeSpectrumAgreement(normalizedX, target.y, reference.x, reference.y);
    const before = score(fixture.previousCoefficients), after = score(coefficients);
    assert.ok(after > before + 0.04, `2400 profile agreement must improve: ${before} -> ${after}`);
    assert.ok(result.matches.some(pair => pair.targetIndex === 840 && pair.referenceIndex === 885), 'Do not shift this right-hand line to reference peak 898');
    assert.ok(result.matches.some(pair => pair.targetIndex === 986 && pair.referenceIndex === 1001), 'Recover the outer reference line');
    // Check a region away from the strongest central line as well.
    const redRows = rows.filter(row => row[0] >= 5070);
    const redScore = makeSpectrumAgreement(normalizedX, target.y, redRows.map(row=>row[0]), redRows.map(row=>row[1]));
    assert.ok(redScore(coefficients) > redScore(fixture.previousCoefficients) + 0.05, 'Right-edge agreement must improve');
    console.log(`${fixture.name}: profile agreement ${before.toFixed(3)} -> ${after.toFixed(3)}`);
  }
}
console.log('Real-file regression: both February 2400 spectra improve; both February 1800 solutions are preserved.');
