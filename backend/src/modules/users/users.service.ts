import { usersRepository } from './users.repository';

export class UsersService {
  getAllUsers() {
    return usersRepository.getAllUsers();
  }

  getUserById(userId: string) {
    return usersRepository.getUserById(userId);
  }
}

export const usersService = new UsersService();
