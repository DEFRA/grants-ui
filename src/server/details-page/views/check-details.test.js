import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import nunjucks from 'nunjucks'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '../../../..')
const environment = nunjucks.configure(
  [
    path.join(projectRoot, 'node_modules/govuk-frontend/dist'),
    path.join(projectRoot, 'node_modules/@defra/forms-engine-plugin/.server/server/plugins/engine/views'),
    dirname,
    path.join(projectRoot, 'src/server/common/components'),
    path.join(projectRoot, 'src/server/common/templates'),
    path.join(projectRoot, 'src/server/land-grants/components')
  ],
  { autoescape: true, trimBlocks: true, lstripBlocks: true }
)

Object.entries(globals).forEach(([name, global]) => environment.addGlobal(name, global))
Object.entries(filters).forEach(([name, filter]) => environment.addFilter(name, filter))
environment.addFilter('evaluate', (value) => value)

const renderPage = (viewModel) =>
  load(
    environment.render('check-details.html', {
      baseLayoutPath: 'layouts/dxt-form.njk',
      pageTitle: 'Check your details',
      serviceName: 'Test grant',
      serviceUrl: '/test-grant',
      breadcrumbs: [],
      cookiesPolicy: { confirmed: true },
      auth: {},
      getAssetPath: (asset) => `/public/${asset}`,
      components: [],
      sections: [],
      page: { def: { metadata: {} } },
      crumb: 'test-crumb',
      ...viewModel
    })
  )

describe('check-details.html view', () => {
  it('should render the SFD update link as the alternate action', () => {
    const sfdUpdateDetailsUrl = '/test-grant/check-details?updateDetailsOnSfd=true'
    const $ = renderPage({ sfdUpdateDetailsUrl })

    expect($('form.check-details-form--sfd')).toHaveLength(1)
    expect($('.check-details-form__submit .govuk-button').text().trim()).toBe('Continue')
    expect($(`a.check-details-form__sfd-link[href="${sfdUpdateDetailsUrl}"]`).text().trim()).toBe('Continue')
  })
})
