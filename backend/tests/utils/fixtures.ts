import request from 'supertest';
import { app } from './testApp';

let counter = 0;
// Guarantees unique email/username per call within a single test run,
// even across many tests in the same file (module-level counter, reset
// per file since Jest gives each test file its own module registry).
const unique = () => `${Date.now()}_${counter++}`;

export interface RegisteredUser {
  email: string;
  password: string;
  fullName: string;
  username: string;
}

export const buildUser = (label: string): RegisteredUser => {
  const id = unique();
  return {
    email: `${label}_${id}@test.local`,
    password: 'Passw0rd!123',
    fullName: label,
    username: `${label}_${id}`.slice(0, 30),
  };
};

export const register = (user: RegisteredUser) =>
  request(app).post('/api/auth/register').send({
    email: user.email,
    password: user.password,
    fullName: user.fullName,
    username: user.username,
  });

export const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

// Registers (AUTO_VERIFY=true in .env.test auto-verifies) and logs in,
// returning the bearer token every existing route already accepts via
// `Authorization: Bearer <token>` -- the same legacy flow the frontend
// and every prior milestone's live testing has used throughout.
export const registerAndLogin = async (label: string): Promise<{ user: RegisteredUser; token: string; userId: string }> => {
  const user = buildUser(label);
  await register(user).expect(201);
  const res = await login(user.email, user.password).expect(200);
  return { user, token: res.body.data.token, userId: res.body.data.user.user_id };
};

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Extracts a named cookie's raw value from a supertest response's
// Set-Cookie header, used only by the refresh-token tests (login's JSON
// body never includes the raw refresh token -- it's cookie-only).
export const extractCookie = (res: request.Response, name: string): string | undefined => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return undefined;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const entry of list) {
    const match = entry.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
};

export const createTeam = async (ownerToken: string, teamName: string): Promise<string> => {
  const res = await request(app).post('/api/teams').set(authHeader(ownerToken)).send({ teamName }).expect(201);
  return res.body.data.team_id;
};

export const addMember = (ownerToken: string, teamId: string, userId: string, role: string) =>
  request(app).post(`/api/teams/${teamId}/members`).set(authHeader(ownerToken)).send({ userId, role });

// Builds a team with one persona per role, all logged in and added with
// their named role. `owner` is whoever creates the team (teams.service.ts
// assigns the creator the owner role automatically).
//
// Milestone 47: the 6 registerAndLogin calls have no dependency on each
// other (each registers/logs in a brand-new, independent user) -- running
// them one at a time was pure serialized bcrypt + Neon round-trip cost
// with nothing gained from the ordering. Parallelizing them is the same
// "reduce the fixture's own wall-clock cost, don't touch Jest's timeout"
// fix M39 already established for this exact shape of problem, and it's
// what bought back the wall-clock room M47's max_team_size capacity check
// needed (an extra row-lock round trip per membership-creation call --
// see teams.repository.ts's TEAM_CAPACITY_GATE comment) without which
// this fixture's heaviest callers (teamMembershipConcurrency.test.ts)
// started exceeding Jest's 30s per-test ceiling. The addMember calls
// still run sequentially -- they're now safe to parallelize too (the
// capacity check serializes them correctly), but buildTeamWithRoles is
// shared by many tests that assert on ordering-sensitive side effects
// (e.g. joined_at), so only the genuinely order-independent registrations
// were changed here.
export const buildTeamWithRoles = async () => {
  const [owner, admin, manager, member, viewer, nonMember] = await Promise.all([
    registerAndLogin('owner'),
    registerAndLogin('admin'),
    registerAndLogin('manager'),
    registerAndLogin('member'),
    registerAndLogin('viewer'),
    registerAndLogin('nonmember'),
  ]);

  const teamId = await createTeam(owner.token, `Team_${unique()}`);
  await addMember(owner.token, teamId, admin.userId, 'admin').expect(200);
  await addMember(owner.token, teamId, manager.userId, 'manager').expect(200);
  await addMember(owner.token, teamId, member.userId, 'member').expect(200);
  await addMember(owner.token, teamId, viewer.userId, 'viewer').expect(200);

  return { teamId, owner, admin, manager, member, viewer, nonMember };
};
