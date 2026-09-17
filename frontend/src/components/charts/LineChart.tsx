import React from 'react';

export interface LineChartPoint {
  label: string;
  value: number;
}

export interface LineChartProps {
  data: LineChartPoint[];
  title?: string;
  height?: number;
  color?: string;
  className?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data = [],
  title = 'Work Trend',
  height = 200,
  color = '#6366f1', // indigo-500
  className = '',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-gray-400 bg-slate-50/50 rounded-2xl border border-slate-100 ${className}`}>
        <span className="text-sm font-medium">No activity trend data available</span>
      </div>
    );
  }

  const padding = 30;
  const chartWidth = 500;
  const chartHeight = height;

  const maxValue = Math.max(...data.map((d) => d.value), 5);
  const minValue = 0;

  const points = data.map((d, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - ((d.value - minValue) / (maxValue - minValue || 1)) * (chartHeight - padding * 2);
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`
    : '';

  return (
    <div className={`w-full bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs ${className}`} data-testid="line-chart">
      {title && (
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h4>
          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            Realtime DB
          </span>
        </div>
      )}
      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((ratio, i) => {
            const y = padding + ratio * (chartHeight - padding * 2);
            return (
              <line
                key={i}
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Fill Area */}
          <path d={areaD} fill="url(#lineChartGradient)" />

          {/* Stroke Line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Point Dots & Tooltip Markers */}
          {points.map((p, i) => (
            <g key={i} className="group cursor-pointer">
              <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke={color} strokeWidth="2.5" className="transition-all group-hover:r-6" />
              <text
                x={p.x}
                y={chartHeight - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
                fontWeight="500"
              >
                {p.label}
              </text>
              <title>{`${p.label}: ${p.value} items`}</title>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

export default LineChart;
