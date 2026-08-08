import { query, queryOne, withTransaction, buildSetClause } from '../../db/client';

const TEAM_SETTINGS_UPDATABLE_COLUMNS = [
  'team_name',
  'description',
  'is_public',
  'is_discoverable',
  'max_team_size',
  'parent_team_id',
  'department',
  'team_type',
];

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
      // Milestone 5: the creator is the owner, not an admin -- the two are
      // now distinct roles with different authority (see requireTeamRole
      // usages across every module's routes). Previously this assigned
      // 'admin', which meant no team ever actually had an owner.
      await this.addTeamMember(team.team_id, teamData.created_by, 'owner');
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

  // Milestone 36: same TOCTOU class as removeTeamMemberIfAuthorized --
  // teams.service.ts's addMember (Milestone 27) reads the target's
  // existing role, decides in JS, then calls the plain upsert above with
  // no lock/transaction between the two, so a concurrent role change on
  // an existing member could land in that gap. Postgres supports a WHERE
  // clause on ON CONFLICT ... DO UPDATE -- when it evaluates false, the
  // conflicting row is left completely untouched (no update, and the
  // INSERT doesn't happen either, since the conflict already exists), and
  // RETURNING yields no row, exactly like a blocked DELETE/UPDATE above.
  // Only reachable for an EXISTING member; a brand-new insert has no
  // target role to protect and always proceeds.
  async addTeamMemberIfAuthorized(teamId: string, targetUserId: string, role: string, requesterRole: string) {
    const text = `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        joined_at = CURRENT_TIMESTAMP
      WHERE team_members.role != 'owner'
        AND (team_members.role != 'admin' OR $4 = 'owner')
      RETURNING role
    `;
    return queryOne<any>(text, [teamId, targetUserId, role, requesterRole]);
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

  // Milestone 36: closes the TOCTOU race in teams.service.ts's removeMember
  // -- the old code did a separate getMemberRole() read, decided in JS,
  // then called plain removeTeamMember() with no lock or transaction
  // between the two, so a concurrent role change on the same target could
  // land between the read and the delete and make the authorization
  // decision act on stale data (e.g. an admin's delete of a just-promoted
  // admin could still go through if the promotion committed after the
  // read but before the delete). The WHERE clause here re-checks the
  // target's role as part of the SAME atomic statement Postgres uses to
  // find and lock the row it's deleting -- no other transaction can slip
  // a role change in between "check" and "act" because there is no gap;
  // they're the same statement. Returns the row that was deleted (or null
  // if nothing was, either because the target isn't a member at all, or
  // because the authorization condition blocked it -- the caller
  // distinguishes those with a plain read, used only to shape the error
  // message, never to gate the mutation itself).
  async removeTeamMemberIfAuthorized(teamId: string, targetUserId: string, requesterRole: string) {
    const text = `
      DELETE FROM team_members
      WHERE team_id = $1 AND user_id = $2
        AND role != 'owner'
        AND (role != 'admin' OR $3 = 'owner')
      RETURNING role
    `;
    return queryOne<any>(text, [teamId, targetUserId, requesterRole]);
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

      // Milestone 25: ON CONFLICT DO NOTHING, matching addTeamMember's
      // existing conflict handling for the same table -- accepting an
      // invite to a team you're already a member of (a duplicate invite,
      // or the same invite accepted twice) is treated as a no-op rather
      // than crashing on the team_members(team_id, user_id) unique
      // constraint. The invite is still marked accepted either way, so it
      // doesn't linger as "pending".
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, user_id) DO NOTHING',
        [invite.team_id, userId, 'member']
      );

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

  // Returns the caller's role in the team, or null if they aren't a member
  // at all. This is the one place that reads a user's standing in a team --
  // requireTeamRole (common/middleware/requireTeamRole.ts) calls this
  // instead of each route re-implementing its own membership/role lookup.
  // Replaces isTeamOwnerOrAdmin, which only ever answered a yes/no question
  // for exactly one tier; every team-management action now needs to know
  // the actual role to enforce the owner-vs-admin distinction.
  async getMemberRole(userId: string, teamId: string): Promise<string | null> {
    const text = `
      SELECT role FROM team_members
      WHERE user_id = $1 AND team_id = $2
    `;
    const result = await queryOne<any>(text, [userId, teamId]);
    return result ? result.role : null;
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

  // Milestone 36: same fix as removeTeamMemberIfAuthorized, applied to the
  // role-change path -- the target's current role is re-checked as part
  // of the same atomic UPDATE that performs the change, closing the same
  // TOCTOU window (a concurrent promotion/demotion of the target can no
  // longer land between the old separate read and the old separate
  // write).
  async updateMemberRoleIfAuthorized(teamId: string, targetUserId: string, newRole: string, requesterRole: string) {
    const text = `
      UPDATE team_members
      SET role = $4
      WHERE team_id = $1 AND user_id = $2
        AND role != 'owner'
        AND (role != 'admin' OR $3 = 'owner')
      RETURNING role
    `;
    return queryOne<any>(text, [teamId, targetUserId, requesterRole, newRole]);
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

  // Milestone 5: approve/reject-join-request only had :requestId in the
  // URL, no :teamId -- this lets requireTeamRole resolve which team a
  // request belongs to before checking the caller's role in it.
  async getJoinRequestById(requestId: string) {
    return queryOne<any>('SELECT * FROM join_requests WHERE request_id = $1', [requestId]);
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

      // Milestone 25: same ON CONFLICT DO NOTHING as acceptInvite above --
      // approving a join request for someone already a member (e.g. they
      // separately accepted an invite in the meantime) is a no-op instead
      // of crashing. The request is still marked approved either way.
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, user_id) DO NOTHING',
        [request.team_id, request.user_id, 'member']
      );

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
    const built = buildSetClause(TEAM_SETTINGS_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getTeam(teamId);
    }

    const text = `
      UPDATE teams
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE team_id = $1
      RETURNING *
    `;

    return queryOne(text, [teamId, ...built.values]);
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
