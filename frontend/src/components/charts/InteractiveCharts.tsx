import { useState } from 'react';

// ============================================================================
// 1. INTERACTIVE PROGRESS RING CHART
// ============================================================================
interface ProgressRingProps {
  percent: number;
  completed?: number;
  total?: number;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
}

export function InteractiveProgressRing({
  percent,
  completed,
  total,
  size = 120,
  stroke = 12,
  label = 'Progress',
  color = '#4F46E5',
}: ProgressRingProps) {
  const [isHovered, setIsHovered] = useState(false);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div
      className="relative flex flex-col items-center justify-center cursor-pointer group"
      style={{ width: size, height: size }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="img"
      aria-label={`${label}: ${percent}%`}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={stroke}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke + (isHovered ? 2 : 0)}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-900">{percent}%</span>
        {label && <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">{label}</span>}
      </div>

      {/* Floating Hover Tooltip */}
      {isHovered && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap pointer-events-none transition-all duration-150 border border-gray-700">
          <div className="font-bold">{label}: {percent}%</div>
          {completed !== undefined && total !== undefined && (
            <div className="text-[11px] text-gray-300">
              {completed} of {total} completed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. INTERACTIVE TASK DONUT CHART
// ============================================================================
interface TaskDonutProps {
  completed: number;
  inProgress: number;
  pendingReview: number;
  todo: number;
}

export function InteractiveTaskDonut({ completed, inProgress, pendingReview, todo }: TaskDonutProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const total = completed + inProgress + pendingReview + todo;

  if (total === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No tasks assigned to display status distribution.
      </div>
    );
  }

  const completedPct = Math.round((completed / total) * 100);
  const inProgPct = Math.round((inProgress / total) * 100);
  const reviewPct = Math.round((pendingReview / total) * 100);
  const todoPct = Math.max(0, 100 - completedPct - inProgPct - reviewPct);

  const categories = [
    { key: 'Completed', count: completed, pct: completedPct, color: '#10B981', bgClass: 'bg-emerald-50', textClass: 'text-emerald-900', dotClass: 'bg-emerald-500' },
    { key: 'In Progress', count: inProgress, pct: inProgPct, color: '#3B82F6', bgClass: 'bg-blue-50', textClass: 'text-blue-900', dotClass: 'bg-blue-500' },
    { key: 'Pending Review', count: pendingReview, pct: reviewPct, color: '#8B5CF6', bgClass: 'bg-purple-50', textClass: 'text-purple-900', dotClass: 'bg-purple-500' },
    { key: 'To Do', count: todo, pct: todoPct, color: '#9CA3AF', bgClass: 'bg-gray-100', textClass: 'text-gray-700', dotClass: 'bg-gray-400' },
  ];

  const currentHover = categories.find((c) => c.key === hoveredCategory);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 p-4">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-40 h-40 transform -rotate-90">
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F3F4F6" strokeWidth="3.8" />

          {/* Completed Segment */}
          <circle
            cx="18" cy="18" r="15.915" fill="none" stroke="#10B981"
            strokeWidth={hoveredCategory === 'Completed' ? 5 : 3.8}
            strokeDasharray={`${completedPct} ${100 - completedPct}`}
            strokeDashoffset="0"
            className="transition-all duration-200 cursor-pointer hover:opacity-80"
            onMouseEnter={() => setHoveredCategory('Completed')}
            onMouseLeave={() => setHoveredCategory(null)}
          />
          {/* In Progress Segment */}
          <circle
            cx="18" cy="18" r="15.915" fill="none" stroke="#3B82F6"
            strokeWidth={hoveredCategory === 'In Progress' ? 5 : 3.8}
            strokeDasharray={`${inProgPct} ${100 - inProgPct}`}
            strokeDashoffset={`-${completedPct}`}
            className="transition-all duration-200 cursor-pointer hover:opacity-80"
            onMouseEnter={() => setHoveredCategory('In Progress')}
            onMouseLeave={() => setHoveredCategory(null)}
          />
          {/* Review Segment */}
          <circle
            cx="18" cy="18" r="15.915" fill="none" stroke="#8B5CF6"
            strokeWidth={hoveredCategory === 'Pending Review' ? 5 : 3.8}
            strokeDasharray={`${reviewPct} ${100 - reviewPct}`}
            strokeDashoffset={`-${completedPct + inProgPct}`}
            className="transition-all duration-200 cursor-pointer hover:opacity-80"
            onMouseEnter={() => setHoveredCategory('Pending Review')}
            onMouseLeave={() => setHoveredCategory(null)}
          />
          {/* Todo Segment */}
          <circle
            cx="18" cy="18" r="15.915" fill="none" stroke="#9CA3AF"
            strokeWidth={hoveredCategory === 'To Do' ? 5 : 3.8}
            strokeDasharray={`${todoPct} ${100 - todoPct}`}
            strokeDashoffset={`-${completedPct + inProgPct + reviewPct}`}
            className="transition-all duration-200 cursor-pointer hover:opacity-80"
            onMouseEnter={() => setHoveredCategory('To Do')}
            onMouseLeave={() => setHoveredCategory(null)}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-gray-900">{total}</span>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Total Tasks</span>
        </div>

        {/* Hover Popover */}
        {currentHover && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap pointer-events-none border border-gray-700">
            <span className="font-bold">{currentHover.key}: </span>
            <span>{currentHover.count} tasks ({currentHover.pct}%)</span>
          </div>
        )}
      </div>

      {/* Interactive Legend List */}
      <div className="space-y-2 flex-1 w-full text-xs">
        {categories.map((cat) => (
          <div
            key={cat.key}
            onMouseEnter={() => setHoveredCategory(cat.key)}
            onMouseLeave={() => setHoveredCategory(null)}
            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${cat.bgClass} ${
              hoveredCategory === cat.key ? 'ring-2 ring-indigo-500 scale-[1.02]' : ''
            }`}
          >
            <div className={`flex items-center gap-2 font-semibold ${cat.textClass}`}>
              <span className={`w-3 h-3 rounded-full ${cat.dotClass} inline-block`}></span>
              {cat.key}
            </div>
            <span className={`font-bold ${cat.textClass}`}>
              {cat.count} ({cat.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 3. INTERACTIVE 7-DAY WORK TREND CHART
// ============================================================================
interface WorkTrendProps {
  trend: Array<{ date: string; completions: number; updates: number }>;
}

export function InteractiveWorkTrendChart({ trend }: WorkTrendProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const maxVal = Math.max(...trend.map((w) => w.completions + w.updates), 1);

  return (
    <div className="space-y-3 pt-2">
      {trend.map((wt) => {
        const completionWidth = Math.round((wt.completions / maxVal) * 100);
        const updateWidth = Math.round((wt.updates / maxVal) * 100);
        const formattedDate = new Date(wt.date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const isHovered = hoveredDate === wt.date;

        return (
          <div
            key={wt.date}
            className={`relative flex items-center gap-3 text-xs p-1.5 rounded-lg transition-colors cursor-pointer ${
              isHovered ? 'bg-indigo-50/70' : 'hover:bg-gray-50'
            }`}
            onMouseEnter={() => setHoveredDate(wt.date)}
            onMouseLeave={() => setHoveredDate(null)}
          >
            <div className="w-24 font-semibold text-gray-600 shrink-0">
              {formattedDate}
            </div>
            <div className="flex-1 bg-gray-100 h-7 rounded-lg overflow-hidden flex items-center px-1">
              {wt.completions > 0 && (
                <div
                  className="bg-emerald-500 text-white text-[10px] font-bold h-5 rounded px-1.5 flex items-center justify-center mr-1 transition-all"
                  style={{ width: `${Math.max(completionWidth, 18)}%` }}
                >
                  ✅ {wt.completions}
                </div>
              )}
              {wt.updates > 0 && (
                <div
                  className="bg-blue-500 text-white text-[10px] font-bold h-5 rounded px-1.5 flex items-center justify-center transition-all"
                  style={{ width: `${Math.max(updateWidth, 18)}%` }}
                >
                  📝 {wt.updates}
                </div>
              )}
              {wt.completions === 0 && wt.updates === 0 && (
                <span className="text-[10px] text-gray-400 pl-2 font-medium">No activity recorded</span>
              )}
            </div>

            {/* Hover Tooltip Popover */}
            {isHovered && (
              <div className="absolute right-0 -top-9 z-30 bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap pointer-events-none border border-gray-700">
                <span className="font-bold">{formattedDate}: </span>
                <span className="text-emerald-400 font-semibold">{wt.completions} completed</span>
                <span className="text-gray-400 mx-1">•</span>
                <span className="text-blue-400 font-semibold">{wt.updates} updates</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
