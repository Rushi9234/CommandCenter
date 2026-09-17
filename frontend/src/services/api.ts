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

export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = (token: string, newPassword: string) =>
  api.post('/auth/reset-password', { token, newPassword });

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

export const getTeamPreview = (teamId: string) =>
  api.get(`/teams/${teamId}/preview`);

export const getTeamWorkSubmissions = (teamId: string, date?: string) =>
  api.get(`/teams/${teamId}/work-submissions`, { params: date ? { date } : undefined });

export const getContextDashboard = (teamId: string) =>
  api.get(`/teams/${teamId}/context-dashboard`);

export const getWorklog = (teamId: string, limit?: number) =>
  api.get(`/teams/${teamId}/worklog`, { params: { limit } });

export const getAttention = (teamId: string) =>
  api.get(`/teams/${teamId}/attention`);

export const getMyAttention = () =>
  api.get('/attention/me');

export const getTeamAttentionDetails = (teamId: string) =>
  api.get(`/attention/teams/${teamId}`);

export const getClassroomAttentionDetails = (teamId: string) =>
  api.get(`/attention/classrooms/${teamId}`);


export const createWorkEntry = (teamId: string, entryText: string) =>
  api.post('/work-entries', { teamId, entryText });

export const getTodaysWorkEntries = (teamId: string) =>
  api.get('/work-entries/today', { params: { teamId } });

export const summarizeWork = (teamId: string) =>
  api.post('/work-entries/summarize', { teamId });

export const submitWork = (teamId: string, confirmedSummary: string, aiSummary?: string) =>
  api.post('/work-entries/submit', { teamId, confirmedSummary, aiSummary });

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

export const getPublicProjects = () =>
  api.get('/projects/public');

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

export const submitTaskForReview = (taskId: string, notes?: string) =>
  api.post(`/tasks/${taskId}/submit`, { notes });

export const approveTask = (taskId: string) =>
  api.post(`/tasks/${taskId}/approve`);

export const requestTaskChanges = (taskId: string, reason: string) =>
  api.post(`/tasks/${taskId}/request-changes`, { reason });

export const createBatchTeamTasks = (classId: string, data: any) =>
  api.post(`/classrooms/${classId}/batch-tasks`, data);

export const searchClassroomMembers = (classId: string, queryStr?: string) =>
  api.get(`/classrooms/${classId}/members/search`, { params: { q: queryStr } });

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

export const getGoalEvidence = (goalId: string) =>
  api.get(`/goals/${goalId}/evidence`);

export const updateGoal = (goalId: string, data: any) =>
  api.put(`/goals/${goalId}`, data);

export const deleteGoal = (goalId: string) =>
  api.delete(`/goals/${goalId}`);

export const submitGoalForReview = (goalId: string, requestedStatus?: string) =>
  api.post(`/goals/${goalId}/submit-review`, requestedStatus ? { requestedStatus } : {});

export const approveGoal = (goalId: string) =>
  api.post(`/goals/${goalId}/approve`);

export const returnGoal = (goalId: string, status?: string) =>
  api.post(`/goals/${goalId}/return`, status ? { status } : {});

export const approveGoalCreation = (goalId: string) =>
  api.post(`/goals/${goalId}/approve-creation`);

export const rejectGoalCreation = (goalId: string) =>
  api.post(`/goals/${goalId}/reject-creation`);

// Profile
export const getMyProfile = () =>
  api.get('/users/me');

export const updateMyProfile = (data: Record<string, any>) =>
  api.put('/users/me/profile', data);

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/users/me/change-password', { current_password: currentPassword, new_password: newPassword });

export const requestEmailChange = (newEmail: string, currentPassword: string) =>
  api.post('/users/me/request-email-change', { new_email: newEmail, current_password: currentPassword });

export const resendEmailChangeVerification = () =>
  api.post('/users/me/resend-email-change-verification');

export const verifyEmailChange = (token: string) =>
  api.post('/auth/verify-email-change', { token });

export const requestPhoneVerification = (phoneNumber: string) =>
  api.post('/users/me/request-phone-verification', { phone_number: phoneNumber });

export const resendPhoneVerification = () =>
  api.post('/users/me/resend-phone-verification');

export const verifyPhone = (code: string) =>
  api.post('/users/me/verify-phone', { code });

export const uploadAvatar = (formData: FormData) => {
  const uploadApi = axios.create({
    baseURL: import.meta.env.PROD ? 'https://commandcenter-backend.vercel.app/api' : '/api',
    timeout: 30000,
  });

  uploadApi.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return uploadApi.post('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const setPresetAvatar = (preset_id: string) =>
  api.post('/users/me/avatar/preset', { preset_id });

export const deleteAvatar = () =>
  api.delete('/users/me/avatar');

// Notifications
export const getMyNotifications = (limit = 20, offset = 0) =>
  api.get(`/notifications?limit=${limit}&offset=${offset}`);

export const markNotificationRead = (notificationId: string) =>
  api.put(`/notifications/${notificationId}/read`);

export const markAllNotificationsRead = () =>
  api.put('/notifications/read-all');

export const getNotificationPreferences = () =>
  api.get('/notifications/preferences');

export const updateNotificationPreferences = (updates: Record<string, boolean>) =>
  api.put('/notifications/preferences', updates);

// Chat V1
export const getChatConversations = () =>
  api.get('/chat/conversations');

export const createDirectConversation = (otherUserId: string) =>
  api.post('/chat/conversations/direct', { other_user_id: otherUserId });

export const createTeamConversation = (teamId: string) =>
  api.post(`/chat/conversations/team/${teamId}`);

export const getChatMessages = (conversationId: string, cursor?: string, limit?: number) =>
  api.get(`/chat/conversations/${conversationId}/messages`, { params: { cursor, limit } });

export const sendChatMessage = (conversationId: string, body: string) =>
  api.post(`/chat/conversations/${conversationId}/messages`, { body });

export const markConversationRead = (conversationId: string) =>
  api.post(`/chat/conversations/${conversationId}/read`);

// Analytics Hub
export const getAnalyticsScopes = () =>
  api.get('/analytics/scopes');

export const getClassAnalytics = (classId: string) =>
  api.get(`/analytics/classes/${classId}`);

export const getTeamAnalytics = (teamId: string) =>
  api.get(`/analytics/teams/${teamId}`);

export const getMemberAnalytics = (memberId: string, teamId?: string) =>
  api.get(`/analytics/members/${memberId}`, { params: teamId ? { teamId } : undefined });

// Project Collaboration
export const requestProjectCollaboration = (projectId: string) =>
  api.post(`/projects/${projectId}/collaborate`);

export const acceptProjectCollaboration = (projectId: string, targetUserId: string) =>
  api.post(`/projects/${projectId}/collaboration/${targetUserId}/accept`);

export const rejectProjectCollaboration = (projectId: string, targetUserId: string) =>
  api.post(`/projects/${projectId}/collaboration/${targetUserId}/reject`);

export const revokeProjectCollaboration = (projectId: string, targetUserId: string) =>
  api.post(`/projects/${projectId}/collaboration/${targetUserId}/revoke`);

export const getProjectCollaborators = (projectId: string) =>
  api.get(`/projects/${projectId}/collaborators`);

export default api;
