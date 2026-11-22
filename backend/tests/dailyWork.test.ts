import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';
import { testPool } from './utils/db';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Milestone 49 -- daily work entries -> AI-drafted summary -> user-confirmed
// submission. New tables (daily_work_entries, daily_work_submissions),
// deliberately separate from daily_logs (unchanged, still personal/
// single-entry). See docs/security/SECURITY_FINDINGS.md and
// PROJECT_HANDOFF.md for the full design rationale.
// ---------------------------------------------------------------------------

describe('Milestone 49 -- POST /work-entries (authorization + happy path)', () => {
  it('lets a team member add an entry', async () => {
    const owner = await registerAndLogin('m49_entry_owner');
    const teamId = await createTeam(owner.token, `M49_Entry_${Date.now()}`);

    const res = await request(app)
      .post('/api/work-entries')
      .set(authHeader(owner.token))
      .send({ teamId, entryText: 'Fixed login validation bug' })
      .expect(201);
    expect(res.body.data.entry_text).toBe('Fixed login validation bug');
  });

  it('rejects a viewer from adding an entry (write-role gate)', async () => {
    const owner = await registerAndLogin('m49_entry_viewer_owner');
    const viewer = await registerAndLogin('m49_entry_viewer');
    const teamId = await createTeam(owner.token, `M49_EntryViewer_${Date.now()}`);
    await addMember(owner.token, teamId, viewer.userId, 'viewer').expect(200);

    await request(app).post('/api/work-entries').set(authHeader(viewer.token)).send({ teamId, entryText: 'Should be rejected' }).expect(403);
  });

  it('rejects a non-member from adding an entry to a team they do not belong to', async () => {
    const owner = await registerAndLogin('m49_entry_nonmember_owner');
    const stranger = await registerAndLogin('m49_entry_stranger');
    const teamId = await createTeam(owner.token, `M49_EntryNonmember_${Date.now()}`);

    await request(app).post('/api/work-entries').set(authHeader(stranger.token)).send({ teamId, entryText: 'Should be rejected' }).expect(403);
  });

  it('rejects an entry over 1000 characters', async () => {
    const owner = await registerAndLogin('m49_entry_toolong_owner');
    const teamId = await createTeam(owner.token, `M49_TooLong_${Date.now()}`);
    await request(app)
      .post('/api/work-entries')
      .set(authHeader(owner.token))
      .send({ teamId, entryText: 'x'.repeat(1001) })
      .expect(400);
  });

  it('caps entries at 50 per day per team', async () => {
    const owner = await registerAndLogin('m49_entry_cap_owner');
    const teamId = await createTeam(owner.token, `M49_Cap_${Date.now()}`);

    for (let i = 0; i < 50; i++) {
      await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: `Entry ${i}` }).expect(201);
    }
    const res = await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: 'One too many' });
    expect(res.status).toBe(400);
  }, 60000);
});

