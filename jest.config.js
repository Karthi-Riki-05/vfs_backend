module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 10000,
  // Each test file manually requires ./setup at the top, which is fine.
  // These ensure mock call history and implementations do not bleed between tests.
  resetMocks: false, // keep mock implementations (tests rely on default user mock)
  clearMocks: true, // clear call history between tests
  collectCoverageFrom: ["src/**/*.js", "!src/**/node_modules/**"],
  coverageDirectory: "coverage",
};
