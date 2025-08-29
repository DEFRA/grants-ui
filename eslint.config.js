import neostandard from 'neostandard'
import prettier from 'eslint-config-prettier'
import jestPlugin from 'eslint-plugin-jest'

export default [
  ...neostandard({
    env: ['node', 'jest'],
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
      jest: jestPlugin
    },
    rules: {
      ...jestPlugin.configs.recommended.rules
    }
  }
]
