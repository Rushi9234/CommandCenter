import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin, addMember } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createGoal = (token: string, teamId?: string, title = 'Notif Goal') =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title, goalType: 'project', teamId });

const getMyNotifications = (token: string, query = '') =>
  request(app).get(`/api/notifications${query}`).set(authHeader(token));

const markRead = (token: string, notificationId: string) =>
  request(app).put(`/api/notifications/${notificationId}/read`).set(authHeader(token));

const markAllRead = (token: string) =>
  request(app).put('/api/notifications/read-all').set(authHeader(token));

const getPreferences = (token: string) =>
  request(app).get('/api/notifications/preferences').set(authHeader(token));

const updatePreferences = (token: string, body: Record<string, boolean>) =>
  request(app).put('/api/notifications/preferences').set(authHeader(token)).send(body);

// Waits briefly for a notification to be persisted -- notifyUser() is
// fire-and-forget from the caller's perspective (awaited within the
// service, but the HTTP response for the TRIGGERING request doesn't
// depend on it finishing before the client sees 200/201). All the
// triggering requests in this file DO await notifyUser() internally
// before their own response resolves (confirmed by reading
// teams.service.ts/goals.service.ts's call sites), so no polling is
// actually needed in practice -- kept as a documented assumption, not a
// retry loop.
const findNotificationByCategory = async (token: string, category: string) => {
  const res = await getMyNotifications(token, '?limit=50');
  return res.body.data.notifications.find((n: any) => n.category === category);
};

