import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as api from '../services/api';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';
import SearchField from '../components/common/SearchField';
import CompactTeamSelector from '../components/common/CompactTeamSelector';
import WorkActivityTimeline from '../components/WorkActivityTimeline';
import GoalDetailView from '../components/GoalDetailView';

export default function Goals() {
  const [searchParams] = useSearchParams();
  const [goals, setGoals] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTimelineGoal, setSelectedTimelineGoal] = useState<any>(null);
  const [selectedDetailGoalId, setSelectedDetailGoalId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [teams, setTeams] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    goalType: 'project',
    parentGoalId: '',
    targetDate: '',
    teamId: '',
  });

  useEffect(() => {
    const goalIdParam = searchParams.get('goalId');
    const teamIdParam = searchParams.get('teamId');

    if (teamIdParam && teamIdParam !== selectedTeam) {
      setSelectedTeam(teamIdParam);
    }
    if (goalIdParam) {
      setSelectedDetailGoalId(goalIdParam);
    }
  }, [searchParams]);

  useEffect(() => {
    loadGoals();
    loadTeams();
  }, [selectedTeam]);

  const loadGoals = async () => {
    try {
      const params = selectedTeam ? `?teamId=${selectedTeam}` : '';
      const res = await api.getGoals(params);
      setGoals(res.data.data);

      const hierarchyRes = await api.getGoalHierarchy(params);
      setHierarchy(hierarchyRes.data.data);
    } catch (error) {
      console.error('Failed to load goals:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const res = await api.getMyTeams();
      setTeams(res.data.data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createGoal(newGoal);
      setShowCreateModal(false);
      setNewGoal({ title: '', description: '', goalType: 'project', parentGoalId: '', targetDate: '', teamId: '' });
      loadGoals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create goal');
    }
  };

  const updateGoalStatus = async (goalId: string, status: string) => {
    try {
      await api.updateGoal(goalId, { status });
      loadGoals();
    } catch (error) {
      console.error('Failed to update goal:', error);
    }
  };

  const filterGoalTree = (goal: any): boolean => {
    const matchesSearch = !searchQuery ||
      goal.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      goal.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = activeTypeFilter === 'all' || goal.goal_type === activeTypeFilter;
    const hasMatchingChild = goal.children && goal.children.some((child: any) => filterGoalTree(child));
    return (matchesSearch && matchesType) || hasMatchingChild;
  };

  const renderGoalTree = (goal: any, level: number = 0) => {
    if (!filterGoalTree(goal)) return null;

    const typeIcons: any = {
      company: '🏢',
      department: '🏛️',
      project: '📁',
      milestone: '🎯',
    };

    return (
      <motion.div
        key={goal.goal_id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`mb-3 ${level > 0 ? 'ml-6 sm:ml-8 border-l-2 border-blue-100 pl-3 sm:pl-4' : ''}`}
      >
        <div className="pro-card p-4 hover:shadow-md transition-shadow bg-white rounded-xl border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xl shrink-0">{typeIcons[goal.goal_type] || '🎯'}</span>
                <h3 className="text-base font-semibold text-gray-900 truncate">{goal.title}</h3>
                <StatusBadge status={goal.status} />
                {goal.creation_status === 'pending_approval' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                    ⏳ Proposed (Pending Approval)
                  </span>
                )}
                {goal.creation_status === 'rejected' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 font-semibold">
                    ❌ Proposal Rejected
                  </span>
                )}
                {goal.status === 'pending_review' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 font-semibold">
                    ◐ Pending Review
                  </span>
                )}
              </div>
              {goal.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{goal.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs sm:text-sm flex-wrap mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-28 sm:w-36 h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                      style={{ width: `${goal.progress || 0}%` }}
                    />
                  </div>
                  <span className="text-gray-700 font-semibold">{goal.progress || 0}%</span>
                </div>

                {goal.target_date && (
                  <span className="text-gray-500 flex items-center gap-1">
                    📅 {new Date(goal.target_date).toLocaleDateString()}
                  </span>
                )}

                {goal.owner && (
                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <Avatar name={goal.owner.full_name || goal.owner.name} src={goal.owner.avatar_url} size="sm" />
                    <span className="text-xs text-gray-600 font-medium">{goal.owner.full_name || goal.owner.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
              <button
                type="button"
                onClick={() => setSelectedDetailGoalId(goal.goal_id)}
                data-testid={`goal-detail-btn-${goal.goal_id}`}
                title="View Goal Details & Evidence"
                aria-label={`View details and evidence for ${goal.title}`}
                className="text-xs text-indigo-700 hover:text-indigo-900 font-medium px-2.5 py-1 rounded-lg border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1 shadow-2xs"
              >
                <span>🛡️</span>
                <span>Details & Evidence</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimelineGoal(goal)}
                data-testid={`goal-timeline-btn-${goal.goal_id}`}
                title="View Timeline"
                aria-label={`View timeline for ${goal.title}`}
                className="text-xs text-gray-600 hover:text-indigo-600 font-medium px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 bg-gray-50 hover:bg-indigo-50 transition-colors flex items-center gap-1"
              >
                <span>📜</span>
                <span>Timeline</span>
              </button>
              <select
                value={goal.status}
                onChange={(e) => updateGoalStatus(goal.goal_id, e.target.value)}
                className="input-field text-xs sm:text-sm py-1 px-2 border-gray-300 rounded-lg bg-gray-50 hover:bg-white transition-colors"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="at_risk">At Risk</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        {goal.children && goal.children.length > 0 && (
          <div className="mt-2 space-y-2">
            {goal.children.map((child: any) => renderGoalTree(child, level + 1))}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Strategic Goals</h1>
          <p className="text-gray-600">Connect tasks to company objectives</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          + Create Goal
        </button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <CompactTeamSelector
            teams={[{ team_id: '', team_name: '👤 Personal Goals' }, ...teams]}
            selectedTeamId={selectedTeam}
            onSelectTeam={(t) => setSelectedTeam(t.team_id)}
            placeholder="Filter teams..."
          />

          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search goals..."
            className="w-full md:w-64"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Types', icon: '🎯' },
            { id: 'company', label: 'Company', icon: '🏢' },
            { id: 'department', label: 'Department', icon: '🏛️' },
            { id: 'project', label: 'Project', icon: '📁' },
            { id: 'milestone', label: 'Milestone', icon: '🎯' },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveTypeFilter(type.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1 ${
                activeTypeFilter === type.id
                  ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {hierarchy.length > 0 ? (
          hierarchy.map((goal) => renderGoalTree(goal))
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No goals yet</p>
            <p className="text-sm">Create your first goal to get started</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h2 className="text-2xl font-bold mb-4">Create New Goal</h2>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  className="input-field"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newGoal.goalType}
                  onChange={(e) => setNewGoal({ ...newGoal, goalType: e.target.value })}
                  className="input-field"
                >
                  <option value="company">🏢 Company Goal</option>
                  <option value="department">🏛️ Department Objective</option>
                  <option value="project">📁 Project Milestone</option>
                  <option value="milestone">🎯 Task Milestone</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Goal (Optional)</label>
                <select
                  value={newGoal.parentGoalId}
                  onChange={(e) => setNewGoal({ ...newGoal, parentGoalId: e.target.value })}
                  className="input-field"
                >
                  <option value="">None (Root Goal)</option>
                  {goals.map((goal) => (
                    <option key={goal.goal_id} value={goal.goal_id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team (Optional)</label>
                <select
                  value={newGoal.teamId}
                  onChange={(e) => setNewGoal({ ...newGoal, teamId: e.target.value })}
                  className="input-field"
                >
                  <option value="">Personal Goal</option>
                  {teams.map((team) => (
                    <option key={team.team_id} value={team.team_id}>
                      {team.team_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={newGoal.targetDate}
                  onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  Create Goal
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Goal Work Activity Timeline Modal */}
      {selectedTimelineGoal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <WorkActivityTimeline
            artifactType="goal"
            artifactId={selectedTimelineGoal.goal_id}
            title={selectedTimelineGoal.title}
            onClose={() => setSelectedTimelineGoal(null)}
          />
        </div>
      )}

      {/* Dedicated Goal Detail & Evidence Modal */}
      {selectedDetailGoalId && (
        <GoalDetailView
          goalId={selectedDetailGoalId}
          onClose={() => setSelectedDetailGoalId(null)}
        />
      )}
    </div>
  );
}
