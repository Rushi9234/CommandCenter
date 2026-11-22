import { query } from './client';

export async function seedDashboardDemoData() {
  console.log('Seeding dashboard demo data...');

  try {
    // 1. Get or verify primary owner user
    const userRes = await query('SELECT user_id FROM users LIMIT 1');
    if (!userRes || userRes.length === 0) {
      console.log('No users found in DB. Please register or create a user first.');
      return;
    }
    const ownerUserId = userRes[0].user_id;

    // 2. Create Classroom Team Context
    const classroomRes = await query(
      `INSERT INTO teams (team_name, description, created_by, is_public, team_type, max_team_size)
       VALUES ($1, $2, $3, true, 'classroom', 100)
       RETURNING team_id`,
      ['Computer Science — TY B', 'Final Year Computer Science Classroom Context', ownerUserId]
    );
    const classId = classroomRes[0].team_id;

    // Add owner as classroom owner
    await query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [classId, ownerUserId]
    );

    // 3. Create 4 Sub-Teams
    const subTeams = [
      { name: 'Team Alpha', desc: 'Full Stack Web Platform' },
      { name: 'Team Beta', desc: 'Mobile App Engine' },
      { name: 'Team Gamma', desc: 'AI Infrastructure & ML' },
      { name: 'Team Delta', desc: 'Security & DevOps Pipeline' },
    ];

    for (const st of subTeams) {
      const teamRes = await query(
        `INSERT INTO teams (team_name, description, created_by, is_public, parent_team_id, team_type)
         VALUES ($1, $2, $3, true, $4, 'main')
         RETURNING team_id`,
        [st.name, st.desc, ownerUserId, classId]
      );
      const teamId = teamRes[0].team_id;

      // Add owner to sub-team
      await query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (team_id, user_id) DO NOTHING`,
        [teamId, ownerUserId]
      );

      // Create Project for Sub-team
      const projRes = await query(
        `INSERT INTO projects (project_name, description, created_by, team_id, priority, is_public)
         VALUES ($1, $2, $3, $4, 'high', true)
         RETURNING project_id`,
        [`${st.name} Deliverables`, `Primary project for ${st.name}`, ownerUserId, teamId]
      );
      const projectId = projRes[0].project_id;

      // Create Goals for Sub-team
      const goalRes = await query(
        `INSERT INTO goals (title, description, created_by, team_id, progress, status, goal_type)
         VALUES ($1, $2, $3, $4, 65, 'in_progress', 'team')
         RETURNING goal_id`,
        [`Launch ${st.name} Milestone 1`, `Complete initial phase for ${st.name}`, ownerUserId, teamId]
      );
      const goalId = goalRes[0].goal_id;

      // Create Tasks across canonical statuses (todo, in_progress, review, done)
      const tasksToSeed = [
        { title: 'Architecture & System Design', status: 'done', priority: 'high' },
        { title: 'API Integration & Auth Scoping', status: 'done', priority: 'medium' },
        { title: 'Frontend Visual Redesign', status: 'in_progress', priority: 'high' },
        { title: 'Realtime SSE Sync Verification', status: 'review', priority: 'high' },
        { title: 'Documentation & Security Audit', status: 'todo', priority: 'low' },
      ];

      for (const t of tasksToSeed) {
        await query(
          `INSERT INTO tasks (project_id, title, description, owner, reviewer, created_by, status, priority, goal_id, completed_at)
           VALUES ($1, $2, $3, $4, $4, $4, $5, $6, $7, $8)`,
          [
            projectId,
            t.title,
            `Task description for ${t.title}`,
            ownerUserId,
            t.status,
            t.priority,
            goalId,
            t.status === 'done' ? new Date() : null,
          ]
        );
      }

      // Create Daily Work Entry & Submission
      await query(
        `INSERT INTO daily_work_entries (user_id, team_id, entry_text)
         VALUES ($1, $2, $3)`,
        [ownerUserId, teamId, `Worked on ${st.name} design and API wiring`]
      );

      await query(
        `INSERT INTO daily_work_submissions (user_id, team_id, work_date, confirmed_summary)
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (user_id, team_id, work_date) DO NOTHING`,
        [ownerUserId, teamId, `Shipped ${st.name} core features and verified API status.`]
      );
    }

    console.log('Dashboard demo data seeded successfully!');
  } catch (err) {
    console.error('Failed to seed dashboard demo data:', err);
  }
}

if (require.main === module) {
  seedDashboardDemoData().then(() => process.exit(0));
}
