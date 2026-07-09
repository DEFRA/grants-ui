import { CleanWebpackPlugin } from 'clean-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'path'
import TerserPlugin from 'terser-webpack-plugin'
import { WebpackAssetsManifest } from 'webpack-assets-manifest'

const { NODE_ENV = 'development' } = process.env

const require = createRequire(import.meta.url)
const dirname = path.dirname(fileURLToPath(import.meta.url))

const govukFrontendPath = path.dirname(require.resolve('govuk-frontend/package.json'))

const defraFormsPath = path.dirname(require.resolve('@defra/forms-engine-plugin/package.json'))
const interactiveMapCss = path.join(dirname, 'node_modules/@defra/interactive-map/dist/css/index.css')

const ruleTypeAssetResource = 'asset/resource'

/**
 * @type {Configuration}
 */
export default {
  context: path.resolve(dirname, 'src/client'),
  entry: {
    application: {
      import: ['./javascripts/application.js', './stylesheets/application.scss']
    },
    'parcel-map': {
      import: ['./javascripts/parcel-map/index.js']
    }
  },
  experiments: {
    outputModule: true
  },
  mode: NODE_ENV === 'production' ? 'production' : 'development',
  devtool: NODE_ENV === 'production' ? 'source-map' : 'inline-source-map',
  watchOptions: {
    aggregateTimeout: 200,
    poll: 1000
  },
  output: {
    filename: NODE_ENV === 'production' ? 'javascripts/[name].[contenthash:7].min.js' : 'javascripts/[name].js',

    chunkFilename: NODE_ENV === 'production' ? 'javascripts/[name].[chunkhash:7].min.js' : 'javascripts/[name].js',

    path: path.join(dirname, '.public'),
    publicPath: '/public/',
    libraryTarget: 'module',
    module: true
  },
  resolve: {
    alias: {
      '~': dirname,
      '/public/assets': path.join(govukFrontendPath, 'dist/govuk/assets')
    }
  },
  module: {
    rules: [
      {
        test: /\.(js|mjs|scss)$/,
        loader: 'source-map-loader',
        enforce: 'pre'
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          browserslistEnv: 'javascripts',
          cacheDirectory: true,
          extends: path.join(dirname, 'babel.config.cjs'),
          // Babel 8 removed preset-env's `loose` shorthand; replicate the
          // smaller browser transforms it produced via granular assumptions.
          // (`bugfixes` was also removed — bugfix plugins are now always on.)
          assumptions: {
            arrayLikeIsIterable: true,
            constantReexports: true,
            constantSuper: true,
            enumerableModuleMeta: true,
            ignoreFunctionLength: true,
            ignoreToPrimitiveHint: true,
            iterableIsArray: true,
            mutableTemplateObject: true,
            noClassCalls: true,
            noDocumentAll: true,
            noIncompleteNsImportDetection: true,
            noNewArrows: true,
            objectRestNoSymbols: true,
            privateFieldsAsProperties: true,
            setClassMethods: true,
            setComputedProperties: true,
            setPublicClassFields: true,
            setSpreadProperties: true,
            skipForOfIteratorClosing: true,
            superIsCallableConstructor: true
          },
          presets: [
            [
              '@babel/preset-env',
              {
                // Skip CommonJS modules transform
                modules: false
              }
            ]
          ]
        }
      },
      {
        test: /\.scss$/,
        type: ruleTypeAssetResource,
        generator: {
          binary: false,
          filename: NODE_ENV === 'production' ? 'stylesheets/[name].[contenthash:7].min.css' : 'stylesheets/[name].css'
        },
        use: [
          'postcss-loader',
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                loadPaths: [
                  path.join(dirname, 'src/client/stylesheets'),
                  path.join(dirname, 'src/server/common/components'),
                  path.join(dirname, 'src/server/common/templates/partials'),
                  path.join(dirname, 'node_modules')
                ],
                quietDeps: true,
                sourceMapIncludeSources: true,
                style: 'expanded'
              },
              warnRuleAsWarning: true
            }
          }
        ]
      },
      {
        test: /\.(png|svg|jpe?g|gif)$/,
        type: ruleTypeAssetResource,
        generator: {
          filename: 'assets/images/[name][ext]'
        }
      },
      {
        test: /\.(ico)$/,
        type: ruleTypeAssetResource,
        generator: {
          filename: 'assets/images/[name][ext]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: ruleTypeAssetResource,
        generator: {
          filename: 'assets/fonts/[name][ext]'
        }
      }
    ]
  },
  optimization: {
    minimize: NODE_ENV === 'production',
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          // Use webpack default compress options
          // https://webpack.js.org/configuration/optimization/#optimizationminimizer
          compress: { passes: 2 },

          // Allow Terser to remove @preserve comments
          format: { comments: false },

          // Include sources content from dependency source maps
          sourceMap: {
            includeSources: true
          },

          // Compatibility workarounds
          safari10: true
        }
      })
    ],

    // Skip bundling unused modules
    providedExports: true,
    sideEffects: true,
    usedExports: true
  },
  plugins: [
    new CleanWebpackPlugin(),
    new WebpackAssetsManifest(),
    new CopyPlugin({
      patterns: [
        {
          from: path.join(govukFrontendPath, 'dist/govuk/assets'),
          to: 'assets'
        },
        {
          from: path.join(defraFormsPath, '.public/assets'),
          to: 'dxt-assets'
        },
        {
          from: interactiveMapCss,
          to: 'stylesheets/interactive-map.css'
        }
      ]
    })
  ],
  stats: {
    errorDetails: true,
    loggingDebug: ['sass-loader'],
    preset: 'minimal'
  },
  target: 'browserslist:javascripts'
}

/**
 * @import { Configuration } from 'webpack'
 */
