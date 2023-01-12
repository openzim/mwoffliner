module.exports = {
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "js"],
  collectCoverage: false,
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  verbose: true,
  globals: {
    'ts-jest': {
      tsConfig: {
        sourceMap: true,
        inlineSourceMap: true
      }
    }
  }
}
