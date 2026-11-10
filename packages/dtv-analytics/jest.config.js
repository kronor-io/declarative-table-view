export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    transform: {
        // Transpiled only, DTV's sources included: `npm run typecheck` checks the types
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json', useESM: true, isolatedModules: true }]
    },
    moduleNameMapper: {
        // DTV and its workspace dependency from their sources, as DTV's own tests have them
        '^@kronor/dtv$': '<rootDir>/test/dtv-sources.ts',
        '^@kronor/hasura-graphql$': '<rootDir>/../hasura-graphql/src/index.ts',
        // Sources carry the .js extensions Node's ESM resolver needs; map them back to .ts.
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.css$': '<rootDir>/../dtv/styleMock.cjs'
    }
};
