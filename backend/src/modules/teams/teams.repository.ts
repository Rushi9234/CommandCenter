import { query, queryOne, withTransaction } from '../../db/client';

// Moved verbatim from the old databaseService.ts (team/member/invite/join-
// request methods). deleteTeam was dropped -- grep confirmed zero callers
// anywhere in the app, so it was dead code.
export class TeamsRepository {
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
      teamData.team_type || 'main',
    ];

    const team = await queryOne<any>(text, params);

    if (team) {
      await this.addTeamMember(team.team_id, teamData.created_by, 'admin');
    }

    return team;
  }

  async getTeam(teamId: string) {
    const text = 'SELECT * FROM teams WHERE team_id = $1';
    return queryOne(text, [teamId]);
  }

  async getAllTeams() {
    const text = `
      SELECT * FROM teams
      WHERE is_public = true AND is_discoverable = true
      ORDER BY created_at DESC
    `;
    return query(text);
  }

  async getUserTeams(userId: string) {
    const text = `
      SELECT t.* FROM teams t
      INNER JOIN team_members tm ON t.team_id = tm.team_id
      WHERE tm.user_id = $1
      ORDER BY t.created_at DESC
    `;
    return query(text, [userId]);
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
    return queryOne(text, [teamId, userId, role]);
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
    return query<any>(text, [teamId]);
  }

  async removeTeamMember(teamId: string, userId: string) {
    const text = 'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2';
    return query(text, [teamId, userId]);
  }

  async createInvite(teamId: string, email: string, invitedBy: string) {
    const text = `
      INSERT INTO team_invites (team_id, email, invited_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return queryOne<any>(text, [teamId, email, invitedBy]);
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
    return query<any>(text, [email]);
  }

  async acceptInvite(inviteId: string, userId: string) {
    return withTransaction(async (client) => {
      const inviteResult = await client.query('SELECT * FROM team_invites WHERE invite_id = $1', [inviteId]);

      if (inviteResult.rows.length === 0) {
        return null;
      }

      const invite = inviteResult.rows[0];

      await client.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [
        invite.team_id,
        userId,
        'member',
      ]);

      await client.query(
        'UPDATE team_invites SET status = $1, accepted_at = CURRENT_TIMESTAMP WHERE invite_id = $2',
        ['accepted', inviteId]
      );

      return invite;
    });
  }

  async rejectInvite(inviteId: string) {
    const text = `
      UPDATE team_invites
      SET status = 'rejected'
      WHERE invite_id = $1
      RETURNING *
    `;
    return queryOne(text, [inviteId]);
  }

  async searchTeams(searchQuery: string) {
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
    const searchPattern = `%${searchQuery}%`;
    return query(text, [searchPattern]);
  }

  async isTeamOwnerOrAdmin(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT tm.role FROM team_members tm
      WHERE tm.user_id = $1 AND tm.team_id = $2
    `;
    const result = await queryOne<any>(text, [userId, teamId]);
    return result ? result.role === 'owner' || result.role === 'admin' : false;
  }

  async updateMemberRole(teamId: string, userId: string, role: string) {
    const text = `
      UPDATE team_members
      SET role = $1
      WHERE team_id = $2 AND user_id = $3
      RETURNING *
    `;
    return queryOne(text, [role, teamId, userId]);
  }

  async updateMemberPermissions(teamId: string, userId: string, permissions: any) {
    const text = `
      UPDATE team_members
      SET permissions = $1
      WHERE team_id = $2 AND user_id = $3
      RETURNING *
    `;
    return queryOne(text, [JSON.stringify(permissions), teamId, userId]);
  }

  async createJoinRequest(teamId: string, userId: string) {
    const text = `
      INSERT INTO join_requests (team_id, user_id)
      VALUES ($1, $2)
      RETURNING *
    `;
    return queryOne(text, [teamId, userId]);
  }

  async getTeamJoinRequests(teamId: string) {
    const text = `
      SELECT * FROM join_requests
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return query<any>(text, [teamId]);
  }

  async approveJoinRequest(requestId: string) {
    return withTransaction(async (client) => {
      const requestResult = await client.query('SELECT * FROM join_requests WHERE request_id = $1', [requestId]);

      if (requestResult.rows.length === 0) {
        return null;
      }

      const request = requestResult.rows[0];

      await client.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [
        request.team_id,
        request.user_id,
        'member',
      ]);

      await client.query('UPDATE join_requests SET status = $1 WHERE request_id = $2', ['approved', requestId]);

      return request;
    });
  }

  async rejectJoinRequest(requestId: string) {
    const text = `
      UPDATE join_requests
      SET status = 'rejected'
      WHERE request_id = $1
      RETURNING *
    `;
    return queryOne(text, [requestId]);
  }

  async updateTeamSettings(teamId: string, updates: Record<string, any>) {
    // NOTE: preserved as-is -- same unallowlisted dynamic SET clause as the
    // original. See users.repository.ts for the same note; fixing this is
    // out of scope for this architecture-only milestone.
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
    return queryOne(text, params);
  }

  async getSubTeams(parentTeamId: string) {
    const text = `
      SELECT * FROM teams
      WHERE parent_team_id = $1
      ORDER BY created_at DESC
    `;
    return query(text, [parentTeamId]);
  }

  async getDepartments() {
    const text = `
      SELECT DISTINCT department, COUNT(*) as team_count
      FROM teams
      WHERE department IS NOT NULL
      GROUP BY department
      ORDER BY department
    `;
    return query(text);
  }

  async canAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT team_id FROM team_members
      WHERE user_id = $1 AND team_id = $2
    `;
    const result = await queryOne(text, [userId, teamId]);
    return result !== null;
  }
}

export const teamsRepository = new TeamsRepository();
