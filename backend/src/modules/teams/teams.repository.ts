import { query, queryOne, withTransaction, buildSetClause } from '../../db/client';
import { ConflictError } from '../../common/errors';

// Milestone 47: max_team_size was confirmed decorative (M44/M46's own
// audits) on the assumption it was never surfaced in the frontend -- a
// fresh check found that assumption was wrong: Teams.tsx's create-team
// form has a required "Team Size Limit *" field with the helper text
// "Maximum number of team members", i.e. the product visibly promises
// enforcement that never existed. This SELECT-based INSERT is reused by
// every membership-creation path below (addTeamMemberIfAuthorized,
// acceptInvite, approveJoinRequest). The EXISTS clause makes it a no-op
// gate for a user who is ALREADY a member -- re-inviting/re-approving/
// updating an existing member's role never grows headcount, so it must
// never be blocked by a full team.
//
// IMPORTANT -- this WHERE clause alone is NOT race-safe, unlike the
// single-row conditional statements M36/M39/M40 established (a plain
// row lock naturally serializes two UPDATEs/DELETEs targeting the same
// row). COUNT(*) is a read across potentially-many OTHER rows with no
// single row to lock -- two concurrent callers can each read "count = 2,
// max = 3" before either commits, and both then legitimately pass the
// check, overshooting the cap (a genuine, real bug this milestone's own
// concurrency test caught: 5 concurrent adds against 2 open slots let 3
// through, not 2). `lockTeamForCapacityCheck` (a `SELECT ... FOR UPDATE`
// on the team's own `teams` row, issued as its OWN statement before the
// capacity-gated INSERT) is what actually closes this.
//
// A tempting-looking "optimization" was tried and REJECTED: folding the
// lock into a CTE on the SAME statement as the INSERT (`WITH team_lock AS
// (SELECT ... FOR UPDATE) INSERT ... FROM team_lock WHERE COUNT(*) <
// team_lock.max_team_size`), to avoid a separate round trip. That is
// NOT correct, and this milestone's own concurrency test caught it too
// (successCount came back 3, not 2, on the exact same race): in READ
// COMMITTED, a statement's snapshot is taken once at that statement's
// start. Postgres's EvalPlanQual mechanism re-checks ONLY the specific
// locked row against its latest committed version once the lock is
// granted -- it does NOT refresh the snapshot for the REST of that same
// statement. So the COUNT(*) subquery over team_members (a different
// table from the locked teams row) still reads the ORIGINAL, pre-wait
// snapshot even after the FOR UPDATE unblocks, and can miss a
// concurrently-committed insert. The lock must be its own statement,
// followed by the capacity-gated INSERT as a SEPARATE statement (both
// inside one transaction) so the INSERT gets a fresh snapshot that
// correctly reflects everything committed while it was waiting on the
// lock. The extra round trip this costs is real (see
// lockTeamForCapacityCheck's own comment for how that latency was
// addressed instead of removing the lock).
const TEAM_CAPACITY_GATE = `(
  EXISTS (SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2)
  OR (SELECT COUNT(*) FROM team_members WHERE team_id = $1) <
     (SELECT max_team_size FROM teams WHERE team_id = $1)
)`;

