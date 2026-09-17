import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TeamOption {
  team_id: string;
  team_name: string;
  team_type?: string;
  parent_team_id?: string | null;
  department?: string;
}

interface CompactTeamSelectorProps {
  teams: TeamOption[];
  selectedTeamId: string | null;
  onSelectTeam: (team: TeamOption) => void;
  placeholder?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

export default function CompactTeamSelector({
  teams,
  selectedTeamId,
  onSelectTeam,
  placeholder = 'Search teams...',
  label,
  compact = false,
  className = '',
}: CompactTeamSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.team_id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams;
    const term = search.toLowerCase().trim();
    return teams.filter(
      (t) =>
        t.team_name.toLowerCase().includes(term) ||
        (t.department && t.department.toLowerCase().includes(term))
    );
  }, [teams, search]);

  const classrooms = useMemo(
    () => filteredTeams.filter((t) => t.team_type === 'classroom'),
    [filteredTeams]
  );

  const regularTeams = useMemo(
    () => filteredTeams.filter((t) => t.team_type !== 'classroom'),
    [filteredTeams]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 border font-medium rounded-lg transition-all shadow-sm ${
          compact
            ? 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 px-3 py-1 text-xs'
            : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50 px-3.5 py-2 text-sm w-full'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-sm">
            {selectedTeam?.team_type === 'classroom' ? '🎓' : '👥'}
          </span>
          <span className="truncate">
            {selectedTeam ? selectedTeam.team_name : 'Select a team'}
          </span>
        </span>
        <span className="text-xs text-slate-400">▼</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 mt-1.5 w-72 max-h-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col text-slate-100"
          >
            {/* Search Input */}
            <div className="p-2 border-b border-slate-800 bg-slate-950/80">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-slate-900 text-slate-100 text-xs px-3 py-1.5 rounded-md border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
                autoFocus
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto p-1.5 space-y-2 flex-1">
              {classrooms.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
                    🎓 Classrooms ({classrooms.length})
                  </div>
                  {classrooms.map((team) => (
                    <button
                      key={team.team_id}
                      type="button"
                      onClick={() => {
                        onSelectTeam(team);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                        selectedTeamId === team.team_id
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{team.team_name}</span>
                      {selectedTeamId === team.team_id && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}

              {regularTeams.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    👥 Teams ({regularTeams.length})
                  </div>
                  {regularTeams.map((team) => (
                    <button
                      key={team.team_id}
                      type="button"
                      onClick={() => {
                        onSelectTeam(team);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                        selectedTeamId === team.team_id
                          ? 'bg-blue-600 text-white font-bold'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{team.team_name}</span>
                      {selectedTeamId === team.team_id && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}

              {filteredTeams.length === 0 && (
                <div className="text-center text-xs text-slate-400 py-4">
                  No matching teams found.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
