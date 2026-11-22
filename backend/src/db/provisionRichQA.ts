import { query } from './client';
import bcrypt from 'bcrypt';

async function main() {
  try {
    console.log('--- Provisioning Rich QA Test Topology ---');

    // 1. Password Hash using bcrypt cost 12
    const passwordHash = await bcrypt.hash('Password123!', 12);

    const userNames = [
      { name: 'Rush', email: 'rush@commandcenter.local', username: 'rush' },
      { name: 'Raju', email: 'raju@commandcenter.local', username: 'raju' },
      { name: 'Sham', email: 'sham@commandcenter.local', username: 'sham' },
      { name: 'Amit', email: 'amit@commandcenter.local', username: 'amit' },
      { name: 'Neha', email: 'neha@commandcenter.local', username: 'neha' },
      { name: 'Pooja', email: 'pooja@commandcenter.local', username: 'pooja' },
      { name: 'Kiran', email: 'kiran@commandcenter.local', username: 'kiran' },
      { name: 'Ravi', email: 'ravi@commandcenter.local', username: 'ravi' },
      { name: 'Sita', email: 'sita@commandcenter.local', username: 'sita' },
      { name: 'Mohan', email: 'mohan@commandcenter.local', username: 'mohan' },
      { name: 'Nikhil', email: 'nikhil@commandcenter.local', username: 'nikhil' },
      { name: 'Priya', email: 'priya@commandcenter.local', username: 'priya' },
      { name: 'Arun', email: 'arun@commandcenter.local', username: 'arun' },
      { name: 'Vikram', email: 'vikram@commandcenter.local', username: 'vikram' },
    ];

    const userMap: Record<string, string> = {};
    for (const u of userNames) {
      const res = await query<any>(
        `INSERT INTO users (full_name, email, username, password_hash, role, is_verified)
         VALUES ($1, $2, $3, $4, 'member', true)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash
         RETURNING user_id, email, full_name`,
        [u.name, u.email, u.username, passwordHash]
      );
      userMap[u.name] = res[0].user_id;
    }

    console.log(`Provisioned ${Object.keys(userMap).length} users.`);

    // 2. Classes
    const rushId = userMap['Rush'];
    const shamId = userMap['Sham'];
    const amitId = userMap['Amit'];

    const classARes = await query<any>(
      `INSERT INTO teams (team_name, description, created_by, team_type, is_public, is_discoverable)
       VALUES ('Class A — Computer Science', 'Class A CS Department', $1, 'classroom', true, true)
       RETURNING team_id`,
      [rushId]
    );
    const classAId = classARes[0].team_id;

    const classBRes = await query<any>(
      `INSERT INTO teams (team_name, description, created_by, team_type, is_public, is_discoverable)
       VALUES ('Class B — Information Technology', 'Class B IT Department', $1, 'classroom', true, true)
       RETURNING team_id`,
      [shamId]
    );
    const classBId = classBRes[0].team_id;

    const classCRes = await query<any>(
      `INSERT INTO teams (team_name, description, created_by, team_type, is_public, is_discoverable)
       VALUES ('Class C — Data Science', 'Class C DS Department', $1, 'classroom', true, true)
       RETURNING team_id`,
      [amitId]
    );
    const classCId = classCRes[0].team_id;

    // Add Class Owners as Owners in team_members for class
    await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [classAId, rushId]);
    await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [classBId, shamId]);
    await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [classCId, amitId]);

    // 3. Class Sub-Teams
    const teamSpecs = [
      // Class A sub-teams
      { name: 'Team A1 (Alpha)', parent: classAId, leader: 'Raju', members: ['Pooja', 'Kiran', 'Ravi'] },
      { name: 'Team A2 (Beta)', parent: classAId, leader: 'Sham', members: ['Sita', 'Mohan'] },
      { name: 'Team A3 (Gamma)', parent: classAId, leader: 'Nikhil', members: ['Priya', 'Arun'] },
      { name: 'Team A4 (Delta)', parent: classAId, leader: 'Vikram', members: ['Rush'] },

      // Class B sub-teams
      { name: 'Team B1 (Epsilon)', parent: classBId, leader: 'Sham', members: ['Amit', 'Neha'] },
      { name: 'Team B2 (Zeta)', parent: classBId, leader: 'Neha', members: ['Pooja', 'Raju', 'Kiran'] },
      { name: 'Team B3 (Eta)', parent: classBId, leader: 'Pooja', members: ['Ravi', 'Sita'] },
      { name: 'Team B4 (Theta)', parent: classBId, leader: 'Mohan', members: ['Nikhil', 'Priya'] },

      // Class C sub-teams
      { name: 'Team C1 (Iota)', parent: classCId, leader: 'Amit', members: ['Arun', 'Vikram'] },
      { name: 'Team C2 (Kappa)', parent: classCId, leader: 'Kiran', members: ['Ravi', 'Sita'] },
      { name: 'Team C3 (Lambda)', parent: classCId, leader: 'Rush', members: ['Raju', 'Sham'] },
      { name: 'Team C4 (Mu)', parent: classCId, leader: 'Neha', members: ['Mohan', 'Nikhil'] },

      // Unparented Teams
      { name: 'Unparented Team X', parent: null, leader: 'Raju', members: ['Pooja', 'Sham'] },
      { name: 'Unparented Team Y', parent: null, leader: 'Sham', members: ['Amit', 'Neha'] },
      { name: 'Unparented Team Z', parent: null, leader: 'Mohan', members: ['Priya', 'Arun'] },
    ];

    const teamMap: Record<string, string> = {};
    for (const spec of teamSpecs) {
      const leaderId = userMap[spec.leader];
      const res = await query<any>(
        `INSERT INTO teams (team_name, description, created_by, parent_team_id, team_type, is_public)
         VALUES ($1, $2, $3, $4, 'main', true)
         RETURNING team_id`,
        [spec.name, `${spec.name} description`, leaderId, spec.parent]
      );
      const tid = res[0].team_id;
      teamMap[spec.name] = tid;

      // Add leader as owner
      await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [tid, leaderId]);

      // Add members
      for (const mName of spec.members) {
        const mid = userMap[mName];
        await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [tid, mid]);
      }
    }

    console.log(`Provisioned ${Object.keys(teamMap).length} teams.`);

    // 4. Projects & Tasks
    const teamA1Id = teamMap['Team A1 (Alpha)'];
    const teamB2Id = teamMap['Team B2 (Zeta)'];
    const poojaId = userMap['Pooja'];
    const rajuId = userMap['Raju'];

    // Team A1 Project
    const projA1Res = await query<any>(
      `INSERT INTO projects (project_name, description, team_id, created_by, status, is_public)
       VALUES ('Team A1 Project — AI Analytics', 'CS AI Analytics Platform', $1, $2, 'active', true)
       RETURNING project_id`,
      [teamA1Id, rajuId]
    );
    const projA1Id = projA1Res[0].project_id;

    // Team A1 Tasks for Pooja
    await query(
      `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
       VALUES ($1, 'Task A1-1: Build SVG Donut Chart', 'Build interactive SVG donut chart component', $2, 'in_progress', 'high', $3)`,
      [projA1Id, poojaId, rajuId]
    );

    await query(
      `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
       VALUES ($1, 'Task A1-2: Add 7-Day Trend Graph', 'Implement SVG line graph', $2, 'done', 'medium', $3)`,
      [projA1Id, poojaId, rajuId]
    );

    // Team B2 Project
    const projB2Res = await query<any>(
      `INSERT INTO projects (project_name, description, team_id, created_by, status, is_public)
       VALUES ('Team B2 Project — Cloud Portal', 'IT Cloud Management Portal', $1, $2, 'active', true)
       RETURNING project_id`,
      [teamB2Id, userMap['Neha']]
    );
    const projB2Id = projB2Res[0].project_id;

    // Team B2 Task for Pooja
    await query(
      `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
       VALUES ($1, 'Task B2-1: Configure AWS Deployment', 'Setup CloudFront CDN', $2, 'review', 'high', $3)`,
      [projB2Id, poojaId, userMap['Neha']]
    );

    // Personal Project for Pooja
    const projPoojaPersonalRes = await query<any>(
      `INSERT INTO projects (project_name, description, team_id, created_by, status, is_public)
       VALUES ('Pooja Personal App', 'Private portfolio project', NULL, $1, 'planning', false)
       RETURNING project_id`,
      [poojaId]
    );
    const projPoojaPersonalId = projPoojaPersonalRes[0].project_id;

    await query(
      `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
       VALUES ($1, 'Task P-1: Design Personal Portfolio', 'Personal design task', $2, 'todo', 'low', $2)`,
      [projPoojaPersonalId, poojaId]
    );

    // Additional Team Projects for varied progress
    for (const tName of Object.keys(teamMap)) {
      if (tName === 'Team A1 (Alpha)' || tName === 'Team B2 (Zeta)') continue;
      const tid = teamMap[tName];
      const pRes = await query<any>(
        `INSERT INTO projects (project_name, description, team_id, created_by, status, is_public)
         VALUES ($1, $2, $3, $4, 'active', true)
         RETURNING project_id`,
        [`${tName} Core Module`, `Core project for ${tName}`, tid, rushId]
      );
      const pid = pRes[0].project_id;

      // Seed 5-6 tasks per project with varied statuses
      const statuses = ['todo', 'in_progress', 'review', 'done', 'done'];
      for (let i = 1; i <= 5; i++) {
        const st = statuses[i % statuses.length];
        await query(
          `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
           VALUES ($1, $2, $3, $4, $5, 'medium', $6)`,
          [pid, `Task ${tName}-${i}`, `Task description ${i}`, rajuId, st, rushId]
        );
      }
    }

    // 5. Team Goals & Blockers for Team A1
    await query(
      `INSERT INTO goals (title, description, team_id, created_by, status, progress)
       VALUES ('Goal A1: Launch Analytics MVP', 'Deliver v1 of team analytics dashboard', $1, $2, 'in_progress', 75)`,
      [teamA1Id, poojaId]
    );

    await query(
      `INSERT INTO blockers (team_id, title, description, status, created_by, severity)
       VALUES ($1, 'Blocker A1: API Latency', 'Database query optimization needed', 'open', $2, 'high')`,
      [teamA1Id, poojaId]
    );

    // 6. Work State History (for 7-day trend chart)
    for (let i = 6; i >= 0; i--) {
      await query(
        `INSERT INTO work_state_history (team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state, created_at)
         VALUES ($1, 'task', $2, 'completed', $3, $4::jsonb, $5::jsonb, CURRENT_DATE - INTERVAL '${i} days')`,
        [teamA1Id, projA1Id, poojaId, JSON.stringify({ status: 'in_progress' }), JSON.stringify({ status: 'done' })]
      );
      await query(
        `INSERT INTO work_state_history (team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state, created_at)
         VALUES ($1, 'task', $2, 'updated', $3, $4::jsonb, $5::jsonb, CURRENT_DATE - INTERVAL '${i} days')`,
        [teamA1Id, projA1Id, rajuId, JSON.stringify({ status: 'todo' }), JSON.stringify({ status: 'in_progress' })]
      );
    }

    // 7. Collaboration Requests
    // Public project created by Rush for discovery
    const pubProjRes = await query<any>(
      `INSERT INTO projects (project_name, description, team_id, created_by, status, is_public)
       VALUES ('CommandCenter Open Source Engine', 'Public community framework', NULL, $1, 'active', true)
       RETURNING project_id`,
      [rushId]
    );
    const pubProjId = pubProjRes[0].project_id;

    // Raju requests collaboration on Rush's public project
    await query(
      `INSERT INTO project_collaborators (project_id, user_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'pending'`,
      [pubProjId, rajuId]
    );

    // Sham is accepted collaborator
    await query(
      `INSERT INTO project_collaborators (project_id, user_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'accepted'`,
      [pubProjId, shamId]
    );

    console.log('--- Rich QA Test Topology Provisioning Successful! ---');
    process.exit(0);
  } catch (err) {
    console.error('Failed to provision QA test topology:', err);
    process.exit(1);
  }
}

main();
