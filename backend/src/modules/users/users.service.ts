import { usersRepository } from './users.repository';

export class UsersService {
  // Milestone 41: the repository's SELECT DISTINCT ... ORDER BY requires
  // created_at in the select list (Postgres rule), but that column was
  // never part of this endpoint's response before -- stripped here so the
  // response shape is unchanged for every field that already existed.
  async getAllUsers(callerId: string) {
    const users = await usersRepository.getAllUsers(callerId);
    return users.map(({ created_at, ...rest }: any) => rest);
  }

  getUserById(userId: string) {
    return usersRepository.getUserById(userId);
  }
}

export const usersService = new UsersService();
