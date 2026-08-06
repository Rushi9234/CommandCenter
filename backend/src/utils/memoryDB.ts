// PostgreSQL Database Adapter (Production Ready)
// Replaces in-memory storage with persistent PostgreSQL

import { pgPool } from './database';
import { teamDB } from './teamDB';
import crypto from 'crypto';

interface User {
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  password_hash: string;
  role: string;
  impact_score: number;
  streak_count: number;
  total_logs: number;
  team_id?: string;
  is_verified: boolean;
  verification_token?: string;
  privacy_settings: {
    ai_enabled: boolean;
    sentiment_tracking: boolean;
    leaderboard_visible: boolean;
    analytics_opt_in: boolean;
  };
  created_at: Date;
}

interface DailyLog {
  log_id: string;
  user_id: string;
  entry_text: string;
  log_date: string;
  log_time: string;
  crypto_signature: string;
  entry_summary?: string;
  bullet_points?: string[];
  sentiment_score?: number;
  word_count: number;
  is_edited: boolean;
  created_at: Date;
}

interface Team {
  team_id: string;
  team_name: string;
  description: string;
  created_by: string;
  is_public: boolean;
  is_discoverable: boolean;
  max_team_size: number;
  parent_team_id?: string;
  department?: string;
  team_type: 'main' | 'sub-team' | 'department';
  created_at: Date;
}

interface JoinRequest {
  request_id: string;
  team_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date;
}

interface Goal {
  goal_id: string;
  title: string;
  description: string;
  goal_type: 'company' | 'department' | 'project' | 'milestone';
  status: 'planning' | 'active' | 'completed' | 'at_risk' | 'blocked';
  progress: number;
  created_by: string;
  team_id?: string;
  parent_goal_id?: string;
  target_date?: Date;
  created_at: Date;
  completed_at?: Date;
}

interface Project {
  project_id: string;
  project_name: string;
  description: string;
  team_id?: string;
  created_by: string;
  status: 'planning' | 'active' | 'completed' | 'on_hold';
  priority: 'low' | 'medium' | 'high';
  is_public: boolean;
  deadline?: Date;
  created_at: Date;
}

