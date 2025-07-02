export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.jest.json'
        }
    }
};