describe('Milestone 49 -- GET /work-entries/today', () => {
  it("only returns the caller's own entries, not a teammate's", async () => {
    const owner = await registerAndLogin('m49_today_owner');
    const member = await registerAndLogin('m49_today_member');
    const teamId = await createTeam(owner.token, `M49_Today_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: "Owner's entry" }).expect(201);
    await request(app).post('/api/work-entries').set(authHeader(member.token)).send({ teamId, entryText: "Member's entry" }).expect(201);

    const res = await request(app).get(`/api/work-entries/today?teamId=${teamId}`).set(authHeader(member.token)).expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].entry_text).toBe("Member's entry");
  });
});

describe('Milestone 49 -- POST /work-entries/summarize (draft only, never persists)', () => {
  it('returns a draft summary without creating a submission row', async () => {
    const owner = await registerAndLogin('m49_summarize_owner');
    const teamId = await createTeam(owner.token, `M49_Summarize_${Date.now()}`);
    await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: 'Did some work' }).expect(201);

    const res = await request(app).post('/api/work-entries/summarize').set(authHeader(owner.token)).send({ teamId }).expect(200);
    expect(typeof res.body.data.draftSummary).toBe('string');
    expect(res.body.data.draftSummary.length).toBeGreaterThan(0);

    // Confirms the draft was never written -- a fresh history query for
    // today shows no submission yet.
    const historyRes = await request(app).get(`/api/teams/${teamId}/work-submissions`).set(authHeader(owner.token)).expect(200);
    expect(historyRes.body.data.length).toBe(0);
  });

  it('rejects summarizing when there are no entries for today', async () => {
    const owner = await registerAndLogin('m49_summarize_empty_owner');
    const teamId = await createTeam(owner.token, `M49_SummarizeEmpty_${Date.now()}`);
    await request(app).post('/api/work-entries/summarize').set(authHeader(owner.token)).send({ teamId }).expect(400);
  });
});

describe('Milestone 49 -- POST /work-entries/submit (final confirmation)', () => {
  it('creates a submission from the confirmed summary', async () => {
    const owner = await registerAndLogin('m49_submit_owner');
    const teamId = await createTeam(owner.token, `M49_Submit_${Date.now()}`);
    await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: 'Did some work' }).expect(201);

    const res = await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Completed all planned tasks for today.' })
      .expect(201);
    expect(res.body.data.confirmed_summary).toBe('Completed all planned tasks for today.');
    expect(res.body.data.work_date).toBeDefined();
  });

  it('rejects a second submission for the same team/day (duplicate submission)', async () => {
    const owner = await registerAndLogin('m49_submit_dup_owner');
    const teamId = await createTeam(owner.token, `M49_SubmitDup_${Date.now()}`);
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'First submission of the day.' })
      .expect(201);

    const res = await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Trying to submit again.' });
    expect(res.status).toBe(409);
  });

  it('never lets concurrent double-submit-clicks create two submissions for the same day (race safety)', async () => {
    const owner = await registerAndLogin('m49_submit_race_owner');
    const teamId = await createTeam(owner.token, `M49_SubmitRace_${Date.now()}`);

    const submit = (text: string) =>
      request(app).post('/api/work-entries/submit').set(authHeader(owner.token)).send({ teamId, confirmedSummary: text });

    const [a, b] = await Promise.all([submit('First concurrent attempt.'), submit('Second concurrent attempt.')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const historyRes = await request(app).get(`/api/teams/${teamId}/work-submissions`).set(authHeader(owner.token)).expect(200);
    expect(historyRes.body.data.length).toBe(1);
  });

  it('blocks adding a new entry after today has already been submitted', async () => {
    const owner = await registerAndLogin('m49_submit_lock_owner');
    const teamId = await createTeam(owner.token, `M49_SubmitLock_${Date.now()}`);
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Already submitted for today.' })
      .expect(201);

    const res = await request(app).post('/api/work-entries').set(authHeader(owner.token)).send({ teamId, entryText: 'Too late' });
    expect(res.status).toBe(409);
  });

  it('rejects a confirmedSummary under 10 characters', async () => {
    const owner = await registerAndLogin('m49_submit_short_owner');
    const teamId = await createTeam(owner.token, `M49_SubmitShort_${Date.now()}`);
    await request(app).post('/api/work-entries/submit').set(authHeader(owner.token)).send({ teamId, confirmedSummary: 'short' }).expect(400);
  });
});

describe('Milestone 49 -- GET /teams/:teamId/work-submissions (team-scoped history, cross-team isolation)', () => {
  it('shows every team member their teammates confirmed submissions for the day', async () => {
    const owner = await registerAndLogin('m49_history_owner');
    const member = await registerAndLogin('m49_history_member');
    const teamId = await createTeam(owner.token, `M49_History_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: "Owner's confirmed work for today." })
      .expect(201);
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(member.token))
      .send({ teamId, confirmedSummary: "Member's confirmed work for today." })
      .expect(201);

    const res = await request(app).get(`/api/teams/${teamId}/work-submissions`).set(authHeader(member.token)).expect(200);
    expect(res.body.data.length).toBe(2);
    const usernames = res.body.data.map((s: any) => s.username);
    expect(usernames).toContain(owner.user.username);
    expect(usernames).toContain(member.user.username);
  });

  it('never leaks a submission from an unrelated team', async () => {
    const ownerA = await registerAndLogin('m49_isolation_owner_a');
    const ownerB = await registerAndLogin('m49_isolation_owner_b');
    const teamA = await createTeam(ownerA.token, `M49_IsolationA_${Date.now()}`);
    const teamB = await createTeam(ownerB.token, `M49_IsolationB_${Date.now()}`);

    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(ownerA.token))
      .send({ teamId: teamA, confirmedSummary: "Team A's confirmed work today." })
      .expect(201);

    const res = await request(app).get(`/api/teams/${teamB}/work-submissions`).set(authHeader(ownerB.token)).expect(200);
    expect(res.body.data.length).toBe(0);
  });

  it('rejects a non-member from reading a team\'s work history', async () => {
    const owner = await registerAndLogin('m49_history_authz_owner');
    const stranger = await registerAndLogin('m49_history_authz_stranger');
    const teamId = await createTeam(owner.token, `M49_HistoryAuthz_${Date.now()}`);

    await request(app).get(`/api/teams/${teamId}/work-submissions`).set(authHeader(stranger.token)).expect(403);
  });
});

