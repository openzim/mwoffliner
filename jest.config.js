module.exports = {
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "js"],
  collectCoverage: true,
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsConfig: {
        sourceMap: true,
        inlineSourceMap: true
      }
    }
  }
}
