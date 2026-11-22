import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, registerAndLogin } from './utils/fixtures';

beforeAll(async () => {
  jest.setTimeout(60000);
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Project Collaboration, Discovery & Notification Verification (Section 24 Tests)', () => {
  it('1 & 2. Public project discovery includes public projects and excludes private projects', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const owner = await registerAndLogin(`owner_disc_${ts}`);
    const outsider = await registerAndLogin(`outsider_disc_${ts}`);

    // Create public personal project
    const pubRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `QA Public Discovery ${ts}`, description: 'Public App', isPublic: true })
      .expect(201);
    const pubId = pubRes.body.data.project_id;

    // Create private personal project
    const privRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `QA Private Stealth ${ts}`, description: 'Private App', isPublic: false })
      .expect(201);
    const privId = privRes.body.data.project_id;

    await new Promise((r) => setTimeout(r, 200));

    // Outsider calls GET /api/projects/public
    const res = await request(app)
      .get('/api/projects/public')
      .set(authHeader(outsider.token))
      .expect(200);

    const publicList = res.body.data;
    const foundPub = publicList.find((p: any) => p.project_id === pubId);
    const foundPriv = publicList.find((p: any) => p.project_id === privId);

    expect(foundPub).toBeDefined();
    expect(foundPub.project_name).toBe(`QA Public Discovery ${ts}`);
    expect(foundPriv).toBeUndefined();
  });

  it('3, 4, 8. Collaboration request creation, duplicate handling & owner notification', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const owner = await registerAndLogin(`owner_collab_${ts}`);
    const requester = await registerAndLogin(`requester_collab_${ts}`);

    // Owner creates public project
    const pubRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `Collab Project ${ts}`, description: 'Open Collab', isPublic: true })
      .expect(201);
    const projectId = pubRes.body.data.project_id;
    await new Promise((r) => setTimeout(r, 200));

    // Requester submits collaboration request
    const reqRes = await request(app)
      .post(`/api/projects/${projectId}/collaborate`)
      .set(authHeader(requester.token))
      .expect(201);

    expect(reqRes.body.data.status).toBe('pending');
    expect(reqRes.body.data.user_id).toBe(requester.userId);

    // Duplicate request: submitting again returns 409 Conflict with clear message
    const dupRes = await request(app)
      .post(`/api/projects/${projectId}/collaborate`)
      .set(authHeader(requester.token))
      .expect(409);
    expect(dupRes.body.error).toContain('already pending');

    // Owner receives notification
    const notifRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(owner.token))
      .expect(200);

    const notifications = notifRes.body.data.notifications || notifRes.body.data;
    const collabNotif = notifications.find(
      (n: any) => n.category === 'project.collaboration_requested' && n.project_id === projectId
    );
    expect(collabNotif).toBeDefined();
    expect(collabNotif.message).toContain('wants to collaborate');
  });

  it('5, 6, 7, 9. Owner accept/reject authorization and requester notifications', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const owner = await registerAndLogin(`owner_acc_${ts}`);
    const reqAccept = await registerAndLogin(`req_acc_${ts}`);
    const reqReject = await registerAndLogin(`req_rej_${ts}`);
    const attacker = await registerAndLogin(`attacker_acc_${ts}`);

    const pubRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `Accept Reject Test ${ts}`, description: 'Collab Test', isPublic: true })
      .expect(201);
    const projectId = pubRes.body.data.project_id;
    await new Promise((r) => setTimeout(r, 200));

    // Submit 2 requests
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(reqAccept.token)).expect(201);
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(reqReject.token)).expect(201);
    await new Promise((r) => setTimeout(r, 200));

    // Attacker tries to accept reqAccept's request -> 403 Forbidden
    await request(app)
      .post(`/api/projects/${projectId}/collaboration/${reqAccept.userId}/accept`)
      .set(authHeader(attacker.token))
      .expect(403);

    // Owner accepts reqAccept
    const acceptRes = await request(app)
      .post(`/api/projects/${projectId}/collaboration/${reqAccept.userId}/accept`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(acceptRes.body.data.status).toBe('accepted');

    // Owner rejects reqReject
    const rejectRes = await request(app)
      .post(`/api/projects/${projectId}/collaboration/${reqReject.userId}/reject`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    await new Promise((r) => setTimeout(r, 200));

    // reqAccept receives accepted notification
    const accNotifRes = await request(app).get('/api/notifications').set(authHeader(reqAccept.token)).expect(200);
    const accList = accNotifRes.body.data.notifications || accNotifRes.body.data;
    const accNotif = accList.find((n: any) => n.category === 'project.collaboration_accepted');
    expect(accNotif).toBeDefined();
    expect(accNotif.project_id).toBe(projectId);

    // reqReject receives rejected notification
    const rejNotifRes = await request(app).get('/api/notifications').set(authHeader(reqReject.token)).expect(200);
    const rejList = rejNotifRes.body.data.notifications || rejNotifRes.body.data;
    const rejNotif = rejList.find((n: any) => n.category === 'project.collaboration_rejected');
    expect(rejNotif).toBeDefined();
    expect(rejNotif.project_id).toBe(projectId);
  });

  it('11, 12, 13, 14, 15. Collaborator permissions, task creation, review workflow, and delete restriction', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const owner = await registerAndLogin(`owner_contrib_${ts}`);
    const collaborator = await registerAndLogin(`collab_contrib_${ts}`);

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `Contribution Project ${ts}`, description: 'Workflow test', isPublic: true })
      .expect(201);
    const projectId = projRes.body.data.project_id;
    await new Promise((r) => setTimeout(r, 200));

    // Request & accept collaboration
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(collaborator.token)).expect(201);
    await request(app).post(`/api/projects/${projectId}/collaboration/${collaborator.userId}/accept`).set(authHeader(owner.token)).expect(200);
    await new Promise((r) => setTimeout(r, 200));

    // Accepted collaborator creates a task
    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(collaborator.token))
      .send({ title: `Feature by Collaborator ${ts}`, owner: collaborator.userId, status: 'in_progress' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    // Collaborator submits task for review
    const submitRes = await request(app)
      .post(`/api/tasks/${taskId}/submit`)
      .set(authHeader(collaborator.token))
      .send({ notes: 'Please review my feature implementation' })
      .expect(200);
    expect(submitRes.body.data.status).toBe('review');

    // Owner receives review notification
    const ownerNotifRes = await request(app).get('/api/notifications').set(authHeader(owner.token)).expect(200);
    const ownerNotifList = ownerNotifRes.body.data.notifications || ownerNotifRes.body.data;
    const reviewNotif = ownerNotifList.find((n: any) => n.category === 'task.review_requested');
    expect(reviewNotif).toBeDefined();

    // Owner requests changes
    const reqChangesRes = await request(app)
      .post(`/api/tasks/${taskId}/request-changes`)
      .set(authHeader(owner.token))
      .send({ reason: 'Please fix edge case error handling' })
      .expect(200);
    expect(reqChangesRes.body.data.status).toBe('in_progress');

    // Collaborator re-submits task for review
    await request(app).post(`/api/tasks/${taskId}/submit`).set(authHeader(collaborator.token)).expect(200);

    // Owner approves task
    const approveRes = await request(app)
      .post(`/api/tasks/${taskId}/approve`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(approveRes.body.data.status).toBe('done');

    // Collaborator tries to DELETE the project -> 403 Forbidden (Only project creator can delete)
    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set(authHeader(collaborator.token))
      .expect(403);
  });

  it('16. Private project unauthorized access is strictly denied (403 Forbidden)', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const owner = await registerAndLogin(`owner_priv_${ts}`);
    const intruder = await registerAndLogin(`intruder_priv_${ts}`);

    const privRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: `Secret Vault ${ts}`, isPublic: false })
      .expect(201);
    const projectId = privRes.body.data.project_id;

    // Intruder tries to GET project details -> 403 Forbidden
    await request(app)
      .get(`/api/projects/${projectId}/details`)
      .set(authHeader(intruder.token))
      .expect(403);

    // Intruder tries to GET project tasks -> 403 Forbidden
    await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set(authHeader(intruder.token))
      .expect(403);
  });

  it('Section 12: Complete 16-Point Project Collaborator Task Authorization Matrix', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const rush = await registerAndLogin(`rush_owner_${ts}`);
    const pooja = await registerAndLogin(`pooja_collab_${ts}`);
    const pendingUser = await registerAndLogin(`pending_u_${ts}`);
    const rejectedUser = await registerAndLogin(`rejected_u_${ts}`);
    const revokedUser = await registerAndLogin(`revoked_u_${ts}`);
    const stranger = await registerAndLogin(`stranger_u_${ts}`);

    // Create public independent project
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(rush.token))
      .send({ projectName: `Rush App ${ts}`, description: 'Independent Project', isPublic: true })
      .expect(201);
    const projectId = projRes.body.data.project_id;
    await new Promise((r) => setTimeout(r, 200));

    // Setup collaborator states:
    // Pooja -> accepted
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(pooja.token)).expect(201);
    await request(app).post(`/api/projects/${projectId}/collaboration/${pooja.userId}/accept`).set(authHeader(rush.token)).expect(200);

    // pendingUser -> pending
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(pendingUser.token)).expect(201);

    // rejectedUser -> rejected
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(rejectedUser.token)).expect(201);
    await request(app).post(`/api/projects/${projectId}/collaboration/${rejectedUser.userId}/reject`).set(authHeader(rush.token)).expect(200);

    // revokedUser -> accepted then revoked
    await request(app).post(`/api/projects/${projectId}/collaborate`).set(authHeader(revokedUser.token)).expect(201);
    await request(app).post(`/api/projects/${projectId}/collaboration/${revokedUser.userId}/accept`).set(authHeader(rush.token)).expect(200);
    await request(app).post(`/api/projects/${projectId}/collaboration/${revokedUser.userId}/revoke`).set(authHeader(rush.token)).expect(200);

    await new Promise((r) => setTimeout(r, 200));

    // 1. Accepted collaborator (Pooja) can access project
    const detailsRes = await request(app)
      .get(`/api/projects/${projectId}/details`)
      .set(authHeader(pooja.token))
      .expect(200);
    expect(detailsRes.body.data.project_id).toBe(projectId);

    // 4. Project owner (Rush) can assign task to accepted collaborator (Pooja)
    const assignedTaskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(rush.token))
      .send({ title: `Assigned Task to Pooja ${ts}`, owner: pooja.userId, priority: 'high' })
      .expect(201);
    const assignedTaskId = assignedTaskRes.body.data.task_id;

    // 16. Collaborator receives assignment notification
    await new Promise((r) => setTimeout(r, 200));
    const poojaNotifs = await request(app).get('/api/notifications').set(authHeader(pooja.token)).expect(200);
    const poojaNotifList = poojaNotifs.body.data.notifications || poojaNotifs.body.data;
    const assignNotif = poojaNotifList.find((n: any) => n.category === 'task.owner_assigned' && n.task_id === assignedTaskId);
    expect(assignNotif).toBeDefined();

    // 2. Accepted collaborator (Pooja) can view permitted task
    const tasksRes = await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set(authHeader(pooja.token))
      .expect(200);
    const foundTask = tasksRes.body.data.find((t: any) => t.task_id === assignedTaskId);
    expect(foundTask).toBeDefined();

    // 3. Accepted collaborator (Pooja) can update permitted task
    const updateTaskRes = await request(app)
      .put(`/api/tasks/${assignedTaskId}`)
      .set(authHeader(pooja.token))
      .send({ status: 'in_progress', description: 'Working on feature implementation' })
      .expect(200);
    expect(updateTaskRes.body.data.status).toBe('in_progress');

    // 6. Accepted collaborator (Pooja) can submit for review
    const submitRes = await request(app)
      .post(`/api/tasks/${assignedTaskId}/submit`)
      .set(authHeader(pooja.token))
      .send({ notes: 'Completed feature code' })
      .expect(200);
    expect(submitRes.body.data.status).toBe('review');

    // 15. Owner receives review notification
    await new Promise((r) => setTimeout(r, 200));
    const rushNotifs = await request(app).get('/api/notifications').set(authHeader(rush.token)).expect(200);
    const rushNotifList = rushNotifs.body.data.notifications || rushNotifs.body.data;
    const reviewReqNotif = rushNotifList.find((n: any) => n.category === 'task.review_requested' && n.task_id === assignedTaskId);
    expect(reviewReqNotif).toBeDefined();

    // 7. Collaborator (Pooja) CANNOT approve own contribution/task
    await request(app)
      .post(`/api/tasks/${assignedTaskId}/approve`)
      .set(authHeader(pooja.token))
      .expect(403);

    // 9. Project owner (Rush) can request changes
    const reqChangesRes = await request(app)
      .post(`/api/tasks/${assignedTaskId}/request-changes`)
      .set(authHeader(rush.token))
      .send({ reason: 'Add unit tests' })
      .expect(200);
    expect(reqChangesRes.body.data.status).toBe('in_progress');

    // Pooja re-submits
    await request(app).post(`/api/tasks/${assignedTaskId}/submit`).set(authHeader(pooja.token)).expect(200);

    // 8. Project owner (Rush) can approve
    const approveRes = await request(app)
      .post(`/api/tasks/${assignedTaskId}/approve`)
      .set(authHeader(rush.token))
      .expect(200);
    expect(approveRes.body.data.status).toBe('done');

    // 5. Accepted collaborator (Pooja) can create contribution/task
    const poojaCreatedRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(pooja.token))
      .send({ title: `Pooja's Self-Created Task ${ts}`, status: 'in_progress' })
      .expect(201);
    const poojaTaskId = poojaCreatedRes.body.data.task_id;
    expect(poojaCreatedRes.body.data.created_by).toBe(pooja.userId);

    // Pooja submits her contribution for review
    await request(app).post(`/api/tasks/${poojaTaskId}/submit`).set(authHeader(pooja.token)).expect(200);
    // Rush approves Pooja's contribution
    await request(app).post(`/api/tasks/${poojaTaskId}/approve`).set(authHeader(rush.token)).expect(200);

    // 13. Collaborator (Pooja) CANNOT delete project
    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set(authHeader(pooja.token))
      .expect(403);

    // Make project private to test unauthorized/pending/rejected/revoked permissions
    await request(app)
      .put(`/api/projects/${projectId}`)
      .set(authHeader(rush.token))
      .send({ is_public: false })
      .expect(200);

    // 10. Pending collaborator denied access to private project task
    await request(app)
      .put(`/api/tasks/${assignedTaskId}`)
      .set(authHeader(pendingUser.token))
      .send({ status: 'in_progress' })
      .expect(403);

    // 11. Rejected collaborator denied access
    await request(app)
      .put(`/api/tasks/${assignedTaskId}`)
      .set(authHeader(rejectedUser.token))
      .send({ status: 'in_progress' })
      .expect(403);

    // 12. Revoked collaborator denied access
    await request(app)
      .put(`/api/tasks/${assignedTaskId}`)
      .set(authHeader(revokedUser.token))
      .send({ status: 'in_progress' })
      .expect(403);

    // 14. Unrelated stranger denied access
    await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set(authHeader(stranger.token))
      .expect(403);
  }, 90000);
});
