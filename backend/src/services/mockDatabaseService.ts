// Mock Database Service for Testing
// This simulates PostgreSQL behavior without requiring actual database connection

export class MockDatabaseService {
  private users: any[] = [];
  private teams: any[] = [];
  private projects: any[] = [];
  private logs: any[] = [];
  private goals: any[] = [];
  private blockers: any[] = [];
  private tasks: any[] = [];
  private teamMembers: any[] = [];
  private invites: any[] = [];

  constructor() {
    console.log('📝 Using Mock Database Service for testing');
  }

  // Override query methods to use in-memory storage
  private async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    console.log(`Mock Query: ${text}`, params);
    // Simulate async database operation
    await new Promise(resolve => setTimeout(resolve, 10));
    return [];
  }

  private async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    console.log(`Mock Query One: ${text}`, params);
    await new Promise(resolve => setTimeout(resolve, 10));
    return null;
  }

  // Test database connection
  async testConnection() {
    return { success: true, message: 'Mock database connected successfully' };
  }

  // Add mock data methods for testing
  async createTeam(teamData: any) {
    const team = {
      team_id: `team_${Date.now()}`,
      ...teamData,
      created_at: new Date().toISOString()
    };
    this.teams.push(team);
    return team;
  }

  async getUserTeams(userId: string) {
    return this.teams.filter(team => team.created_by === userId);
  }

  async getAllTeams() {
    return this.teams;
  }

  async createUser(userData: any) {
    const user = {
      user_id: `user_${Date.now()}`,
      ...userData,
      created_at: new Date().toISOString()
    };
    this.users.push(user);
    return user;
  }

  async getUserByEmail(email: string) {
    return this.users.find(user => user.email === email) || null;
  }

  async getUserById(userId: string) {
    return this.users.find(user => user.user_id === userId) || null;
  }

  async createLog(logData: any) {
    const log = {
      log_id: `log_${Date.now()}`,
      ...logData,
      created_at: new Date().toISOString()
    };
    this.logs.push(log);
    return log;
  }

  async getUserLogs(userId: string, limit?: number) {
    const userLogs = this.logs.filter(log => log.user_id === userId);
    return limit ? userLogs.slice(0, limit) : userLogs;
  }

  async createProject(projectData: any) {
    const project = {
      project_id: `project_${Date.now()}`,
      ...projectData,
      created_at: new Date().toISOString()
    };
    this.projects.push(project);
    return project;
  }

  async getUserProjects(userId: string) {
    return this.projects.filter(project => project.created_by === userId);
  }

  async createGoal(goalData: any) {
    const goal = {
      goal_id: `goal_${Date.now()}`,
      ...goalData,
      created_at: new Date().toISOString()
    };
    this.goals.push(goal);
    return goal;
  }

  async getUserGoals(userId: string) {
    return this.goals.filter(goal => goal.created_by === userId);
  }

  async createBlocker(blockerData: any) {
    const blocker = {
      blocker_id: `blocker_${Date.now()}`,
      ...blockerData,
      created_at: new Date().toISOString()
    };
    this.blockers.push(blocker);
    return blocker;
  }

  async getTeamBlockers(teamId: string) {
    return this.blockers.filter(blocker => blocker.team_id === teamId);
  }

  // Add other required methods as needed...
  async updateUser(userId: string, updates: any) { return null; }
  async getUserTasks(userId: string) { return []; }
  async getAllUsers() { return this.users; }
  async canAccessProject(userId: string, projectId: string) { return true; }
  async canAccessTeam(userId: string, teamId: string) { return true; }
  async calculateStreak(userId: string) { return 0; }
  async getLogById(logId: string) { return null; }
  async updateLog(logId: string, updates: any) { return null; }
  async updateGoal(goalId: string, updates: any) { return null; }
  async deleteGoal(goalId: string) { return; }
  async calculateGoalProgress(goalId: string) { return { progress: 0, completed: 0, total: 0 }; }
  async getTeamMembers(teamId: string) { return []; }
  async addTeamMember(teamId: string, userId: string, role: string) { return null; }
  async removeTeamMember(teamId: string, userId: string) { return; }
  async createInvite(teamId: string, email: string, userId: string) { return null; }
  async getUserInvites(email: string) { return []; }
  async acceptInvite(inviteId: string, userId: string) { return; }
  async rejectInvite(inviteId: string) { return null; }
  async searchTeams(query: string) { return []; }
  async createJoinRequest(teamId: string, userId: string) { return null; }
  async getTeamJoinRequests(teamId: string) { return []; }
  async approveJoinRequest(requestId: string) { return null; }
  async rejectJoinRequest(requestId: string) { return null; }
  async isTeamOwnerOrAdmin(userId: string, teamId: string) { return false; }
  async updateMemberRole(teamId: string, userId: string, role: string) { return null; }
  async updateMemberPermissions(teamId: string, userId: string, permissions: any) { return; }
  async getAllPublicProjects() { return []; }
  async getProject(projectId: string) { return null; }
  async updateProject(projectId: string, updates: any) { return null; }
  async deleteProject(projectId: string) { return; }
  async getTeamProjects(teamId: string) { return []; }
  async createTask(taskData: any) { return null; }
  async getProjectTasks(projectId: string) { return []; }
  async getTask(taskId: string) { return null; }
  async updateTask(taskId: string, updates: any) { return null; }
  async deleteTask(taskId: string) { return; }
  async getBlocker(blockerId: string) { return null; }
  async getBlockerMessages(blockerId: string) { return []; }
  async createMessage(blockerId: string, userId: string, messageText: string) { return null; }
  async updateBlocker(blockerId: string, updates: any) { return null; }
  async getSubTeams(parentTeamId: string) { return []; }
  async getDepartments() { return []; }
  async getTeamGoals(teamId: string) { return []; }
  async clearAll() { return; }
}

export const mockDbService = new MockDatabaseService();
