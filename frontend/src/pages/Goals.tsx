import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as api from '../services/api';

export default function Goals() {
  const [goals, setGoals] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [teams, setTeams] = useState<any[]>([]);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    goalType: 'project',
    parentGoalId: '',
    targetDate: '',
    teamId: '',
  });

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
      const payload = {
        title: newGoal.title,
        description: newGoal.description,
        goalType: newGoal.goalType,

        // Do NOT send empty string for UUID fields
        ...(newGoal.parentGoalId
          ? { parentGoalId: newGoal.parentGoalId }
          : {}),

        ...(newGoal.teamId
          ? { teamId: newGoal.teamId }
          : {}),

        ...(newGoal.targetDate
          ? { targetDate: newGoal.targetDate }
          : {}),
      };

      console.log('Creating goal with payload:', payload);

      await api.createGoal(payload);

      setShowCreateModal(false);

      setNewGoal({
        title: '',
        description: '',
        goalType: 'project',
        parentGoalId: '',
        targetDate: '',
        teamId: '',
      });

      await loadGoals();
    } catch (error: any) {
      console.error('Create goal error:', error.response?.data);

      alert(
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to create goal'
      );
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

  const renderGoalTree = (goal: any, level: number = 0) => {
    const statusColors: any = {
      planning: 'bg-gray-100 text-gray-700',
      active: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      at_risk: 'bg-yellow-100 text-yellow-700',
      blocked: 'bg-red-100 text-red-700',
    };

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
        className={`mb-3 ${level > 0 ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}
      >
        <div className="pro-card p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{typeIcons[goal.goal_type]}</span>
                <h3 className="text-lg font-semibold text-gray-900">{goal.title}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[goal.status]}`}>
                  {goal.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{goal.description}</p>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${goal.progress || 0}%` }}
                    />
                  </div>
                  <span className="text-gray-600 font-medium">{goal.progress || 0}%</span>
                </div>
                
                {goal.target_date && (
                  <span className="text-gray-500">
                    📅 {new Date(goal.target_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <select
                value={goal.status}
                onChange={(e) => updateGoalStatus(goal.goal_id, e.target.value)}
                className="input-field text-sm py-1"
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
          <div className="mt-2">
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

      <div className="mb-6 flex gap-4">
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="input-field"
        >
          <option value="">Personal Goals</option>
          {teams.map((team) => (
            <option key={team.team_id} value={team.team_id}>
              {team.team_name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            🏢 Company
          </button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            🏛️ Department
          </button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            📁 Project
          </button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            🎯 Milestone
          </button>
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
    </div>
  );
}
