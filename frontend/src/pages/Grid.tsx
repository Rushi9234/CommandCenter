import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useApiRequest } from '../hooks/useApiRequest';
import * as api from '../services/api';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';

export default function Grid() {
  const { user } = useAuth();
  // Milestone 20: adopts the shared useApiRequest hook (proof-of-pattern
  // page) instead of a hand-written loading/data useState pair. Behavior
  // preserved exactly: loading starts true (initialLoading), a failed
  // load logs the same message and leaves the last-known leaderboard on
  // screen (the hook never clears `data` on error), and the 30s poll
  // interval is unchanged -- the hook has no polling of its own, this
  // page still owns that.
  const { data: leaderboardData, loading, execute: loadLeaderboard } = useApiRequest<any[]>(
    () => api.getLeaderboard().then((response) => response.data.data),
    { initialLoading: true }
  );
  const leaderboard: any[] = leaderboardData ?? [];

  useEffect(() => {
    // Deliberately [] (matching this effect's deps before this
    // milestone), not [loadLeaderboard] -- execute()'s reference changes
    // on every render (see useApiRequest.ts's memoization note), so
    // including it here would re-run this effect, and reset the
    // interval, on every render instead of once on mount.
    const load = () => loadLeaderboard().catch((error) => console.error('Failed to load leaderboard:', error));
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', class: 'bg-gradient-to-br from-amber-300 to-amber-500 shadow-md', text: 'text-amber-950' };
    if (rank === 2) return { emoji: '🥈', class: 'bg-gradient-to-br from-slate-200 to-slate-400 shadow-sm', text: 'text-slate-900' };
    if (rank === 3) return { emoji: '🥉', class: 'bg-gradient-to-br from-amber-600 to-amber-800 shadow-sm', text: 'text-white' };
    return { emoji: `#${rank}`, class: 'bg-gray-100 border border-gray-200', text: 'text-gray-700' };
  };

  const myRank = leaderboard.findIndex(u => u.user_id === user?.user_id) + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">The Grid</h1>
              <p className="text-gray-600 mt-1">Team leaderboard and rankings</p>
            </div>
            {myRank > 0 && (
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">#{myRank}</div>
                <div className="text-sm text-gray-600">Your Rank</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="spinner w-8 h-8 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading rankings...</p>
          </div>
        ) : (
          <>
            {/* Top 3 */}
            {leaderboard.length >= 3 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {[1, 0, 2].map((idx) => {
                  const player = leaderboard[idx];
                  const rank = idx + 1;
                  const badge = getRankBadge(rank);
                  return (
                    <motion.div
                      key={player.user_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`pro-card p-6 text-center bg-white rounded-xl border border-gray-200 shadow-sm ${
                        rank === 1 ? 'transform sm:-translate-y-2 border-amber-300 ring-2 ring-amber-400/20' : ''
                      }`}
                    >
                      <div className={`w-14 h-14 mx-auto rounded-full ${badge.class} flex items-center justify-center text-xl font-bold ${badge.text} mb-3`}>
                        {badge.emoji}
                      </div>
                      <div className="flex justify-center mb-3">
                        <Avatar name={player.full_name} src={player.avatar_url} size="xl" />
                      </div>
                      <h3 className="font-bold text-gray-900 truncate">{player.full_name}</h3>
                      <p className="text-xs text-gray-500">@{player.username}</p>
                      <div className="mt-4 flex items-center justify-center gap-4 pt-3 border-t border-gray-100">
                        <div className="text-center">
                          <div className="text-xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-xs text-gray-500 font-medium">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-xs text-gray-500 font-medium">🔥 Streak</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Rest of Rankings */}
            <div className="pro-card p-6 bg-white rounded-xl border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">All Rankings</h2>
              <div className="space-y-2">
                {leaderboard.map((player, index) => {
                  const rank = index + 1;
                  const badge = getRankBadge(rank);
                  const isCurrentUser = player.user_id === user?.user_id;

                  return (
                    <motion.div
                      key={player.user_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                        isCurrentUser ? 'bg-blue-50/60 border-2 border-blue-500 shadow-xs' : 'pro-card-hover border border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-full shrink-0 ${badge.class} flex items-center justify-center font-bold text-xs ${badge.text}`}>
                          {badge.emoji}
                        </div>
                        <Avatar name={player.full_name} src={player.avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 flex items-center gap-2 truncate">
                            <span className="truncate">{player.full_name}</span>
                            {isCurrentUser && <StatusBadge status="You" />}
                          </div>
                          <div className="text-xs text-gray-500">@{player.username}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-center">
                          <div className="text-lg sm:text-xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-[11px] text-gray-500">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg sm:text-xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-[11px] text-gray-500">🔥 Streak</div>
                        </div>
                        <div className="text-center hidden sm:block">
                          <div className="text-lg sm:text-xl font-bold text-green-600">{player.recent_activity}</div>
                          <div className="text-[11px] text-gray-500">Logs (7d)</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {leaderboard.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">🏆</div>
                  <p>No rankings yet. Start logging to appear on the leaderboard!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
