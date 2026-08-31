export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/cli/**/*.test.ts', '<rootDir>/src/cli/**/*.test.tsx'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.cli.json', useESM: true }]
    },
    moduleNameMapper: {
        '^@kronor/hasura-graphql/typegen$': '<rootDir>/../hasura-graphql/src/typegen/index.ts',
        '^@kronor/hasura-graphql$': '<rootDir>/../hasura-graphql/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1'
    }
};