import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

export default function SOSHub() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [blockers, setBlockers] = useState<any[]>([]);
  const [selectedBlocker, setSelectedBlocker] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [aiAdvice, setAiAdvice] = useState('');
  const [loading, setLoading] = useState(false);

  const [newBlocker, setNewBlocker] = useState({
    title: '',
    description: '',
    blockerType: 'technical',
    severity: 'medium',
  });

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      loadBlockers();
      const interval = setInterval(loadBlockers, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedTeam]);

  useEffect(() => {
    if (selectedBlocker) {
      loadMessages();
      const interval = setInterval(loadMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedBlocker]);

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setTeams(response.data.data);
      if (response.data.data.length > 0) {
        setSelectedTeam(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  const loadBlockers = async () => {
    if (!selectedTeam) return;
    try {
      const response = await api.getTeamBlockers(selectedTeam.team_id);
      setBlockers(response.data.data);
    } catch (error) {
      console.error('Failed to load blockers:', error);
    }
  };

  const loadMessages = async () => {
    if (!selectedBlocker) return;
    try {
      const response = await api.getMessages(selectedBlocker.blocker_id);
      setMessages(response.data.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    try {
      await api.createBlocker({ ...newBlocker, teamId: selectedTeam.team_id });
      setShowCreateModal(false);
      setNewBlocker({ title: '', description: '', blockerType: 'technical', severity: 'medium' });
      loadBlockers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create blocker');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlocker || !newMessage.trim()) return;
    try {
      await api.sendMessage(selectedBlocker.blocker_id, newMessage);
      setNewMessage('');
      loadMessages();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send message');
    }
  };

  const handleResolve = async () => {
    if (!selectedBlocker) return;
    try {
      await api.updateBlocker(selectedBlocker.blocker_id, { status: 'resolved' });
      setSelectedBlocker(null);
      loadBlockers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to resolve blocker');
    }
  };

  const handleGetAIAdvice = async () => {
    if (!selectedBlocker) return;
    setLoading(true);
    try {
      const response = await api.getAIAdvice(selectedBlocker.blocker_id);
      setAiAdvice(response.data.data.advice);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to get AI advice');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: any = { low: 'green', medium: 'yellow', high: 'red' };
    return colors[severity] || 'gray';
  };

  const getStatusColor = (status: string) => {
    const colors: any = { open: 'red', in_progress: 'yellow', resolved: 'green' };
    return colors[status] || 'gray';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">SOS Hub</h1>
              <p className="text-gray-600 mt-1">Get help with blockers and challenges</p>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              🆘 Report Blocker
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="pro-card p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Teams</h2>
              <div className="space-y-2">
                {teams.map((team) => (
                  <button
                    key={team.team_id}
                    onClick={() => { setSelectedTeam(team); setSelectedBlocker(null); }}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedTeam?.team_id === team.team_id
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{team.team_name}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Active Blockers</h2>
              <div className="space-y-2">
                {blockers.filter(b => b.status !== 'resolved').map((blocker) => (
                  <button
                    key={blocker.blocker_id}
                    onClick={() => setSelectedBlocker(blocker)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedBlocker?.blocker_id === blocker.blocker_id
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm">{blocker.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`badge badge-${getSeverityColor(blocker.severity)} text-xs`}>
                        {blocker.severity}
                      </span>
                      <span className="text-xs text-gray-500">{blocker.message_count} msgs</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            {selectedBlocker ? (
              <div className="space-y-6">
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedBlocker.title}</h2>
                      <p className="text-gray-600 mt-2">{selectedBlocker.description}</p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className={`badge badge-${getSeverityColor(selectedBlocker.severity)}`}>
                          {selectedBlocker.severity} severity
                        </span>
                        <span className={`badge badge-${getStatusColor(selectedBlocker.status)}`}>
                          {selectedBlocker.status}
                        </span>
                        <span className="badge badge-gray">{selectedBlocker.blocker_type}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleGetAIAdvice} disabled={loading} className="btn-secondary">
                        🤖 AI Help
                      </button>
                      {selectedBlocker.status !== 'resolved' && (
                        <button onClick={handleResolve} className="btn-primary">
                          ✅ Resolve
                        </button>
                      )}
                    </div>
                  </div>

                  {aiAdvice && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-purple-50 border border-purple-200 rounded-lg mb-4"
                    >
                      <div className="font-semibold text-purple-900 mb-2">🤖 AI Mentor Advice</div>
                      <p className="text-purple-800 whitespace-pre-wrap">{aiAdvice}</p>
                      <button onClick={() => setAiAdvice('')} className="text-purple-600 text-sm mt-2">
                        Hide
                      </button>
                    </motion.div>
                  )}
                </div>

                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Discussion</h3>
                  <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
                    {messages.map((msg) => (
                      <div
                        key={msg.message_id}
                        className={`flex gap-3 ${msg.user_id === user?.user_id ? 'flex-row-reverse' : ''}`}
                      >
                        <div className="avatar w-8 h-8 text-xs flex-shrink-0">
                          {msg.user?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className={`flex-1 ${msg.user_id === user?.user_id ? 'text-right' : ''}`}>
                          <div className="text-xs text-gray-600 mb-1">
                            {msg.user?.full_name} • {new Date(msg.created_at).toLocaleTimeString()}
                          </div>
                          <div className={`inline-block p-3 rounded-lg ${
                            msg.user_id === user?.user_id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}>
                            {msg.message_text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="input-field flex-1"
                    />
                    <button type="submit" className="btn-primary">
                      Send
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="pro-card p-12 text-center">
                <div className="text-6xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Blocker Selected</h3>
                <p className="text-gray-600">Select a blocker or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Report Blocker</h2>
              <form onSubmit={handleCreateBlocker} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={newBlocker.title}
                    onChange={(e) => setNewBlocker({ ...newBlocker, title: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newBlocker.description}
                    onChange={(e) => setNewBlocker({ ...newBlocker, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <select
                      value={newBlocker.blockerType}
                      onChange={(e) => setNewBlocker({ ...newBlocker, blockerType: e.target.value })}
                      className="input-field"
                    >
                      <option value="technical">Technical</option>
                      <option value="resource">Resource</option>
                      <option value="dependency">Dependency</option>
                      <option value="clarity">Clarity</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
                    <select
                      value={newBlocker.severity}
                      onChange={(e) => setNewBlocker({ ...newBlocker, severity: e.target.value })}
                      className="input-field"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Blocker'}
                  </button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
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
