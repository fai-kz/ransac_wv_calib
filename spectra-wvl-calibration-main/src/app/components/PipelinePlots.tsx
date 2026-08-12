import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';

// Step 1: Grating Classification
export function GratingClassificationPlot() {
  const data = [
    { name: '360', prob: 0.03 },
    { name: '1800', prob: 0.91 },
    { name: '2400', prob: 0.06 },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 15 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis hide domain={[0, 1]} />
        <Bar dataKey="prob" fill="#2B6CB0" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Step 2: Normalization
export function NormalizationPlot() {
  const data = Array.from({ length: 30 }, (_, i) => ({
    x: i,
    raw: 1500 + Math.random() * 500 + Math.sin(i * 0.3) * 300,
    norm: 0.3 + Math.random() * 0.1 + Math.sin(i * 0.3) * 0.2,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Line type="monotone" dataKey="raw" stroke="#9CA3AF" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="norm" stroke="#2B6CB0" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Step 3: Peak Detection - now takes prominence parameter
export function PeakDetectionPlot({ prominence }: { prominence: number }) {
  const numPeaks = Math.max(3, Math.floor(prominence * 30));
  const spectrum = Array.from({ length: 40 }, (_, i) => ({
    x: i,
    y: 0.2 + Math.random() * 0.1 + (i % Math.floor(40 / numPeaks) === 0 ? 0.3 + prominence : 0),
  }));

  const peaks = Array.from({ length: numPeaks }, (_, i) => ({
    x: i * Math.floor(40 / numPeaks),
    y: 0.5 + prominence,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Line data={spectrum} type="monotone" dataKey="y" stroke="#2B6CB0" strokeWidth={1} dot={false} />
        <Scatter data={peaks} fill="#DD6B20" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Step 4: DTW Matching - now shows connection lines
export function DTWMatchingPlot({ window }: { window?: number }) {
  const lamp = [
    { x: 6, y: 0.7 },
    { x: 12, y: 0.65 },
    { x: 18, y: 0.75 },
    { x: 24, y: 0.68 },
  ];
  
  const object = [
    { x: 7, y: 0.45 },
    { x: 13, y: 0.40 },
    { x: 19, y: 0.50 },
    { x: 25, y: 0.43 },
  ];

  const baseline1 = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0.3 }));
  const baseline2 = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0.15 }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Line data={baseline1} type="monotone" dataKey="y" stroke="#DD6B20" strokeWidth={0.5} dot={false} />
        <Line data={baseline2} type="monotone" dataKey="y" stroke="#2B6CB0" strokeWidth={0.5} dot={false} />
        <Scatter data={lamp} fill="#DD6B20" />
        <Scatter data={object} fill="#2B6CB0" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Step 5: Polynomial Fitting - now takes order parameter
export function PolynomialFittingPlot({ order }: { order: number }) {
  const points = Array.from({ length: 15 }, (_, i) => ({
    pixel: i * 2.5,
    wavelength: 4000 + i * 200 + (Math.random() - 0.5) * 30,
  }));

  const fit = Array.from({ length: 40 }, (_, i) => {
    const pixel = i;
    let wavelength = 4000;
    for (let o = 1; o <= order; o++) {
      wavelength += 75 * Math.pow(pixel, o) + 0.05 * Math.pow(pixel, o);
    }
    return { pixel, wavelength };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Scatter data={points} fill="#2B6CB0" />
        <Line data={fit} type="monotone" dataKey="wavelength" stroke="#DD6B20" strokeWidth={1.5} dot={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Step 6: RANSAC Refinement - shows before/after clearly
export function RansacRefinementPlot({ iterations, tolerance }: { iterations?: number; tolerance?: number }) {
  const inliers = Array.from({ length: 12 }, (_, i) => ({
    x: i * 3,
    y: 4000 + i * 200,
  }));

  const outliers = [
    { x: 8, y: 4900 },
    { x: 15, y: 6200 },
    { x: 25, y: 8800 },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Scatter data={inliers} fill="#2B6CB0" />
        <Scatter data={outliers} fill="#D9DEE6" shape="cross" opacity={0.3} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Step 7: Inverse Normalization
export function InverseNormalizationPlot() {
  const data = Array.from({ length: 30 }, (_, i) => ({
    wavelength: 4000 + i * 150,
    flux: 0.4 + Math.random() * 0.2 + Math.sin(i * 0.4) * 0.15,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Line type="monotone" dataKey="flux" stroke="#2B6CB0" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Step 8: Final Output
export function FinalOutputPlot() {
  const data = Array.from({ length: 35 }, (_, i) => ({
    wavelength: 4000 + i * 120,
    flux: 0.5 + Math.random() * 0.15 + Math.sin(i * 0.35) * 0.2,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <Line type="monotone" dataKey="flux" stroke="#2B6CB0" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}