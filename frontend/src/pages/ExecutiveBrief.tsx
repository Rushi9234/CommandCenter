import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

export default function ExecutiveBrief() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [logsRes, tasksRes, teamsRes, leaderboardRes] = await Promise.all([
        api.getMyLogs(30),
        api.getMyTasks(),
        api.getMyTeams(),
        api.getLeaderboard(),
      ]);
      setLogs(logsRes.data.data);
      setTasks(tasksRes.data.data);
      setTeams(teamsRes.data.data);
      setLeaderboard(leaderboardRes.data.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysRange = () => {
    return timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  };

  const getRecentLogs = () => {
    const days = getDaysRange();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return logs.filter(log => new Date(log.created_at) >= cutoff);
  };

  const recentLogs = getRecentLogs();
  const completedTasks = tasks.filter(t => t.status === 'done');
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const avgSentiment = recentLogs.length > 0
    ? recentLogs.reduce((sum, log) => sum + (log.sentiment_score || 0), 0) / recentLogs.length
    : 0;
  const totalWords = recentLogs.reduce((sum, log) => sum + log.word_count, 0);
  const myRank = leaderboard.findIndex(u => u.user_id === user?.user_id) + 1;

  const getActivityData = () => {
    const days = getDaysRange();
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = logs.filter(log => log.log_date === dateStr).length;
      data.push({ date: dateStr, count });
    }
    return data;
  };

  const activityData = getActivityData();
  const maxActivity = Math.max(...activityData.map(d => d.count), 1);

  const getSentimentLabel = (score: number) => {
    if (score > 0.3) return { text: 'Positive', color: 'text-green-600', bg: 'bg-green-100' };
    if (score < -0.3) return { text: 'Needs Attention', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { text: 'Neutral', color: 'text-gray-600', bg: 'bg-gray-100' };
  };

  const sentiment = getSentimentLabel(avgSentiment);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-600 mt-1">Your productivity insights and metrics</p>
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="input-field w-auto"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="stat-card"
          >
            <div className="stat-label">Total Logs</div>
            <div className="stat-value">{recentLogs.length}</div>
            <div className="text-sm text-gray-600 mt-2">
              {getDaysRange()} day period
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="stat-card"
          >
            <div className="stat-label">Current Streak</div>
            <div className="stat-value text-orange-600">{user?.streak_count || 0}</div>
            <div className="text-sm text-gray-600 mt-2">
              Consecutive days
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="stat-card"
          >
            <div className="stat-label">Impact Score</div>
            <div className="stat-value text-blue-600">{user?.impact_score || 0}</div>
            <div className="text-sm text-gray-600 mt-2">
              Rank #{myRank > 0 ? myRank : 'N/A'}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="stat-card"
          >
            <div className="stat-label">Tasks Completed</div>
            <div className="stat-value text-green-600">{completedTasks.length}</div>
            <div className="text-sm text-gray-600 mt-2">
              {activeTasks.length} active
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity Chart */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="pro-card p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Activity Overview</h2>
              <div className="space-y-3">
                {activityData.map((day, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 w-20">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(day.count / maxActivity) * 100}%` }}
                        transition={{ delay: 0.6 + index * 0.05, duration: 0.5 }}
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full flex items-center justify-end pr-3"
                      >
                        {day.count > 0 && (
                          <span className="text-white text-xs font-medium">{day.count}</span>
                        )}
                      </motion.div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Productivity Insights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="pro-card p-6 mt-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Productivity Insights</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Average Words per Log</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {recentLogs.length > 0 ? Math.round(totalWords / recentLogs.length) : 0} words
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-blue-600">
                    {recentLogs.length > 0 ? Math.round(totalWords / recentLogs.length) : 0}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Completion Rate</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}% of tasks
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-green-600">
                    {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                  </div>
                </div>

                <div className={`flex items-center justify-between p-4 ${sentiment.bg} rounded-lg`}>
                  <div>
                    <div className="font-medium text-gray-900">Overall Sentiment</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Based on log analysis
                    </div>
                  </div>
                  <div className={`text-lg font-semibold ${sentiment.color}`}>
                    {sentiment.text}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Side Stats */}
          <div className="space-y-6">
            {/* Team Performance */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="pro-card p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Teams</h2>
              <div className="space-y-3">
                {teams.length > 0 ? (
                  teams.map((team) => (
                    <div key={team.team_id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="font-medium text-gray-900">{team.team_name}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {team.is_public ? 'Public' : 'Private'} team
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No teams yet</p>
                )}
              </div>
            </motion.div>

            {/* Recent Achievements */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="pro-card p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Achievements</h2>
              <div className="space-y-3">
                {user?.streak_count && user.streak_count >= 7 && (
                  <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl">🔥</div>
                    <div>
                      <div className="font-medium text-gray-900">Week Warrior</div>
                      <div className="text-xs text-gray-600">7+ day streak</div>
                    </div>
                  </div>
                )}
                {completedTasks.length >= 10 && (
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl">✅</div>
                    <div>
                      <div className="font-medium text-gray-900">Task Master</div>
                      <div className="text-xs text-gray-600">10+ tasks completed</div>
                    </div>
                  </div>
                )}
                {recentLogs.length >= 20 && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl">📝</div>
                    <div>
                      <div className="font-medium text-gray-900">Consistent Logger</div>
                      <div className="text-xs text-gray-600">20+ logs</div>
                    </div>
                  </div>
                )}
                {myRank > 0 && myRank <= 3 && (
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl">🏆</div>
                    <div>
                      <div className="font-medium text-gray-900">Top Performer</div>
                      <div className="text-xs text-gray-600">Rank #{myRank}</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
              className="pro-card p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Words</span>
                  <span className="font-semibold text-gray-900">{totalWords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Avg Log Length</span>
                  <span className="font-semibold text-gray-900">
                    {recentLogs.length > 0 ? Math.round(totalWords / recentLogs.length) : 0} words
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active Projects</span>
                  <span className="font-semibold text-gray-900">{activeTasks.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Team Count</span>
                  <span className="font-semibold text-gray-900">{teams.length}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
