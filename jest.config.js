// Jest configuration adjusted to:
// - Move deprecated ts-jest config from globals to transform
// - Treat TS/TSX as ESM (project is type: module)
// - Mock CSS imports to avoid syntax errors in component tests
// - Use jsdom environment for React component tests
export default {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    setupFiles: ['./jest.setup.cjs'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', useESM: true }]
    },
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': '<rootDir>/styleMock.cjs'
    }
};
