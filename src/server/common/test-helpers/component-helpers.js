import { fileURLToPath } from 'node:url'
import path from 'node:path'
import nunjucks from 'nunjucks'
import { load } from 'cheerio'
import { camelCase } from 'lodash'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '../../../..')

/**
 * Configures a nunjucks environment with filters and globals
 * @param {nunjucks.Environment} env
 */
function configureNunjucksEnv(env) {
  Object.entries(globals).forEach(([name, global]) => {
    env.addGlobal(name, global)
  })

  Object.entries(filters).forEach(([name, filter]) => {
    env.addFilter(name, filter)
  })
}

/**
 * Creates a renderer function for a nunjucks component
 * @param {string} callerMetaUrl - import.meta.url from the test file
 * @param {string} macroName - Full macro name (e.g., 'defraSupportDetails', 'appDemoAwareButton')
 * @returns {(params: object, callBlock?: string) => CheerioAPI}
 */
export function createComponentRenderer(callerMetaUrl, macroName) {
  const testDir = path.dirname(fileURLToPath(callerMetaUrl))
  const componentName = path.basename(testDir)

  const env = nunjucks.configure(
    [
      path.join(projectRoot, 'node_modules/govuk-frontend/dist/'),
      path.normalize(path.resolve(testDir, '../')),
      path.normalize(path.join(projectRoot, 'src/server/common/components')),
      path.normalize(path.join(projectRoot, 'src/server/common/templates'))
    ],
    {
      trimBlocks: true,
      lstripBlocks: true
    }
  )

  configureNunjucksEnv(env)

  return function render(params, callBlock) {
    const macroPath = `${componentName}/macro.njk`
    const macroParams = JSON.stringify(params, null, 2)
    let macroString = `{%- from "${macroPath}" import ${macroName} -%}`

    if (callBlock) {
      macroString += `{%- call ${macroName}(${macroParams}) -%}${callBlock}{%- endcall -%}`
    } else {
      macroString += `{{- ${macroName}(${macroParams}) -}}`
    }

    return load(env.renderString(macroString, {}))
  }
}

/**
 * Creates a renderer for a full page template, wired with the same view paths,
 * globals and filters the app uses at runtime.
 * @param {string} callerMetaUrl - import.meta.url from the test file
 * @param {string} template - Template name, resolved relative to the caller's directory
 * @param {object} [defaults] - View model defaults merged under each call's overrides
 * @param {string[]} [extraViewPaths] - Extra view directories, relative to the project root
 * @returns {(viewModel?: object) => CheerioAPI}
 */
export function createPageRenderer(callerMetaUrl, template, defaults = {}, extraViewPaths = []) {
  const testDir = path.dirname(fileURLToPath(callerMetaUrl))

  const env = nunjucks.configure(
    [
      path.join(projectRoot, 'node_modules/govuk-frontend/dist'),
      path.join(projectRoot, 'node_modules/@defra/forms-engine-plugin/.server/server/plugins/engine/views'),
      testDir,
      ...extraViewPaths.map((viewPath) => path.join(projectRoot, viewPath)),
      path.join(projectRoot, 'src/server/common/components'),
      path.join(projectRoot, 'src/server/common/templates'),
      path.join(projectRoot, 'src/server/land-grants/components')
    ],
    { autoescape: true, trimBlocks: true, lstripBlocks: true }
  )

  configureNunjucksEnv(env)

  // The engine plugin supplies these at runtime; all are identity functions
  // outside a form context, which is what these tests render in.
  env.addFilter('evaluate', (value) => value)
  env.addGlobal('checkComponentTemplates', (component) => component)
  env.addGlobal('checkErrorTemplates', (errors) => errors)

  return (viewModel = {}) =>
    load(
      env.render(template, {
        baseLayoutPath: 'layouts/dxt-form.njk',
        serviceName: 'Test grant',
        serviceUrl: '/test-grant',
        breadcrumbs: [],
        cookiesPolicy: { confirmed: true },
        auth: {},
        crumb: 'test-crumb',
        getAssetPath: (asset) => `/public/${asset}`,
        ...defaults,
        ...viewModel
      })
    )
}

const nunjucksTestEnv = nunjucks.configure(
  [
    '~/node_modules/govuk-frontend/dist/',
    path.normalize(path.resolve(dirname, '../templates')),
    path.normalize(path.resolve(dirname, '../components'))
  ],
  {
    trimBlocks: true,
    lstripBlocks: true
  }
)

configureNunjucksEnv(nunjucksTestEnv)

/**
 * @param {string} componentName
 * @param {object} params
 * @param {string} [callBlock]
 */
export function renderComponent(componentName, params, callBlock) {
  const macroPath = `${componentName}/macro.njk`
  const macroName = `app${componentName.charAt(0).toUpperCase() + camelCase(componentName.slice(1))}`
  const macroParams = JSON.stringify(params, null, 2)
  let macroString = `{%- from "${macroPath}" import ${macroName} -%}`

  if (callBlock) {
    macroString += `{%- call ${macroName}(${macroParams}) -%}${callBlock}{%- endcall -%}`
  } else {
    macroString += `{{- ${macroName}(${macroParams}) -}}`
  }

  return load(nunjucksTestEnv.renderString(macroString, {}))
}

/**
 * @import { CheerioAPI } from 'cheerio'
 */