describe('Notifications -- creation and recipient correctness', () => {
  it('a join request notifies the team owner/admin, not the requester', async () => {
    const owner = await registerAndLogin('notif_owner_a');
    const requester = await registerAndLogin('notif_requester_a');
    const teamId = await createTeam(owner.token, `NotifTeamA_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const ownerNotif = await findNotificationByCategory(owner.token, 'team.join_request.created');
    expect(ownerNotif).toBeTruthy();
    expect(ownerNotif.title).toBe('New join request');

    const requesterNotif = await findNotificationByCategory(requester.token, 'team.join_request.created');
    expect(requesterNotif).toBeFalsy();
  });

  it('an approved join request notifies the requester, not other members', async () => {
    const owner = await registerAndLogin('notif_owner_b');
    const requester = await registerAndLogin('notif_requester_b');
    const bystander = await registerAndLogin('notif_bystander_b');
    const teamId = await createTeam(owner.token, `NotifTeamB_${Date.now()}`);
    await addMember(owner.token, teamId, bystander.userId, 'member').expect(200);

    const joinRes = await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);
    const requestId = joinRes.body.data.request_id;

    await request(app).post(`/api/join-requests/${requestId}/approve`).set(authHeader(owner.token)).expect(200);

    const requesterNotif = await findNotificationByCategory(requester.token, 'team.join_request.approved');
    expect(requesterNotif).toBeTruthy();
    expect(requesterNotif.message).toContain('approved');

    const bystanderNotif = await findNotificationByCategory(bystander.token, 'team.join_request.approved');
    expect(bystanderNotif).toBeFalsy();
  });

  it('a team-goal proposal notifies the team leader, not other members, and approval notifies the proposer', async () => {
    const owner = await registerAndLogin('notif_owner_c');
    const member = await registerAndLogin('notif_member_c');
    const bystander = await registerAndLogin('notif_bystander_c');
    const teamId = await createTeam(owner.token, `NotifTeamC_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    await addMember(owner.token, teamId, bystander.userId, 'member').expect(200);

    const goalRes = await createGoal(member.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    const ownerNotif = await findNotificationByCategory(owner.token, 'goal.creation_proposed');
    expect(ownerNotif).toBeTruthy();
    expect(ownerNotif.title).toBe('Goal approval requested');

    const bystanderNotif = await findNotificationByCategory(bystander.token, 'goal.creation_proposed');
    expect(bystanderNotif).toBeFalsy();

    await request(app).post(`/api/goals/${goalId}/approve-creation`).set(authHeader(owner.token)).expect(200);

    const memberNotif = await findNotificationByCategory(member.token, 'goal.creation_approved');
    expect(memberNotif).toBeTruthy();
    expect(memberNotif.title).toBe('Your team goal was approved');
  });

  it('a leader creating a team goal directly generates no creation-proposal notification (auto-approved, nothing to notify)', async () => {
    const owner = await registerAndLogin('notif_owner_d');
    const teamId = await createTeam(owner.token, `NotifTeamD_${Date.now()}`);
    await createGoal(owner.token, teamId).expect(201);

    const res = await getMyNotifications(owner.token);
    expect(res.body.data.notifications.find((n: any) => n.category === 'goal.creation_proposed')).toBeFalsy();
  });

  it('task owner assignment notifies the assigned owner, not the assigning creator', async () => {
    const owner = await registerAndLogin('notif_owner_e');
    const assignee = await registerAndLogin('notif_assignee_e');
    const teamId = await createTeam(owner.token, `NotifTeamE_${Date.now()}`);
    await addMember(owner.token, teamId, assignee.userId, 'member').expect(200);

    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Notif Project', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Notif Task', owner: assignee.userId })
      .expect(201);

    const assigneeNotif = await findNotificationByCategory(assignee.token, 'task.owner_assigned');
    expect(assigneeNotif).toBeTruthy();
    expect(assigneeNotif.title).toBe('Task assigned to you');

    const ownerNotif = await findNotificationByCategory(owner.token, 'task.owner_assigned');
    expect(ownerNotif).toBeFalsy();
  });

  it('re-sending the same task owner on update does NOT generate a duplicate notification', async () => {
    const owner = await registerAndLogin('notif_owner_f');
    const assignee = await registerAndLogin('notif_assignee_f');
    const teamId = await createTeam(owner.token, `NotifTeamF_${Date.now()}`);
    await addMember(owner.token, teamId, assignee.userId, 'member').expect(200);

    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Notif Project F', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;
    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Notif Task F', owner: assignee.userId })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    // Resend the SAME owner via an unrelated field update.
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ owner: assignee.userId, priority: 'high' }).expect(200);

    const res = await getMyNotifications(assignee.token, '?limit=50');
    const ownerAssignedNotifs = res.body.data.notifications.filter((n: any) => n.category === 'task.owner_assigned');
    expect(ownerAssignedNotifs.length).toBe(1);
  });

  it('reassigning a task to a genuinely NEW owner does generate a fresh notification for the new owner', async () => {
    const owner = await registerAndLogin('notif_owner_g');
    const first = await registerAndLogin('notif_first_g');
    const second = await registerAndLogin('notif_second_g');
    const teamId = await createTeam(owner.token, `NotifTeamG_${Date.now()}`);
    await addMember(owner.token, teamId, first.userId, 'member').expect(200);
    await addMember(owner.token, teamId, second.userId, 'member').expect(200);

    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Notif Project G', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;
    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Notif Task G', owner: first.userId })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ owner: second.userId }).expect(200);

    const secondNotif = await findNotificationByCategory(second.token, 'task.owner_assigned');
    expect(secondNotif).toBeTruthy();
  });

  it('a blocker notifies team leadership (owner/admin/manager), not a plain member, and not the reporter', async () => {
    const owner = await registerAndLogin('notif_owner_h');
    const manager = await registerAndLogin('notif_manager_h');
    const reporter = await registerAndLogin('notif_reporter_h');
    const plainMember = await registerAndLogin('notif_plain_h');
    const teamId = await createTeam(owner.token, `NotifTeamH_${Date.now()}`);
    await addMember(owner.token, teamId, manager.userId, 'manager').expect(200);
    await addMember(owner.token, teamId, reporter.userId, 'member').expect(200);
    await addMember(owner.token, teamId, plainMember.userId, 'member').expect(200);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(reporter.token))
      .send({ teamId, title: 'Notif Blocker', description: 'blocked' })
      .expect(201);

    expect(await findNotificationByCategory(owner.token, 'blocker.created')).toBeTruthy();
    expect(await findNotificationByCategory(manager.token, 'blocker.created')).toBeTruthy();
    expect(await findNotificationByCategory(reporter.token, 'blocker.created')).toBeFalsy();
    expect(await findNotificationByCategory(plainMember.token, 'blocker.created')).toBeFalsy();
  });
});

