import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';

export default function Teams() {
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
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [newTeam, setNewTeam] = useState({
    teamName: '',
    description: '',
    isPublic: true,
    maxTeamSize: 10,
  });

  const [inviteEmail, setInviteEmail] = useState('');

  useEffect(() => {
    loadTeams();
    loadInvites();
    loadAllTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setTeams(response.data.data);
      if (response.data.data.length > 0 && !selectedTeam) {
        selectTeam(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

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

  const selectTeam = async (team: any) => {
    setSelectedTeam(team);
    try {
      const [membersRes, requestsRes] = await Promise.all([
        api.getTeamMembers(team.team_id),
        api.getJoinRequests(team.team_id),
      ]);
      setTeamMembers(membersRes.data.data);
      setJoinRequests(requestsRes.data.data);
    } catch (error) {
      console.error('Failed to load team data:', error);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createTeam(newTeam.teamName, newTeam.description, newTeam.isPublic, newTeam.maxTeamSize);
      setShowCreateModal(false);
      setNewTeam({ teamName: '', description: '', isPublic: true, maxTeamSize: 10 });
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create team');
    } finally {
      setLoading(false);
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
      alert('Invitation sent successfully! The user will receive an email with instructions.');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await api.acceptInvite(inviteId);
      loadInvites();
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to accept invitation');
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      await api.rejectInvite(inviteId);
      loadInvites();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject invitation');
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
      alert('Failed to search teams. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    if (!confirm('Are you sure you want to remove this member?')) return;
    
    try {
      await api.removeTeamMember(selectedTeam.team_id, userId);
      selectTeam(selectedTeam);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!selectedTeam) return;
    try {
      await api.updateMemberRole(selectedTeam.team_id, userId, newRole);
      selectTeam(selectedTeam);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update role');
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    try {
      await api.requestJoinTeam(teamId);
      alert('Join request sent! The team owner will review your request.');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send join request');
    }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
    try {
      await api.approveJoinRequest(requestId);
      if (selectedTeam) selectTeam(selectedTeam);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleRejectJoinRequest = async (requestId: string) => {
    try {
      await api.rejectJoinRequest(requestId);
      if (selectedTeam) selectTeam(selectedTeam);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleLeaveTeam = async () => {
    if (!selectedTeam || !confirm('Are you sure you want to leave this team?')) return;
    try {
      await api.leaveTeam(selectedTeam.team_id);
      setSelectedTeam(null);
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to leave team');
    }
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
      setShowSettingsModal(false);
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-gray-50">
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
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                + Create Team
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
                      className="text-green-600 hover:text-green-700 text-sm font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectInvite(invite.invite_id)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Teams List */}
          <div className="lg:col-span-1">
            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Teams ({teams.length})</h2>
              <div className="space-y-2">
                <AnimatePresence>
                  {teams.map((team, index) => (
                    <motion.button
                      key={team.team_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => selectTeam(team)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedTeam?.team_id === team.team_id
                          ? 'bg-blue-50 border-2 border-blue-500 shadow-sm'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{team.team_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(team.created_at).toLocaleDateString()}
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
                {teams.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No teams yet.<br/>Create one to get started!
                  </p>
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
                      <h2 className="text-2xl font-bold text-gray-900">{selectedTeam.team_name}</h2>
                      <p className="text-gray-600 mt-2">{selectedTeam.description || 'No description provided'}</p>
                      <div className="flex items-center gap-4 mt-4">
                        <span className="badge badge-blue">{teamMembers.length} members</span>
                        <span className={`badge ${selectedTeam.is_public ? 'badge-green' : 'badge-gray'}`}>
                          {selectedTeam.is_public ? '🌐 Public' : '🔒 Private'}
                        </span>
                        <span className="text-sm text-gray-500">
                          Created {new Date(selectedTeam.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowSettingsModal(true)} className="btn-secondary">
                        ⚙️ Settings
                      </button>
                      <button onClick={() => setShowInviteModal(true)} className="btn-primary">
                        📧 Invite
                      </button>
                      <button onClick={handleLeaveTeam} className="btn-secondary text-red-600">
                        🚪 Leave
                      </button>
                    </div>
                  </div>
                </div>

                {/* Members */}
                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>

                  {/* Join Requests */}
                  {joinRequests.length > 0 && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="font-medium text-yellow-900 mb-3">📋 Pending Join Requests ({joinRequests.length})</div>
                      <div className="space-y-2">
                        {joinRequests.map((request) => (
                          <div key={request.request_id} className="flex items-center justify-between bg-white p-3 rounded">
                            <div className="flex items-center gap-3">
                              <div className="avatar w-8 h-8 text-xs">
                                {getInitials(request.user?.full_name || 'U')}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{request.user?.full_name}</div>
                                <div className="text-xs text-gray-500">@{request.user?.username}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApproveJoinRequest(request.request_id)}
                                className="text-green-600 hover:text-green-700 text-sm font-medium px-3 py-1"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectJoinRequest(request.request_id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium px-3 py-1"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <AnimatePresence>
                      {teamMembers.map((member, index) => (
                        <motion.div
                          key={member.user_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center justify-between p-4 pro-card-hover"
                        >
                          <div className="flex items-center gap-3">
                            <div className="avatar w-10 h-10 text-sm">
                              {getInitials(member.user?.full_name || 'U')}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{member.user?.full_name}</div>
                              <div className="text-sm text-gray-500">@{member.user?.username}</div>
                            </div>
                            {member.role === 'owner' && (
                              <span className="badge badge-yellow">👑 Owner</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <select
                              value={member.role}
                              onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                              disabled={member.role === 'owner'}
                              className="input-field text-sm py-1.5"
                            >
                              <option value="owner" disabled>Owner</option>
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </select>

                            {member.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pro-card p-12 text-center"
              >
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Team</h2>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={newTeam.teamName}
                    onChange={(e) => setNewTeam({ ...newTeam, teamName: e.target.value })}
                    className="input-field"
                    placeholder="Engineering Team"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newTeam.description}
                    onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                    placeholder="What does this team do?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Size Limit *
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={newTeam.maxTeamSize}
                    onChange={(e) => setNewTeam({ ...newTeam, maxTeamSize: parseInt(e.target.value) || 10 })}
                    className="input-field"
                    placeholder="Enter team size (2-100)"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Maximum number of team members
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTeam.isPublic}
                      onChange={(e) => setNewTeam({ ...newTeam, isPublic: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public team (discoverable by others)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Private teams require invitation to join
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Team'}
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
      </AnimatePresence>

      {/* Invite by Email Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Invite Team Member</h2>
              <form onSubmit={handleInviteByEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input-field"
                    placeholder="colleague@company.com"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    They'll receive an invitation to join this team
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Sending...' : 'Send Invitation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn-secondary flex-1"
                  >
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-2xl max-h-[80vh] overflow-auto"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Discover Teams</h2>
              
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  placeholder="Search teams by name or description..."
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                {searchLoading ? (
                  <div className="text-center py-8">
                    <div className="spinner w-6 h-6 mx-auto mb-2"></div>
                    <p className="text-gray-500">Searching teams...</p>
                  </div>
                ) : (searchQuery ? searchResults : allTeams).length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    {searchQuery ? 'No teams found' : 'No teams available'}
                  </p>
                ) : (
                  (searchQuery ? searchResults : allTeams).map((team) => (
                    <motion.div
                      key={team.team_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 pro-card-hover"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{team.team_name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{team.description || 'No description'}</p>
                          <div className="flex items-center gap-3 mt-2">
                            {team.owner && (
                              <span className="text-xs text-gray-500">
                                👤 Led by {team.owner.full_name}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {team.member_count || 0} members
                            </span>
                            {team.is_public && <span className="badge badge-green text-xs">Public</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinTeam(team.team_id)}
                          className="btn-primary text-sm"
                        >
                          Request to Join
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowDiscoverModal(false)}
                className="btn-secondary w-full mt-4"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Team Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && selectedTeam && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Team Settings</h2>
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={selectedTeam.team_name}
                    onChange={(e) => setSelectedTeam({ ...selectedTeam, team_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
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
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Public teams can be found and joined by anyone
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