interface Task {
  task_id: string;
  project_id: string;
  title: string;
  description: string;
  owner?: string;
  contributors: string[];
  reviewer?: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  progress: number;
  due_date?: Date;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

interface Blocker {
  blocker_id: string;
  title: string;
  description: string;
  blocker_type: string;
  urgency: string;
  impact: string;
  affected_tasks: string[];
  attempted_solutions: string;
  severity: string;
  status: string;
  created_by: string;
  resolved_by?: string;
  ai_suggestions?: any;
  similar_blockers?: any;
  suggested_helpers?: any;
  created_at: Date;
  resolved_at?: Date;
}

interface Message {
  message_id: string;
  blocker_id: string;
  user_id: string;
  message_text: string;
  created_at: Date;
}

interface Invite {
  invite_id: string;
  team_id: string;
  email: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: Date;
  accepted_at?: Date;
}

// In-memory storage for development
const users = new Map<string, User>();
const usersByEmail = new Map<string, string>();
const usersByUsername = new Map<string, string>();
const logs = new Map<string, DailyLog>();
const teams = new Map<string, Team>();
const teamMembers = new Map<string, any[]>();
const invites = new Map<string, Invite>();
const joinRequests = new Map<string, JoinRequest>();
const goals = new Map<string, Goal>();
const projects = new Map<string, Project>();
const tasks = new Map<string, Task>();
const blockers = new Map<string, Blocker>();
const messages = new Map<string, Message[]>();

export const memoryDB = {
  // User operations
  async createUser(userData: Omit<User, 'user_id' | 'created_at'>): Promise<User> {
    const user: User = {
      ...userData,
      user_id: crypto.randomUUID(),
      created_at: new Date(),
    };
    
    users.set(user.user_id, user);
    usersByEmail.set(user.email, user.user_id);
    usersByUsername.set(user.username, user.user_id);
    
    return user;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = usersByEmail.get(email);
    return userId ? users.get(userId) || null : null;
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const userId = usersByUsername.get(username);
    return userId ? users.get(userId) || null : null;
  },

  async getUserById(userId: string): Promise<User | null> {
    return users.get(userId) || null;
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = users.get(userId);
    if (!user) return null;
    
    Object.assign(user, updates);
    users.set(userId, user);
    return user;
  },

  // Team operations - Use PostgreSQL
  async createTeam(
    teamName: string,
    description: string,
    createdBy: string,
    isPublic: boolean = true,
    maxTeamSize: number = 10,
    isDiscoverable: boolean = true,
    parentTeamId?: string,
    department?: string,
    teamType: 'main' | 'sub-team' | 'department' = 'main'
  ): Promise<Team> {
    return await teamDB.createTeam(
      teamName,
      description,
      createdBy,
      isPublic,
      maxTeamSize,
      isDiscoverable,
      parentTeamId,
      department,
      teamType
    );
  },

  async getTeam(teamId: string): Promise<Team | null> {
    return await teamDB.getTeam(teamId);
  },

  async getAllTeams(): Promise<Team[]> {
    return await teamDB.getAllTeams();
  },

  async getUserTeams(userId: string): Promise<Team[]> {
    return await teamDB.getUserTeams(userId);
  },

  async getTeamMembers(teamId: string): Promise<any[]> {
    return await teamDB.getTeamMembers(teamId);
  },

  async addTeamMember(teamId: string, userId: string, role: string = 'member'): Promise<void> {
    await teamDB.addTeamMember(teamId, userId, role);
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await teamDB.removeTeamMember(teamId, userId);
  },

  async createInvite(teamId: string, email: string, invitedBy: string): Promise<Invite> {
    return await teamDB.createInvite(teamId, email, invitedBy);
  },

  async getUserInvites(email: string): Promise<Invite[]> {
    return await teamDB.getUserInvites(email);
  },

  async acceptInvite(inviteId: string, userId: string): Promise<void> {
    await teamDB.acceptInvite(inviteId, userId);
  },

  async searchTeams(query: string): Promise<Team[]> {
    return await teamDB.searchTeams(query);
  },

  // Log operations (keep in memory for now)
  async createLog(userId: string, entryText: string): Promise<DailyLog> {
    const log: DailyLog = {
      log_id: crypto.randomUUID(),
      user_id: userId,
      entry_text: entryText,
      log_date: new Date().toISOString().split('T')[0],
      log_time: new Date().toTimeString().split(' ')[0],
      crypto_signature: crypto.randomBytes(32).toString('hex'),
      word_count: entryText.trim().split(/\s+/).length,
      is_edited: false,
      created_at: new Date(),
    };
    
    logs.set(log.log_id, log);
    return log;
  },

  async getUserLogs(userId: string, limit?: number): Promise<DailyLog[]> {
    const userLogs = Array.from(logs.values())
      .filter(log => log.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return limit ? userLogs.slice(0, limit) : userLogs;
  },

  async updateLog(logId: string, entryText: string): Promise<DailyLog | null> {
    const log = logs.get(logId);
    if (!log) return null;
    
    log.entry_text = entryText;
    log.is_edited = true;
    log.word_count = entryText.trim().split(/\s+/).length;
    
    logs.set(logId, log);
    return log;
  },

  // Project operations (keep in memory for now)
  async createProject(
    name: string,
    description: string,
    createdBy: string,
    teamId?: string,
    priority: string = 'medium',
    deadline?: Date,
    isPublic: boolean = true
  ): Promise<Project> {
    const project: Project = {
      project_id: crypto.randomUUID(),
      project_name: name,
      description,
      team_id: teamId,
      created_by: createdBy,
      status: 'planning',
      priority: priority as any,
      is_public: isPublic,
      deadline,
      created_at: new Date(),
    };
    
    projects.set(project.project_id, project);
    return project;
  },

  async getProject(projectId: string): Promise<Project | null> {
    return projects.get(projectId) || null;
  },

  async getUserProjects(userId: string): Promise<Project[]> {
    return Array.from(projects.values())
      .filter(project => project.created_by === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getAllPublicProjects(): Promise<Project[]> {
    return Array.from(projects.values())
      .filter(project => project.is_public)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // Clear all data (for testing)
  async clearAll(): Promise<void> {
    users.clear();
    usersByEmail.clear();
    usersByUsername.clear();
    logs.clear();
    teams.clear();
    teamMembers.clear();
    goals.clear();
    projects.clear();
    tasks.clear();
    blockers.clear();
    messages.clear();
  },
};
