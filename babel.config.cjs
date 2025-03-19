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
 * @import { TransformOptions } from '@babel/core'
 */
