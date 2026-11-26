import { createRequire } from 'node:module'
import webpack from 'webpack'
import CopyPlugin from 'copy-webpack-plugin'
import applicationConfig from '../../webpack.config.js'

const require = createRequire(import.meta.url)

// Spike-only build: production configuration remains unchanged.
export default {
  ...applicationConfig,
  plugins: [
    ...applicationConfig.plugins,
    new webpack.IgnorePlugin({ resourceRegExp: /^(ol|proj4|@arcgis\/core)(\/|$)/ }),
    new CopyPlugin({
      patterns: [
        {
          from: require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'),
          to: 'assets/interactive-map/maplibre-gl-worker.mjs'
        }
      ]
    })
  ]
}
