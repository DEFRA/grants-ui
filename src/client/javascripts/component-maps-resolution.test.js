// @vitest-environment node
import { transformFileSync } from '@babel/core'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import babelConfig from '../../../babel.config.cjs'

test('resolves the map helper through the existing Babel resolver without a new webpack alias', () => {
  const sourceUrl = new URL('./component-maps.js', import.meta.url)
  const { ast } = transformFileSync(fileURLToPath(sourceUrl), {
    configFile: false,
    babelrc: false,
    plugins: babelConfig.plugins,
    ast: true,
    code: false
  })
  const helperImport = ast.program.body.find(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.specifiers.some((specifier) => specifier.imported?.name === 'processLocation')
  )
  const resolve = createRequire(sourceUrl).resolve
  expect(resolve(helperImport.source.value)).toBe(
    fileURLToPath(
      new URL(
        '../../../node_modules/@defra/forms-engine-plugin/.server/client/javascripts/location-map.js',
        import.meta.url
      )
    )
  )
})
