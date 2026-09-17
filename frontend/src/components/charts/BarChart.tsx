import React from 'react';

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  items: BarChartItem[];
  title?: string;
  height?: number;
  className?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  items = [],
  title = 'Work Distribution',
  className = '',
}) => {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  if (!items || items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-gray-400 bg-slate-50/50 rounded-2xl border border-slate-100 ${className}`}>
        <span className="text-sm font-medium">No project distribution data</span>
      </div>
    );
  }

  const defaultColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs ${className}`} data-testid="bar-chart">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h4>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Projects</span>
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((item, idx) => {
          const pct = Math.round((item.value / maxVal) * 100);
          const color = item.color || defaultColors[idx % defaultColors.length];

          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 truncate max-w-[180px]">{item.label}</span>
                <span className="font-bold text-slate-900">{item.value}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarChart;
