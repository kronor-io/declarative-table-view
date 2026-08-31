export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', useESM: true }]
    },
    moduleNameMapper: {
        // Sources carry the .js extensions Node's ESM resolver needs; map them back to .ts.
        '^(\\.{1,2}/.*)\\.js$': '$1'
    }
};
