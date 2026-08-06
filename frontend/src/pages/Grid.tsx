import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

export default function Grid() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLeaderboard = async () => {
    try {
      const response = await api.getLeaderboard();
      setLeaderboard(response.data.data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', class: 'bg-gradient-to-br from-yellow-400 to-yellow-600', text: 'text-yellow-900' };
    if (rank === 2) return { emoji: '🥈', class: 'bg-gradient-to-br from-gray-300 to-gray-500', text: 'text-gray-900' };
    if (rank === 3) return { emoji: '🥉', class: 'bg-gradient-to-br from-orange-400 to-orange-600', text: 'text-orange-900' };
    return { emoji: `#${rank}`, class: 'bg-gray-100', text: 'text-gray-700' };
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
              <div className="grid grid-cols-3 gap-4 mb-8">
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
                      className={`pro-card p-6 text-center ${rank === 1 ? 'transform scale-105' : ''}`}
                    >
                      <div className={`w-16 h-16 mx-auto rounded-full ${badge.class} flex items-center justify-center text-2xl font-bold ${badge.text} mb-3`}>
                        {badge.emoji}
                      </div>
                      <div className="avatar w-20 h-20 mx-auto mb-3 text-lg">
                        {getInitials(player.full_name)}
                      </div>
                      <h3 className="font-bold text-gray-900">{player.full_name}</h3>
                      <p className="text-sm text-gray-600">@{player.username}</p>
                      <div className="mt-4 flex items-center justify-center gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-xs text-gray-600">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-xs text-gray-600">🔥 Streak</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Rest of Rankings */}
            <div className="pro-card p-6">
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
                      className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                        isCurrentUser ? 'bg-blue-50 border-2 border-blue-500' : 'pro-card-hover'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-full ${badge.class} flex items-center justify-center font-bold text-sm ${badge.text}`}>
                          {badge.emoji}
                        </div>
                        <div className="avatar w-10 h-10 text-sm">
                          {getInitials(player.full_name)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {player.full_name}
                            {isCurrentUser && <span className="badge badge-blue text-xs">You</span>}
                          </div>
                          <div className="text-sm text-gray-600">@{player.username}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-xs text-gray-600">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-xs text-gray-600">🔥 Streak</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-green-600">{player.recent_activity}</div>
                          <div className="text-xs text-gray-600">Logs (7d)</div>
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
