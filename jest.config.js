export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Include both .test.ts and .test.tsx so React component tests run.
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.jest.json'
        }
    }
};
