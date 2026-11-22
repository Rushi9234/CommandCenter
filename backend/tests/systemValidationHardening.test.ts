import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, registerAndLogin, createTeam, addMember } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('System Validation & Integration Hardening (Bug B & Bug C Regression)', () => {
  describe('BUG B REGRESSION — Stale Join Requests Cleanup', () => {
    it('filters out join requests for users who are already team members', async () => {
      const owner = await registerAndLogin('bugb_owner');
      const teamId = await createTeam(owner.token, 'Software Engg Test');

      const user = await registerAndLogin('bugb_user');

      // User requests to join
      await request(app)
        .post(`/api/teams/${teamId}/join`)
        .set(authHeader(user.token))
        .expect(200);

      // Verify pending request exists
      const initialReqs = await request(app)
        .get(`/api/teams/${teamId}/join-requests`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(initialReqs.body.data.length).toBe(1);
      expect(initialReqs.body.data[0].user_id).toBe(user.userId);

      // Admin directly adds the user to the team via addMember
      await addMember(owner.token, teamId, user.userId, 'member').expect(200);

      // getTeamJoinRequests should NO LONGER return the request under pending join requests
      const updatedReqs = await request(app)
        .get(`/api/teams/${teamId}/join-requests`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(updatedReqs.body.data.length).toBe(0);
    });

    it('approving a join request sets status to approved and adds membership atomically', async () => {
      const owner = await registerAndLogin('bugb_owner2');
      const teamId = await createTeam(owner.token, 'Software Engg Test 2');

      const user = await registerAndLogin('bugb_user2');

      const joinRes = await request(app)
        .post(`/api/teams/${teamId}/join`)
        .set(authHeader(user.token))
        .expect(200);

      const requestId = joinRes.body.data.request_id;

      // Approve join request
      await request(app)
        .post(`/api/join-requests/${requestId}/approve`)
        .set(authHeader(owner.token))
        .expect(200);

      // Subsequent getTeamJoinRequests must be empty
      const reqs = await request(app)
        .get(`/api/teams/${teamId}/join-requests`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(reqs.body.data.length).toBe(0);

      // Verify member is in team members list
      const members = await request(app)
        .get(`/api/teams/${teamId}/members`)
        .set(authHeader(owner.token))
        .expect(200);

      const found = members.body.data.find((m: any) => m.user_id === user.userId);
      expect(found).toBeDefined();
    });
  });

  describe('BUG C REGRESSION — Newly Created Team API & Worklog Integrity', () => {
    it('returns clean worklog, attention, and context dashboard shapes for a brand-new team', async () => {
      const owner = await registerAndLogin('bugc_owner');
      const teamId = await createTeam(owner.token, 'Brand New Team');

      // 1. Worklog Endpoint
      const worklogRes = await request(app)
        .get(`/api/teams/${teamId}/worklog`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(worklogRes.body.data.team_id).toBe(teamId);
      expect(worklogRes.body.data.team_summary.tasks.assigned).toBe(0);
      expect(worklogRes.body.data.team_summary.goals.total).toBe(0);
      expect(worklogRes.body.data.team_summary.blockers.total).toBe(0);
      expect(worklogRes.body.data.member_summary.length).toBe(1); // Creator is owner
      expect(worklogRes.body.data.work_items.tasks).toEqual([]);

      // 2. Attention Endpoint
      const attRes = await request(app)
        .get(`/api/teams/${teamId}/attention`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(attRes.body.data.team).toBeDefined();
      expect(attRes.body.data.team.status).toBe('NO_ACTIVE_WORK');
      expect(Array.isArray(attRes.body.data.team.reasons)).toBe(true);
      expect(attRes.body.data.team.evidence).toBeDefined();
      expect(attRes.body.data.team.evidence.open_blockers).toBe(0);

      // 3. Context Dashboard Endpoint
      const ctxRes = await request(app)
        .get(`/api/teams/${teamId}/context-dashboard`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(ctxRes.body.data.context.team_id).toBe(teamId);
      expect(ctxRes.body.data.teams).toEqual([]);
      expect(ctxRes.body.data.summary.total_teams).toBe(0);
    });
  });
});
