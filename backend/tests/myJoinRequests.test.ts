import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Milestone 50 -- GET /join-requests/my, the self-scoped mirror of
// GET /invites/my. Powers the frontend's "Waiting for team leader
// approval" empty state, which previously had no data source: a
// requester had no way to see their own pending join requests, only team
// owners/admins could see incoming ones via GET /teams/:teamId/join-requests.
// ---------------------------------------------------------------------------

describe('Milestone 50 -- GET /join-requests/my', () => {
  it("returns the caller's own pending join request with the team attached", async () => {
    const owner = await registerAndLogin('m50_myreq_owner');
    const requester = await registerAndLogin('m50_myreq_requester');
    const teamId = await createTeam(owner.token, `M50_MyReq_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const res = await request(app).get('/api/join-requests/my').set(authHeader(requester.token)).expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('pending');
    expect(res.body.data[0].team.team_id).toBe(teamId);
    expect(res.body.data[0].team.team_name).toContain('M50_MyReq');
  });

  it('never returns another user\'s join request', async () => {
    const owner = await registerAndLogin('m50_myreq_isolation_owner');
    const requesterA = await registerAndLogin('m50_myreq_isolation_a');
    const requesterB = await registerAndLogin('m50_myreq_isolation_b');
    const teamId = await createTeam(owner.token, `M50_Isolation_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterA.token)).expect(200);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterB.token)).expect(200);

    const resA = await request(app).get('/api/join-requests/my').set(authHeader(requesterA.token)).expect(200);
    expect(resA.body.data.length).toBe(1);
    expect(resA.body.data[0].user_id).toBe(requesterA.userId);
  });

  it('reflects a rejected request\'s status once the team leader rejects it', async () => {
    const owner = await registerAndLogin('m50_myreq_rejected_owner');
    const requester = await registerAndLogin('m50_myreq_rejected_requester');
    const teamId = await createTeam(owner.token, `M50_Rejected_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);
    const requestsRes = await request(app).get(`/api/teams/${teamId}/join-requests`).set(authHeader(owner.token)).expect(200);
    const requestId = requestsRes.body.data[0].request_id;
    await request(app).post(`/api/join-requests/${requestId}/reject`).set(authHeader(owner.token)).expect(200);

    const res = await request(app).get('/api/join-requests/my').set(authHeader(requester.token)).expect(200);
    expect(res.body.data[0].status).toBe('rejected');
  });

  it('returns an empty array when the caller has no join requests', async () => {
    const user = await registerAndLogin('m50_myreq_empty');
    const res = await request(app).get('/api/join-requests/my').set(authHeader(user.token)).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).get('/api/join-requests/my').expect(401);
  });
});
