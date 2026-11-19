import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nunjucks from 'nunjucks'
import { load } from 'cheerio'

const componentRoot = fileURLToPath(new URL('../components/', import.meta.url))
const govukFrontendRoot = path.resolve('node_modules/govuk-frontend/dist')

/**
 * Creates an isolated renderer for a module component macro.
 * @param {string} callerMetaUrl - import.meta.url from the test file
 * @param {string} macroName - Full macro name (e.g. 'appHeading')
 * @returns {(params: object, callBlock?: string) => import('cheerio').CheerioAPI}
 */
export function createComponentRenderer(callerMetaUrl, macroName) {
  const componentName = path.basename(path.dirname(fileURLToPath(callerMetaUrl)))
  const environment = new nunjucks.Environment(new nunjucks.FileSystemLoader([govukFrontendRoot, componentRoot]), {
    trimBlocks: true,
    lstripBlocks: true
  })

  return function render(params, callBlock) {
    const macroPath = `${componentName}/macro.njk`
    const macroParams = JSON.stringify(params, null, 2)
    let macroString = `{%- from "${macroPath}" import ${macroName} -%}`

    if (callBlock) {
      macroString += `{%- call ${macroName}(${macroParams}) -%}${callBlock}{%- endcall -%}`
    } else {
      macroString += `{{- ${macroName}(${macroParams}) -}}`
    }

    return load(environment.renderString(macroString, {}))
  }
}
