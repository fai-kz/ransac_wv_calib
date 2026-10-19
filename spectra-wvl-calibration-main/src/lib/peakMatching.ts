export interface PeakMatch {
  targetIndex: number;
  referenceIndex: number;
  cost: number;
}

/** Match ordered peak sequences. The input axes must cover approximately the
 * same spectral interval; this is not a blind search of a full laboratory atlas.
 * Geometry dominates: separately normalized local profiles only break ties.
 */
export interface MatchingOptions {
  strategy?: "position" | "shape" | "local";
  predictedPositions?: number[];
  radius?: number;
}

export function matchPeaks(
  targetPeaks: number[], referencePeaks: number[],
  targetX: number[], referenceX: number[],
  targetY: number[], referenceY: number[], windowSize: number,
  options: MatchingOptions = {},
): PeakMatch[] {
  if (!targetPeaks.length || !referencePeaks.length) return [];
  const t = targetPeaks.map(index => targetX[index]);
  const r = referencePeaks.map(index => referenceX[index]);

  // A bounded coarse registration uses positions, not relative line heights.
  // Symmetric nearest-neighbour support penalizes matching many lines to one.
  let bestScore = -Infinity;
  let scale = 1, offset = 0;
  const support = (a: number[], b: number[]) => {
    let j = 0, total = 0;
    for (const value of a) {
      while (j + 1 < b.length && Math.abs(b[j + 1] - value) < Math.abs(b[j] - value)) j++;
      total += Math.exp(-0.5 * ((value - b[j]) / 0.006) ** 2);
    }
    return total / a.length;
  };
  if (!options.predictedPositions && (!options.strategy || options.strategy === "position")) for (let si = -20; si <= 20; si++) {
    const candidateScale = 1 + si * 0.01;
    for (let oi = -24; oi <= 24; oi++) {
      const candidateOffset = oi * 0.005;
      const predicted = t.map(x => candidateScale * x + candidateOffset);
      const score = support(predicted, r) + support(r, predicted)
        - 0.01 * (Math.abs(candidateOffset) + Math.abs(candidateScale - 1));
      if (score > bestScore) {
        bestScore = score; scale = candidateScale; offset = candidateOffset;
      }
    }
  }

  const radius = options.radius ?? 0.05;
  const shapeLed = options.strategy === "shape";
  const tw = targetPeaks.map(index => normalizeWindow(extractWindow(targetY, index, windowSize)));
  const rw = referencePeaks.map(index => normalizeWindow(extractWindow(referenceY, index, windowSize)));
  // A local-profile hypothesis is used only to seed RANSAC in the caller.
  // The final assignment is rebuilt by the ordered matcher around that fit.
  if (options.strategy === "local") {
    const proposed: PeakMatch[] = [];
    for (let i = 0; i < t.length; i++) {
      let best: PeakMatch | null = null;
      for (let j = 0; j < r.length; j++) {
        if (Math.abs(t[i] - r[j]) >= radius) continue;
        const cost = dtwDistance(tw[i], rw[j]) / Math.max(tw[i].length, rw[j].length);
        if (!best || cost < best.cost) best = {targetIndex: targetPeaks[i], referenceIndex: referencePeaks[j], cost};
      }
      if (best) proposed.push(best);
    }
    const used = new Set<number>();
    return proposed.sort((a, b) => a.cost - b.cost).filter(pair => {
      if (used.has(pair.referenceIndex)) return false;
      used.add(pair.referenceIndex); return true;
    }).sort((a, b) => a.targetIndex - b.targetIndex);
  }
  const columns = r.length + 1;
  const costs = new Float64Array((t.length + 1) * columns);
  const steps = new Uint8Array(costs.length);
  const pairCosts = new Float64Array(t.length * r.length);
  const shapeCosts = new Float64Array(pairCosts.length);
  const gap = 0.8;
  for (let i = 1; i <= t.length; i++) { costs[i * columns] = i * gap; steps[i * columns] = 1; }
  for (let j = 1; j <= r.length; j++) { costs[j] = j * gap; steps[j] = 2; }
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= r.length; j++) {
      const predicted = options.predictedPositions?.[targetPeaks[i - 1]] ?? (scale * t[i - 1] + offset);
      const distance = Math.abs(predicted - r[j - 1]);
      const shapeCost = distance < radius
        ? dtwDistance(tw[i - 1], rw[j - 1]) / Math.max(tw[i - 1].length, rw[j - 1].length)
        : Infinity;
      shapeCosts[(i - 1) * r.length + j - 1] = shapeCost;
      const pairCost = shapeLed
        ? 0.15 * distance / radius + 4 * Math.min(shapeCost, 1)
        : distance / (options.predictedPositions ? radius / 1.6 : 0.015) + 0.15 * Math.min(shapeCost, 1);
      pairCosts[(i - 1) * r.length + j - 1] = distance < radius ? pairCost : Infinity;
      const position = i * columns + j;
      const skipTarget = costs[position - columns] + gap;
      const skipReference = costs[position - 1] + gap;
      const match = costs[position - columns - 1] + pairCosts[(i - 1) * r.length + j - 1];
      if (match < skipTarget && match < skipReference) { costs[position] = match; steps[position] = 3; }
      else if (skipTarget <= skipReference) { costs[position] = skipTarget; steps[position] = 1; }
      else { costs[position] = skipReference; steps[position] = 2; }
    }
  }
  const matches: PeakMatch[] = [];
  let i = t.length, j = r.length;
  while (i || j) {
    const step = steps[i * columns + j];
    if (step === 3) {
      matches.push({ targetIndex: targetPeaks[i - 1], referenceIndex: referencePeaks[j - 1],
        cost: shapeCosts[(i - 1) * r.length + j - 1] });
      i--; j--;
    } else if (step === 1) i--;
    else j--;
  }
  return matches.reverse();
}

function extractWindow(values: number[], center: number, windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, center - half);
  const end = Math.min(values.length, center + half + 1);
  return values.slice(start, end);
}

function normalizeWindow(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return range === 0 ? values.map(() => 0) : values.map((value) => (value - min) / range);
}

function dtwDistance(a: number[], b: number[]): number {
  let previous = new Float64Array(b.length + 1);
  previous.fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Float64Array(b.length + 1);
    current.fill(Number.POSITIVE_INFINITY);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      current[j] = cost + Math.min(previous[j], current[j - 1], previous[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}
