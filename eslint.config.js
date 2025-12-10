import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import vitestPlugin from '@vitest/eslint-plugin'

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
    rules: {
      'no-console': 'error',
      curly: ['error', 'all'],
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/quotes': 'off',
      '@stylistic/eol-last': 'off',
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/indent': 'off'
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
      ...vitestPlugin.configs.recommended.rules
    }
  }
]