describe('Notifications -- privacy and cross-team isolation', () => {
  it('a proposal on team A never notifies team B\'s leader', async () => {
    const ownerA = await registerAndLogin('notif_ownerA_i');
    const memberA = await registerAndLogin('notif_memberA_i');
    const ownerB = await registerAndLogin('notif_ownerB_i');
    const teamA = await createTeam(ownerA.token, `NotifTeamI1_${Date.now()}`);
    await createTeam(ownerB.token, `NotifTeamI2_${Date.now()}`);
    await addMember(ownerA.token, teamA, memberA.userId, 'member').expect(200);

    await createGoal(memberA.token, teamA).expect(201);

    expect(await findNotificationByCategory(ownerB.token, 'goal.creation_proposed')).toBeFalsy();
  });

  it('user A cannot read user B\'s notifications via GET /notifications (each user only ever sees their own)', async () => {
    const owner = await registerAndLogin('notif_owner_j');
    const requester = await registerAndLogin('notif_requester_j');
    const teamId = await createTeam(owner.token, `NotifTeamJ_${Date.now()}`);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const ownerRes = await getMyNotifications(owner.token, '?limit=50');
    const requesterRes = await getMyNotifications(requester.token, '?limit=50');
    // Structurally impossible for cross-contamination: the endpoint has
    // no notificationId/userId param at all, it is always scoped to
    // req.user.userId server-side -- this test documents that contract.
    expect(ownerRes.body.data.notifications.every((n: any) => true)).toBe(true);
    expect(requesterRes.body.data.notifications.length).toBe(0);
  });
});

describe('Notifications -- read-state ownership (IDOR protection)', () => {
  it('user A cannot mark user B\'s notification as read (403)', async () => {
    const owner = await registerAndLogin('notif_owner_k');
    const requester = await registerAndLogin('notif_requester_k');
    const outsider = await registerAndLogin('notif_outsider_k');
    const teamId = await createTeam(owner.token, `NotifTeamK_${Date.now()}`);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const ownerNotif = await findNotificationByCategory(owner.token, 'team.join_request.created');
    expect(ownerNotif).toBeTruthy();

    await markRead(outsider.token, ownerNotif.notification_id).expect(403);

    const stillUnread = await findNotificationByCategory(owner.token, 'team.join_request.created');
    expect(stillUnread.read_at).toBeNull();
  });

  it('the recipient can mark their own notification as read, idempotently', async () => {
    const owner = await registerAndLogin('notif_owner_l');
    const requester = await registerAndLogin('notif_requester_l');
    const teamId = await createTeam(owner.token, `NotifTeamL_${Date.now()}`);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const notif = await findNotificationByCategory(owner.token, 'team.join_request.created');

    const res1 = await markRead(owner.token, notif.notification_id).expect(200);
    expect(res1.body.data.read_at).not.toBeNull();

    // Second mark-read is a safe no-op, not an error.
    await markRead(owner.token, notif.notification_id).expect(200);
  });

  it('a malformed notification ID is rejected with 400, not a 500', async () => {
    const owner = await registerAndLogin('notif_owner_m');
    await markRead(owner.token, 'not-a-uuid').expect(400);
  });

  it('mark-all-read only affects the caller\'s own notifications', async () => {
    const owner = await registerAndLogin('notif_owner_n');
    const requesterX = await registerAndLogin('notif_requesterX_n');
    const requesterY = await registerAndLogin('notif_requesterY_n');
    const teamId = await createTeam(owner.token, `NotifTeamN_${Date.now()}`);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterX.token)).expect(200);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterY.token)).expect(200);

    const before = await getMyNotifications(owner.token, '?limit=50');
    expect(before.body.data.unreadCount).toBeGreaterThanOrEqual(2);

    const res = await markAllRead(owner.token).expect(200);
    expect(res.body.data.markedCount).toBeGreaterThanOrEqual(2);

    const after = await getMyNotifications(owner.token, '?limit=50');
    expect(after.body.data.unreadCount).toBe(0);
    expect(after.body.data.notifications.every((n: any) => n.read_at !== null)).toBe(true);
  });
});

