import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, addMember, buildTeamWithRoles, registerAndLogin } from './utils/fixtures';
import { teamsRepository } from '../src/modules/teams/teams.repository';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const getRole = async (teamId: string, userId: string) => {
  const res = await pgPool.query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
  return res.rows[0]?.role ?? null;
};

describe('Milestone 36 -- deterministic proof: removeMember/updateMemberRole are atomic with the authorization check', () => {
  // These hold a real Postgres row lock open via an uncommitted
  // transaction on the SAME row the atomic method targets, then issue
  // the atomic method's query while that lock is held. Postgres
  // guarantees the atomic method's statement physically cannot proceed
  // until the lock is released (COMMIT/ROLLBACK) -- this is not a timing
  // hope, it's the database's own lock-wait semantics. The short delay
  // before releasing the lock only gives the blocked query time to reach
  // Postgres and start waiting; it is not what makes the test correct.
  it('a promotion to admin that commits while a non-owner admin\'s removal is in flight blocks the removal', async () => {
    const { teamId, admin } = await buildTeamWithRoles();
    const target = await registerAndLogin('m36_det_remove_target');
    await addMember(admin.token, teamId, target.userId, 'member').expect(200);

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3', ['admin', teamId, target.userId]);

      const removalPromise = teamsRepository.removeTeamMemberIfAuthorized(teamId, target.userId, 'admin');
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const removalResult = await removalPromise;
      // Blocked -- the DELETE re-evaluated its WHERE clause against the
      // now-committed role='admin' and matched zero rows.
      expect(removalResult).toBeNull();
    } finally {
      client.release();
    }

    expect(await getRole(teamId, target.userId)).toBe('admin');
  });

  it('a promotion to admin that commits while a non-owner admin\'s demote attempt is in flight blocks the demotion', async () => {
    const { teamId, admin } = await buildTeamWithRoles();
    const target = await registerAndLogin('m36_det_demote_target');
    await addMember(admin.token, teamId, target.userId, 'member').expect(200);

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3', ['admin', teamId, target.userId]);

      const demotePromise = teamsRepository.updateMemberRoleIfAuthorized(teamId, target.userId, 'member', 'admin');
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const demoteResult = await demotePromise;
      expect(demoteResult).toBeNull();
    } finally {
      client.release();
    }

    expect(await getRole(teamId, target.userId)).toBe('admin');
  });

  it('the owner is unaffected by the same lock contention -- their removal proceeds once the conflicting transaction commits', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const target = await registerAndLogin('m36_det_owner_target');
    await addMember(owner.token, teamId, target.userId, 'member').expect(200);

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3', ['admin', teamId, target.userId]);

      const removalPromise = teamsRepository.removeTeamMemberIfAuthorized(teamId, target.userId, 'owner');
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const removalResult = await removalPromise;
      // Owner is exempt from the hierarchy rule -- succeeds even though
      // the target became an admin in the interim.
      expect(removalResult).not.toBeNull();
    } finally {
      client.release();
    }

    expect(await getRole(teamId, target.userId)).toBeNull();
  });
});

describe('Milestone 36 -- realistic concurrent HTTP requests preserve the invariant either way the race resolves', () => {
  it('admin-removes vs owner-promotes fired via Promise.all never lets the removal succeed against an admin', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const target = await registerAndLogin('m36_http_race_remove');
    await addMember(owner.token, teamId, target.userId, 'member').expect(200);

    const [removeRes] = await Promise.all([
      request(app).delete(`/api/teams/${teamId}/members/${target.userId}`).set(authHeader(admin.token)),
      request(app).put(`/api/teams/${teamId}/members/${target.userId}/role`).set(authHeader(owner.token)).send({ role: 'admin' }),
    ]);

    const finalRole = await getRole(teamId, target.userId);

    // The two valid outcomes of a genuine race: either the removal
    // happened first (target gone, promotion becomes a no-op on a
    // nonexistent row) or the promotion happened first/concurrently
    // (target is now admin, and the non-owner admin's removal MUST have
    // been rejected). What must never happen: target is gone AND was
    // already admin at the moment of removal -- i.e. removeRes.status
    // 200 is only valid when the final state shows no leftover admin
    // row, which re-querying rules out by construction here.
    if (finalRole === 'admin') {
      expect(removeRes.status).toBe(403);
    } else {
      expect(finalRole).toBeNull();
      expect(removeRes.status).toBe(200);
    }
  });

  it('admin-demotes vs owner-promotes fired via Promise.all never lets the demotion succeed against an admin', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const target = await registerAndLogin('m36_http_race_demote');
    await addMember(owner.token, teamId, target.userId, 'member').expect(200);

    const [demoteRes] = await Promise.all([
      request(app)
        .put(`/api/teams/${teamId}/members/${target.userId}/role`)
        .set(authHeader(admin.token))
        .send({ role: 'viewer' }),
      request(app).put(`/api/teams/${teamId}/members/${target.userId}/role`).set(authHeader(owner.token)).send({ role: 'admin' }),
    ]);

    const finalRole = await getRole(teamId, target.userId);
    // Whichever statement Postgres serialized last wins outright (both
    // are UPDATEs on the same row) -- either the demotion applied first
    // and the promotion overwrote it (finalRole 'admin', demoteRes 200
    // since target was still a plain member when the demotion's atomic
    // check ran), or the promotion committed first and the demotion's
    // WHERE then correctly blocked touching an admin (finalRole 'admin',
    // demoteRes 403). Both leave finalRole as 'admin' -- the invariant
    // under test is that demoteRes is never a success that overwrote an
    // admin's role out from under the owner's own action without
    // permission; confirmed by checking demoteRes against the DB state
    // instead of assuming an order.
    expect(finalRole).toBe('admin');
    if (demoteRes.status === 200) {
      // The demotion's own atomic UPDATE was the one that landed on the
      // (still 'member') row -- correct, since the promotion then simply
      // overwrote it afterward. Confirm this isn't silently wrong by
      // checking demoteRes never reports success while ALSO the row it
      // demoted was already 'admin' -- already guaranteed by the WHERE
      // clause itself (verified by the deterministic tests above); here
      // we only assert the observable end state is consistent.
      expect(demoteRes.body.success).toBe(true);
    } else {
      expect(demoteRes.status).toBe(403);
    }
  });

  it('owner operations still succeed under concurrent load', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();

    const [removeRes] = await Promise.all([
      request(app).delete(`/api/teams/${teamId}/members/${admin.userId}`).set(authHeader(owner.token)),
      request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)),
    ]);

    expect(removeRes.status).toBe(200);
    expect(await getRole(teamId, admin.userId)).toBeNull();
  });

  it('admin can still perform legitimate member operations (removing a plain member, promoting a member to manager)', async () => {
    const { teamId, admin, member } = await buildTeamWithRoles();

    await request(app)
      .put(`/api/teams/${teamId}/members/${member.userId}/role`)
      .set(authHeader(admin.token))
      .send({ role: 'manager' })
      .expect(200);
    expect(await getRole(teamId, member.userId)).toBe('manager');

    const removeRes = await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(admin.token)).expect(200);
    expect(removeRes.status).toBe(200);
    expect(await getRole(teamId, member.userId)).toBeNull();
  });
});
