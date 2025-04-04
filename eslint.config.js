import js from '@eslint/js'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import tsparser from '@typescript-eslint/parser'
import { globalIgnores } from 'eslint/config'

export default [
  js.configs.recommended,
  globalIgnores(['lib/**', 'res/**', '**/*.js', '**/*.cjs']),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: 'tsconfig.json',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
