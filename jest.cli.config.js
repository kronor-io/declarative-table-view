export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/cli/**/*.test.ts', '<rootDir>/src/cli/**/*.test.tsx'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.cli.json', useESM: true }]
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    }
};