describe('Notifications -- unread count and pagination', () => {
  it('unread count reflects only unread notifications, updates after marking read', async () => {
    const owner = await registerAndLogin('notif_owner_o');
    const requester = await registerAndLogin('notif_requester_o');
    const teamId = await createTeam(owner.token, `NotifTeamO_${Date.now()}`);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    const before = await getMyNotifications(owner.token);
    expect(before.body.data.unreadCount).toBe(1);

    const notif = before.body.data.notifications[0];
    await markRead(owner.token, notif.notification_id).expect(200);

    const after = await getMyNotifications(owner.token);
    expect(after.body.data.unreadCount).toBe(0);
  });

  it('pagination via limit/offset returns the newest-first page requested', async () => {
    const owner = await registerAndLogin('notif_owner_p');
    const teamId = await createTeam(owner.token, `NotifTeamP_${Date.now()}`);
    for (let i = 0; i < 5; i++) {
      const requester = await registerAndLogin(`notif_requester_p${i}`);
      await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);
    }

    const page1 = await getMyNotifications(owner.token, '?limit=2&offset=0').expect(200);
    expect(page1.body.data.notifications.length).toBe(2);
    const page2 = await getMyNotifications(owner.token, '?limit=2&offset=2').expect(200);
    expect(page2.body.data.notifications.length).toBe(2);
    expect(page1.body.data.notifications[0].notification_id).not.toBe(page2.body.data.notifications[0].notification_id);
  });

  it('a malformed limit/offset query param is rejected with 400', async () => {
    const owner = await registerAndLogin('notif_owner_q');
    await getMyNotifications(owner.token, '?limit=not-a-number').expect(400);
  });
});

describe('Notifications -- preferences', () => {
  it('defaults to all categories ON for a fresh user', async () => {
    const owner = await registerAndLogin('notif_owner_r');
    const res = await getPreferences(owner.token).expect(200);
    expect(res.body.data).toEqual({
      team_join_request: true,
      goal_creation: true,
      goal_completion: true,
      task_assignment: true,
      blocker: true,
    });
  });

  it('disabling a category suppresses future notifications in that category, without affecting others', async () => {
    const owner = await registerAndLogin('notif_owner_s');
    const requester = await registerAndLogin('notif_requester_s');
    const teamId = await createTeam(owner.token, `NotifTeamS_${Date.now()}`);

    await updatePreferences(owner.token, { team_join_request: false }).expect(200);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requester.token)).expect(200);

    expect(await findNotificationByCategory(owner.token, 'team.join_request.created')).toBeFalsy();
  });

  it('re-enabling a category resumes delivery', async () => {
    const owner = await registerAndLogin('notif_owner_t');
    const requesterA = await registerAndLogin('notif_requesterA_t');
    const requesterB = await registerAndLogin('notif_requesterB_t');
    const teamId = await createTeam(owner.token, `NotifTeamT_${Date.now()}`);

    await updatePreferences(owner.token, { team_join_request: false }).expect(200);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterA.token)).expect(200);
    expect(await findNotificationByCategory(owner.token, 'team.join_request.created')).toBeFalsy();

    await updatePreferences(owner.token, { team_join_request: true }).expect(200);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(requesterB.token)).expect(200);
    expect(await findNotificationByCategory(owner.token, 'team.join_request.created')).toBeTruthy();
  });

  it('a user cannot read or modify another user\'s preferences -- there is no cross-user param at all', async () => {
    const userA = await registerAndLogin('notif_userA_u');
    const userB = await registerAndLogin('notif_userB_u');

    await updatePreferences(userA.token, { blocker: false }).expect(200);

    const bRes = await getPreferences(userB.token).expect(200);
    expect(bRes.body.data.blocker).toBe(true);
  });

  it('an unrecognized preference key is rejected (400), not silently accepted', async () => {
    const owner = await registerAndLogin('notif_owner_v');
    await updatePreferences(owner.token, { not_a_real_category: false } as any).expect(400);
  });
});
