import { pgPool } from './database';

export interface Team {
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

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  permissions: any;
  joined_at: Date;
}

export class TeamDatabase {
  // Create team
  async createTeam(
    teamName: string,
    description: string,
    createdBy: string,
    isPublic: boolean = true,
    maxTeamSize: number = 10,
    isDiscoverable: boolean = true,
    parentTeamId?: string,
    department?: string,
    teamType: string = 'main'
  ): Promise<Team> {
    const result = await pgPool.query(`
      INSERT INTO teams (team_name, description, created_by, is_public, is_discoverable, max_team_size, parent_team_id, department, team_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [teamName, description, createdBy, isPublic, isDiscoverable, maxTeamSize, parentTeamId, department, teamType]);
    
    return result.rows[0];
  }

  // Get all public discoverable teams
  async getAllTeams(): Promise<Team[]> {
    const result = await pgPool.query(`
      SELECT * FROM teams 
      WHERE is_public = true AND is_discoverable = true 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  // Get user's teams
  async getUserTeams(userId: string): Promise<Team[]> {
    const result = await pgPool.query(`
      SELECT t.* FROM teams t
      INNER JOIN team_members tm ON t.team_id = tm.team_id
      WHERE tm.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);
    return result.rows;
  }

  // Get team by ID
  async getTeam(teamId: string): Promise<Team | null> {
    const result = await pgPool.query(`
      SELECT * FROM teams WHERE team_id = $1
    `, [teamId]);
    return result.rows[0] || null;
  }

  // Add team member
  async addTeamMember(teamId: string, userId: string, role: string = 'member'): Promise<void> {
    await pgPool.query(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, user_id) DO NOTHING
    `, [teamId, userId, role]);
  }

  // Get team members
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const result = await pgPool.query(`
      SELECT tm.*, u.full_name, u.username, u.email
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.user_id
      WHERE tm.team_id = $1
      ORDER BY tm.joined_at ASC
    `, [teamId]);
    return result.rows;
  }

  // Remove team member
  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await pgPool.query(`
      DELETE FROM team_members WHERE team_id = $1 AND user_id = $2
    `, [teamId, userId]);
  }

  // Search teams
  async searchTeams(query: string): Promise<Team[]> {
    const result = await pgPool.query(`
      SELECT * FROM teams 
      WHERE is_public = true AND is_discoverable = true 
      AND (team_name ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
    `, [`%${query}%`]);
    return result.rows;
  }

  // Create invitation
  async createInvite(teamId: string, email: string, invitedBy: string): Promise<any> {
    const result = await pgPool.query(`
      INSERT INTO team_invites (team_id, email, invited_by, status, created_at)
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING *
    `, [teamId, email, invitedBy]);
    return result.rows[0];
  }

  // Get user's invites
  async getUserInvites(email: string): Promise<any[]> {
    const result = await pgPool.query(`
      SELECT ti.*, t.team_name, u.full_name as inviter_name
      FROM team_invites ti
      INNER JOIN teams t ON ti.team_id = t.team_id
      INNER JOIN users u ON ti.invited_by = u.user_id
      WHERE ti.email = $1 AND ti.status = 'pending'
      ORDER BY ti.created_at DESC
    `, [email]);
    return result.rows;
  }

  // Accept invite
  async acceptInvite(inviteId: string, userId: string): Promise<void> {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      
      // Get invite details
      const inviteResult = await client.query(`
        SELECT team_id, email FROM team_invites WHERE invite_id = $1
      `, [inviteId]);
      
      if (inviteResult.rows.length === 0) {
        throw new Error('Invite not found');
      }
      
      const invite = inviteResult.rows[0];
      
      // Add user to team
      await client.query(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (team_id, user_id) DO NOTHING
      `, [invite.team_id, userId]);
      
      // Mark invite as accepted
      await client.query(`
        UPDATE team_invites SET status = 'accepted', accepted_at = NOW()
        WHERE invite_id = $1
      `, [inviteId]);
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const teamDB = new TeamDatabase();
