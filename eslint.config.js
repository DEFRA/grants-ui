import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import vitestPlugin from 'eslint-plugin-vitest'

export default [
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
  }
]