// ---------------------------------------------------------------------------
// Milestone 53 -- personal Daily Work history (GET /work-entries/history).
// Scoped strictly to the authenticated caller's own submissions for one
// team -- never a teammate's, never a different team's. Past-dated rows
// are seeded directly via testPool since the submit API always writes
// work_date = CURRENT_DATE (no way to submit "for yesterday" through the
// real flow, by design -- M49's own submitWork).
// ---------------------------------------------------------------------------

const seedSubmission = async (userId: string, teamId: string, workDate: string, confirmedSummary: string) => {
  await testPool.query(
    `INSERT INTO daily_work_submissions (user_id, team_id, work_date, confirmed_summary) VALUES ($1, $2, $3, $4)`,
    [userId, teamId, workDate, confirmedSummary]
  );
};

describe('Milestone 53 -- GET /work-entries/history (personal, cross-user/cross-team isolation)', () => {
  it("lets an authenticated member retrieve their own history", async () => {
    const owner = await registerAndLogin('m53_history_owner');
    const teamId = await createTeam(owner.token, `M53_History_${Date.now()}`);
    await seedSubmission(owner.userId, teamId, '2026-08-01', 'Worked on the login flow.');

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].confirmed_summary).toBe('Worked on the login flow.');
    expect(res.body.data[0].work_date).toBeDefined();
    expect(res.body.data[0].confirmed_at).toBeDefined();
  });

  it("never returns another member's submissions, even for the same team/dates", async () => {
    const owner = await registerAndLogin('m53_history_iso_owner');
    const member = await registerAndLogin('m53_history_iso_member');
    const teamId = await createTeam(owner.token, `M53_HistoryIso_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    await seedSubmission(owner.userId, teamId, '2026-08-01', "Owner's private history entry.");
    await seedSubmission(member.userId, teamId, '2026-08-01', "Member's private history entry.");

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamId}`).set(authHeader(member.token)).expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].confirmed_summary).toBe("Member's private history entry.");
    expect(JSON.stringify(res.body.data)).not.toContain("Owner's private history entry.");
  });

  it('never leaks history from an unrelated team the caller also belongs to', async () => {
    const user = await registerAndLogin('m53_history_crossteam_user');
    const teamA = await createTeam(user.token, `M53_HistoryCrossA_${Date.now()}`);
    const teamB = await createTeam(user.token, `M53_HistoryCrossB_${Date.now()}`);
    await seedSubmission(user.userId, teamA, '2026-08-01', "Team A's work.");

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamB}`).set(authHeader(user.token)).expect(200);
    expect(res.body.data.length).toBe(0);
  });

  it('rejects a non-member from reading history for that team', async () => {
    const owner = await registerAndLogin('m53_history_authz_owner');
    const stranger = await registerAndLogin('m53_history_authz_stranger');
    const teamId = await createTeam(owner.token, `M53_HistoryAuthz_${Date.now()}`);
    await seedSubmission(owner.userId, teamId, '2026-08-01', 'Should not be visible to a stranger.');

    await request(app).get(`/api/work-entries/history?teamId=${teamId}`).set(authHeader(stranger.token)).expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    const owner = await registerAndLogin('m53_history_unauth_owner');
    const teamId = await createTeam(owner.token, `M53_HistoryUnauth_${Date.now()}`);

    await request(app).get(`/api/work-entries/history?teamId=${teamId}`).expect(401);
  });

  it('returns an empty array for a team with no history yet', async () => {
    const owner = await registerAndLogin('m53_history_empty_owner');
    const teamId = await createTeam(owner.token, `M53_HistoryEmpty_${Date.now()}`);

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns multiple records ordered newest-first', async () => {
    const owner = await registerAndLogin('m53_history_multi_owner');
    const teamId = await createTeam(owner.token, `M53_HistoryMulti_${Date.now()}`);
    await seedSubmission(owner.userId, teamId, '2026-08-01', 'Oldest entry.');
    await seedSubmission(owner.userId, teamId, '2026-08-05', 'Middle entry.');
    await seedSubmission(owner.userId, teamId, '2026-08-10', 'Newest entry.');

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.map((s: any) => s.confirmed_summary)).toEqual(['Newest entry.', 'Middle entry.', 'Oldest entry.']);
  });

  it('honors the limit parameter', async () => {
    const owner = await registerAndLogin('m53_history_limit_owner');
    const teamId = await createTeam(owner.token, `M53_HistoryLimit_${Date.now()}`);
    await seedSubmission(owner.userId, teamId, '2026-08-01', 'First.');
    await seedSubmission(owner.userId, teamId, '2026-08-02', 'Second.');
    await seedSubmission(owner.userId, teamId, '2026-08-03', 'Third.');

    const res = await request(app).get(`/api/work-entries/history?teamId=${teamId}&limit=2`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.length).toBe(2);
  });
});
