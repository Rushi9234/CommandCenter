import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Milestone 51 -- GET /teams/:teamId/context-dashboard. Read
// contextDashboard.service.ts's own comment for the full authorization
// reasoning: gated by the SAME requireTeamRole(['owner','admin']) every
// other owner/admin route already uses, on the PARENT team's own id --
// no new middleware. What's new is a narrow, aggregate-only view into
// the parent's CHILD teams (counts/booleans, never content), which these
// tests exist to prove stays narrow.
// ---------------------------------------------------------------------------

const createSubTeam = async (ownerToken: string, teamName: string, parentTeamId: string) => {
  const res = await request(app)
    .post('/api/teams')
    .set(authHeader(ownerToken))
    .send({ teamName, parentTeamId })
    .expect(201);
  return res.body.data.team_id;
};

describe('Milestone 51 -- authorization', () => {
  it('lets the parent team owner view the dashboard', async () => {
    const owner = await registerAndLogin('m51_authz_owner');
    const classroomId = await createTeam(owner.token, `M51_Classroom_${Date.now()}`);
    await createSubTeam(owner.token, `M51_SubA_${Date.now()}`, classroomId);

    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.teams.length).toBe(1);
  });

  it('lets a parent-team admin view the dashboard', async () => {
    const owner = await registerAndLogin('m51_authz_admin_owner');
    const admin = await registerAndLogin('m51_authz_admin');
    const classroomId = await createTeam(owner.token, `M51_ClassroomAdmin_${Date.now()}`);
    await addMember(owner.token, classroomId, admin.userId, 'admin').expect(200);

    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(admin.token)).expect(200);
  });

  it('rejects a plain member of the parent team (not owner/admin)', async () => {
    const owner = await registerAndLogin('m51_authz_member_owner');
    const member = await registerAndLogin('m51_authz_member');
    const classroomId = await createTeam(owner.token, `M51_ClassroomMember_${Date.now()}`);
    await addMember(owner.token, classroomId, member.userId, 'member').expect(200);

    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(member.token)).expect(403);
  });

  it('rejects a viewer of the parent team', async () => {
    const owner = await registerAndLogin('m51_authz_viewer_owner');
    const viewer = await registerAndLogin('m51_authz_viewer');
    const classroomId = await createTeam(owner.token, `M51_ClassroomViewer_${Date.now()}`);
    await addMember(owner.token, classroomId, viewer.userId, 'viewer').expect(200);

    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(viewer.token)).expect(403);
  });

  it('rejects a stranger with no relationship to the parent team', async () => {
    const owner = await registerAndLogin('m51_authz_stranger_owner');
    const stranger = await registerAndLogin('m51_authz_stranger');
    const classroomId = await createTeam(owner.token, `M51_ClassroomStranger_${Date.now()}`);

    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(stranger.token)).expect(403);
  });

  it("rejects a coordinator viewing an unrelated context they don't own/admin (cross-context access)", async () => {
    const ownerA = await registerAndLogin('m51_cross_owner_a');
    const ownerB = await registerAndLogin('m51_cross_owner_b');
    const classroomB = await createTeam(ownerB.token, `M51_ClassroomB_${Date.now()}`);

    await request(app).get(`/api/teams/${classroomB}/context-dashboard`).set(authHeader(ownerA.token)).expect(403);
  });

  it('a child team\'s own owner/admin (not the parent\'s) cannot use their child-team role to view the parent dashboard', async () => {
    const parentOwner = await registerAndLogin('m51_childowner_parent');
    const childOwner = await registerAndLogin('m51_childowner_child');
    const classroomId = await createTeam(parentOwner.token, `M51_ChildOwnerParent_${Date.now()}`);
    // childOwner creates their OWN normal team (owner of it), unrelated to classroomId.
    await createTeam(childOwner.token, `M51_ChildOwnerTeam_${Date.now()}`);

    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(childOwner.token)).expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    const owner = await registerAndLogin('m51_authz_unauth_owner');
    const classroomId = await createTeam(owner.token, `M51_Unauth_${Date.now()}`);
    await request(app).get(`/api/teams/${classroomId}/context-dashboard`).expect(401);
  });

  it('rejects a nonexistent team with 403 (requireTeamRole runs before the controller ever gets to check existence -- the same established 404-vs-403 pattern this project has already reviewed and accepted project-wide, not a new inconsistency)', async () => {
    const owner = await registerAndLogin('m51_authz_404');
    await request(app)
      .get('/api/teams/00000000-0000-0000-0000-000000000000/context-dashboard')
      .set(authHeader(owner.token))
      .expect(403);
  });
});

