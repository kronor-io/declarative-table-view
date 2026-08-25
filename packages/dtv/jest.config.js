// Jest configuration adjusted to:
// - Move deprecated ts-jest config from globals to transform
// - Treat TS/TSX as ESM (project is type: module)
// - Mock CSS imports to avoid syntax errors in component tests
// - Use jsdom environment for React component tests
export default {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    testPathIgnorePatterns: ['<rootDir>/src/cli/'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', useESM: true }]
    },
    moduleNameMapper: {
        // Resolve the workspace package to its sources so tests pick up changes
        // without a rebuild (its published exports map is ESM-only).
        '^@kronor/hasura-graphql/typegen$': '<rootDir>/../hasura-graphql/src/typegen/index.ts',
        '^@kronor/hasura-graphql$': '<rootDir>/../hasura-graphql/src/index.ts',
        // Core sources carry .js extensions for Node's ESM resolver; map them back to source.
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/styleMock.cjs'
    }
};
