module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFilesAfterSetup: [],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/node_modules/**',
    ],
    coverageDirectory: 'coverage',
    testTimeout: 10000,
};
