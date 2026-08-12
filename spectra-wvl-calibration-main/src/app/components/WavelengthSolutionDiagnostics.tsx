import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PipelineParameters } from '../App';

interface WavelengthSolutionDiagnosticsProps {
  parameters: PipelineParameters;
  isProcessing: boolean;
}

export function WavelengthSolutionDiagnostics({ parameters, isProcessing }: WavelengthSolutionDiagnosticsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Generate wavelength solution data based on polynomial order
  const generateWavelengthData = () => {
    const points = Array.from({ length: 43 }, (_, i) => {
      const pixel = i * 10 + Math.random() * 5;
      const baseWavelength = 4000 + pixel * 0.8;
      const noise = (Math.random() - 0.5) * parameters.ransacTolerance * 2;
      return {
        pixel,
        wavelength: baseWavelength + noise,
      };
    });

    // Add outliers based on RANSAC tolerance
    const outliers = [
      { pixel: 85, wavelength: 4200, isOutlier: true },
      { pixel: 180, wavelength: 5800, isOutlier: true },
      { pixel: 320, wavelength: 7100, isOutlier: true },
      { pixel: 380, wavelength: 7850, isOutlier: true },
    ];

    return { points, outliers };
  };

  const { points, outliers } = generateWavelengthData();

  // Generate polynomial fit line
  const fitData = Array.from({ length: 100 }, (_, i) => {
    const pixel = i * 4.5;
    let wavelength = 4000;
    
    // Polynomial of specified order
    for (let order = 1; order <= parameters.polynomialOrder; order++) {
      wavelength += 0.8 * Math.pow(pixel, order) + 0.0001 * Math.pow(pixel, order + 1);
    }
    
    return { pixel, wavelength };
  });

  // Generate residuals
  const residualsData = points.map(p => {
    const fittedWavelength = fitData.find(f => Math.abs(f.pixel - p.pixel) < 5)?.wavelength || p.wavelength;
    return {
      pixel: p.pixel,
      residual: p.wavelength - fittedWavelength,
    };
  });

  return (
    <div className="mt-6 pt-6 border-t border-[#D9DEE6]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left mb-4"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
          <h3 className="text-[15px] text-gray-900">Wavelength Solution & Fit Diagnostics</h3>
        </div>
        {isProcessing && (
          <span className="flex items-center gap-2 text-[12px] text-[#2B6CB0]">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Updating...
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-6">
          {/* Wavelength Calibration Plot */}
          <div className="bg-white border border-[#D9DEE6] rounded-md p-4">
            <h4 className="text-[13px] text-gray-700 mb-3">Pixel-to-Wavelength Transformation</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 10, right: 20, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" />
                <XAxis 
                  dataKey="pixel" 
                  type="number"
                  label={{ value: 'Pixel', position: 'insideBottom', offset: -15, style: { fontSize: 12, fill: '#6B7280' } }}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  stroke="#D9DEE6"
                />
                <YAxis 
                  label={{ value: 'Wavelength (Å)', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#6B7280' } }}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  stroke="#D9DEE6"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #D9DEE6', 
                    borderRadius: 6,
                    fontSize: 11
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                />
                <Scatter 
                  data={points} 
                  fill="#2B6CB0" 
                  name="Matched peaks (inliers)"
                  opacity={0.7}
                />
                <Scatter 
                  data={outliers} 
                  fill="#D9DEE6" 
                  name="Rejected outliers"
                  opacity={0.4}
                  shape="cross"
                />
                <Line 
                  data={fitData} 
                  type="monotone" 
                  dataKey="wavelength" 
                  stroke="#DD6B20" 
                  strokeWidth={2} 
                  dot={false}
                  name={`Polynomial fit (order ${parameters.polynomialOrder})`}
                />
              </ScatterChart>
            </ResponsiveContainer>
            
            <div className="mt-3 px-3 py-2 bg-[#F6F7F9] rounded-md">
              <p className="text-[11px] text-gray-600">
                <span className="font-mono">λ(x) = c₀ + c₁x + c₂x² + ... + c_{parameters.polynomialOrder}x^{parameters.polynomialOrder}</span>
                {' • '}
                RANSAC tolerance: {parameters.ransacTolerance} Å
                {' • '}
                Inliers: {points.length} / Total: {points.length + outliers.length}
              </p>
            </div>
          </div>

          {/* Residuals Plot */}
          <div className="bg-white border border-[#D9DEE6] rounded-md p-4">
            <h4 className="text-[13px] text-gray-700 mb-3">Fit Residuals</h4>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 10, right: 20, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" />
                <XAxis 
                  dataKey="pixel" 
                  type="number"
                  label={{ value: 'Pixel', position: 'insideBottom', offset: -15, style: { fontSize: 12, fill: '#6B7280' } }}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  stroke="#D9DEE6"
                />
                <YAxis 
                  label={{ value: 'Residual (Å)', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#6B7280' } }}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  stroke="#D9DEE6"
                  domain={[-5, 5]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #D9DEE6', 
                    borderRadius: 6,
                    fontSize: 11
                  }}
                />
                <Scatter 
                  data={residualsData} 
                  fill="#2B6CB0" 
                  opacity={0.6}
                />
                <Line 
                  data={[{ pixel: 0, y: 0 }, { pixel: 450, y: 0 }]} 
                  type="monotone" 
                  dataKey="y" 
                  stroke="#D9DEE6" 
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
            
            <div className="mt-3 px-3 py-2 bg-[#F6F7F9] rounded-md">
              <p className="text-[11px] text-gray-600">
                RMS residual: {(Math.sqrt(residualsData.reduce((sum, d) => sum + d.residual ** 2, 0) / residualsData.length)).toFixed(3)} Å
                {' • '}
                Max deviation: {Math.max(...residualsData.map(d => Math.abs(d.residual))).toFixed(2)} Å
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
