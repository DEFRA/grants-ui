// @vitest-environment node
import { transformFileSync } from '@babel/core'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import babelConfig from '../../../babel.config.cjs'

test('resolves map helpers through the dependency public entry point', () => {
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
      statement.type === 'ImportDeclaration' && statement.source.value === '@defra/forms-engine-plugin/shared.js'
  )
  const resolve = createRequire(sourceUrl).resolve
  const require = createRequire(sourceUrl)
  const packagePath = resolve('@defra/forms-engine-plugin/package.json')
  const { exports } = require(packagePath)
  expect(helperImport.specifiers.map((specifier) => specifier.imported.name)).toEqual(['geospatialMap', 'map'])
  expect(resolve(helperImport.source.value)).toBe(
    fileURLToPath(new URL(exports['./shared.js'], `file://${packagePath}`))
  )
  expect(
    ast.program.body
      .filter((statement) => statement.type === 'ImportDeclaration')
      .map((statement) => statement.source.value)
  ).not.toEqual(expect.arrayContaining([expect.stringContaining('node_modules/')]))
})
