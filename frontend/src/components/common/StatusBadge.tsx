import React from 'react';

export interface StatusBadgeProps {
  status: string;
  variant?: 'status' | 'priority' | 'type';
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  // Common / Tasks
  todo: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  review: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  planning: 'bg-purple-50 text-purple-700 border-purple-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  on_hold: 'bg-amber-50 text-amber-700 border-amber-200',
  open: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',

  // Priorities
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  urgent: 'bg-red-100 text-red-800 border-red-300 font-semibold',

  // Types / Tags
  web: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  dev: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  mobile: 'bg-purple-50 text-purple-700 border-purple-200',
  design: 'bg-pink-50 text-pink-700 border-pink-200',
  marketing: 'bg-orange-50 text-orange-700 border-orange-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant: _variant = 'status',
  size = 'sm',
  className = '',
}) => {
  if (!status) return null;
  const normalizedKey = status.toLowerCase().replace(/[\s-]/g, '_');
  const colorClass = STATUS_COLOR_MAP[normalizedKey] || 'bg-gray-100 text-gray-700 border-gray-200';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shrink-0 ${sizeClass} ${colorClass} ${className}`}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
