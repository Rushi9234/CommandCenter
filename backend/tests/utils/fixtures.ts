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
export const buildTeamWithRoles = async () => {
  const owner = await registerAndLogin('owner');
  const admin = await registerAndLogin('admin');
  const manager = await registerAndLogin('manager');
  const member = await registerAndLogin('member');
  const viewer = await registerAndLogin('viewer');
  const nonMember = await registerAndLogin('nonmember');

  const teamId = await createTeam(owner.token, `Team_${unique()}`);
  await addMember(owner.token, teamId, admin.userId, 'admin').expect(200);
  await addMember(owner.token, teamId, manager.userId, 'manager').expect(200);
  await addMember(owner.token, teamId, member.userId, 'member').expect(200);
  await addMember(owner.token, teamId, viewer.userId, 'viewer').expect(200);

  return { teamId, owner, admin, manager, member, viewer, nonMember };
};
