// Milestone 47 -- realistic concurrent load/capacity measurement.
//
// Not a Jest test (deliberately -- Jest's runner and per-test timeout
// model aren't a good fit for "fire N concurrent HTTP sessions and measure
// latency distribution"). Run directly against the LOCAL test database
// only: `npx ts-node scripts/loadTest.ts` from backend/, after `npm run
// test` has confirmed .env.test points at commandcenter_test. Never point
// this at a production DATABASE_URL.
//
// Simulates realistic ordinary usage (not an attack): each "session" is
// one already-registered user logging in, then making the handful of
// read calls a real dashboard load actually makes (my teams, today's
// standup, team blockers, goal hierarchy, leaderboard) -- the same
// endpoints M46 hardened against N+1 fan-out. Fires an increasing number
// of concurrent sessions and reports success rate, latency percentiles,
// and the shared pgPool's own connection utilization, so M47 has actual
// measurement behind its pool-size conclusion instead of a guess.

import dotenv from 'dotenv';
import path from 'path';

// Same guard tests/setup/env.ts uses -- refuse to run against anything
// that isn't the local test database.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('commandcenter_test')) {
  throw new Error('loadTest.ts must run against commandcenter_test only. Check backend/.env.test.');
}

import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { Pool } from 'pg';

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

const TABLES = [
  'messages', 'blockers', 'daily_logs', 'tasks', 'goals', 'projects',
  'join_requests', 'team_invites', 'refresh_tokens', 'team_members', 'teams', 'users',
];

const resetDatabase = async () => {
  await dbPool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
};

let counter = 0;
const unique = () => `${Date.now()}_${counter++}`;

const registerAndLogin = async (label: string) => {
  const id = unique();
  const email = `${label}_${id}@loadtest.local`;
  const username = `${label}_${id}`.slice(0, 30);
  const registerRes = await request(app).post('/api/auth/register').send({
    email, password: 'Passw0rd!123', fullName: label, username,
  });
  if (registerRes.status !== 201) {
    return null;
  }
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'Passw0rd!123' });
  if (loginRes.status !== 200) {
    return null;
  }
  return { token: loginRes.body.data.token, userId: loginRes.body.data.user.user_id, email };
};

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const createTeam = async (ownerToken: string, teamName: string) => {
  const res = await request(app).post('/api/teams').set(authHeader(ownerToken)).send({ teamName, maxTeamSize: 100 });
  if (res.status !== 201) {
    return null;
  }
  return res.body.data.team_id as string;
};

const addMember = async (ownerToken: string, teamId: string, userId: string): Promise<boolean> => {
  const res = await request(app).post(`/api/teams/${teamId}/members`).set(authHeader(ownerToken)).send({ userId, role: 'member' });
  return res.status === 200;
};

interface Timing { endpoint: string; ms: number; status: number; }

const firstFailureBody: Record<string, string> = {};

