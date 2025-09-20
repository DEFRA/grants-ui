import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import vitestPlugin from '@vitest/eslint-plugin'

export default [
  {
    ignores: ['acceptance/allure-report/**', '/acceptance/allure-results/**']
  },
  ...neostandard({
    env: ['node'],
    jsx: false,
    style: false,
    ignores: ['.server', '.public', 'coverage', 'node_modules']
  }),
  prettier,
  {
    rules: {
      'no-console': 'error',

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
  },
  {
    files: ['acceptance/**/*.js'],
    languageOptions: {
      globals: {
        browser: 'readonly',
        expect: 'readonly',
        $: 'readonly',
        $$: 'readonly'
      }
    }
  }
]
