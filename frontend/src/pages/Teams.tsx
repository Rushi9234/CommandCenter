import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/common/Avatar';
import AvatarGroup from '../components/common/AvatarGroup';
import SearchField from '../components/common/SearchField';
import StatusBadge from '../components/common/StatusBadge';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
}

export default function Teams() {
  const { user } = useAuth();
  const params = useParams<{ teamId?: string; memberId?: string; classId?: string }>();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showJoinByIdModal, setShowJoinByIdModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTeamSearch, setSidebarTeamSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Toast feedback state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mutation loading protection state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Custom confirmation dialog state
  const [confirmModal, setConfirmModal] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {},
  });

  // Stale request version protection for rapid team switching
  const teamSelectSeq = useRef(0);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const setActionProgress = (key: string, isLoading: boolean) => {
    setActionLoading((prev) => ({ ...prev, [key]: isLoading }));
  };

  // Preview state for Join by Team ID
  const [joinByIdInput, setJoinByIdInput] = useState('');
  const [previewedTeam, setPreviewedTeam] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Sub-teams & work submissions
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [workSubmissions, setWorkSubmissions] = useState<any[]>([]);

  const [newTeam, setNewTeam] = useState({
    teamName: '',
    description: '',
    isPublic: true,
    maxTeamSize: 10,
    teamType: 'main',
    parentTeamId: '',
  });

  const [inviteEmail, setInviteEmail] = useState('');

  const CONTEXT_TYPES = [
    { value: 'main', label: 'Normal Team', emoji: '👥' },
    { value: 'classroom', label: 'Subject / Classroom', emoji: '🎓' },
    { value: 'hackathon', label: 'Hackathon', emoji: '🏆' },
  ];
  const contextTypeLabel = (teamType?: string) => CONTEXT_TYPES.find((c) => c.value === teamType)?.label || teamType;
  const contextTypeEmoji = (teamType?: string) => CONTEXT_TYPES.find((c) => c.value === teamType)?.emoji || '👥';

  const [myJoinRequests, setMyJoinRequests] = useState<any[]>([]);

  // Body scroll lock management when modals are open
  useEffect(() => {
    const isAnyModalOpen =
      showCreateModal ||
      showInviteModal ||
      showDiscoverModal ||
      showSettingsModal ||
      showJoinByIdModal ||
      confirmModal.isOpen;

    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [
    showCreateModal,
    showInviteModal,
    showDiscoverModal,
    showSettingsModal,
    showJoinByIdModal,
    confirmModal.isOpen,
  ]);

  // Escape key listener for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setShowInviteModal(false);
        setShowDiscoverModal(false);
        setShowSettingsModal(false);
        setShowJoinByIdModal(false);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    loadTeams();
    loadInvites();
    loadAllTeams();
    loadMyJoinRequests();
  }, []);

  const loadMyJoinRequests = async () => {
    try {
      const response = await api.getMyJoinRequests();
      setMyJoinRequests(response.data.data.filter((r: any) => r.status === 'pending'));
    } catch (error) {
      console.error('Failed to load my join requests:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeams();
      const list = response.data.data;
      setTeams(list);

      if (params.teamId) {
        const found = list.find((t: any) => t.team_id === params.teamId);
        if (found) {
          selectTeam(found, false);
          return;
        }
      }

      if (list.length > 0 && !selectedTeam) {
        selectTeam(list[0], false);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  useEffect(() => {
    if (params.teamId && teams.length > 0) {
      const found = teams.find((t: any) => t.team_id === params.teamId);
      if (found && found.team_id !== selectedTeam?.team_id) {
        selectTeam(found, false);
      }
    }
  }, [params.teamId, teams]);

  const loadAllTeams = async () => {
    try {
      const response = await api.getAllTeams();
      setAllTeams(response.data.data);
    } catch (error) {
      console.error('Failed to load all teams:', error);
    }
  };

  const loadInvites = async () => {
    try {
      const response = await api.getMyInvites();
      setInvites(response.data.data);
    } catch (error) {
      console.error('Failed to load invites:', error);
    }
  };

  const selectTeam = async (team: any, updateUrl = true) => {
    setSelectedTeam(team);
    if (updateUrl && team?.team_id) {
      const targetPath = team.team_type === 'classroom' ? `/classrooms/${team.team_id}` : `/teams/${team.team_id}`;
      if (window.location.pathname !== targetPath) {
        navigate(targetPath, { replace: false });
      }
    }
    const currentSeq = ++teamSelectSeq.current;
    setSubTeams([]);
    setWorkSubmissions([]);

    try {
      const [membersRes, requestsRes] = await Promise.all([
        api.getTeamMembers(team.team_id).catch(() => ({ data: { data: [] } })),
        api.getJoinRequests(team.team_id).catch(() => ({ data: { data: [] } })),
      ]);

      if (currentSeq !== teamSelectSeq.current) return;

      const membersList = membersRes.data?.data || [];
      const requestsList = requestsRes.data?.data || [];

      setTeamMembers(membersList);
      setJoinRequests(requestsList);
    } catch (error) {
      console.error('Failed to load team data:', error);
    }

    try {
      const subTeamsRes = await api.getSubTeams(team.team_id);
      if (currentSeq !== teamSelectSeq.current) return;
      setSubTeams(subTeamsRes.data.data);
    } catch (error) {
      console.error('Failed to load sub-teams:', error);
    }

    try {
      const submissionsRes = await api.getTeamWorkSubmissions(team.team_id);
      if (currentSeq !== teamSelectSeq.current) return;
      setWorkSubmissions(submissionsRes.data.data);
    } catch (error) {
      console.error('Failed to load work submissions:', error);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createTeam(
        newTeam.teamName,
        newTeam.description,
        newTeam.isPublic,
        newTeam.maxTeamSize,
        newTeam.parentTeamId.trim() || undefined,
        undefined,
        newTeam.teamType
      );
      showToast('Team created successfully!', 'success');
      setShowCreateModal(false);
      setNewTeam({ teamName: '', description: '', isPublic: true, maxTeamSize: 10, teamType: 'main', parentTeamId: '' });
      loadTeams();
      loadAllTeams();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to create team', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewTeamId = async () => {
    const teamId = joinByIdInput.trim();
    if (!teamId) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewedTeam(null);
    try {
      const res = await api.getTeamPreview(teamId);
      setPreviewedTeam(res.data.data);
    } catch (error: any) {
      setPreviewError(
        error.response?.status === 404
          ? 'No team found with that ID. Double-check the Team ID with whoever shared it.'
          : error.response?.data?.error || 'Failed to preview that team.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleJoinPreviewedTeam = async () => {
    if (!previewedTeam) return;
    setActionProgress(`join-${previewedTeam.team_id}`, true);
    try {
      await api.requestJoinTeam(previewedTeam.team_id);
      showToast('Join request sent! The team owner will review your request.', 'success');
      setShowJoinByIdModal(false);
      setJoinByIdInput('');
      setPreviewedTeam(null);
      loadMyJoinRequests();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to send join request', 'error');
    } finally {
      setActionProgress(`join-${previewedTeam.team_id}`, false);
    }
  };

  const handleInviteByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    try {
      await api.inviteByEmail(selectedTeam.team_id, inviteEmail);
      setShowInviteModal(false);
      setInviteEmail('');
      showToast('Invitation sent successfully!', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to send invitation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setActionProgress(`invite-${inviteId}`, true);
    try {
      await api.acceptInvite(inviteId);
      showToast('Invitation accepted!', 'success');
      loadInvites();
      loadTeams();
      loadAllTeams();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to accept invitation', 'error');
    } finally {
      setActionProgress(`invite-${inviteId}`, false);
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    setActionProgress(`invite-${inviteId}`, true);
    try {
      await api.rejectInvite(inviteId);
      showToast('Invitation declined', 'info');
      loadInvites();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to reject invitation', 'error');
    } finally {
      setActionProgress(`invite-${inviteId}`, false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await api.searchTeams(searchQuery);
      setSearchResults(response.data.data);
    } catch (error) {
      console.error('Search failed:', error);
      showToast('Failed to search teams. Please try again.', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const promptRemoveMember = (member: any) => {
    const memberName = member.user?.full_name || member.full_name || member.username || 'this member';
    setConfirmModal({
      isOpen: true,
      title: 'Remove Team Member',
      message: `Are you sure you want to remove ${memberName} from ${selectedTeam?.team_name || 'the team'}?`,
      confirmText: 'Remove Member',
      onConfirm: async () => {
        setActionProgress(`remove-${member.user_id}`, true);
        try {
          await api.removeTeamMember(selectedTeam.team_id, member.user_id);
          showToast('Member removed from team', 'success');
          selectTeam(selectedTeam);
          loadTeams();
          loadAllTeams();
        } catch (error: any) {
          showToast(error.response?.data?.error || 'Failed to remove member', 'error');
        } finally {
          setActionProgress(`remove-${member.user_id}`, false);
        }
      },
    });
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!selectedTeam) return;
    setActionProgress(`role-${userId}`, true);
    try {
      await api.updateMemberRole(selectedTeam.team_id, userId, newRole);
      showToast('Member role updated successfully', 'success');
      selectTeam(selectedTeam);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to update role', 'error');
    } finally {
      setActionProgress(`role-${userId}`, false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    setActionProgress(`join-${teamId}`, true);
    try {
      await api.requestJoinTeam(teamId);
      showToast('Join request sent! The team owner will review your request.', 'success');
      loadMyJoinRequests();
    } catch (error: any) {
      const errMsg = error.response?.data?.error || 'Failed to send join request';
      showToast(errMsg, 'error');
      loadMyJoinRequests();
    } finally {
      setActionProgress(`join-${teamId}`, false);
    }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
    setActionProgress(`approve-${requestId}`, true);
    try {
      await api.approveJoinRequest(requestId);
      showToast('Join request approved', 'success');
      setJoinRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (selectedTeam) selectTeam(selectedTeam);
      loadTeams();
      loadAllTeams();
    } catch (error: any) {
      const errMsg = error.response?.data?.error || 'That join request was already processed';
      showToast(errMsg, 'error');
      setJoinRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (selectedTeam) selectTeam(selectedTeam);
    } finally {
      setActionProgress(`approve-${requestId}`, false);
    }
  };

  const handleRejectJoinRequest = async (requestId: string) => {
    setActionProgress(`reject-${requestId}`, true);
    try {
      await api.rejectJoinRequest(requestId);
      showToast('Join request rejected', 'info');
      setJoinRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (selectedTeam) selectTeam(selectedTeam);
    } catch (error: any) {
      const errMsg = error.response?.data?.error || 'That join request was already processed';
      showToast(errMsg, 'error');
      setJoinRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (selectedTeam) selectTeam(selectedTeam);
    } finally {
      setActionProgress(`reject-${requestId}`, false);
    }
  };

  const promptLeaveTeam = () => {
    if (!selectedTeam) return;
    setConfirmModal({
      isOpen: true,
      title: 'Leave Team',
      message: `Are you sure you want to leave ${selectedTeam.team_name}? You will lose access to team activities and projects.`,
      confirmText: 'Leave Team',
      onConfirm: async () => {
        setActionProgress('leave-team', true);
        try {
          await api.leaveTeam(selectedTeam.team_id);
          showToast(`You have left ${selectedTeam.team_name}`, 'info');
          setSelectedTeam(null);
          loadTeams();
          loadAllTeams();
        } catch (error: any) {
          showToast(error.response?.data?.error || 'Failed to leave team', 'error');
        } finally {
          setActionProgress('leave-team', false);
        }
      },
    });
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    try {
      await api.updateTeamSettings(selectedTeam.team_id, {
        team_name: selectedTeam.team_name,
        description: selectedTeam.description,
        is_public: selectedTeam.is_public,
      });
      showToast('Team settings updated', 'success');
      setShowSettingsModal(false);
      loadTeams();
      loadAllTeams();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to update settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* LEVEL 1 → LEVEL 2 → LEVEL 3 UNIFIED HIERARCHICAL NAVIGATION BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 text-xs shadow-xs" data-testid="unified-hierarchy-breadcrumb">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap text-gray-600 font-medium">
            <Link
              to="/overview"
              className="text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-1 font-semibold"
            >
              <span>👤</span> My Work
            </Link>

            {selectedTeam && (
              <>
                <span className="text-gray-400 font-mono">/</span>

                {/* Parent Classroom Context */}
                {selectedTeam.parent_team_id && (
                  <>
                    <button
                      onClick={() => {
                        const parent = teams.find((t) => t.team_id === selectedTeam.parent_team_id);
                        if (parent) selectTeam(parent);
                      }}
                      className="text-indigo-700 hover:text-indigo-900 transition-colors flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-semibold"
                    >
                      <span>🏫</span> Classroom Context
                    </button>
                    <span className="text-gray-400 font-mono">/</span>
                  </>
                )}

                {/* Current Active Level */}
                <span className="bg-indigo-600 text-white px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 shadow-xs">
                  {selectedTeam.team_type === 'classroom' ? '🏫 Classroom' : '👥 Team'}: {selectedTeam.team_name}
                </span>

                {/* Scope Badge */}
                <span className="text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg text-[11px] border border-gray-200 font-medium">
                  Scope: {selectedTeam.team_type === 'classroom' ? 'Classroom Aggregate Overview' : 'Team Work Transparency'}
                </span>
              </>
            )}
          </div>

          {/* Quick Back & Nav buttons */}
          <div className="flex items-center gap-3 text-[11px]">
            {selectedTeam && selectedTeam.parent_team_id && (
              <button
                onClick={() => {
                  const parent = teams.find((t) => t.team_id === selectedTeam.parent_team_id);
                  if (parent) selectTeam(parent);
                }}
                className="text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
              >
                ⬅️ Back to Parent Classroom
              </button>
            )}
            <Link
              to="/overview"
              className="text-gray-700 hover:text-gray-900 font-medium flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg border border-gray-200 transition-colors"
            >
              ⬅️ Back to My Work
            </Link>
          </div>
        </div>
      </div>

      {/* Global Toast Notification Container */}
      <div
        className="fixed top-20 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border text-sm font-medium transition-all ${
                toast.type === 'success'
                  ? 'bg-emerald-900 text-emerald-50 border-emerald-700'
                  : toast.type === 'error'
                  ? 'bg-rose-900 text-rose-50 border-rose-700'
                  : toast.type === 'warning'
                  ? 'bg-amber-900 text-amber-50 border-amber-700'
                  : 'bg-slate-900 text-slate-50 border-slate-700'
              }`}
            >
              <span className="text-base">
                {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-white/70 hover:text-white ml-2 text-xs p-1"
                aria-label="Dismiss toast"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
              <p className="text-gray-600 mt-1">Collaborate with your team members</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDiscoverModal(true)} className="btn-secondary">
                🔍 Discover Teams
              </button>
              <button
                onClick={() => {
                  setShowJoinByIdModal(true);
                  setPreviewedTeam(null);
                  setPreviewError('');
                  setJoinByIdInput('');
                }}
                className="btn-secondary"
              >
                🔑 Join with Team ID
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                + Create Team / Classroom
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Invites Banner */}
      {invites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border-b border-blue-200"
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📬</span>
                <div>
                  <div className="font-semibold text-blue-900">
                    You have {invites.length} pending team {invites.length === 1 ? 'invitation' : 'invitations'}
                  </div>
                  <div className="text-sm text-blue-700">Review and accept to join teams</div>
                </div>
              </div>
              <div className="flex gap-2">
                {invites.slice(0, 2).map((invite) => (
                  <div key={invite.invite_id} className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg">
                    <span className="text-sm font-medium">{invite.team?.team_name}</span>
                    <button
                      onClick={() => handleAcceptInvite(invite.invite_id)}
                      disabled={actionLoading[`invite-${invite.invite_id}`]}
                      className="text-green-600 hover:text-green-700 text-sm font-medium disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectInvite(invite.invite_id)}
                      disabled={actionLoading[`invite-${invite.invite_id}`]}
                      className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* My Pending Join Requests Banner */}
      {myJoinRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-50 border-b border-yellow-200"
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <div className="font-semibold text-yellow-900">
                  Waiting for approval on {myJoinRequests.length} join {myJoinRequests.length === 1 ? 'request' : 'requests'}
                </div>
                <div className="text-sm text-yellow-700">
                  {myJoinRequests.map((r: any) => r.team?.team_name).filter(Boolean).join(', ') ||
                    'A team leader still needs to review this.'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Teams List */}
          <div className="lg:col-span-1">
            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Your Teams ({teams.length})</h2>
              {teams.length > 5 && (
                <div className="mb-2">
                  <input
                    type="text"
                    value={sidebarTeamSearch}
                    onChange={(e) => setSidebarTeamSearch(e.target.value)}
                    placeholder="Filter my teams..."
                    className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {teams
                    .filter((t) => !sidebarTeamSearch.trim() || t.team_name.toLowerCase().includes(sidebarTeamSearch.toLowerCase().trim()))
                    .map((team, index) => (
                      <motion.button
                        key={team.team_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => selectTeam(team)}
                        className={`w-full text-left p-2.5 rounded-lg transition-all ${
                          selectedTeam?.team_id === team.team_id
                            ? 'bg-blue-50 border-2 border-blue-500 shadow-sm font-semibold'
                            : 'hover:bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-xs flex items-center gap-1.5 truncate">
                          <span>{team.team_type === 'classroom' ? '🎓' : '👥'}</span>
                          <span className="truncate">{team.team_name}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(team.created_at).toLocaleDateString()}
                        </div>
                      </motion.button>
                    ))}
                </AnimatePresence>
                {teams.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8 space-y-3">
                    <p className="font-medium">No teams yet</p>
                    <p className="text-xs">Create or discover a team to get started.</p>
                    <button
                      onClick={() => {
                        setShowJoinByIdModal(true);
                        setPreviewedTeam(null);
                        setPreviewError('');
                        setJoinByIdInput('');
                      }}
                      className="btn-secondary text-xs w-full"
                    >
                      🔑 Join with Team ID
                    </button>
                    <p className="text-xs">or</p>
                    <button onClick={() => setShowCreateModal(true)} className="btn-primary text-xs w-full">
                      + Create Team or Classroom
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team Details */}
          <div className="lg:col-span-3">
            {selectedTeam ? (
              <motion.div
                key={selectedTeam.team_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Team Info */}
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-bold text-gray-900">{selectedTeam.team_name}</h2>
                        {selectedTeam.team_type && selectedTeam.team_type !== 'main' && (
                          <span className="badge badge-blue">
                            {contextTypeEmoji(selectedTeam.team_type)} {contextTypeLabel(selectedTeam.team_type)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 mt-2">{selectedTeam.description || 'No description provided'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">Team ID:</span>
                        <code className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{selectedTeam.team_id}</code>
                      </div>
                      <div className="flex items-center gap-4 mt-4 flex-wrap">
                        <AvatarGroup
                          users={teamMembers.map((m) => ({
                            user_id: m.user_id,
                            full_name: m.user?.full_name || m.full_name || m.username || 'User',
                            avatar_url: m.user?.avatar_url || m.avatar_url,
                          }))}
                          max={4}
                          size="sm"
                        />
                        <span className="badge badge-blue">{teamMembers.length} members</span>
                        <StatusBadge status={selectedTeam.is_public ? 'Public' : 'Private'} />
                        <span className="text-sm text-gray-500">
                          Created {new Date(selectedTeam.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {teamMembers.some((m) => m.user_id === user?.user_id && ['owner', 'admin', 'manager'].includes(m.role)) && (
                        <>
                          <button onClick={() => setShowSettingsModal(true)} className="btn-secondary">
                            ⚙️ Settings
                          </button>
                          <button onClick={() => setShowInviteModal(true)} className="btn-primary">
                            📧 Invite
                          </button>
                        </>
                      )}
                      <button
                        onClick={promptLeaveTeam}
                        disabled={actionLoading['leave-team']}
                        className="btn-secondary text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {actionLoading['leave-team'] ? 'Leaving...' : '🚪 Leave'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dedicated Analytics Hub Navigation Entry Point */}
                <div className="pro-card p-6 bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white rounded-2xl shadow-md">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">📊</span>
                        <h3 className="text-lg font-bold">
                          {selectedTeam.team_type === 'classroom' ? 'Classroom Analytics Hub' : 'Team Analytics Hub'}
                        </h3>
                      </div>
                      <p className="text-sm text-indigo-100">
                        {selectedTeam.team_type === 'classroom'
                          ? `Explore comprehensive classroom-wide metrics, team progress comparisons, and member breakdown for ${selectedTeam.team_name}.`
                          : `View overall progress, task distribution donut charts, 7-day completion trends, and member status for ${selectedTeam.team_name}.`}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (selectedTeam.team_type === 'classroom') {
                          navigate(`/analytics/classes/${selectedTeam.team_id}`);
                        } else if (selectedTeam.parent_team_id) {
                          navigate(`/analytics/classes/${selectedTeam.parent_team_id}/teams/${selectedTeam.team_id}`);
                        } else {
                          navigate(`/analytics/teams/${selectedTeam.team_id}`);
                        }
                      }}
                      className="px-5 py-2.5 bg-white text-indigo-900 font-bold rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-sm shadow-xs whitespace-nowrap"
                    >
                      <span>Open Analytics Hub</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Teams list for Classrooms */}
                {selectedTeam.team_type === 'classroom' && subTeams.length > 0 && (
                  <div className="pro-card p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Sub-Teams in {selectedTeam.team_name} ({subTeams.length})
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Sub-teams created under this classroom. Click to manage team members or view analytics.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {subTeams.map((st: any) => (
                        <div
                          key={st.team_id}
                          className="pro-card-hover p-4 border border-gray-200 rounded-xl hover:border-indigo-400 transition-all flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-gray-900">{st.team_name}</div>
                            <div className="text-xs text-gray-500">{st.description || 'No description'}</div>
                          </div>
                          <button
                            onClick={() => navigate(`/analytics/classes/${selectedTeam.team_id}/teams/${st.team_id}`)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100"
                          >
                            Analytics →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Today's Activity */}
                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Today's Activity</h3>
                  <p className="text-sm text-gray-500 mb-4">Who has submitted today's confirmed work -- not a productivity score.</p>
                  <div className="flex flex-wrap gap-2">
                    {teamMembers.map((member: any) => {
                      const memberName = member.user?.full_name || member.full_name || member.username || 'Member';
                      const submitted = workSubmissions.some((s: any) => s.user_id === member.user_id);
                      return (
                        <span
                          key={member.user_id}
                          className={`badge ${submitted ? 'badge-green' : 'badge-gray'}`}
                          title={memberName}
                        >
                          {submitted ? '✅' : '⚪'} {memberName}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Members Section */}
                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>

                  {/* Pending Join Requests */}
                  {joinRequests.length > 0 && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="font-medium text-yellow-900 mb-3">
                        📋 Pending Join Requests ({joinRequests.length})
                      </div>
                      <div className="space-y-2">
                        {joinRequests.map((request) => {
                          const requesterName = request.user?.full_name || request.user?.username || 'Requester';
                          const requesterHandle = request.user?.username || '';
                          return (
                            <div
                              key={request.request_id}
                              className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar name={requesterName} src={request.user?.avatar_url} size="sm" />
                                <div>
                                  <div className="font-medium text-sm text-gray-900">{requesterName}</div>
                                  {requesterHandle && <div className="text-xs text-gray-500">@{requesterHandle}</div>}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproveJoinRequest(request.request_id)}
                                  disabled={actionLoading[`approve-${request.request_id}`]}
                                  className="text-green-600 hover:text-green-700 text-sm font-medium px-3 py-1 border border-green-200 rounded-md hover:bg-green-50 disabled:opacity-50"
                                >
                                  {actionLoading[`approve-${request.request_id}`] ? 'Approving...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleRejectJoinRequest(request.request_id)}
                                  disabled={actionLoading[`reject-${request.request_id}`]}
                                  className="text-red-600 hover:text-red-700 text-sm font-medium px-3 py-1 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                                >
                                  {actionLoading[`reject-${request.request_id}`] ? 'Rejecting...' : 'Reject'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Members List */}
                  <div className="space-y-3">
                    <AnimatePresence>
                      {teamMembers.map((member, index) => {
                        const memberName = member.user?.full_name || member.full_name || member.username || 'Team Member';
                        const username = member.user?.username || member.username || '';

                        return (
                          <motion.div
                            key={member.user_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-center justify-between p-4 pro-card-hover"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar name={memberName} src={member.user?.avatar_url || member.avatar_url} size="md" />
                              <div>
                                <div className="font-medium text-gray-900">{memberName}</div>
                                {username && <div className="text-sm text-gray-500">@{username}</div>}
                              </div>
                              {member.role === 'owner' && <span className="badge badge-yellow">👑 Owner</span>}
                            </div>

                            <div className="flex items-center gap-3">
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                disabled={member.role === 'owner' || actionLoading[`role-${member.user_id}`]}
                                className="input-field text-sm py-1.5"
                              >
                                <option value="owner" disabled>
                                  Owner
                                </option>
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                              </select>

                              {member.role !== 'owner' && (
                                <button
                                  onClick={() => promptRemoveMember(member)}
                                  disabled={actionLoading[`remove-${member.user_id}`]}
                                  className="text-red-600 hover:text-red-700 text-sm font-medium px-2 py-1 hover:bg-red-50 rounded disabled:opacity-50"
                                >
                                  {actionLoading[`remove-${member.user_id}`] ? 'Removing...' : 'Remove'}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {teamMembers.length === 0 && (
                      <p className="text-center text-gray-500 py-6 text-sm">This team doesn't have any members yet.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="pro-card p-12 text-center">
                <div className="text-6xl mb-4">👥</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Team Selected</h3>
                <p className="text-gray-600 mb-6">Select a team from the list or create a new one</p>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                  Create Your First Team
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Create Team Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6 overflow-hidden"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreateModal(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-team-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.25 }}
              className="pro-card w-full max-w-lg max-h-[calc(100vh-64px)] flex flex-col relative overflow-hidden"
            >
              <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-white">
                <h2 id="create-team-modal-title" className="text-lg sm:text-xl font-bold text-gray-900">
                  Create New Team
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTeam} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">What are you creating? *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CONTEXT_TYPES.map((ct) => (
                        <button
                          key={ct.value}
                          type="button"
                          onClick={() => setNewTeam({ ...newTeam, teamType: ct.value })}
                          className={`p-2.5 rounded-lg border-2 text-center text-xs sm:text-sm transition-all ${
                            newTeam.teamType === ct.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="text-xl sm:text-2xl mb-0.5">{ct.emoji}</div>
                          <span className="font-semibold">{ct.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      A classroom or hackathon works like a team -- you'll be its owner and can create sub-teams under it.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Team Name *</label>
                    <input
                      type="text"
                      value={newTeam.teamName}
                      onChange={(e) => setNewTeam({ ...newTeam, teamName: e.target.value })}
                      className="input-field text-sm py-2"
                      placeholder={
                        newTeam.teamType === 'classroom'
                          ? 'Software Engineering - TY CSE - 2026'
                          : newTeam.teamType === 'hackathon'
                          ? 'Smart India Hackathon 2026'
                          : 'Engineering Team'
                      }
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={newTeam.description}
                      onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                      className="input-field text-sm py-2 resize-none"
                      rows={2}
                      placeholder="What does this team do?"
                    />
                  </div>

                  {newTeam.teamType === 'main' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Parent Classroom/Hackathon Team ID (optional)
                      </label>
                      <input
                        type="text"
                        value={newTeam.parentTeamId}
                        onChange={(e) => setNewTeam({ ...newTeam, parentTeamId: e.target.value })}
                        className="input-field text-sm py-2"
                        placeholder="Paste the classroom/hackathon's Team ID"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Team Size Limit *</label>
                    <input
                      type="number"
                      min="2"
                      max="100"
                      value={newTeam.maxTeamSize}
                      onChange={(e) => setNewTeam({ ...newTeam, maxTeamSize: parseInt(e.target.value) || 10 })}
                      className="input-field text-sm py-2"
                      placeholder="Enter team size (2-100)"
                      required
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTeam.isPublic}
                        onChange={(e) => setNewTeam({ ...newTeam, isPublic: e.target.checked })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-xs sm:text-sm font-medium text-gray-700">Public team (discoverable by others)</span>
                    </label>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50/50">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Creating...' : 'Create Team'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite by Email Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowInviteModal(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="invite-modal-title" className="text-xl font-bold text-gray-900">
                  Invite Team Member
                </h2>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleInviteByEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input-field"
                    placeholder="colleague@company.com"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">They'll receive an invitation to join this team</p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Sending...' : 'Send Invitation'}
                  </button>
                  <button type="button" onClick={() => setShowInviteModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Discover Teams Modal */}
      <AnimatePresence>
        {showDiscoverModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDiscoverModal(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-teams-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-2xl max-h-[85vh] flex flex-col relative"
            >
              {/* Sticky Modal Header with Close [X] */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 flex-shrink-0">
                <div>
                  <h2 id="discover-teams-modal-title" className="text-xl font-bold text-gray-900">
                    Discover Teams
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Browse public teams and classrooms available to join</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiscoverModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {/* Search Bar */}
              <div className="py-4 flex-shrink-0">
                <SearchField
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search teams by name or description..."
                />
              </div>

              {/* Internal Scrollable Content */}
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {searchLoading ? (
                  <div className="text-center py-8">
                    <div className="spinner w-6 h-6 mx-auto mb-2"></div>
                    <p className="text-gray-500 text-sm">Searching teams...</p>
                  </div>
                ) : (searchQuery ? searchResults : allTeams).length === 0 ? (
                  <div className="text-center text-gray-500 py-10 space-y-1">
                    <p className="font-medium text-base">
                      {searchQuery ? 'No search results' : 'No teams available'}
                    </p>
                    <p className="text-xs">
                      {searchQuery ? 'Try matching another team name or description' : 'No discoverable public teams found'}
                    </p>
                  </div>
                ) : (
                  (searchQuery ? searchResults : allTeams).map((team) => {
                    const isMember = teams.some((t) => t.team_id === team.team_id);
                    const isPending = myJoinRequests.some((r) => r.team_id === team.team_id);

                    const classLabel = team.department
                      ? `in ${team.department}`
                      : team.team_type && team.team_type !== 'main'
                      ? `Class: ${contextTypeLabel(team.team_type)}`
                      : 'No class assigned';

                    return (
                      <motion.div key={team.team_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 pro-card-hover">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900">{team.team_name}</h3>
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
                                {classLabel}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{team.description || 'No description'}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {team.owner && (
                                <span className="text-xs text-gray-500">
                                  👤 Led by {team.owner.full_name || team.owner.username}
                                </span>
                              )}
                              <span className="text-xs text-gray-600 font-medium">
                                {team.member_count ?? 0} members
                              </span>
                              {team.is_public && <span className="badge badge-green text-xs">Public</span>}
                            </div>
                          </div>

                          {/* State-aware action button */}
                          <div className="flex-shrink-0">
                            {isMember ? (
                              <span className="badge badge-blue text-xs font-semibold px-3 py-1.5">
                                Already a Member
                              </span>
                            ) : isPending ? (
                              <span className="badge badge-yellow text-xs font-semibold px-3 py-1.5">
                                Request Pending
                              </span>
                            ) : (
                              <button
                                onClick={() => handleJoinTeam(team.team_id)}
                                disabled={actionLoading[`join-${team.team_id}`]}
                                className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {actionLoading[`join-${team.team_id}`] && <span className="spinner w-3.5 h-3.5" />}
                                Request to Join
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join with Team ID Modal */}
      <AnimatePresence>
        {showJoinByIdModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowJoinByIdModal(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-by-id-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="join-by-id-modal-title" className="text-xl font-bold text-gray-900">
                  Join with Team ID
                </h2>
                <button
                  type="button"
                  onClick={() => setShowJoinByIdModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">Ask your coordinator, team leader, or organizer for the Team ID.</p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={joinByIdInput}
                  onChange={(e) => {
                    setJoinByIdInput(e.target.value);
                    setPreviewedTeam(null);
                    setPreviewError('');
                  }}
                  className="input-field flex-1"
                  placeholder="Paste the Team ID"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handlePreviewTeamId}
                  disabled={previewLoading || !joinByIdInput.trim()}
                  className="btn-secondary"
                >
                  {previewLoading ? 'Looking...' : 'Preview'}
                </button>
              </div>

              {previewError && <p className="text-sm text-red-600 mb-4">{previewError}</p>}

              {previewedTeam && (
                <div className="p-4 pro-card-hover mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{previewedTeam.team_name}</h3>
                    {previewedTeam.team_type && previewedTeam.team_type !== 'main' && (
                      <span className="badge badge-blue">
                        {contextTypeEmoji(previewedTeam.team_type)} {contextTypeLabel(previewedTeam.team_type)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{previewedTeam.description || 'No description'}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>
                      {previewedTeam.member_count}/{previewedTeam.max_team_size} members
                    </span>
                    {previewedTeam.owner && <span>Led by {previewedTeam.owner.full_name || previewedTeam.owner.username}</span>}
                  </div>
                  <button
                    onClick={handleJoinPreviewedTeam}
                    disabled={actionLoading[`join-${previewedTeam.team_id}`]}
                    className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
                  >
                    {actionLoading[`join-${previewedTeam.team_id}`] && <span className="spinner w-4 h-4" />}
                    Request to Join
                  </button>
                </div>
              )}

              <button type="button" onClick={() => setShowJoinByIdModal(false)} className="btn-secondary w-full">
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Team Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && selectedTeam && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowSettingsModal(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="settings-modal-title" className="text-xl font-bold text-gray-900">
                  Team Settings
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Team Name *</label>
                  <input
                    type="text"
                    value={selectedTeam.team_name}
                    onChange={(e) => setSelectedTeam({ ...selectedTeam, team_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={selectedTeam.description}
                    onChange={(e) => setSelectedTeam({ ...selectedTeam, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeam.is_public}
                      onChange={(e) => setSelectedTeam({ ...selectedTeam, is_public: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public team (discoverable)</span>
                  </label>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button type="button" onClick={() => setShowSettingsModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Destructive Action Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setConfirmModal((prev) => ({ ...prev, isOpen: false }));
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md relative"
            >
              <h2 id="confirm-modal-title" className="text-xl font-bold text-gray-900 mb-2">
                {confirmModal.title}
              </h2>
              <p className="text-sm text-gray-600 mb-6">{confirmModal.message}</p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const action = confirmModal.onConfirm;
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                    await action();
                  }}
                  className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 text-white"
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
