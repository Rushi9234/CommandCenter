import React from 'react';

interface FollowUpChipsProps {
  chips?: string[];
  onChipClick: (prompt: string) => void;
  disabled?: boolean;
}

export const FollowUpChips: React.FC<FollowUpChipsProps> = ({ chips, onChipClick, disabled = false }) => {
  if (!chips || chips.length === 0) return null;

  // Limit to max 3 relevant chips as specified in Section 9
  const displayChips = chips.slice(0, 3);

  return (
    <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 mt-2">
      <span className="text-[10px] font-semibold text-slate-400 block w-full uppercase tracking-wider">Suggested Follow-ups</span>
      {displayChips.map((c, idx) => (
        <button
          key={idx}
          onClick={() => onChipClick(c)}
          disabled={disabled}
          className="text-left px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium rounded-lg text-[11px] border border-slate-200/70 transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {c}
        </button>
      ))}
    </div>
  );
};

export default FollowUpChips;
