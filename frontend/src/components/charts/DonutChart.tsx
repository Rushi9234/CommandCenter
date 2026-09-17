import React from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  totalLabel?: string;
  size?: number;
  title?: string;
  className?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  segments = [],
  totalLabel = 'Total Tasks',
  size = 180,
  title = 'Task Status Distribution',
  className = '',
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-gray-400 bg-slate-50/50 rounded-2xl border border-slate-100 ${className}`}>
        <span className="text-sm font-medium">No tasks recorded yet</span>
      </div>
    );
  }

  const radius = 60;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  let cumulativeAngle = 0;

  return (
    <div className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col items-center ${className}`} data-testid="donut-chart">
      {title && (
        <div className="w-full flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h4>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {total} Items
          </span>
        </div>
      )}

      <div className="relative flex items-center justify-center my-2" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 160 160" className="transform -rotate-90">
          <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {segments.map((seg, i) => {
            if (seg.value === 0) return null;
            const strokeDasharray = `${(seg.value / total) * circumference} ${circumference}`;
            const strokeDashoffset = -cumulativeAngle;
            cumulativeAngle += (seg.value / total) * circumference;

            return (
              <circle
                key={i}
                cx="80"
                cy="80"
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 hover:opacity-80 cursor-pointer"
              >
                <title>{`${seg.label}: ${seg.value} (${Math.round((seg.value / total) * 100)}%)`}</title>
              </circle>
            );
          })}
        </svg>

        {/* Center Ring Data */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-black text-slate-900 leading-none">{total}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{totalLabel}</span>
        </div>
      </div>

      {/* Segment Legend */}
      <div className="w-full grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-slate-600 truncate font-medium">{seg.label}</span>
            </div>
            <span className="font-bold text-slate-900 ml-1">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DonutChart;
