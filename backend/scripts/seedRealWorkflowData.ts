import { query, queryOne } from '../src/db/client';

async function seedRealWorkflowData() {
  console.log('🌱 Seeding realistic test environment...');

  // 1. Ensure test users exist
  const ownerEmail = 'owner@commandcenter.local';
  const leaderAlphaEmail = 'leader.alpha@commandcenter.local';
  const leaderBetaEmail = 'leader.beta@commandcenter.local';
  const leaderMahaEmail = 'leader.maha@commandcenter.local';
  const rajuEmail = 'raju.maharudra@commandcenter.local';
  const memberAlphaEmail = 'member.alpha@commandcenter.local';

  const defaultPassword = '$2b$10$wN31X2yH6eJ9jG5L9X/8e.uW1gU4U5kK5M3jN6H1U3lK5M3jN6H1U'; // dummy hash

  async function ensureUser(email: string, username: string, fullName: string, role = 'member') {
    let u = await queryOne<any>('SELECT * FROM users WHERE email = $1', [email]);
    if (!u) {
      u = await queryOne<any>(
        `INSERT INTO users (email, username, full_name, password_hash, role, is_verified)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [email, username, fullName, defaultPassword, role]
      );
    }
    return u;
  }

  const owner = await ensureUser(ownerEmail, 'jayesh_coordinator', 'Jayesh Telgote', 'admin');
  const leaderAlpha = await ensureUser(leaderAlphaEmail, 'alpha_lead', 'Aniket Sharma', 'manager');
  const leaderBeta = await ensureUser(leaderBetaEmail, 'beta_lead', 'Pooja Verma', 'manager');
  const leaderMaha = await ensureUser(leaderMahaEmail, 'rohan_lead', 'Rohan Kulkarni', 'manager');
  const raju = await ensureUser(rajuEmail, 'raju_sharma', 'Raju Sharma', 'member');
  const memberAlpha = await ensureUser(memberAlphaEmail, 'sneha_alpha', 'Sneha Patil', 'member');

  // 2. Ensure Class A and Class B teams exist
  async function ensureTeam(name: string, type: 'classroom' | 'main', parentId: string | null = null, createdBy: string) {
    let t = await queryOne<any>('SELECT * FROM teams WHERE team_name = $1', [name]);
    if (!t) {
      t = await queryOne<any>(
        `INSERT INTO teams (team_name, description, created_by, team_type, parent_team_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, `${name} Context & Workspace`, createdBy, type, parentId]
      );
    }
    return t;
  }

  const classA = await ensureTeam('Computer Science — TY B (CLASS A)', 'classroom', null, owner.user_id);
  const classB = await ensureTeam('Information Technology — TY A (CLASS B)', 'classroom', null, owner.user_id);

  const teamAlpha = await ensureTeam('Team Alpha', 'main', classA.team_id, leaderAlpha.user_id);
  const teamBeta = await ensureTeam('Team Beta', 'main', classA.team_id, leaderBeta.user_id);
  const teamMaharudra = await ensureTeam('Team Maharudra', 'main', classA.team_id, leaderMaha.user_id);

  const teamDelta = await ensureTeam('Team Delta', 'main', classB.team_id, owner.user_id);
  const teamEpsilon = await ensureTeam('Team Epsilon', 'main', classB.team_id, owner.user_id);

  const independentTeam = await ensureTeam('Independent Engineering Team', 'main', null, owner.user_id);

  // 3. Ensure memberships
  async function ensureMember(teamId: string, userId: string, role: string) {
    await query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [teamId, userId, role]
    );
  }

  // Class A memberships
  await ensureMember(classA.team_id, owner.user_id, 'owner');
  await ensureMember(teamAlpha.team_id, owner.user_id, 'owner');
  await ensureMember(teamAlpha.team_id, leaderAlpha.user_id, 'admin');
  await ensureMember(teamAlpha.team_id, memberAlpha.user_id, 'member');

  await ensureMember(teamBeta.team_id, owner.user_id, 'owner');
  await ensureMember(teamBeta.team_id, leaderBeta.user_id, 'admin');

  await ensureMember(teamMaharudra.team_id, owner.user_id, 'owner');
  await ensureMember(teamMaharudra.team_id, leaderMaha.user_id, 'admin');
  await ensureMember(teamMaharudra.team_id, raju.user_id, 'member');

  // Class B memberships
  await ensureMember(classB.team_id, owner.user_id, 'owner');
  await ensureMember(teamDelta.team_id, owner.user_id, 'owner');
  await ensureMember(teamEpsilon.team_id, owner.user_id, 'owner');

  // Independent Team
  await ensureMember(independentTeam.team_id, owner.user_id, 'owner');

  // 4. Ensure Projects for Teams
  async function ensureProject(name: string, teamId: string, createdBy: string) {
    let p = await queryOne<any>('SELECT * FROM projects WHERE project_name = $1 AND team_id = $2', [name, teamId]);
    if (!p) {
      p = await queryOne<any>(
        `INSERT INTO projects (project_name, description, team_id, created_by, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [name, `Primary deliverables for ${name}`, teamId, createdBy]
      );
    }
    return p;
  }

  const projAlpha = await ensureProject('Alpha Core Deliverables', teamAlpha.team_id, leaderAlpha.user_id);
  const projBeta = await ensureProject('Beta System Modules', teamBeta.team_id, leaderBeta.user_id);
  const projMaha = await ensureProject('Maharudra Chatbot Platform', teamMaharudra.team_id, leaderMaha.user_id);

  // 5. Create Varied Realistic Tasks
  async function createSampleTask(
    projectId: string,
    title: string,
    ownerId: string | null,
    reviewerId: string | null,
    status: string,
    createdBy: string,
    priority = 'medium'
  ) {
    const existing = await queryOne<any>('SELECT * FROM tasks WHERE project_id = $1 AND title = $2', [projectId, title]);
    if (existing) return existing;

    const completedAt = status === 'done' ? new Date() : null;
    return queryOne<any>(
      `INSERT INTO tasks (project_id, title, description, owner, reviewer, status, priority, created_by, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [projectId, title, `Task specification for: ${title}`, ownerId, reviewerId, status, priority, createdBy, completedAt]
    );
  }

  // Team Maharudra Tasks
  const taskMaha1 = await createSampleTask(
    projMaha.project_id,
    'Complete Chatbot UI Integration',
    raju.user_id,
    leaderMaha.user_id,
    'review', // PENDING REVIEW
    owner.user_id,
    'high'
  );

  const taskMaha2 = await createSampleTask(
    projMaha.project_id,
    'Database Indexing & Query Tuning',
    raju.user_id,
    leaderMaha.user_id,
    'in_progress',
    leaderMaha.user_id,
    'medium'
  );

  const taskMaha3 = await createSampleTask(
    projMaha.project_id,
    'API Endpoint Documentation',
    leaderMaha.user_id,
    owner.user_id,
    'done',
    owner.user_id,
    'low'
  );

  // Team Alpha Tasks
  await createSampleTask(projAlpha.project_id, 'Setup CI/CD Pipeline', leaderAlpha.user_id, owner.user_id, 'done', owner.user_id, 'high');
  await createSampleTask(projAlpha.project_id, 'Frontend Layout Redesign', memberAlpha.user_id, leaderAlpha.user_id, 'in_progress', leaderAlpha.user_id, 'medium');

  // Team Beta Tasks (One Blocker & Overdue task)
  await createSampleTask(projBeta.project_id, 'Backend Auth Service Refactor', leaderBeta.user_id, owner.user_id, 'in_progress', owner.user_id, 'high');

  // 6. Blocker for Team Beta
  const blockerBeta = await queryOne<any>('SELECT * FROM blockers WHERE team_id = $1 AND title = $2', [teamBeta.team_id, 'Redis Session Cluster Outage']);
  if (!blockerBeta) {
    await query(
      `INSERT INTO blockers (team_id, title, description, blocker_type, urgency, impact, status, created_by)
       VALUES ($1, $2, $3, 'technical', 'high', 'critical', 'open', $4)`,
      [teamBeta.team_id, 'Redis Session Cluster Outage', 'Unable to authenticate session tokens on local dev server.', leaderBeta.user_id]
    );
  }

  console.log('✅ Real test dataset successfully provisioned!');
  console.log('   Class A (CS TY B): Team Alpha, Team Beta, Team Maharudra');
  console.log('   Class B (IT TY A): Team Delta, Team Epsilon');
  console.log('   Users: Jayesh (Coordinator), Rohan & Aniket & Pooja (Leaders), Raju & Sneha (Members)');
}

seedRealWorkflowData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed to seed workflow test data:', err);
    process.exit(1);
  });
