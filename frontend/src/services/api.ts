import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.PROD ? 'https://commandcenter-backend.vercel.app/api' : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add response error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    // Log error for debugging
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    return Promise.reject(error);
  }
);

// Auth
export const register = (data: { email: string; username: string; fullName: string; password: string }) =>
  api.post('/auth/register', data);

export const login = (data: { email: string; password: string }) =>
  api.post('/auth/login', data);

export const verifyEmail = (token: string) =>
  api.post('/auth/verify-email', { token });

export const resendVerification = (email: string) =>
  api.post('/auth/resend-verification', { email });

// Logs
export const createLog = (entryText: string) =>
  api.post('/logs', { entryText });

export const getMyLogs = (limit?: number) =>
  api.get('/logs/my', { params: { limit } });

export const updateLog = (logId: string, entryText: string) =>
  api.put(`/logs/${logId}`, { entryText });

export const getLogSuggestions = () =>
  api.get('/logs/suggestions');

export const getProductivityInsights = () =>
  api.get('/logs/insights');

// Teams
export const createTeam = (teamName: string, description: string, isPublic?: boolean, maxTeamSize?: number, parentTeamId?: string, department?: string, teamType?: string) =>
  api.post('/teams', { teamName, description, isPublic, maxTeamSize, parentTeamId, department, teamType });

export const getMyTeams = () =>
  api.get('/teams/my');

export const getAllTeams = () =>
  api.get('/teams');

export const getSubTeams = (teamId: string) =>
  api.get(`/teams/${teamId}/sub-teams`);

// Milestone 50: safe, minimal team info by exact ID -- backend (M48) has
// no membership/discoverability gate on this by design (see
// docs/security/SECURITY_FINDINGS.md §20 for why that's not a new
// exposure), so this is the "preview before you request to join" half of
// the Team ID join flow requestJoinTeam already supported unpreviewed.
export const getTeamPreview = (teamId: string) =>
  api.get(`/teams/${teamId}/preview`);

// Milestone 50: M49's daily-work submission history for a team -- used
// only for the neutral "submitted today / not yet" indicator on a
// classroom/hackathon overview, never a productivity score.
export const getTeamWorkSubmissions = (teamId: string, date?: string) =>
  api.get(`/teams/${teamId}/work-submissions`, { params: date ? { date } : undefined });

// Milestone 51: owner/admin-of-the-parent-team-only (backend-enforced via
// the same requireTeamRole every other owner/admin route uses) --
// returns only aggregate counts/booleans about child teams, never their
// member lists, blocker/task content, or daily-work text. Attempt this
// only when the frontend already knows the caller is owner/admin of the
// selected team (see Teams.tsx) -- a 403 here is a real, backend-enforced
// rejection either way, this is just avoiding a pointless failed request.
export const getContextDashboard = (teamId: string) =>
  api.get(`/teams/${teamId}/context-dashboard`);

// Milestone 52: the create/summarize/submit half of M49's daily work
// model -- getTeamWorkSubmissions (above) already covers the read side.
// Every call is team-scoped by design (the backend requires teamId on
// each); Pulse.tsx gates all four behind an explicitly user-selected team,
// never a default.
export const createWorkEntry = (teamId: string, entryText: string) =>
  api.post('/work-entries', { teamId, entryText });

export const getTodaysWorkEntries = (teamId: string) =>
  api.get('/work-entries/today', { params: { teamId } });

export const summarizeWork = (teamId: string) =>
  api.post('/work-entries/summarize', { teamId });

export const submitWork = (teamId: string, confirmedSummary: string, aiSummary?: string) =>
  api.post('/work-entries/submit', { teamId, confirmedSummary, aiSummary });

// Milestone 53: personal history only -- backend scopes the query to the
// authenticated caller's own user_id, so this can never return another
// member's submissions. Bounded at 30 by default (no pagination/date-range
// browsing -- explicitly deferred).
export const getWorkHistory = (teamId: string, limit?: number) =>
  api.get('/work-entries/history', { params: { teamId, limit } });

export const getDepartments = () =>
  api.get('/teams/departments');

export const getTeamMembers = (teamId: string) =>
  api.get(`/teams/${teamId}/members`);

export const addTeamMember = (teamId: string, userId: string, role?: string) =>
  api.post(`/teams/${teamId}/members`, { userId, role });

export const removeTeamMember = (teamId: string, userId: string) =>
  api.delete(`/teams/${teamId}/members/${userId}`);

