const { NODE_ENV } = process.env

/**
 * @type {TransformOptions}
 */
module.exports = {
  browserslistEnv: 'node',
  presets: [
    [
      '@babel/preset-env',
      {
        modules: NODE_ENV === 'test' ? 'auto' : false
      }
    ]
  ],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '~': '.'
        }
      }
    ]
  ],
  env: {
    test: {
      plugins: ['babel-plugin-transform-import-meta']
    }
  }
}

/**
 * `@babel/core` ships no bundled type declarations and `@types/babel__core`
 * is not installed, so `@import { TransformOptions } from '@babel/core'`
 * raises TS7016. Fall back to the loosely-typed transform options shape this
 * config actually uses rather than installing types here.
 * @typedef {Record<string, any>} TransformOptions
 */