// Milestone 47: this extra round trip (a separate statement from the
// capacity-gated INSERT that follows it -- see TEAM_CAPACITY_GATE's
// comment on why it can't be folded into one statement) measurably slowed
// down every membership-creation path, enough to push
// teamMembershipConcurrency.test.ts's already bcrypt-heavy
// buildTeamWithRoles()-based tests past Jest's 30s ceiling. Fixed at the
// actual cost driver instead of here: fixtures.ts's buildTeamWithRoles now
// registers its 6 independent users concurrently (they have no
// dependency on each other) rather than one at a time, the same "reduce
// the test's own wall-clock cost, don't touch the timeout" fix M39 used
// for the same class of problem. That bought back more wall-clock time
// than this one extra round trip costs.
const lockTeamForCapacityCheck = (client: import('pg').PoolClient, teamId: string) =>
  client.query('SELECT team_id FROM teams WHERE team_id = $1 FOR UPDATE', [teamId]);

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
  // Milestone 40: the team INSERT and the owner-membership INSERT used to
  // be two separate statements with no transaction between them -- if the
  // first committed and the second then threw (a transient connection
  // drop, or previously an uncaught 23503/22P02 on a malformed
  // created_by/parent_team_id), the result was an orphaned team: a row in
  // `teams` with zero rows in `team_members`, inaccessible to anyone
  // (every route's authorization check requires a `team_members` row to
  // exist at all -- see getMemberRole), and with no way for the caller to
  // retry cleanly since the team already "exists." Both statements now
  // commit or roll back together, matching the same withTransaction
  // pattern already used for acceptInvite/approveJoinRequest/password
  // reset.
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
    return withTransaction(async (client) => {
      const teamResult = await client.query(
        `INSERT INTO teams (
          team_name, description, created_by, is_public, is_discoverable,
          max_team_size, parent_team_id, department, team_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          teamData.team_name,
          teamData.description || null,
          teamData.created_by,
          teamData.is_public !== false,
          teamData.is_discoverable !== false,
          teamData.max_team_size || 10,
          teamData.parent_team_id || null,
          teamData.department || null,
          teamData.team_type || 'main',
        ]
      );

      const team = teamResult.rows[0];
      if (!team) {
        return team;
      }

      // Milestone 5: the creator is the owner, not an admin -- the two are
      // now distinct roles with different authority (see requireTeamRole
      // usages across every module's routes). Previously this assigned
      // 'admin', which meant no team ever actually had an owner.
      await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, user_id) DO UPDATE SET
           role = EXCLUDED.role,
           joined_at = CURRENT_TIMESTAMP`,
        [team.team_id, teamData.created_by, 'owner']
      );

      return team;
    });
  }

  async getTeam(teamId: string) {
    const text = 'SELECT * FROM teams WHERE team_id = $1';
    return queryOne(text, [teamId]);
  }

  // Milestone 46: bulk counterpart to getTeam, for callers (getMyInvites)
  // that used to fetch one team per invite with its own query.
  async getTeamsByIds(teamIds: string[]) {
    if (teamIds.length === 0) {
      return [];
    }
    return query<any>('SELECT * FROM teams WHERE team_id = ANY($1)', [teamIds]);
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
  // Milestone 47: the plain VALUES(...) INSERT this used to be unconditionally
  // attempted the insert regardless of team size -- rewritten as a SELECT-based
  // INSERT so TEAM_CAPACITY_GATE can gate whether a row is proposed at all
  // (a brand-new member), while the ON CONFLICT...DO UPDATE WHERE clause
  // (unchanged) still separately gates the hierarchy rule for an existing
  // member's role change. If capacity blocks the insert, RETURNING yields no
  // row, identical in shape to a hierarchy-blocked result -- isTeamAtCapacity
  // (below) is what the service layer uses to tell the two apart. Runs
  // inside a transaction that locks the team's own row as its own
  // statement FIRST (see lockTeamForCapacityCheck's comment on
  // TEAM_CAPACITY_GATE for why this can't be folded into one statement)
  // so concurrent addMember calls against the same team serialize instead
  // of both reading a stale COUNT(*) and overshooting the cap.
  async addTeamMemberIfAuthorized(teamId: string, targetUserId: string, role: string, requesterRole: string) {
    return withTransaction(async (client) => {
      await lockTeamForCapacityCheck(client, teamId);
      const result = await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         SELECT $1, $2, $3
         WHERE ${TEAM_CAPACITY_GATE}
         ON CONFLICT (team_id, user_id) DO UPDATE SET
           role = EXCLUDED.role,
           joined_at = CURRENT_TIMESTAMP
         WHERE team_members.role != 'owner'
           AND (team_members.role != 'admin' OR $4 = 'owner')
         RETURNING role`,
        [teamId, targetUserId, role, requesterRole]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    });
  }

  // Milestone 47: lets the service layer distinguish "insert blocked by
  // capacity" from "insert blocked by hierarchy" when addTeamMemberIfAuthorized
  // returns null and the target isn't already a member -- the only two
  // reasons TEAM_CAPACITY_GATE (which the hierarchy-check WHERE clause above
  // doesn't affect for a brand-new member) would have blocked the row.
  async isTeamAtCapacity(teamId: string): Promise<boolean> {
    const text = `
      SELECT (SELECT COUNT(*) FROM team_members WHERE team_id = $1) >=
             (SELECT max_team_size FROM teams WHERE team_id = $1) AS at_capacity
    `;
    const result = await queryOne<any>(text, [teamId]);
    return result ? result.at_capacity : false;
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

  // Milestone 40: teams.service.ts's removeMember used to call
  // removeTeamMemberIfAuthorized (above) and THEN, as a separate,
  // non-transactional follow-up call, invalidatePendingInvites -- if the
  // second statement failed after the first had already committed (a
  // transient connection drop), a departing member's still-pending invite
  // would silently survive, reopening a narrow slice of the exact
  // staleness gap Milestone 39 closed for the common path. Folds both into
  // one transaction: the delete is still the same atomic, authorization-
  // gated conditional statement (unchanged from above), and the invite
  // revocation only runs at all if that delete actually removed a row.
  async removeMemberAndInvalidateInvites(teamId: string, targetUserId: string, requesterRole: string, targetEmail: string) {
    return withTransaction(async (client) => {
      const deleteResult = await client.query(
        `DELETE FROM team_members
         WHERE team_id = $1 AND user_id = $2
           AND role != 'owner'
           AND (role != 'admin' OR $3 = 'owner')
         RETURNING role`,
        [teamId, targetUserId, requesterRole]
      );

      if (deleteResult.rows.length === 0) {
        return null;
      }

      await client.query(
        `UPDATE team_invites SET status = 'revoked' WHERE team_id = $1 AND email = $2 AND status = 'pending'`,
        [teamId, targetEmail]
      );

      return deleteResult.rows[0];
    });
  }

  // Milestone 40: same fix as removeMemberAndInvalidateInvites above,
  // applied to leaveTeam's shape (an unconditional delete -- the caller
  // removing themselves needs no hierarchy re-check, unlike removeMember).
  async leaveTeamAndInvalidateInvites(teamId: string, userId: string, userEmail: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
      await client.query(
        `UPDATE team_invites SET status = 'revoked' WHERE team_id = $1 AND email = $2 AND status = 'pending'`,
        [teamId, userEmail]
      );
    });
  }

  // Milestone 40: a partial unique index on (team_id, email) WHERE
  // status = 'pending' (see migrations/) now backs this -- previously a
  // caller could invite the same email to the same team any number of
  // times, each call silently inserting another row getUserInvites would
  // return alongside the others. ON CONFLICT DO NOTHING makes a repeat
  // call while a prior invite is still pending a no-op at the database
  // level (RETURNING yields no row); the service layer (teams.service.ts)
  // turns that into a clean 409 instead of a duplicate email being sent
  // and a duplicate row appearing in the recipient's invite list.
  async createInvite(teamId: string, email: string, invitedBy: string) {
    const text = `
      INSERT INTO team_invites (team_id, email, invited_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, email) WHERE status = 'pending' DO NOTHING
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

  // Milestone 39: the invite's pending-ness used to be read by a plain
  // SELECT with no status filter, relying entirely on the SERVICE layer's
  // earlier (non-transactional) assertInviteBelongsToCaller check -- a
  // real gap, since a concurrent removeMember/leaveTeam revoking this
  // SAME invite (see invalidatePendingInvites) could commit in the window
  // between that earlier check and this transaction, and the old code
  // would still accept it anyway. The status transition ('pending' ->
  // 'accepted') is now the same atomic conditional-UPDATE pattern
  // Milestone 36 established: if it affects zero rows, the invite is no
  // longer pending (already used, or just revoked by a removal), and
  // membership is never inserted.
  async acceptInvite(inviteId: string, userId: string) {
    return withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE team_invites
         SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
         WHERE invite_id = $1 AND status = 'pending'
         RETURNING *`,
        [inviteId]
      );

      if (updateResult.rows.length === 0) {
        return null;
      }

      const invite = updateResult.rows[0];

      // Milestone 25: ON CONFLICT DO NOTHING, matching addTeamMember's
      // existing conflict handling for the same table -- accepting an
      // invite to a team you're already a member of (a duplicate invite,
      // or the same invite accepted twice) is treated as a no-op rather
      // than crashing on the team_members(team_id, user_id) unique
      // constraint.
      //
      // Milestone 47: also gated by TEAM_CAPACITY_GATE, now that
      // max_team_size has a real enforcement path. A zero-row result is
      // ambiguous between "already a member" (harmless no-op, same as
      // before M47) and "team is full" (a real error that must roll back
      // the status flip above too, so the invite stays 'pending' and can
      // be retried later if a spot opens up) -- the follow-up SELECT
      // disambiguates. Throwing here (inside withTransaction) rolls back
      // the whole transaction, including the invite UPDATE. The lock
      // (see TEAM_CAPACITY_GATE's comment on why it must be its own
      // statement) must be taken before the capacity-gated insert so this
      // serializes against a concurrent addMember/approveJoinRequest on
      // the same team.
      await lockTeamForCapacityCheck(client, invite.team_id);
      const insertResult = await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         SELECT $1, $2, $3
         WHERE ${TEAM_CAPACITY_GATE}
         ON CONFLICT (team_id, user_id) DO NOTHING
         RETURNING *`,
        [invite.team_id, userId, 'member']
      );

      if (insertResult.rows.length === 0) {
        const alreadyMember = await client.query(
          'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
          [invite.team_id, userId]
        );
        if (alreadyMember.rows.length === 0) {
          throw new ConflictError('This team has reached its maximum size');
        }
      }

      return invite;
    });
  }

  // Milestone 43: previously an unconditional UPDATE with no status
  // guard, unlike its sibling acceptInvite (Milestone 39's atomic
  // conditional UPDATE). Demonstrable inconsistency this closes: the
  // service layer's own belongs-to-caller check (assertInviteBelongsToCaller)
  // reads a separate, non-transactional snapshot of "still pending"
  // before this ever runs -- two concurrent requests from the same
  // caller (accept + reject on the same invite) could both pass that
  // check while the invite was still pending, then race at the write:
  // if acceptInvite committed first (membership already inserted,
  // status -> 'accepted'), this unconditional UPDATE would still flip
  // status back to 'rejected' with no error, leaving the invite row
  // self-contradictory (says 'rejected', but the caller is a real
  // team_members row). The same `status = 'pending'` guard acceptInvite
  // already uses closes it: rejecting a no-longer-pending invite is now
  // a no-op (0 rows), which the service layer turns into a clean error
  // instead of a silent, incorrect status flip.
  async rejectInvite(inviteId: string) {
    const text = `
      UPDATE team_invites
      SET status = 'rejected'
      WHERE invite_id = $1 AND status = 'pending'
      RETURNING *
    `;
    return queryOne(text, [inviteId]);
  }

  // Milestone 46: was unbounded (no LIMIT at all) -- reachable by ANY
  // authenticated user with zero relationship to any matched team and no
  // rate limiter on the route, so a broad query (e.g. a single common
  // letter) could match every public+discoverable team in the app. The
  // service layer's own per-team owner/member-count enrichment then
  // fanned out two more queries per match (see teams.service.ts's
  // searchTeams, fixed alongside this). Capped at 50 -- comfortably more
  // than a search UI would ever usefully display on one page, matching
  // the array-length bound convention already established (M40) rather
  // than an arbitrary number.
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
      LIMIT 50
    `;
    const searchPattern = `%${searchQuery}%`;
    return query(text, [searchPattern]);
  }

  // Milestone 46: batch counterpart to the per-team getTeamMembers fan-out
  // searchTeams' service-layer enrichment used to do -- one GROUP BY query
  // for every matched team's member count at once, regardless of how many
  // teams matched.
  async getMemberCounts(teamIds: string[]): Promise<Record<string, number>> {
    if (teamIds.length === 0) {
      return {};
    }
    const rows = await query<{ team_id: string; count: string }>(
      'SELECT team_id, COUNT(*) AS count FROM team_members WHERE team_id = ANY($1) GROUP BY team_id',
      [teamIds]
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.team_id] = Number(row.count);
    }
    return counts;
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

  // Milestone 40: same fix as createInvite above -- a partial unique index
  // on (team_id, user_id) WHERE status = 'pending' now backs this, and a
  // repeat join request while a prior one is still pending is a no-op
  // (RETURNING yields no row) instead of another row admins would see
  // duplicated in getTeamJoinRequests.
  async createJoinRequest(teamId: string, userId: string) {
    const text = `
      INSERT INTO join_requests (team_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (team_id, user_id) WHERE status = 'pending' DO NOTHING
      RETURNING *
    `;
    return queryOne<any>(text, [teamId, userId]);
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

  // Milestone 43: the status transition used to be a plain SELECT
  // (no status filter) followed by an unconditional UPDATE -- the exact
  // same TOCTOU shape rejectInvite had (see its comment above), just on
  // join_requests instead of team_invites. A join request already
  // rejected (or approved a second time) had no guard preventing this
  // from re-approving it or double-counting. The status transition is
  // now the same atomic conditional-UPDATE pattern as acceptInvite:
  // affects zero rows if the request is no longer pending, in which
  // case the membership INSERT never runs at all.
  async approveJoinRequest(requestId: string) {
    return withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE join_requests
         SET status = 'approved'
         WHERE request_id = $1 AND status = 'pending'
         RETURNING *`,
        [requestId]
      );

      if (updateResult.rows.length === 0) {
        return null;
      }

      const request = updateResult.rows[0];

      // Milestone 25: same ON CONFLICT DO NOTHING as acceptInvite above --
      // approving a join request for someone already a member (e.g. they
      // separately accepted an invite in the meantime) is a no-op instead
      // of crashing. The request is still marked approved either way.
      //
      // Milestone 47: same TEAM_CAPACITY_GATE + disambiguation as
      // acceptInvite -- a genuinely full team throws (rolling back the
      // status flip above, leaving the request 'pending'), while
      // already-a-member stays the pre-M47 silent no-op. Same lock-before-
      // check requirement as acceptInvite/addTeamMemberIfAuthorized.
      await lockTeamForCapacityCheck(client, request.team_id);
      const insertResult = await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         SELECT $1, $2, $3
         WHERE ${TEAM_CAPACITY_GATE}
         ON CONFLICT (team_id, user_id) DO NOTHING
         RETURNING *`,
        [request.team_id, request.user_id, 'member']
      );

      if (insertResult.rows.length === 0) {
        const alreadyMember = await client.query(
          'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
          [request.team_id, request.user_id]
        );
        if (alreadyMember.rows.length === 0) {
          throw new ConflictError('This team has reached its maximum size');
        }
      }

      return request;
    });
  }

  // Milestone 43: same fix as rejectInvite/approveJoinRequest above --
  // previously unconditional, so rejecting an already-approved request
  // flipped its status back to 'rejected' with no effect on the
  // membership that approval had already granted, leaving an admin's
  // view of the request contradicted by actual team_members state.
  async rejectJoinRequest(requestId: string) {
    const text = `
      UPDATE join_requests
      SET status = 'rejected'
      WHERE request_id = $1 AND status = 'pending'
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
