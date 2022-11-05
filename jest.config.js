module.exports = {
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["**/test/jest/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  collectCoverage: false,
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
}
