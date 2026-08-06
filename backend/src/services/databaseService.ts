// PostgreSQL Database Service - Production Ready
// All database operations centralized here

import { Pool, PoolClient } from 'pg';
import { pgPool } from '../utils/database';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = pgPool;
  }

  // Helper method to execute queries
  private async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Helper method for single row queries
  private async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
  }

  // ===== USER OPERATIONS =====
  
  async createUser(userData: {
    email: string;
    username: string;
    full_name: string;
    password_hash: string;
    role?: string;
  }) {
    const text = `
      INSERT INTO users (email, username, full_name, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      userData.email,
      userData.username,
      userData.full_name,
      userData.password_hash,
      userData.role || 'member'
    ];
    return this.queryOne(text, params);
  }

  async getUserByEmail(email: string) {
    const text = 'SELECT * FROM users WHERE email = $1';
    return this.queryOne(text, [email]);
  }

  async getUserByUsername(username: string) {
    const text = 'SELECT * FROM users WHERE username = $1';
    return this.queryOne(text, [username]);
  }

  async getUserById(userId: string) {
    const text = 'SELECT * FROM users WHERE user_id = $1';
    return this.queryOne(text, [userId]);
  }

  async updateUser(userId: string, updates: Partial<any>) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;
    
    const params = [userId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  // ===== TEAM OPERATIONS =====
  
  async createTeam(teamData: {
    team_name: string;
    description?: string;
    created_by: string;
    is_public?: boolean;
    is_discoverable?: boolean;
    max_team_size?: number;
    parent_team_id?: string;
    department?: string;
    team_type?: string;
  }) {
    const text = `
      INSERT INTO teams (
        team_name, description, created_by, is_public, is_discoverable,
        max_team_size, parent_team_id, department, team_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      teamData.team_name,
      teamData.description || null,
      teamData.created_by,
      teamData.is_public !== false,
      teamData.is_discoverable !== false,
      teamData.max_team_size || 10,
      teamData.parent_team_id || null,
      teamData.department || null,
      teamData.team_type || 'main'
    ];
    
    const team = await this.queryOne(text, params);
    
    // Add creator as admin
    if (team) {
      await this.addTeamMember(team.team_id, teamData.created_by, 'admin');
    }
    
    return team;
  }

  async getTeam(teamId: string) {
    const text = 'SELECT * FROM teams WHERE team_id = $1';
    return this.queryOne(text, [teamId]);
  }

  async getAllTeams() {
    const text = `
      SELECT * FROM teams 
      WHERE is_public = true AND is_discoverable = true
      ORDER BY created_at DESC
    `;
    return this.query(text);
  }

  async getUserTeams(userId: string) {
    const text = `
      SELECT t.* FROM teams t
      INNER JOIN team_members tm ON t.team_id = tm.team_id
      WHERE tm.user_id = $1
      ORDER BY t.created_at DESC
    `;
    return this.query(text, [userId]);
  }

  async addTeamMember(teamId: string, userId: string, role: string = 'member') {
    const text = `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        joined_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return this.queryOne(text, [teamId, userId, role]);
  }

  async getTeamMembers(teamId: string) {
    const text = `
      SELECT 
        tm.*,
        u.user_id,
        u.full_name,
        u.username,
        u.email
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.user_id
      WHERE tm.team_id = $1
      ORDER BY tm.joined_at ASC
    `;
    return this.query(text, [teamId]);
  }

  async removeTeamMember(teamId: string, userId: string) {
    const text = 'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2';
    return this.query(text, [teamId, userId]);
  }

  async createInvite(teamId: string, email: string, invitedBy: string) {
    const text = `
      INSERT INTO team_invites (team_id, email, invited_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return this.queryOne(text, [teamId, email, invitedBy]);
  }

  async getUserInvites(email: string) {
    const text = `
      SELECT 
        ti.*,
        t.team_name,
        u.full_name as inviter_name
      FROM team_invites ti
      INNER JOIN teams t ON ti.team_id = t.team_id
      INNER JOIN users u ON ti.invited_by = u.user_id
      WHERE ti.email = $1 AND ti.status = 'pending'
      ORDER BY ti.created_at DESC
    `;
    return this.query(text, [email]);
  }

  async acceptInvite(inviteId: string, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get invite details
      const inviteResult = await client.query(
        'SELECT * FROM team_invites WHERE invite_id = $1',
        [inviteId]
      );
      
      if (inviteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      
      const invite = inviteResult.rows[0];
      
      // Add user to team
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
        [invite.team_id, userId, 'member']
      );
      
      // Update invite status
      await client.query(
        'UPDATE team_invites SET status = $1, accepted_at = CURRENT_TIMESTAMP WHERE invite_id = $2',
        ['accepted', inviteId]
      );
      
      await client.query('COMMIT');
      return invite;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async searchTeams(query: string) {
    const text = `
      SELECT * FROM teams 
      WHERE is_public = true 
        AND is_discoverable = true 
        AND (
          LOWER(team_name) LIKE LOWER($1) OR 
          LOWER(description) LIKE LOWER($1)
        )
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${query}%`;
    return this.query(text, [searchPattern]);
  }

  // ===== PROJECT OPERATIONS =====
  
  async createProject(projectData: {
    project_name: string;
    description?: string;
    created_by: string;
    team_id?: string;
    status?: string;
    priority?: string;
    is_public?: boolean;
    deadline?: Date;
  }) {
    const text = `
      INSERT INTO projects (
        project_name, description, created_by, team_id, status,
        priority, is_public, deadline
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const params = [
      projectData.project_name,
      projectData.description || null,
      projectData.created_by,
      projectData.team_id || null,
      projectData.status || 'planning',
      projectData.priority || 'medium',
      projectData.is_public !== false,
      projectData.deadline || null
    ];
    
    return this.queryOne(text, params);
  }

  async getProject(projectId: string) {
    const text = 'SELECT * FROM projects WHERE project_id = $1';
    return this.queryOne(text, [projectId]);
  }

  async getUserProjects(userId: string) {
    const text = `
      SELECT * FROM projects 
      WHERE created_by = $1 OR team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY created_at DESC
    `;
    return this.query(text, [userId]);
  }

  async getAllPublicProjects() {
    const text = `
      SELECT * FROM projects 
      WHERE is_public = true
      ORDER BY created_at DESC
    `;
    return this.query(text);
  }

  async updateProject(projectId: string, updates: Partial<any>) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE projects 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $1
      RETURNING *
    `;
    
    const params = [projectId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  async deleteProject(projectId: string) {
    const text = 'DELETE FROM projects WHERE project_id = $1';
    return this.query(text, [projectId]);
  }

  // ===== LOG OPERATIONS =====
  
  async createLog(logData: {
    user_id: string;
    entry_text: string;
    log_date: string;
    log_time: string;
    crypto_signature?: string;
    entry_summary?: string;
    bullet_points?: any;
    sentiment_score?: number;
    word_count?: number;
  }) {
    const text = `
      INSERT INTO daily_logs (
        user_id, entry_text, log_date, log_time, crypto_signature,
        entry_summary, bullet_points, sentiment_score, word_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      logData.user_id,
      logData.entry_text,
      logData.log_date,
      logData.log_time,
      logData.crypto_signature || null,
      logData.entry_summary || null,
      JSON.stringify(logData.bullet_points || []),
      logData.sentiment_score || null,
      logData.word_count || logData.entry_text.split(' ').length
    ];
    
    return this.queryOne(text, params);
  }

  async getUserLogs(userId: string, limit?: number) {
    let text = `
      SELECT * FROM daily_logs 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    const params: any[] = [userId];
    
    if (limit) {
      text += ` LIMIT $2`;
      params.push(limit);
    }
    
    return this.query(text, params);
  }

  async updateLog(logId: string, updates: Partial<any>) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE daily_logs 
      SET ${setClause}, is_edited = true, updated_at = CURRENT_TIMESTAMP
      WHERE log_id = $1
      RETURNING *
    `;
    
    const params = [logId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  // ===== GOAL OPERATIONS =====
  
  async createGoal(goalData: {
    title: string;
    description?: string;
    goal_type?: string;
    status?: string;
    progress?: number;
    created_by: string;
    team_id?: string;
    parent_goal_id?: string;
    target_date?: Date;
  }) {
    const text = `
      INSERT INTO goals (
        title, description, goal_type, status, progress,
        created_by, team_id, parent_goal_id, target_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      goalData.title,
      goalData.description || null,
      goalData.goal_type || 'milestone',
      goalData.status || 'planning',
      goalData.progress || 0,
      goalData.created_by,
      goalData.team_id || null,
      goalData.parent_goal_id || null,
      goalData.target_date || null
    ];
    
    return this.queryOne(text, params);
  }

  async getGoal(goalId: string) {
    const text = 'SELECT * FROM goals WHERE goal_id = $1';
    return this.queryOne(text, [goalId]);
  }

  async getUserGoals(userId: string) {
    const text = `
      SELECT * FROM goals 
      WHERE created_by = $1 OR team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY created_at DESC
    `;
    return this.query(text, [userId]);
  }

  async getTeamGoals(teamId: string) {
    const text = `
      SELECT * FROM goals 
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [teamId]);
  }

  async updateGoal(goalId: string, updates: Partial<any>) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE goals 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE goal_id = $1
      RETURNING *
    `;
    
    const params = [goalId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  async deleteGoal(goalId: string) {
    const text = 'DELETE FROM goals WHERE goal_id = $1';
    return this.query(text, [goalId]);
  }

  // Test database connection
  async testConnection() {
    try {
      await this.query('SELECT 1');
      return { success: true, message: 'Database connected successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ===== ADDITIONAL METHODS FOR TEAM CONTROLLER =====
  
  async isTeamOwnerOrAdmin(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT tm.role FROM team_members tm
      WHERE tm.user_id = $1 AND tm.team_id = $2
    `;
    const result = await this.queryOne(text, [userId, teamId]);
    return result ? (result.role === 'owner' || result.role === 'admin') : false;
  }

  async updateMemberRole(teamId: string, userId: string, role: string) {
    const text = `
      UPDATE team_members 
      SET role = $1
      WHERE team_id = $2 AND user_id = $3
      RETURNING *
    `;
    return this.queryOne(text, [role, teamId, userId]);
  }

  async updateMemberPermissions(teamId: string, userId: string, permissions: any) {
    const text = `
      UPDATE team_members 
      SET permissions = $1
      WHERE team_id = $2 AND user_id = $3
      RETURNING *
    `;
    return this.queryOne(text, [JSON.stringify(permissions), teamId, userId]);
  }

  async getAllUsers() {
    const text = `
      SELECT user_id, username, full_name, email, role, impact_score, streak_count, total_logs
      FROM users
      ORDER BY created_at DESC
    `;
    return this.query(text);
  }

  async createJoinRequest(teamId: string, userId: string) {
    const text = `
      INSERT INTO join_requests (team_id, user_id)
      VALUES ($1, $2)
      RETURNING *
    `;
    return this.queryOne(text, [teamId, userId]);
  }

  async getTeamJoinRequests(teamId: string) {
    const text = `
      SELECT * FROM join_requests 
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [teamId]);
  }

  async approveJoinRequest(requestId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get request details
      const requestResult = await client.query(
        'SELECT * FROM join_requests WHERE request_id = $1',
        [requestId]
      );
      
      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      
      const request = requestResult.rows[0];
      
      // Add user to team
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
        [request.team_id, request.user_id, 'member']
      );
      
      // Update request status
      await client.query(
        'UPDATE join_requests SET status = $1 WHERE request_id = $2',
        ['approved', requestId]
      );
      
      await client.query('COMMIT');
      return request;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectJoinRequest(requestId: string) {
    const text = `
      UPDATE join_requests 
      SET status = 'rejected'
      WHERE request_id = $1
      RETURNING *
    `;
    return this.queryOne(text, [requestId]);
  }

  async rejectInvite(inviteId: string) {
    const text = `
      UPDATE team_invites 
      SET status = 'rejected'
      WHERE invite_id = $1
      RETURNING *
    `;
    return this.queryOne(text, [inviteId]);
  }

  async updateTeamSettings(teamId: string, updates: any) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE teams 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE team_id = $1
      RETURNING *
    `;
    
    const params = [teamId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  async deleteTeam(teamId: string) {
    const text = 'DELETE FROM teams WHERE team_id = $1';
    return this.query(text, [teamId]);
  }

  async getSubTeams(parentTeamId: string) {
    const text = `
      SELECT * FROM teams 
      WHERE parent_team_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [parentTeamId]);
  }

  async getDepartments() {
    const text = `
      SELECT DISTINCT department, COUNT(*) as team_count
      FROM teams 
      WHERE department IS NOT NULL
      GROUP BY department
      ORDER BY department
    `;
    return this.query(text);
  }

  // ===== PROJECT TASK METHODS =====
  async createTask(taskData: {
    project_id: string;
    title: string;
    description?: string;
    owner?: string;
    contributors?: any;
    reviewer?: string;
    dependencies?: any;
    priority?: string;
    created_by: string;
  }) {
    const text = `
      INSERT INTO tasks (
        project_id, title, description, owner, contributors, reviewer,
        dependencies, priority, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      taskData.project_id,
      taskData.title,
      taskData.description || null,
      taskData.owner || null,
      JSON.stringify(taskData.contributors || []),
      taskData.reviewer || null,
      JSON.stringify(taskData.dependencies || []),
      taskData.priority || 'medium',
      taskData.created_by
    ];
    
    return this.queryOne(text, params);
  }

  async getProjectTasks(projectId: string) {
    const text = `
      SELECT * FROM tasks 
      WHERE project_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [projectId]);
  }

  async getTask(taskId: string) {
    const text = 'SELECT * FROM tasks WHERE task_id = $1';
    return this.queryOne(text, [taskId]);
  }

  async updateTask(taskId: string, updates: any) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE tasks 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1
      RETURNING *
    `;
    
    const params = [taskId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }

  async deleteTask(taskId: string) {
    const text = 'DELETE FROM tasks WHERE task_id = $1';
    return this.query(text, [taskId]);
  }

  async getUserTasks(userId: string) {
    const text = `
      SELECT t.* FROM tasks t
      INNER JOIN projects p ON t.project_id = p.project_id
      WHERE t.created_by = $1 OR p.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY t.created_at DESC
    `;
    return this.query(text, [userId]);
  }

  // ===== PERMISSION METHODS =====
  async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT p.project_id FROM projects p
      WHERE p.project_id = $1 AND (
        p.created_by = $2 OR 
        p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $2
        )
      )
    `;
    const result = await this.queryOne(text, [projectId, userId]);
    return result !== null;
  }

  async canAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT team_id FROM team_members
      WHERE user_id = $1 AND team_id = $2
    `;
    const result = await this.queryOne(text, [userId, teamId]);
    return result !== null;
  }

  // ===== TEAM PROJECT METHODS =====
  async getTeamProjects(teamId: string) {
    const text = `
      SELECT * FROM projects 
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [teamId]);
  }

  // ===== SOS/BLOCKER METHODS =====
  async getBlocker(blockerId: string) {
    const text = 'SELECT * FROM blockers WHERE blocker_id = $1';
    return this.queryOne(text, [blockerId]);
  }

  async getBlockerMessages(blockerId: string) {
    const text = `
      SELECT m.*, u.username, u.full_name
      FROM messages m
      INNER JOIN users u ON m.user_id = u.user_id
      WHERE m.blocker_id = $1
      ORDER BY m.created_at ASC
    `;
    return this.query(text, [blockerId]);
  }

  async createMessage(blockerId: string, userId: string, messageText: string) {
    const text = `
      INSERT INTO messages (blocker_id, user_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return this.queryOne(text, [blockerId, userId, messageText]);
  }

  // ===== LOG METHODS =====
  async getLogById(logId: string) {
    const text = 'SELECT * FROM daily_logs WHERE log_id = $1';
    return this.queryOne(text, [logId]);
  }

  // ===== GOAL PROGRESS METHODS =====
  async calculateGoalProgress(goalId: string) {
    // Simple progress calculation based on sub-goals
    const text = `
      WITH RECURSIVE goal_tree AS (
        SELECT goal_id, progress, status FROM goals WHERE goal_id = $1
        UNION ALL
        SELECT g.goal_id, g.progress, g.status 
        FROM goals g
        INNER JOIN goal_tree gt ON g.parent_goal_id = gt.goal_id
      )
      SELECT 
        COUNT(*) as total_goals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_goals,
        AVG(progress) as avg_progress
      FROM goal_tree
    `;
    const result = await this.queryOne(text, [goalId]);
    
    if (!result) return { progress: 0, completed: 0, total: 0 };
    
    const total = parseInt(result.total_goals);
    const completed = parseInt(result.completed_goals);
    const avgProgress = parseFloat(result.avg_progress) || 0;
    
    return {
      progress: total > 0 ? Math.round((completed / total) * 100) : avgProgress,
      completed,
      total
    };
  }

  // ===== USER STREAK METHODS =====
  async calculateStreak(userId: string): Promise<number> {
    const text = `
      WITH ordered_logs AS (
        SELECT DISTINCT log_date, 
               log_date - LAG(log_date) OVER (ORDER BY log_date) as gap
        FROM daily_logs 
        WHERE user_id = $1 
        ORDER BY log_date DESC
      )
      SELECT COUNT(*) as streak
      FROM ordered_logs 
      WHERE gap = 1 OR log_date = CURRENT_DATE
    `;
    const result = await this.queryOne(text, [userId]);
    return result ? parseInt(result.streak) : 0;
  }

  // ===== BLOCKER METHODS =====
  async createBlocker(blockerData: {
    team_id: string;
    title: string;
    description?: string;
    blocker_type?: string;
    urgency?: string;
    impact?: string;
    affected_tasks?: any[];
    attempted_solutions?: string;
    created_by: string;
    ai_suggestions?: any[];
    similar_blockers?: any[];
    suggested_helpers?: any[];
  }) {
    const text = `
      INSERT INTO blockers (
        team_id, title, description, blocker_type, urgency, impact,
        affected_tasks, attempted_solutions, created_by, ai_suggestions,
        similar_blockers, suggested_helpers
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const params = [
      blockerData.team_id,
      blockerData.title,
      blockerData.description || null,
      blockerData.blocker_type || 'technical',
      blockerData.urgency || 'medium',
      blockerData.impact || 'blocks_task',
      JSON.stringify(blockerData.affected_tasks || []),
      blockerData.attempted_solutions || null,
      blockerData.created_by,
      JSON.stringify(blockerData.ai_suggestions || []),
      JSON.stringify(blockerData.similar_blockers || []),
      JSON.stringify(blockerData.suggested_helpers || [])
    ];
    
    return this.queryOne(text, params);
  }

  async getTeamBlockers(teamId: string) {
    const text = `
      SELECT * FROM blockers 
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return this.query(text, [teamId]);
  }

  async updateBlocker(blockerId: string, updates: any) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const text = `
      UPDATE blockers 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE blocker_id = $1
      RETURNING *
    `;
    
    const params = [blockerId, ...Object.values(updates)];
    return this.queryOne(text, params);
  }
}

// Export singleton instance
export const dbService = new DatabaseService();
