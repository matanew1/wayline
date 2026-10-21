/** Pure-logic tests only (strings, helpers). UI is covered by typecheck, lint and bundling. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, strict: true, types: ['jest'] } }] },
};
