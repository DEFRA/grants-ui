import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import vitestPlugin from '@vitest/eslint-plugin'
import grantsUiPlugin from './.eslint/index.js'

export default [
  ...neostandard({
    env: ['node'],
    // @ts-ignore
    jsx: false,
    style: false,
    ignores: ['.server', '.public', 'coverage', 'node_modules', '.stryker-tmp', '.idea', '.vscode']
  }),
  prettier,
  {
    plugins: {
      'grants-ui': grantsUiPlugin
    },
    rules: {
      'no-console': 'error',
      curly: ['error', 'all'],
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/quotes': 'off',
      '@stylistic/eol-last': 'off',
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/indent': 'off',
      'grants-ui/try-catch-allowed-functions': ['off', { exclude: ['log', 'logger'] }]
    }
  },
  {
    files: ['**/*.test.{js,cjs}'],
    plugins: {
      vitest: vitestPlugin
    },
    languageOptions: {
      globals: {
        ...vitestPlugin.environments.env.globals
      }
    },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'assertLogCode'] }]
    }
  }
]