const timed = async (endpoint: string, fn: () => Promise<{ status: number; body?: any }>): Promise<Timing> => {
  const start = Date.now();
  const res = await fn();
  if (res.status >= 400 && !firstFailureBody[endpoint]) {
    firstFailureBody[endpoint] = JSON.stringify(res.body);
  }
  return { endpoint, ms: Date.now() - start, status: res.status };
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

async function seed(numTeams: number, membersPerTeam: number) {
  console.log(`\nSeeding ${numTeams} teams x ${membersPerTeam} members...`);
  const teams: { teamId: string; ownerToken: string; memberTokens: string[] }[] = [];

  let skippedTeams = 0;
  for (let t = 0; t < numTeams; t++) {
    try {
      const owner = await registerAndLogin(`lt_owner_${t}`);
      if (!owner) { skippedTeams++; continue; }
      const teamId = await createTeam(owner.token, `LoadTest_Team_${t}_${unique()}`);
      if (!teamId) { skippedTeams++; continue; }
      const memberTokens: string[] = [owner.token];

      const memberResults = await Promise.all(
        Array.from({ length: membersPerTeam - 1 }, (_, i) => registerAndLogin(`lt_member_${t}_${i}`))
      );
      const members = memberResults.filter((m): m is NonNullable<typeof m> => m !== null);
      if (members.length < memberResults.length) {
        console.warn(`  (team ${t}: ${memberResults.length - members.length} member registrations failed, continuing with ${members.length})`);
      }
      const addResults = await Promise.all(members.map((m) => addMember(owner.token, teamId, m.userId)));
      const actuallyAdded = members.filter((_, i) => addResults[i]);
      if (actuallyAdded.length < members.length) {
        console.warn(`  (team ${t}: ${members.length - actuallyAdded.length} addMember calls failed, continuing with ${actuallyAdded.length} confirmed members)`);
      }
      // Only tokens CONFIRMED added to team_members go into memberTokens --
      // a token for someone who registered but was never actually added
      // would correctly get a 403 from every team-scoped read later, which
      // would corrupt the load test's own success-rate numbers with a
      // seeding artifact rather than a real capacity signal.
      memberTokens.push(...actuallyAdded.map((m) => m.token));

      // Each member posts today's log so /logs/standup has real rows to
      // batch-load (the exact code path M46 rewrote).
      await Promise.all(
        memberTokens.map((tok) =>
          request(app).post('/api/logs').set(authHeader(tok)).send({ entryText: `Load test log entry ${unique()}` })
        )
      );

      // One blocker + a couple of messages so /teams/:id/blockers has real
      // creator/message_count data to batch-load.
      const blockerRes = await request(app).post('/api/blockers').set(authHeader(owner.token)).send({ teamId, title: 'Load test blocker' });
      const blockerId = blockerRes.body.data?.blocker_id;
      if (blockerId) {
        await request(app).post(`/api/blockers/${blockerId}/messages`).set(authHeader(owner.token)).send({ messageText: 'progress update' });
      }

      // A small goal hierarchy so /goals/hierarchy exercises buildGoalTree.
      await request(app).post('/api/goals').set(authHeader(owner.token)).send({ title: 'Load test goal', teamId });

      teams.push({ teamId, ownerToken: owner.token, memberTokens });
    } catch (err: any) {
      skippedTeams++;
      console.warn(`  (team ${t}: seeding threw, skipped: ${err?.message || err})`);
    }
  }
  if (skippedTeams > 0) {
    console.warn(`Skipped ${skippedTeams}/${numTeams} teams during seeding (transient registration/creation errors under concurrent load -- see report notes).`);
  }
  const totalMembers = teams.reduce((sum, t) => sum + t.memberTokens.length, 0);
  console.log(`Seeded ${teams.length} usable teams, ${totalMembers} confirmed members (avg ${(totalMembers / Math.max(1, teams.length)).toFixed(1)}/team).`);

  // DIAGNOSTIC (temporary): compare what team_members actually has for
  // teams[0] against the userIds encoded in the tokens we THINK are its
  // members, to rule out a token/membership mismatch bug in this script
  // vs a real app-side bug.
  if (teams.length > 0) {
    const jwt = require('jsonwebtoken');
    const t0 = teams[0];
    const dbRows = await dbPool.query('SELECT user_id, role FROM team_members WHERE team_id = $1', [t0.teamId]);
    const tokenUserIds = t0.memberTokens.map((tok) => (jwt.decode(tok) as any)?.userId);
    console.log('DIAGNOSTIC teams[0].teamId =', t0.teamId);
    console.log('DIAGNOSTIC team_members rows:', JSON.stringify(dbRows.rows));
    console.log('DIAGNOSTIC memberTokens decoded userIds:', JSON.stringify(tokenUserIds));
  }

  console.log('Seeding complete.');
  return teams;
}

async function runSession(team: { teamId: string; memberTokens: string[] }, sessionIndex: number): Promise<Timing[]> {
  const token = team.memberTokens[sessionIndex % team.memberTokens.length];
  const results: Timing[] = [];

  results.push(await timed('GET /teams/my', () => request(app).get('/api/teams/my').set(authHeader(token))));
  results.push(await timed('GET /logs/standup', () => request(app).get(`/api/logs/standup?teamId=${team.teamId}`).set(authHeader(token))));
  results.push(await timed('GET /teams/:id/blockers', () => request(app).get(`/api/teams/${team.teamId}/blockers`).set(authHeader(token))));
  results.push(await timed('GET /goals/hierarchy', () => request(app).get(`/api/goals/hierarchy?teamId=${team.teamId}`).set(authHeader(token))));
  results.push(await timed('GET /leaderboard', () => request(app).get('/api/leaderboard').set(authHeader(token))));

  return results;
}

async function runLoad(concurrency: number, teams: { teamId: string; ownerToken: string; memberTokens: string[] }[]) {
  console.log(`\n=== Concurrency: ${concurrency} sessions ===`);

  const poolBefore = { total: pgPool.totalCount, idle: pgPool.idleCount, waiting: pgPool.waitingCount };

  let peakWaiting = 0;
  const pollHandle = setInterval(() => {
    if (pgPool.waitingCount > peakWaiting) peakWaiting = pgPool.waitingCount;
  }, 25);

  const start = Date.now();
  const sessionPromises = Array.from({ length: concurrency }, (_, i) => {
    const team = teams[i % teams.length];
    return runSession(team, i).catch((err) => {
      return [{ endpoint: 'SESSION_ERROR', ms: 0, status: 0 }] as Timing[];
    });
  });
  const allResults = (await Promise.all(sessionPromises)).flat();
  const wallMs = Date.now() - start;

  clearInterval(pollHandle);
  const poolAfter = { total: pgPool.totalCount, idle: pgPool.idleCount, waiting: pgPool.waitingCount };

  const byEndpoint = new Map<string, Timing[]>();
  for (const r of allResults) {
    const list = byEndpoint.get(r.endpoint) || [];
    list.push(r);
    byEndpoint.set(r.endpoint, list);
  }

  console.log(`Wall clock: ${wallMs}ms for ${concurrency} sessions (${allResults.length} requests)`);
  console.log(`Pool before: total=${poolBefore.total} idle=${poolBefore.idle} waiting=${poolBefore.waiting}`);
  console.log(`Pool after:  total=${poolAfter.total} idle=${poolAfter.idle} waiting=${poolAfter.waiting}`);
  console.log(`Peak queued-waiting-for-a-connection observed: ${peakWaiting}`);

  let totalSuccess = 0;
  let totalRequests = 0;
  for (const [endpoint, timings] of byEndpoint) {
    const ms = timings.map((t) => t.ms).sort((a, b) => a - b);
    const successCount = timings.filter((t) => t.status >= 200 && t.status < 300).length;
    totalSuccess += successCount;
    totalRequests += timings.length;
    console.log(
      `  ${endpoint.padEnd(28)} n=${timings.length.toString().padEnd(4)} success=${successCount}/${timings.length}  ` +
        `p50=${percentile(ms, 50)}ms p95=${percentile(ms, 95)}ms p99=${percentile(ms, 99)}ms max=${ms[ms.length - 1]}ms` +
        (successCount < timings.length && firstFailureBody[endpoint] ? `  firstFailure=${firstFailureBody[endpoint]}` : '')
    );
  }
  console.log(`Overall success rate: ${totalSuccess}/${totalRequests} (${((totalSuccess / totalRequests) * 100).toFixed(1)}%)`);
}

async function main() {
  await resetDatabase();

  // 30 teams x 8 members = 240 real users seeded once; each load level
  // reuses this same pool of teams/users rather than reseeding, so later
  // levels aren't measuring registration cost, only read-path capacity.
  const teams = await seed(30, 8);

  for (const concurrency of [25, 50, 100, 200]) {
    await runLoad(concurrency, teams);
  }

  await dbPool.end();
  await pgPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
