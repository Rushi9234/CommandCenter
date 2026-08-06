// Mock Database Service
// Used only for the /health fallback message when PostgreSQL is unreachable at boot.
// Its previous CRUD stub methods were never called by any controller and have been removed.

export class MockDatabaseService {
  constructor() {
    console.log('📝 Mock Database Service active (PostgreSQL unreachable)');
  }

  async testConnection() {
    return { success: true, message: 'Mock database connected successfully' };
  }
}

export const mockDbService = new MockDatabaseService();
