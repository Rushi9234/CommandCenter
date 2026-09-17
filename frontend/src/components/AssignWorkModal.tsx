import React, { useState, useEffect } from 'react';
import * as api from '../services/api';
import Avatar from './common/Avatar';

export interface AssignWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  classId?: string;
  classroomId?: string;
  teamId?: string;
  currentTeamId?: string;
  teams?: any[];
  availableTeams?: any[];
  isClassOwner?: boolean;
}

export const AssignWorkModal: React.FC<AssignWorkModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  classId,
  classroomId,
  teamId,
  currentTeamId,
  teams = [],
  availableTeams = [],
}) => {
  const effectiveClassId = classId || classroomId;
  const effectiveTeamId = teamId || currentTeamId;
  const effectiveTeams = teams.length > 0 ? teams : availableTeams;
  const [recipientType, setRecipientType] = useState<'team' | 'individual'>('team');
  const [selectedTargetTeam, setSelectedTargetTeam] = useState<string>(teamId || 'all');
  const [reviewerPolicy, setReviewerPolicy] = useState<'team_leaders' | 'class_owner'>('team_leaders');

  // Member Search State
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);

  // Task Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveTeamId) {
      setSelectedTargetTeam(effectiveTeamId);
    } else if (effectiveTeams.length > 0) {
      setSelectedTargetTeam('all');
    }
  }, [effectiveTeamId, effectiveTeams]);

  useEffect(() => {
    if (recipientType === 'individual' && effectiveClassId && memberSearchQuery.trim()) {
      const timer = setTimeout(async () => {
        setSearchingMembers(true);
        try {
          const res = await api.searchClassroomMembers(effectiveClassId, memberSearchQuery);
          setSearchResults(res.data.data || []);
        } catch (err) {
          console.error('Failed to search members:', err);
        } finally {
          setSearchingMembers(false);
        }
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [recipientType, effectiveClassId, memberSearchQuery]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (recipientType === 'team' && selectedTargetTeam === 'all' && effectiveClassId) {
        // All Teams Batch Assignment
        await api.createBatchTeamTasks(effectiveClassId, {
          title: title.trim(),
          description: description.trim(),
          priority,
          deadline: deadline || undefined,
          reviewerPolicy,
        });
      } else if (recipientType === 'individual' && selectedMember) {
        // Individual Member Assignment
        // Get target team's project or default
        const targetTeamId = selectedMember.team_id || effectiveTeamId;
        const projRes = await api.getTeamProjects(targetTeamId);
        const projects = projRes.data.data || [];
        let targetProj = projects.find((p: any) => p.status === 'active') || projects[0];

        if (!targetProj) {
          const createProjRes = await api.createProject({
            projectName: 'Assigned Work',
            description: 'Assigned work items container',
            teamId: targetTeamId,
            priority: 'medium',
          });
          targetProj = createProjRes.data.data;
        }

        await api.createTask(targetProj.project_id, {
          title: title.trim(),
          description: description.trim(),
          owner: selectedMember.user_id,
          priority,
          deadline: deadline || undefined,
        });
      } else {
        // Single Team Assignment
        const targetTeamId = selectedTargetTeam !== 'all' ? selectedTargetTeam : effectiveTeamId;
        if (!targetTeamId) throw new Error('Target team must be selected');

        const projRes = await api.getTeamProjects(targetTeamId);
        const projects = projRes.data.data || [];
        let targetProj = projects.find((p: any) => p.status === 'active') || projects[0];

        if (!targetProj) {
          const createProjRes = await api.createProject({
            projectName: 'Team Workload',
            description: 'Team tasks container',
            teamId: targetTeamId,
            priority: 'medium',
          });
          targetProj = createProjRes.data.data;
        }

        await api.createTask(targetProj.project_id, {
          title: title.trim(),
          description: description.trim(),
          priority,
          deadline: deadline || undefined,
        });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to assign work:', err);
      setError(err.response?.data?.error || err.message || 'Failed to assign work');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-hidden" data-testid="assign-work-modal">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-xl w-full max-h-[calc(100vh-64px)] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between border-b border-gray-100 p-4 sm:p-5 bg-white">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <span>📋 Assign Work</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold border border-indigo-100">
                Authorized Workflow
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Assign work to teams or individual members with clear review expectations</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-lg hover:bg-gray-100 transition-all"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0" data-testid="assign-work-form">
          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            {/* Step 1: Who receives this work? */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Who should receive this work? *
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => { setRecipientType('team'); setSelectedMember(null); }}
                  className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    recipientType === 'team'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>👥 Team / All Teams</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('individual')}
                  className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    recipientType === 'individual'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>👤 Individual Member</span>
                </button>
              </div>
            </div>

            {/* Recipient Details */}
            {recipientType === 'team' ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Select Target Team *</label>
                <select
                  value={selectedTargetTeam}
                  onChange={(e) => setSelectedTargetTeam(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  {effectiveClassId && <option value="all">🌐 All Teams in Class (Batch Mode)</option>}
                  {effectiveTeams.map((t) => (
                    <option key={t.team_id} value={t.team_id}>
                      {t.team_name} ({t.member_count || t.members_count || 0} members)
                    </option>
                  ))}
                </select>
                {selectedTargetTeam === 'all' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-2">
                    <p className="font-semibold">⚡ All Teams Batch Mode Active</p>
                    <p>Each team will receive an independent, actionable task instance to complete at their own pace.</p>
                    <div className="pt-1">
                      <label className="block font-semibold text-[11px] uppercase text-blue-900 mb-1">Default Reviewer Policy:</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="policy"
                            checked={reviewerPolicy === 'team_leaders'}
                            onChange={() => setReviewerPolicy('team_leaders')}
                            className="text-indigo-600"
                          />
                          <span>Team Leaders (Recommended)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="policy"
                            checked={reviewerPolicy === 'class_owner'}
                            onChange={() => setReviewerPolicy('class_owner')}
                            className="text-indigo-600"
                          />
                          <span>Class Owner</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Search & Select Member *</label>
                {selectedMember ? (
                  <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs">
                    <div className="flex items-center gap-3">
                      <Avatar name={selectedMember.full_name} size="md" />
                      <div>
                        <div className="font-bold text-gray-900">{selectedMember.full_name}</div>
                        <div className="text-gray-500">@{selectedMember.username} • {selectedMember.role || 'Member'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(null)}
                      className="text-indigo-700 hover:text-indigo-900 font-bold px-2 py-1 text-xs"
                    >
                      Change Member
                    </button>
                  </div>
                ) : (
                  <div className="relative space-y-2">
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Search by name or username..."
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                    />
                    {searchingMembers && <div className="text-xs text-gray-500">Searching classroom members...</div>}
                    {searchResults.length > 0 && (
                      <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 shadow-md">
                        {searchResults.map((m) => (
                          <button
                            key={m.user_id}
                            type="button"
                            onClick={() => { setSelectedMember(m); setSearchResults([]); }}
                            className="w-full text-left p-2.5 hover:bg-indigo-50 flex items-center justify-between text-xs transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar name={m.full_name} size="sm" />
                              <div>
                                <div className="font-semibold text-gray-900">{m.full_name}</div>
                                <div className="text-gray-500">@{m.username}</div>
                              </div>
                            </div>
                            <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Task Title & Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Task Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Complete Chatbot UI Integration"
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description / Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed instructions or work criteria..."
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 min-h-[72px] resize-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Priority & Deadline */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Deadline (Optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (recipientType === 'individual' && !selectedMember)}
              className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {loading ? 'Assigning Work...' : 'Confirm Assignment 🚀'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignWorkModal;
