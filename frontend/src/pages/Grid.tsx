import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useApiRequest } from '../hooks/useApiRequest';
import * as api from '../services/api';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';

export type PeriodType = 'all' | 'month' | 'week' | 'today';

interface LeaderboardUser {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  impact_score: number;
  streak_count: number;
  recent_activity: number;
  team_id?: string;
}

const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' },
  { id: 'today', label: 'Today' },
];

const LEADERBOARD_GUIDE_STORAGE_KEY = 'leaderboardGuideDismissed';

export default function Grid() {
  const { user } = useAuth();
  const [activePeriod, setActivePeriod] = useState<PeriodType>('all');
  const [guideDismissed, setGuideDismissed] = useState<boolean>(() => {
    return localStorage.getItem(LEADERBOARD_GUIDE_STORAGE_KEY) === 'true';
  });

  const {
    data: leaderboardData,
    loading,
    error,
    execute: loadLeaderboard,
  } = useApiRequest<LeaderboardUser[]>(
    () => api.getLeaderboard(activePeriod).then((res) => res.data.data),
    { initialLoading: true }
  );

  const leaderboard: LeaderboardUser[] = leaderboardData ?? [];

  useEffect(() => {
    loadLeaderboard().catch((err) => console.error('Failed to load leaderboard:', err));
    const interval = setInterval(() => {
      loadLeaderboard().catch((err) => console.error('Failed to poll leaderboard:', err));
    }, 30000);
    return () => clearInterval(interval);
  }, [activePeriod]);

  const handlePeriodChange = (period: PeriodType) => {
    if (period === activePeriod) return;
    setActivePeriod(period);
  };

  const dismissGuide = () => {
    setGuideDismissed(true);
    localStorage.setItem(LEADERBOARD_GUIDE_STORAGE_KEY, 'true');
  };

  const userIndex = leaderboard.findIndex((u) => u.user_id === user?.user_id);
  const myRank = userIndex >= 0 ? userIndex + 1 : 0;
  const currentUserData = userIndex >= 0 ? leaderboard[userIndex] : null;

  // Derive summary metrics truthfully from API dataset
  const activeContributorsCount = leaderboard.length;
  const activeStreaksCount = leaderboard.filter((u) => u.streak_count >= 3).length;
  const avgImpactScore = leaderboard.length
    ? Math.round(leaderboard.reduce((sum, u) => sum + u.impact_score, 0) / leaderboard.length)
    : 0;

  // Podium users: #1 Center, #2 Left, #3 Right
  const top1 = leaderboard.length >= 1 ? leaderboard[0] : null;
  const top2 = leaderboard.length >= 2 ? leaderboard[1] : null;
  const top3 = leaderboard.length >= 3 ? leaderboard[2] : null;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-12">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* COMPACT PAGE HEADER & PERIOD SELECTOR */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-indigo-600 text-[10px] font-extrabold uppercase tracking-wider">
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                LEADERBOARD
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 leading-snug">
                Top contributors drive real progress
              </h1>
              <p className="text-xs text-slate-500 leading-normal">
                See who's making an impact across CommandCenter. Higher contribution, stronger teams.
              </p>
            </div>

            {/* Subtle Trophy Artwork Badge */}
            <div className="hidden md:flex items-center gap-3 bg-indigo-50/50 border border-indigo-100 rounded-xl px-3.5 py-2 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4m12 0h4m-2-2v4m-5 8v-2a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0a2 2 0 01-2 2H9a2 2 0 01-2-2m10 0v4a2 2 0 01-2 2H9a2 2 0 01-2-2v-4m12 0H5" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Workspace Rankings</div>
                <div className="text-[11px] text-slate-500">Updated in real-time</div>
              </div>
            </div>
          </div>

          {/* Integrated Period Tabs */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
            {PERIOD_OPTIONS.map((opt) => {
              const isActive = activePeriod === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePeriodChange(opt.id)}
                  type="button"
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs border border-indigo-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/60'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TWO-COLUMN LAYOUT: MAIN (8 cols) & SIDEBAR (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* MAIN AREA */}
          <div className="lg:col-span-8 space-y-5">
            {/* SUMMARY METRICS ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Metric 1 */}
              <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Contributors</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{loading ? '...' : activeContributorsCount}</div>
                  <div className="text-[10px] text-slate-500">Team members with activity</div>
                </div>
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>

              {/* Metric 2 */}
              <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Streaks</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{loading ? '...' : activeStreaksCount}</div>
                  <div className="text-[10px] text-slate-500">Members with 3+ day streak</div>
                </div>
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                </div>
              </div>

              {/* Metric 3 */}
              <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Impact Score</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{loading ? '...' : avgImpactScore}</div>
                  <div className="text-[10px] text-slate-500">Mean score for period</div>
                </div>
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* COMPACT TOP CONTRIBUTORS PODIUM */}
            {!loading && !Boolean(error) && leaderboard.length >= 1 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">Top Contributors</h3>
                    <p className="text-xs text-slate-500">Highest impact scores in the selected period</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                  {/* #2 Rank (Left) */}
                  {top2 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-4 text-center shadow-2xs relative"
                    >
                      <div className="w-6 h-6 rounded-full bg-slate-200 border border-slate-300 text-slate-800 font-extrabold text-[11px] flex items-center justify-center mx-auto mb-2">
                        #2
                      </div>
                      <div className="flex justify-center mb-1.5">
                        <Avatar name={top2.full_name} src={top2.avatar_url} size="md" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs truncate">{top2.full_name}</h4>
                      <p className="text-[10px] text-slate-400">@{top2.username}</p>

                      <div className="mt-2 pt-1.5 border-t border-slate-200/60">
                        <div className="text-[10px] text-slate-400 font-medium">Impact Score</div>
                        <div className="text-lg font-black text-indigo-600">{top2.impact_score}</div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] bg-white rounded-lg p-1.5 border border-slate-200/50">
                        <div>
                          <span className="text-slate-400 block text-[9px]">Streak</span>
                          <span className="font-bold text-amber-600">{top2.streak_count}d</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Recent Logs</span>
                          <span className="font-bold text-emerald-600">{top2.recent_activity}</span>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}

                  {/* #1 Rank (Center - Prominent) */}
                  {top1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-b from-amber-50/90 via-white to-white rounded-xl border-2 border-amber-300 ring-2 ring-amber-400/10 p-4 sm:p-4.5 text-center shadow-xs relative sm:-translate-y-1 order-first sm:order-none"
                    >
                      <div className="absolute top-1.5 right-2 text-amber-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                        </svg>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 text-slate-950 font-black text-xs flex items-center justify-center mx-auto mb-2 shadow-2xs border border-amber-300">
                        #1
                      </div>
                      <div className="flex justify-center mb-1.5">
                        <Avatar name={top1.full_name} src={top1.avatar_url} size="lg" />
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-sm truncate">{top1.full_name}</h4>
                      <p className="text-[10px] text-slate-400">@{top1.username}</p>

                      <div className="mt-2 pt-1.5 border-t border-amber-200/60">
                        <div className="text-[10px] text-slate-400 font-medium">Impact Score</div>
                        <div className="text-xl font-black text-indigo-600">{top1.impact_score}</div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] bg-amber-50/50 rounded-lg p-1.5 border border-amber-200/60">
                        <div>
                          <span className="text-slate-400 block text-[9px]">Streak</span>
                          <span className="font-bold text-amber-600">{top1.streak_count}d</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Recent Logs</span>
                          <span className="font-bold text-emerald-600">{top1.recent_activity}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* #3 Rank (Right) */}
                  {top3 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-4 text-center shadow-2xs relative"
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-900/10 border border-amber-800/20 text-amber-950 font-extrabold text-[11px] flex items-center justify-center mx-auto mb-2">
                        #3
                      </div>
                      <div className="flex justify-center mb-1.5">
                        <Avatar name={top3.full_name} src={top3.avatar_url} size="md" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs truncate">{top3.full_name}</h4>
                      <p className="text-[10px] text-slate-400">@{top3.username}</p>

                      <div className="mt-2 pt-1.5 border-t border-slate-200/60">
                        <div className="text-[10px] text-slate-400 font-medium">Impact Score</div>
                        <div className="text-lg font-black text-indigo-600">{top3.impact_score}</div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] bg-white rounded-lg p-1.5 border border-slate-200/50">
                        <div>
                          <span className="text-slate-400 block text-[9px]">Streak</span>
                          <span className="font-bold text-amber-600">{top3.streak_count}d</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Recent Logs</span>
                          <span className="font-bold text-emerald-600">{top3.recent_activity}</span>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>
              </div>
            )}

            {/* SKELETON LOADING STATE */}
            {loading && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="h-44 bg-slate-200/80 rounded-xl animate-pulse" />
                  <div className="h-48 bg-slate-200/80 rounded-xl animate-pulse sm:-translate-y-1" />
                  <div className="h-44 bg-slate-200/80 rounded-xl animate-pulse" />
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-2.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              </div>
            )}

            {/* ERROR STATE */}
            {Boolean(error) && !loading && (
              <div className="bg-white rounded-2xl border border-red-200 p-6 text-center shadow-xs max-w-md mx-auto my-4">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-slate-900">Leaderboard couldn't be loaded</h3>
                <p className="text-xs text-slate-600 mt-0.5">We couldn't retrieve the latest leaderboard data.</p>
                <button
                  onClick={() => loadLeaderboard()}
                  type="button"
                  className="mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* EMPTY STATE */}
            {!loading && !Boolean(error) && leaderboard.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-xs my-3">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 border border-amber-200 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4m12 0h4m-2-2v4m-5 8v-2a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0a2 2 0 01-2 2H9a2 2 0 01-2-2m10 0v4a2 2 0 01-2 2H9a2 2 0 01-2-2v-4m12 0H5" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-slate-900">No ranking data yet</h3>
                <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                  Complete work and log activity to appear on the leaderboard.
                </p>
              </div>
            )}

            {/* DENSE ALL RANKINGS TABLE */}
            {!loading && !Boolean(error) && leaderboard.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">All Rankings</h3>
                    <p className="text-xs text-slate-500">Showing all contributors for the selected period</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {leaderboard.length} Contributors
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="py-2 px-2.5 w-10 text-center">#</th>
                        <th className="py-2 px-2.5">Member</th>
                        <th className="py-2 px-2.5 text-right">Impact Score ↓</th>
                        <th className="py-2 px-2.5 text-right">Streak</th>
                        <th className="py-2 px-2.5 text-right">Recent Logs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {leaderboard.map((player, index) => {
                        const rank = index + 1;
                        const isCurrentUser = player.user_id === user?.user_id;

                        return (
                          <tr
                            key={player.user_id}
                            className={`transition-colors ${
                              isCurrentUser
                                ? 'bg-indigo-50/70 border-l-4 border-indigo-600 font-semibold'
                                : rank === 1
                                ? 'bg-amber-50/30'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="py-2.5 px-2.5 text-center">
                              <span
                                className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-full font-bold text-[10px] ${
                                  rank === 1
                                    ? 'bg-amber-400 text-slate-950 font-extrabold'
                                    : rank === 2
                                    ? 'bg-slate-200 text-slate-800'
                                    : rank === 3
                                    ? 'bg-amber-800/20 text-amber-950 font-bold'
                                    : 'text-slate-500 font-medium'
                                }`}
                              >
                                {rank}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={player.full_name} src={player.avatar_url} size="sm" />
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                    <span className="truncate">{player.full_name}</span>
                                    {isCurrentUser && <StatusBadge status="You" />}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-normal">@{player.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-extrabold text-indigo-600 text-xs">
                              {player.impact_score}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-semibold text-amber-600">
                              {player.streak_count}d
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-semibold text-emerald-600">
                              {player.recent_activity}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR: YOUR POSITION (FIRST) & ONBOARDING GUIDE (SECOND) */}
          <div className="lg:col-span-4 space-y-5">
            {/* 1. YOUR POSITION CARD (TOP OF SIDEBAR) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Your Position</h3>
              </div>

              {currentUserData ? (
                <div className="space-y-3">
                  {/* Rank User Header */}
                  <div className="bg-gradient-to-r from-slate-50 to-indigo-50/50 p-3 rounded-xl border border-indigo-100 flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                        myRank === 1
                          ? 'bg-amber-400 text-slate-950 border border-amber-300'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      #{myRank}
                    </div>
                    <Avatar name={currentUserData.full_name} src={currentUserData.avatar_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 truncate">
                        <span className="truncate">{currentUserData.full_name}</span>
                        <StatusBadge status="You" />
                      </div>
                      <div className="text-[10px] text-slate-500">@{currentUserData.username}</div>
                    </div>
                  </div>

                  {/* 3 Metric Tiles */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Impact Score</div>
                      <div className="text-sm font-black text-indigo-600 mt-0.5">{currentUserData.impact_score}</div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Streak</div>
                      <div className="text-sm font-black text-amber-600 mt-0.5">{currentUserData.streak_count}d</div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Recent Logs</div>
                      <div className="text-sm font-black text-emerald-600 mt-0.5">{currentUserData.recent_activity}</div>
                    </div>
                  </div>

                  {/* Dynamic Status / Subtitle Banner */}
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-xs text-indigo-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span className="text-[11px] font-medium leading-tight">
                      {myRank === 1
                        ? "You're currently #1! Keep going and maintain your momentum."
                        : `Currently ranked #${myRank} among ${leaderboard.length} contributors.`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-xs">
                  <p>Log activity to appear on the leaderboard and see your position.</p>
                </div>
              )}
            </div>

            {/* 2. HOW TO USE LEADERBOARD ONBOARDING CARD (BELOW YOUR POSITION) */}
            {!guideDismissed && (
              <AnimatePresence>
                <motion.div
                  key="leaderboard-guide-card"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs relative space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">How to use Leaderboard</h3>
                        <p className="text-[10px] text-slate-500">Track progress & compare activity</p>
                      </div>
                    </div>
                    <button
                      onClick={dismissGuide}
                      type="button"
                      aria-label="Dismiss guide"
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-normal">
                    See who's contributing, track your progress, and compare with others across CommandCenter.
                  </p>

                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">1</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">View your rank</div>
                        <div className="text-[10px] text-slate-500">Check your position and impact score.</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center shrink-0">2</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">Compare progress</div>
                        <div className="text-[10px] text-slate-500">See top contributors and streaks.</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] flex items-center justify-center shrink-0">3</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">Change period</div>
                        <div className="text-[10px] text-slate-500">Switch between all-time, monthly, weekly and daily.</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">4</span>
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">Track contribution</div>
                        <div className="text-[10px] text-slate-500">Understand contribution trends over time.</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
