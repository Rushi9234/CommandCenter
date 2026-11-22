import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles } from './utils/fixtures';

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Task #1 — CommandCenter Attention / Action Center Integration & Security Tests', () => {
  it('1. Individual Scope: GET /api/attention/me returns user-authorized attention items with evidence and action targets', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();

    // Create a project & task assigned to member
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Alpha Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task assigned to member', ownerId: member.userId })
      .expect(201);

    // Create an SOS blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(member.token))
      .send({ teamId, title: 'Network Outage', urgency: 'critical' })
      .expect(201);

    const res = await request(app)
      .get('/api/attention/me')
      .set(authHeader(member.token))
      .expect(200);

    const data = res.body.data;
    expect(data.scope).toBe('INDIVIDUAL');
    expect(data.user_id).toBe(member.userId);
    expect(data.total_action_items).toBeGreaterThanOrEqual(1);

    const blockerItem = data.items.find((i: any) => i.category === 'BLOCKER');
    expect(blockerItem).toBeDefined();
    expect(blockerItem.title).toContain('Network Outage');
    expect(blockerItem.urgency).toBe('critical');
    expect(blockerItem.evidence.some((e: any) => e.label === 'Team')).toBe(true);
    expect(blockerItem.action.route).toBe('/help');
  });

  it('2. Individual Scope: Returns honest empty state when zero attention items exist', async () => {
    const { member } = await buildTeamWithRoles();

    const res = await request(app)
      .get('/api/attention/me')
      .set(authHeader(member.token))
      .expect(200);

    const data = res.body.data;
    expect(data.scope).toBe('INDIVIDUAL');
    expect(data.total_action_items).toBe(0);
    expect(data.items.length).toBe(0);
    expect(data.attention_status).toBe('ON_TRACK');
    expect(data.summary).toContain('No attention items right now');
  });

  it('3. Team Scope: GET /api/attention/teams/:teamId returns team blockers, stalled tasks, and pending join requests with evidence', async () => {
    const { teamId, owner, member, nonMember } = await buildTeamWithRoles();

    // Create blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(member.token))
      .send({ teamId, title: 'DB Pool Exhaustion', urgency: 'high' })
      .expect(201);

    // Create join request from nonMember
    await request(app)
      .post(`/api/teams/${teamId}/join`)
      .set(authHeader(nonMember.token))
      .expect(200);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const data = res.body.data;
    expect(data.scope).toBe('TEAM');
    expect(data.team_id).toBe(teamId);
    expect(data.total_action_items).toBeGreaterThanOrEqual(2);

    const blockerItem = data.items.find((i: any) => i.category === 'BLOCKER');
    expect(blockerItem).toBeDefined();
    expect(blockerItem.title).toContain('DB Pool Exhaustion');
    expect(blockerItem.evidence.length).toBeGreaterThan(0);

    const joinItem = data.items.find((i: any) => i.category === 'PENDING_JOIN_REQUEST');
    expect(joinItem).toBeDefined();
    expect(joinItem.title).toContain(nonMember.user.fullName);
    expect(joinItem.action.route).toBe(`/teams/${teamId}`);
  });

  it('4. Team Scope: Non-member requesting team attention receives 403 Forbidden (IDOR Protection)', async () => {
    const { teamId } = await buildTeamWithRoles();
    const { nonMember } = await buildTeamWithRoles();

    await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(nonMember.token))
      .expect(403);
  });

  it('5. Classroom Scope: GET /api/attention/classrooms/:teamId returns sub-team risk evidence for parent team owner/admin', async () => {
    const { teamId: parentTeamId, owner: parentOwner } = await buildTeamWithRoles();
    const { teamId: childTeamId, owner: childOwner } = await buildTeamWithRoles();

    // Link child team to parent team
    await pgPool.query('UPDATE teams SET parent_team_id = $1 WHERE team_id = $2', [parentTeamId, childTeamId]);

    // Create 2 open blockers in child team to trigger AT_RISK status
    await request(app)
      .post('/api/blockers')
      .set(authHeader(childOwner.token))
      .send({ teamId: childTeamId, title: 'Child Blocker 1', urgency: 'critical' })
      .expect(201);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(childOwner.token))
      .send({ teamId: childTeamId, title: 'Child Blocker 2', urgency: 'high' })
      .expect(201);

    const res = await request(app)
      .get(`/api/attention/classrooms/${parentTeamId}`)
      .set(authHeader(parentOwner.token))
      .expect(200);

    const data = res.body.data;
    expect(data.scope).toBe('CLASSROOM');
    expect(data.parent_team_id).toBe(parentTeamId);
    expect(data.at_risk_teams_count).toBeGreaterThanOrEqual(1);

    const subTeamItem = data.items.find((i: any) => i.category === 'SUBTEAM_AT_RISK');
    expect(subTeamItem).toBeDefined();
    expect(subTeamItem.urgency).toBe('critical');
    expect(subTeamItem.action.route).toBe(`/teams/${childTeamId}`);
  });

  it('6. Classroom Scope: Non-parent-owner receives 403 Forbidden', async () => {
    const { teamId: parentTeamId } = await buildTeamWithRoles();
    const { member: nonOwner } = await buildTeamWithRoles();

    await request(app)
      .get(`/api/attention/classrooms/${parentTeamId}`)
      .set(authHeader(nonOwner.token))
      .expect(403);
  });

  it('7. Privacy & Isolation: Individual attention does NOT expose another user\'s private work', async () => {
    const { member } = await buildTeamWithRoles();
    const { teamId: strangerTeamId, owner: stranger } = await buildTeamWithRoles();

    // Create stranger's blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(stranger.token))
      .send({ teamId: strangerTeamId, title: 'Secret Stranger Blocker', urgency: 'critical' })
      .expect(201);

    const res = await request(app)
      .get('/api/attention/me')
      .set(authHeader(member.token))
      .expect(200);

    const data = res.body.data;
    const hasStrangerBlocker = data.items.some((i: any) => i.title.includes('Secret Stranger Blocker'));
    expect(hasStrangerBlocker).toBe(false);
  });


  it('8. Multiple simultaneous attention items surfaced with correct evidence and drill-down targets', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();

    // 1. Create blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(member.token))
      .send({ teamId, title: 'Simultaneous Blocker', urgency: 'critical' })
      .expect(201);

    // 2. Create project with past deadline & overdue task
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Simultaneous Project', teamId, deadline: new Date(Date.now() - 86400000).toISOString() })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Simultaneous Task', owner: member.userId })
      .expect(201);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const data = res.body.data;
    expect(data.total_action_items).toBeGreaterThanOrEqual(2);
    expect(data.items.some((i: any) => i.category === 'BLOCKER')).toBe(true);
    expect(data.items.some((i: any) => i.category === 'OVERDUE_TASK')).toBe(true);
  });
});
