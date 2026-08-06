/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  testTimeout: 30000,
  // Every test file shares one physical test database and truncates
  // tables between tests -- running files in parallel workers would race
  // on those truncates. Kept serial on purpose, not a perf oversight.
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