export const updateMemberRole = (teamId: string, userId: string, role: string) =>
  api.put(`/teams/${teamId}/members/${userId}/role`, { role });

export const updateMemberPermissions = (teamId: string, userId: string, permissions: any) =>
  api.put(`/teams/${teamId}/members/${userId}/permissions`, { permissions });

export const inviteByEmail = (teamId: string, email: string) =>
  api.post(`/teams/${teamId}/invite`, { email });

export const requestJoinTeam = (teamId: string) =>
  api.post(`/teams/${teamId}/join`);

export const getJoinRequests = (teamId: string) =>
  api.get(`/teams/${teamId}/join-requests`);

// Milestone 50: the requester's own pending/rejected join requests --
// powers the "Waiting for team leader approval" empty state, which had
// no data source before this.
export const getMyJoinRequests = () =>
  api.get('/join-requests/my');

export const approveJoinRequest = (requestId: string) =>
  api.post(`/join-requests/${requestId}/approve`);

export const rejectJoinRequest = (requestId: string) =>
  api.post(`/join-requests/${requestId}/reject`);

export const leaveTeam = (teamId: string) =>
  api.post(`/teams/${teamId}/leave`);

export const updateTeamSettings = (teamId: string, settings: any) =>
  api.put(`/teams/${teamId}/settings`, settings);

export const getMyInvites = () =>
  api.get('/invites/my');

export const acceptInvite = (inviteId: string) =>
  api.post(`/invites/${inviteId}/accept`);

export const rejectInvite = (inviteId: string) =>
  api.post(`/invites/${inviteId}/reject`);

export const searchTeams = (query: string) =>
  api.get('/teams/search', { params: { q: query } });

export const getAllUsers = () =>
  api.get('/users');

// Projects
export const createProject = (data: any) =>
  api.post('/projects', data);

export const getMyProjects = () =>
  api.get('/projects/my');

export const getTeamProjects = (teamId: string) =>
  api.get(`/teams/${teamId}/projects`);

export const updateProject = (projectId: string, data: any) =>
  api.put(`/projects/${projectId}`, data);

export const deleteProject = (projectId: string) =>
  api.delete(`/projects/${projectId}`);

export const analyzeProject = (data: any) =>
  api.post('/projects/analyze', data);

export const createTask = (projectId: string, data: any) =>
  api.post(`/projects/${projectId}/tasks`, data);

export const getProjectTasks = (projectId: string) =>
  api.get(`/projects/${projectId}/tasks`);

export const updateTask = (taskId: string, data: any) =>
  api.put(`/tasks/${taskId}`, data);

export const deleteTask = (taskId: string) =>
  api.delete(`/tasks/${taskId}`);

export const getMyTasks = () =>
  api.get('/tasks/my');

// Leaderboard
export const getLeaderboard = (period?: string) =>
  api.get('/leaderboard', { params: { period } });

// SOS Hub
export const createBlocker = (data: any) =>
  api.post('/blockers', data);

export const getTeamBlockers = (teamId: string) =>
  api.get(`/teams/${teamId}/blockers`);

export const updateBlocker = (blockerId: string, data: any) =>
  api.put(`/blockers/${blockerId}`, data);

export const sendMessage = (blockerId: string, messageText: string) =>
  api.post(`/blockers/${blockerId}/messages`, { messageText });

export const getMessages = (blockerId: string) =>
  api.get(`/blockers/${blockerId}/messages`);

export const getAIAdvice = (blockerId: string) =>
  api.get(`/blockers/${blockerId}/ai-advice`);

export const chatWithAI = (message: string, context: string) =>
  api.post('/ai/chat', { message, context });

export const generateStandup = (teamId?: string) =>
  api.get('/logs/standup', { params: { teamId } });

// Goals
export const createGoal = (data: any) =>
  api.post('/goals', data);

export const getGoals = (params?: string) =>
  api.get(`/goals${params || ''}`);

export const getGoalHierarchy = (params?: string) =>
  api.get(`/goals/hierarchy${params || ''}`);

export const getGoalProgress = (goalId: string) =>
  api.get(`/goals/${goalId}/progress`);

export const updateGoal = (goalId: string, data: any) =>
  api.put(`/goals/${goalId}`, data);

export const deleteGoal = (goalId: string) =>
  api.delete(`/goals/${goalId}`);

export default api;
