import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as logController from '../controllers/logController';
import * as teamController from '../controllers/teamController';
import * as projectController from '../controllers/projectController';
import * as leaderboardController from '../controllers/leaderboardController';
import * as sosController from '../controllers/sosController';
import * as aiController from '../controllers/aiController';
import * as privacyController from '../controllers/privacyController';
import * as goalController from '../controllers/goalController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/verify-email', authController.verifyEmail);
router.post('/auth/resend-verification', authController.resendVerification);

// Log routes (protected)
router.post('/logs', authenticate, logController.createLog);
router.get('/logs/my', authenticate, logController.getMyLogs);
router.get('/logs/suggestions', authenticate, logController.getSuggestions);
router.get('/logs/insights', authenticate, logController.getInsights);
router.get('/logs/standup', authenticate, logController.getStandup);
router.put('/logs/:logId', authenticate, logController.updateLog);

// Team routes (protected)
router.post('/teams', authenticate, teamController.createTeam);
router.get('/teams', authenticate, teamController.getAllTeams);
router.get('/teams/my', authenticate, teamController.getMyTeams);
router.get('/teams/search', authenticate, teamController.searchTeams);
router.get('/teams/departments', authenticate, teamController.getDepartments);
router.get('/teams/:teamId/members', authenticate, teamController.getTeamMembers);
router.get('/teams/:teamId/sub-teams', authenticate, teamController.getSubTeams);
router.post('/teams/:teamId/members', authenticate, teamController.addMember);
router.post('/teams/:teamId/invite', authenticate, teamController.inviteMember);
router.post('/teams/:teamId/join', authenticate, teamController.requestJoin);
router.get('/teams/:teamId/join-requests', authenticate, teamController.getJoinRequests);
router.post('/teams/:teamId/leave', authenticate, teamController.leaveTeam);
router.put('/teams/:teamId/settings', authenticate, teamController.updateTeamSettings);
router.delete('/teams/:teamId/members/:userId', authenticate, teamController.removeMember);
router.put('/teams/:teamId/members/:userId/role', authenticate, teamController.updateMemberRole);
router.put('/teams/:teamId/members/:userId/permissions', authenticate, teamController.updateMemberPermissions);
router.post('/join-requests/:requestId/approve', authenticate, teamController.approveJoinRequest);
router.post('/join-requests/:requestId/reject', authenticate, teamController.rejectJoinRequest);
router.get('/invites/my', authenticate, teamController.getMyInvites);
router.post('/invites/:inviteId/accept', authenticate, teamController.acceptInvite);
router.post('/invites/:inviteId/reject', authenticate, teamController.rejectInvite);
router.get('/users', authenticate, teamController.getAllUsers);

// Project routes (protected)
router.get('/projects/public', authenticate, projectController.getAllPublicProjects);
router.get('/projects/:projectId/details', authenticate, projectController.getProjectDetails);
router.post('/projects', authenticate, projectController.createProject);
router.get('/projects/my', authenticate, projectController.getMyProjects);
router.get('/teams/:teamId/projects', authenticate, projectController.getTeamProjects);
router.put('/projects/:projectId', authenticate, projectController.updateProject);
router.delete('/projects/:projectId', authenticate, projectController.deleteProject);
router.post('/projects/analyze', authenticate, projectController.analyzeProject);
router.post('/projects/:projectId/tasks', authenticate, projectController.createTask);
router.get('/projects/:projectId/tasks', authenticate, projectController.getProjectTasks);
router.put('/tasks/:taskId', authenticate, projectController.updateTask);
router.delete('/tasks/:taskId', authenticate, projectController.deleteTask);
router.get('/tasks/my', authenticate, projectController.getMyTasks);

// Leaderboard routes (protected)
router.get('/leaderboard', authenticate, leaderboardController.getLeaderboard);

// SOS Hub routes (protected)
router.post('/blockers', authenticate, sosController.createBlocker);
router.get('/teams/:teamId/blockers', authenticate, sosController.getTeamBlockers);
router.put('/blockers/:blockerId', authenticate, sosController.updateBlocker);
router.post('/blockers/:blockerId/messages', authenticate, sosController.sendMessage);
router.get('/blockers/:blockerId/messages', authenticate, sosController.getMessages);
router.get('/blockers/:blockerId/ai-advice', authenticate, sosController.getAIMentorAdvice);

// AI routes (protected)
router.post('/ai/chat', authenticate, aiController.chat);

// Privacy routes (protected)
router.get('/privacy/settings', authenticate, privacyController.getPrivacySettings);
router.put('/privacy/settings', authenticate, privacyController.updatePrivacySettings);
router.get('/privacy/export', authenticate, privacyController.exportUserData);
router.post('/privacy/delete', authenticate, privacyController.deleteUserData);

// Goal routes (protected)
router.post('/goals', authenticate, goalController.createGoal);
router.get('/goals', authenticate, goalController.getGoals);
router.get('/goals/hierarchy', authenticate, goalController.getGoalHierarchy);
router.get('/goals/:goalId/progress', authenticate, goalController.getGoalProgress);
router.put('/goals/:goalId', authenticate, goalController.updateGoal);
router.delete('/goals/:goalId', authenticate, goalController.deleteGoal);

export default router;
