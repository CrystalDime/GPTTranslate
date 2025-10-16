module.exports = {
        preset: 'ts-jest',
        testEnvironment: 'jsdom',
        testPathIgnorePatterns: ['/node_modules/', '/dist/'],
        setupFilesAfterEnv: ['./jest.setup.js'],
};
