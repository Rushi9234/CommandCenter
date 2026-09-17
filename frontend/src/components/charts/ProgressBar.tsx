import React from 'react';

export interface ProgressBarProps {
  percentage: number;
  label?: string;
  sublabel?: string;
  colorClass?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage = 0,
  label,
  sublabel,
  colorClass = 'bg-indigo-600',
  className = '',
}) => {
  const clampedPct = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className={`space-y-1.5 ${className}`} data-testid="progress-bar">
      {(label || sublabel) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="font-semibold text-slate-700">{label}</span>}
          {sublabel ? (
            <span className="text-slate-500 font-medium">{sublabel}</span>
          ) : (
            <span className="font-bold text-indigo-600">{clampedPct}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${colorClass}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
