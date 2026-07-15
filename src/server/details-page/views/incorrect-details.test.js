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

const renderPage = (template, viewModel) =>
  load(
    environment.render(template, {
      baseLayoutPath: 'layouts/dxt-form.njk',
      pageTitle: 'Update your details',
      serviceName: 'Test grant',
      serviceUrl: '/test-grant',
      breadcrumbs: [],
      cookiesPolicy: { confirmed: true },
      auth: {},
      getAssetPath: (asset) => `/public/${asset}`,
      ...viewModel
    })
  )

describe.each(['incorrect-details.njk', 'incorrect-details.html'])('%s view', (template) => {
  it('should use meta refresh as the primary SFD redirect and an anchor as fallback', () => {
    const sfdUpdateUrl = 'https://sfd.example/update?source=grants&ssoOrgId=REL123'
    const $ = renderPage(template, {
      sfdUpdateUrl,
      incorrectDetailsContent: {
        heading: 'Incorrect details content',
        paragraphs: ['This must not be displayed'],
        showRpaSupport: true
      },
      supportEmail: 'support@example.com'
    })

    expect($('head meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${sfdUpdateUrl}`)
    expect($('main a[href="https://sfd.example/update?source=grants&ssoOrgId=REL123"]').text().trim()).toBe(
      'Update details'
    )
    expect($('main a')).toHaveLength(1)
    expect($('main form')).toHaveLength(0)
    expect($('main').text()).not.toContain('Incorrect details content')
    expect($('main').text()).not.toContain('This must not be displayed')
    expect($('main').text()).not.toContain('Contact the Rural Payments Agency')
  })

  it('should preserve the existing incorrect-details content when no SFD URL is provided', () => {
    const $ = renderPage(template, {
      sfdUpdateUrl: null,
      incorrectDetailsContent: {
        heading: 'Update needed',
        paragraphs: ['Contact us to update your details.'],
        showRpaSupport: false
      }
    })

    expect($('head meta[http-equiv="refresh"]')).toHaveLength(0)
    expect($('main h1').text().trim()).toBe('Update needed')
    expect($('main').text()).toContain('Contact us to update your details.')
    expect($('main a').filter((_, element) => $(element).text().trim() === 'Update details')).toHaveLength(0)
  })
})