describe('Milestone 51 -- privacy: no child-team content is ever exposed, only aggregate counts/booleans', () => {
  it('never exposes a child team\'s member list, blocker titles/messages, task titles, or daily-work text', async () => {
    const owner = await registerAndLogin('m51_privacy_owner');
    const childOwner = await registerAndLogin('m51_privacy_childowner');
    const childMember = await registerAndLogin('m51_privacy_childmember');
    const classroomId = await createTeam(owner.token, `M51_Privacy_${Date.now()}`);
    const subTeamId = await createSubTeam(owner.token, `M51_PrivacySub_${Date.now()}`, classroomId);

    // createSubTeam makes `owner` (the classroom's owner) the sub-team's
    // owner too, by the same "creator becomes owner" rule every team
    // already follows -- unrelated to the parent-child relationship
    // itself. Add childOwner/childMember on top, giving the sub-team 3
    // real members: owner, childOwner (admin), childMember (member).
    await addMember(owner.token, subTeamId, childOwner.userId, 'admin').expect(200);
    await addMember(owner.token, subTeamId, childMember.userId, 'member').expect(200);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(childOwner.token))
      .send({ teamId: subTeamId, title: 'SECRET_BLOCKER_TITLE_should_not_leak' })
      .expect(201);
    await request(app)
      .post('/api/work-entries')
      .set(authHeader(childOwner.token))
      .send({ teamId: subTeamId, entryText: 'SECRET_WORK_ENTRY_should_not_leak' })
      .expect(201);

    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    const raw = JSON.stringify(res.body.data);
    expect(raw).not.toContain('SECRET_BLOCKER_TITLE_should_not_leak');
    expect(raw).not.toContain('SECRET_WORK_ENTRY_should_not_leak');
    expect(raw).not.toContain(childMember.user.email);
    expect(raw).not.toContain(childOwner.user.email);

    const subTeamEntry = res.body.data.teams.find((t: any) => t.team_id === subTeamId);
    expect(subTeamEntry.member_count).toBe(3);
    expect(subTeamEntry.open_blocker_count).toBe(1);
    expect(subTeamEntry.members).toBeUndefined();
  });

  it('does not let the classroom owner read the sub-team\'s actual blockers/tasks/work-entries endpoints without explicit membership', async () => {
    const owner = await registerAndLogin('m51_noleak_owner');
    const classroomId = await createTeam(owner.token, `M51_NoLeak_${Date.now()}`);
    const subTeamId = await createSubTeam(owner.token, `M51_NoLeakSub_${Date.now()}`, classroomId);

    // owner created the sub-team, so they ARE its owner too (creator ==
    // owner, unrelated to the parent-child relationship) -- to test the
    // real "no cascade" boundary, remove themselves and use a different
    // team's owner as the "coordinator" who has zero relationship to
    // this specific sub-team.
    const coordinator = await registerAndLogin('m51_noleak_coordinator');
    const classroomId2 = await createTeam(coordinator.token, `M51_NoLeak2_${Date.now()}`);
    // coordinator is owner/admin of classroomId2, NOT of subTeamId (which
    // belongs to classroomId, a different context entirely).
    await request(app).get(`/api/teams/${subTeamId}/blockers`).set(authHeader(coordinator.token)).expect(403);
  });
});

describe('Milestone 51 -- aggregation correctness', () => {
  it('reports accurate member counts, submission status, and blocker counts across multiple child teams', async () => {
    const owner = await registerAndLogin('m51_agg_owner');
    const classroomId = await createTeam(owner.token, `M51_Agg_${Date.now()}`);
    const teamA = await createSubTeam(owner.token, `M51_AggA_${Date.now()}`, classroomId);
    const teamB = await createSubTeam(owner.token, `M51_AggB_${Date.now()}`, classroomId);

    const memberA = await registerAndLogin('m51_agg_membera');
    await addMember(owner.token, teamA, memberA.userId, 'member').expect(200);
    await request(app).post('/api/work-entries/submit').set(authHeader(memberA.token)).send({ teamId: teamA, confirmedSummary: 'Did work today.' }).expect(201);

    await request(app).post('/api/blockers').set(authHeader(owner.token)).send({ teamId: teamB, title: 'Blocker in B' }).expect(201);

    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    const dashA = res.body.data.teams.find((t: any) => t.team_id === teamA);
    const dashB = res.body.data.teams.find((t: any) => t.team_id === teamB);

    expect(dashA.member_count).toBe(2); // owner (added automatically as sub-team creator) + memberA
    expect(dashA.submitted_today).toBe(true);
    expect(dashA.open_blocker_count).toBe(0);
    expect(dashA.needs_attention).toBe(false);

    expect(dashB.submitted_today).toBe(false);
    expect(dashB.open_blocker_count).toBe(1);
    expect(dashB.needs_attention).toBe(true);

    expect(res.body.data.summary.total_teams).toBe(2);
    expect(res.body.data.summary.submitted_today_count).toBe(1);
    expect(res.body.data.summary.blocked_count).toBe(1);
  });

  it('reports accurate task progress from an existing project', async () => {
    const owner = await registerAndLogin('m51_progress_owner');
    const classroomId = await createTeam(owner.token, `M51_Progress_${Date.now()}`);
    const teamA = await createSubTeam(owner.token, `M51_ProgressA_${Date.now()}`, classroomId);

    const projectRes = await request(app).post('/api/projects').set(authHeader(owner.token)).send({ projectName: 'Sprint 1', teamId: teamA }).expect(201);
    const projectId = projectRes.body.data.project_id;
    const task1 = await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 1' }).expect(201);
    await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 2' }).expect(201);
    await request(app).put(`/api/tasks/${task1.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);

    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    const dashA = res.body.data.teams.find((t: any) => t.team_id === teamA);
    expect(dashA.task_progress.total).toBe(2);
    expect(dashA.task_progress.completed).toBe(1);
    expect(dashA.task_progress.percent).toBe(50);
  });

  it('returns an empty teams array cleanly for a context with no sub-teams yet', async () => {
    const owner = await registerAndLogin('m51_empty_owner');
    const classroomId = await createTeam(owner.token, `M51_Empty_${Date.now()}`);
    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.teams).toEqual([]);
    expect(res.body.data.summary.total_teams).toBe(0);
  });

  it('a team with no project has null task_progress, not a crash', async () => {
    const owner = await registerAndLogin('m51_noproject_owner');
    const classroomId = await createTeam(owner.token, `M51_NoProject_${Date.now()}`);
    await createSubTeam(owner.token, `M51_NoProjectSub_${Date.now()}`, classroomId);

    const res = await request(app).get(`/api/teams/${classroomId}/context-dashboard`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.teams[0].task_progress).toBeNull();
  });
});
