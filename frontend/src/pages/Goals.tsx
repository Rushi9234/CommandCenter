import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as api from '../services/api';

const filterGoalTree = (goal: any, selectedGoalType: string): any | null => {
  if (selectedGoalType === 'all') return goal;

  const matchingChildren = (goal.children || [])
    .map((child: any) => filterGoalTree(child, selectedGoalType))
    .filter(Boolean);

  if (goal.goal_type === selectedGoalType) {
    return goal;
  }

  return matchingChildren.length > 0
    ? { ...goal, children: matchingChildren }
    : null;
};

export default function Goals() {
  const [goals, setGoals] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedGoalType, setSelectedGoalType] = useState('all');
  const [teams, setTeams] = useState<any[]>([]);
  // Loading/error granularity fix: getGoals (flat list, feeds only the
  // create-form's "Parent goal" dropdown) and getGoalHierarchy (the
  // page's actual visible content) are independent backend reads with
  // independent failure modes, but previously shared one loading/error
  // pair driven by Promise.all -- whose fail-fast semantics meant if
  // EITHER request rejected, BOTH results were discarded, even a
  // genuinely successful one. Tracked separately now so a hierarchy-only
  // failure doesn't erase an already-successful goals list (or vice
  // versa), and each has its own scoped retry.
  const [hierarchyLoading, setHierarchyLoading] = useState(true);
  const [hierarchyError, setHierarchyError] = useState('');
  const [goalsListLoading, setGoalsListLoading] = useState(true);
  const [goalsListError, setGoalsListError] = useState('');
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [actionGoalId, setActionGoalId] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    goalType: 'project',
    parentGoalId: '',
    targetDate: '',
    teamId: '',
  });
  const [customGoalType, setCustomGoalType] = useState('');
  const [creatingGoal, setCreatingGoal] = useState(false);

  // Stale-response race fix (sync/loading audit): loadGoals() captured
  // selectedTeam/personal-goals context but never verified that context
  // was still current before applying its Promise.all results -- a
  // slower response for a team/context the user has already switched
  // away from could resolve after a faster response for the new
  // selection and overwrite it. Every loadGoals() call bumps this
  // version (whether triggered by a team switch, a mutation, or a manual
  // Retry); only the most recent call's response is applied. Same
  // version-token pattern as SOSHub.tsx / Teams.tsx's selectTeam.
  const loadGoalsVersion = useRef(0);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam]);

  const loadGoals = async () => {
    const requestVersion = ++loadGoalsVersion.current;
    // Cross-section audit fix: switching teams previously left the
    // PREVIOUS team's goal tree on screen for the full duration of the
    // new fetch (loading only showed when hierarchy was already empty,
    // true only on first mount) -- clearing here makes the loading
    // condition correctly fire on every switch, not just the first one,
    // and guarantees a different team's goals can never render under the
    // new selection.
    setGoals([]);
    setHierarchy([]);
    setHierarchyLoading(true);
    setGoalsListLoading(true);
    setHierarchyError('');
    setGoalsListError('');
    const params = selectedTeam ? `?teamId=${selectedTeam}` : '';
    // getGoals and getGoalHierarchy are independent reads of the same
    // team's goals in two different shapes -- no reason to serialize
    // them, and allSettled (not all) is required so that one of them
    // rejecting doesn't discard the other's genuinely successful result.
    const [goalsResult, hierarchyResult] = await Promise.allSettled([
      api.getGoals(params),
      api.getGoalHierarchy(params),
    ]);
    if (loadGoalsVersion.current !== requestVersion) return;

    if (goalsResult.status === 'fulfilled') {
      setGoals(goalsResult.value.data.data);
    } else {
      console.error('Failed to load goals list:', goalsResult.reason);
      setGoalsListError(goalsResult.reason?.response?.data?.error || 'Failed to load goals. Please try again.');
    }
    setGoalsListLoading(false);

    if (hierarchyResult.status === 'fulfilled') {
      setHierarchy(hierarchyResult.value.data.data);
    } else {
      console.error('Failed to load goal hierarchy:', hierarchyResult.reason);
      setHierarchyError(hierarchyResult.reason?.response?.data?.error || 'Failed to load goals. Please try again.');
    }
    setHierarchyLoading(false);
  };

  // Scoped retry: re-fetches only the goals list (used by the Parent
  // goal dropdown), leaving an already-successful hierarchy untouched.
  const retryGoalsList = async () => {
    const requestVersion = ++loadGoalsVersion.current;
    setGoalsListLoading(true);
    setGoalsListError('');
    try {
      const params = selectedTeam ? `?teamId=${selectedTeam}` : '';
      const res = await api.getGoals(params);
      if (loadGoalsVersion.current !== requestVersion) return;
      setGoals(res.data.data);
    } catch (error: any) {
      if (loadGoalsVersion.current !== requestVersion) return;
      console.error('Failed to load goals list:', error);
      setGoalsListError(error.response?.data?.error || 'Failed to load goals. Please try again.');
    } finally {
      if (loadGoalsVersion.current === requestVersion) setGoalsListLoading(false);
    }
  };

  // Scoped retry: re-fetches only the hierarchy (the page's main visible
  // content), leaving an already-successful goals list untouched.
  const retryHierarchy = async () => {
    const requestVersion = ++loadGoalsVersion.current;
    setHierarchyLoading(true);
    setHierarchyError('');
    try {
      const params = selectedTeam ? `?teamId=${selectedTeam}` : '';
      const res = await api.getGoalHierarchy(params);
      if (loadGoalsVersion.current !== requestVersion) return;
      setHierarchy(res.data.data);
    } catch (error: any) {
      if (loadGoalsVersion.current !== requestVersion) return;
      console.error('Failed to load goal hierarchy:', error);
      setHierarchyError(error.response?.data?.error || 'Failed to load goals. Please try again.');
    } finally {
      if (loadGoalsVersion.current === requestVersion) setHierarchyLoading(false);
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

    // Duplicate-submission guard: every other mutation in this file
    // already disables its trigger while in flight (Delete, progress,
    // review actions) -- Create Goal was the one inconsistent case, with
    // no state at all guarding against a fast double-click/double-Enter
    // firing two createGoal requests. The early return is defense in
    // depth alongside the disabled button below (button-disable state
    // may not have committed to the DOM yet on the very next keystroke).
    if (creatingGoal) return;

    if (newGoal.goalType === 'other' && !customGoalType.trim()) {
      alert('Please enter a custom goal type, or choose one of the predefined types.');
      return;
    }

    setCreatingGoal(true);
    try {
      const payload = {
        title: newGoal.title,
        description: newGoal.description,
        goalType: newGoal.goalType === 'other' ? customGoalType.trim() : newGoal.goalType,

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
      setCustomGoalType('');

      await loadGoals();
    } catch (error: any) {
      console.error('Create goal error:', error.response?.data);

      alert(
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to create goal'
      );
    } finally {
      setCreatingGoal(false);
    }
  };

  const updateGoalStatus = async (goalId: string, status: string) => {
    try {
      await api.updateGoal(goalId, { status });
      await loadGoals();
    } catch (error: any) {
      console.error('Failed to update goal:', error);
      alert(error.response?.data?.error || 'Failed to update goal');
    }
  };

  // Root cause of the old "progress bar doesn't update" report: there was
  // no way to set progress from the UI at all -- only status, which never
  // touched progress. This is the actual fix (a real control that sends
  // `progress`), not a rendering patch: loadGoals() already refetches and
  // re-renders immediately after every mutation in this file, so once
  // progress is genuinely sent, the bar updates the same way status
  // already did.
  const updateGoalProgress = async (goalId: string, progress: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    setActionGoalId(goalId);
    try {
      await api.updateGoal(goalId, { progress: clamped });
      await loadGoals();
    } catch (error: any) {
      console.error('Failed to update progress:', error);
      alert(error.response?.data?.error || 'Failed to update progress');
    } finally {
      setActionGoalId(null);
    }
  };

  // requestCompletion distinguishes the two review purposes: leaving it
  // false asks the leader to sign off on the CURRENT progress/stage
  // (status stays whatever it already is), true asks for final
  // completion (status only becomes 'completed' if the leader approves
  // this specific request). Corrective fix: previously there was only
  // one "Submit for Review" action and Approve always completed the
  // goal, so signing off on an ordinary progress bump silently finished
  // it -- see goals.service.ts's approveReview for the server-side half.
  const handleSubmitForReview = async (goalId: string, requestCompletion: boolean) => {
    setActionGoalId(goalId);
    try {
      await api.submitGoalForReview(goalId, requestCompletion ? 'completed' : undefined);
      await loadGoals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit goal for review');
    } finally {
      setActionGoalId(null);
    }
  };

  const handleApproveGoal = async (goalId: string) => {
    setActionGoalId(goalId);
    try {
      await api.approveGoal(goalId);
      await loadGoals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to approve goal');
    } finally {
      setActionGoalId(null);
    }
  };

  const handleReturnGoal = async (goalId: string) => {
    setActionGoalId(goalId);
    try {
      await api.returnGoal(goalId);
      await loadGoals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to return goal');
    } finally {
      setActionGoalId(null);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    setDeletingGoalId(goalId);
    try {
      await api.deleteGoal(goalId);
      await loadGoals();
    } catch (error: any) {
      console.error('Failed to delete goal:', error);
      alert(
        error.response?.status === 409
          ? 'This goal cannot be deleted because it has child goals. Delete or re-parent the child goals first.'
          : error.response?.data?.error || 'Failed to delete goal'
      );
    } finally {
      setDeletingGoalId(null);
    }
  };

  const visibleHierarchy = hierarchy
    .map((goal) => filterGoalTree(goal, selectedGoalType))
    .filter(Boolean);

  const openCreateModal = () => {
    setNewGoal((currentGoal) => ({ ...currentGoal, teamId: selectedTeam }));
    setShowCreateModal(true);
  };

  const renderGoalTree = (goal: any, level: number = 0) => {
    const statusColors: any = {
      planning: 'bg-gray-100 text-gray-700',
      active: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      at_risk: 'bg-yellow-100 text-yellow-700',
      blocked: 'bg-red-100 text-red-700',
      pending_review: 'bg-purple-100 text-purple-700',
    };

    const typeIcons: any = {
      company: '🏢',
      department: '🏛️',
      project: '📁',
      milestone: '🎯',
      research: '🔬',
      academic: '🎓',
      personal: '🙋',
      team: '👥',
      task: '✅',
      performance: '📈',
    };
    const typeIcon = typeIcons[goal.goal_type] || '📌';

    const isTeamGoal = !!goal.team_id;
    const isLeader = goal.my_team_role === 'owner' || goal.my_team_role === 'admin';
    const isPendingReview = goal.status === 'pending_review';
    const isCompleted = goal.status === 'completed';
    const busy = actionGoalId === goal.goal_id;

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
                <span className="text-2xl">{typeIcon}</span>
                <h3 className="text-lg font-semibold text-gray-900">{goal.title}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[goal.status] || 'bg-gray-100 text-gray-700'}`}>
                  {goal.status === 'pending_review' ? 'Waiting for Review' : goal.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{goal.description}</p>

              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${goal.progress || 0}%` }}
                    />
                  </div>
                  {isTeamGoal ? (
                    <input
                      key={`${goal.goal_id}-progress-${goal.progress}`}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={goal.progress || 0}
                      disabled={isCompleted || isPendingReview || busy}
                      aria-label={`Progress for ${goal.title}`}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val !== (goal.progress || 0)) {
                          updateGoalProgress(goal.goal_id, val);
                        }
                      }}
                      className="input-field text-sm py-1 w-16 disabled:opacity-50"
                    />
                  ) : (
                    <span className="text-gray-600 font-medium">{goal.progress || 0}%</span>
                  )}
                  {isTeamGoal && <span className="text-gray-500">%</span>}
                </div>

                {goal.target_date && (
                  <span className="text-gray-500">
                    📅 {new Date(goal.target_date).toLocaleDateString()}
                  </span>
                )}

                {isTeamGoal && isPendingReview && goal.submitted_by_name && (
                  <span className="text-purple-700">
                    📨 {goal.requested_status === 'completed' ? 'Completion requested' : 'Sign-off requested'} by {goal.submitted_by_name}
                    {goal.submitted_for_review_at && ` (${new Date(goal.submitted_for_review_at).toLocaleDateString()})`}
                  </span>
                )}
                {isTeamGoal && isCompleted && goal.approved_by_name && (
                  <span className="text-green-700">
                    ✅ Approved by {goal.approved_by_name}
                    {goal.approved_at && ` (${new Date(goal.approved_at).toLocaleDateString()})`}
                  </span>
                )}
              </div>

              {/* Creator + timestamp visibility: compact secondary metadata
                  line, kept separate from the primary row above so the
                  card doesn't get crowded. created_by_name comes from the
                  same LEFT JOIN pattern already used for submitted_by_name/
                  approved_by_name (goals.repository.ts) -- never
                  fabricated; goal.created_by_name is only absent if the
                  creator's user row itself is genuinely gone, in which
                  case this falls back to a plain, honest label rather
                  than inventing a name. "Updated" only shown when it's
                  meaningfully different from "Created", to avoid restating
                  the same instant twice on every untouched goal. */}
              <div className="text-xs text-gray-400 mt-1">
                Created by {goal.created_by_name || 'a former member'} · {new Date(goal.created_at).toLocaleDateString()}
                {goal.updated_at && new Date(goal.updated_at).getTime() !== new Date(goal.created_at).getTime() && (
                  <> · Updated {new Date(goal.updated_at).toLocaleDateString()}</>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end items-start gap-2">
              {!isTeamGoal && (
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
              )}

              {isTeamGoal && !isPendingReview && !isCompleted && (
                <>
                  <select
                    value={goal.status}
                    onChange={(e) => updateGoalStatus(goal.goal_id, e.target.value)}
                    className="input-field text-sm py-1"
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="at_risk">At Risk</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleSubmitForReview(goal.goal_id, false)}
                    disabled={busy}
                    title="Ask the team leader to sign off on the current progress/stage -- stays In Progress (or the current status) either way"
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {busy ? 'Submitting...' : 'Request Sign-off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitForReview(goal.goal_id, true)}
                    disabled={busy}
                    title="Ask the team leader to verify and mark this goal Completed"
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {busy ? 'Submitting...' : 'Request Completion'}
                  </button>
                </>
              )}

              {isTeamGoal && isPendingReview && isLeader && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveGoal(goal.goal_id)}
                    disabled={busy}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {busy ? 'Working...' : '✅ Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReturnGoal(goal.goal_id)}
                    disabled={busy}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    ↩ Return
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleDeleteGoal(goal.goal_id)}
                disabled={deletingGoalId === goal.goal_id}
                className="btn-secondary text-sm text-red-600 disabled:opacity-50"
              >
                {deletingGoalId === goal.goal_id ? 'Deleting...' : 'Delete'}
              </button>
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
        <button onClick={openCreateModal} className="btn-primary">
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedGoalType('all')}
            className={`px-4 py-2 border rounded-lg ${selectedGoalType === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setSelectedGoalType('company')}
            className={`px-4 py-2 border rounded-lg ${selectedGoalType === 'company' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            🏢 Company
          </button>
          <button
            type="button"
            onClick={() => setSelectedGoalType('department')}
            className={`px-4 py-2 border rounded-lg ${selectedGoalType === 'department' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            🏛️ Department
          </button>
          <button
            type="button"
            onClick={() => setSelectedGoalType('project')}
            className={`px-4 py-2 border rounded-lg ${selectedGoalType === 'project' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            📁 Project
          </button>
          <button
            type="button"
            onClick={() => setSelectedGoalType('milestone')}
            className={`px-4 py-2 border rounded-lg ${selectedGoalType === 'milestone' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            🎯 Milestone
          </button>
          {/* Reconciled with the Create Goal form's type list (goal_type is
              free text, so these are additive filters, not a competing
              system) -- Company/Department above are kept for goals
              created before this list existed. */}
          {[
            { value: 'research', label: '🔬 Research' },
            { value: 'academic', label: '🎓 Academic' },
            { value: 'personal', label: '🙋 Personal' },
            { value: 'team', label: '👥 Team' },
            { value: 'task', label: '✅ Task' },
            { value: 'performance', label: '📈 Performance' },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelectedGoalType(t.value)}
              className={`px-4 py-2 border rounded-lg ${selectedGoalType === t.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content loading/error/empty is driven by the hierarchy fetch
          -- that's the page's actual visible content. The goals-list
          fetch (Parent goal dropdown only) has its own scoped indicator
          near the field that actually depends on it, further down. */}
      {hierarchyLoading && hierarchy.length === 0 && (
        <div role="status" className="text-center py-12 text-gray-600">
          Loading goals...
        </div>
      )}

      {hierarchyError && goalsListError ? (
        // Both independent fetches failed -- almost always the same root
        // cause (network/auth/team-access), so one combined banner with a
        // single Retry that re-fetches both is the correct UX here rather
        // than two redundant banners.
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <p>{hierarchyError}</p>
          <button
            type="button"
            onClick={loadGoals}
            disabled={hierarchyLoading || goalsListLoading}
            className="btn-secondary mt-3 disabled:opacity-50"
          >
            {(hierarchyLoading || goalsListLoading) ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      ) : hierarchyError ? (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <p>{hierarchyError}</p>
          <button
            type="button"
            onClick={retryHierarchy}
            disabled={hierarchyLoading}
            className="btn-secondary mt-3 disabled:opacity-50"
          >
            {hierarchyLoading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        {!hierarchyLoading && !hierarchyError && visibleHierarchy.length > 0 ? (
          visibleHierarchy.map((goal) => renderGoalTree(goal))
        ) : !hierarchyLoading && !hierarchyError ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No goals yet</p>
            <p className="text-sm">Create your first goal to get started</p>
          </div>
        ) : null}
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
                <label htmlFor="goal-title" className="block text-sm font-medium text-gray-700 mb-1">Goal title *</label>
                <input
                  id="goal-title"
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label htmlFor="goal-description" className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  id="goal-description"
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  className="input-field"
                  rows={3}
                />
              </div>

              <div>
                <label htmlFor="goal-type" className="block text-sm font-medium text-gray-700 mb-1">Goal type *</label>
                <select
                  id="goal-type"
                  value={newGoal.goalType}
                  onChange={(e) => setNewGoal({ ...newGoal, goalType: e.target.value })}
                  className="input-field"
                >
                  <option value="project">📁 Project / Development</option>
                  <option value="research">🔬 Research</option>
                  <option value="academic">🎓 Academic</option>
                  <option value="personal">🙋 Personal</option>
                  <option value="team">👥 Team</option>
                  <option value="milestone">🎯 Milestone</option>
                  <option value="task">✅ Task</option>
                  <option value="performance">📈 Performance</option>
                  <option value="other">✏️ Other</option>
                </select>
                {newGoal.goalType === 'other' && (
                  <input
                    type="text"
                    value={customGoalType}
                    onChange={(e) => setCustomGoalType(e.target.value)}
                    className="input-field mt-2"
                    placeholder="Enter a custom goal type"
                    required
                  />
                )}
              </div>

              <div>
                <label htmlFor="goal-parent" className="block text-sm font-medium text-gray-700 mb-1">Parent goal (optional)</label>
                <select
                  id="goal-parent"
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
                {/* Loading/error granularity fix: getGoals feeds only this
                    dropdown -- a failure here previously had zero visible
                    indication anywhere (silently swallowed by the shared
                    error banner's fail-fast Promise.all, or simply not
                    surfaced at all once split apart). This is
                    deliberately non-blocking: the user can still create a
                    root goal (no parent) while this is broken/loading. */}
                {goalsListLoading && (
                  <p className="text-xs text-gray-500 mt-1">Loading existing goals…</p>
                )}
                {goalsListError && (
                  <p className="text-xs text-red-600 mt-1">
                    Couldn't load existing goals to choose a parent.{' '}
                    <button
                      type="button"
                      onClick={retryGoalsList}
                      disabled={goalsListLoading}
                      className="underline disabled:opacity-50"
                    >
                      {goalsListLoading ? 'Retrying...' : 'Retry'}
                    </button>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="goal-team" className="block text-sm font-medium text-gray-700 mb-1">Team (optional)</label>
                <select
                  id="goal-team"
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
                <label htmlFor="goal-target-date" className="block text-sm font-medium text-gray-700 mb-1">Target date (optional)</label>
                <input
                  id="goal-target-date"
                  type="date"
                  value={newGoal.targetDate}
                  onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={creatingGoal} className="btn-primary flex-1 disabled:opacity-50">
                  {creatingGoal ? 'Creating...' : 'Create Goal'}
                </button>
                <button
                  type="button"
                  disabled={creatingGoal}
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary flex-1 disabled:opacity-50"
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
