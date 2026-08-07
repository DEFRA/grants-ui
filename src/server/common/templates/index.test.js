import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import nunjucks from 'nunjucks'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '../../../..')
// `src/server/common/templates` (this dir) must come before the engine views so
// our `index.html` resolves ahead of the engine's built-in one; the engine
// views are still needed for the shared partials (form/heading/components).
const environment = nunjucks.configure(
  [
    path.join(projectRoot, 'node_modules/govuk-frontend/dist'),
    dirname,
    path.join(projectRoot, 'src/server/common/components'),
    path.join(projectRoot, 'src/server/land-grants/components'),
    path.join(projectRoot, 'node_modules/@defra/forms-engine-plugin/.server/server/plugins/engine/views')
  ],
  { autoescape: true, trimBlocks: true, lstripBlocks: true }
)

Object.entries(globals).forEach(([name, global]) => environment.addGlobal(name, global))
Object.entries(filters).forEach(([name, filter]) => environment.addFilter(name, filter))
environment.addFilter('evaluate', (value) => value)

const makePage = (pageConfig, extra = {}) => ({
  path: '/check-your-answers',
  allowContinue: true,
  def: { metadata: { pageConfig, ...extra } }
})

const renderPage = (viewModel) =>
  load(
    environment.render('index.html', {
      baseLayoutPath: 'layouts/dxt-form.njk',
      pageTitle: 'Check your answers',
      serviceName: 'Test grant',
      serviceUrl: '/test-grant',
      breadcrumbs: [],
      cookiesPolicy: { confirmed: true },
      auth: {},
      getAssetPath: (asset) => `/public/${asset}`,
      components: [],
      crumb: 'test-crumb',
      backLink: { text: 'Back', href: '/back' },
      page: makePage({}),
      ...viewModel
    })
  )

describe('index.html view page-level config', () => {
  describe('hideBackLink', () => {
    it('renders the back link by default', () => {
      const $ = renderPage({ page: makePage({ '/check-your-answers': {} }) })
      expect($('.govuk-back-link')).toHaveLength(1)
    })

    it('hides the back link when config.hideBackLink is true', () => {
      const $ = renderPage({ page: makePage({ '/check-your-answers': { hideBackLink: true } }) })
      expect($('.govuk-back-link')).toHaveLength(0)
    })
  })

  describe('rpaDetails', () => {
    it('does not render the RPA details when not configured', () => {
      const $ = renderPage({ page: makePage({ '/check-your-answers': {} }) })
      expect($('.govuk-details__summary-text')).toHaveLength(0)
    })

    it('renders a GDS details component with the title in the summary and the HTML content as the text', () => {
      const $ = renderPage({
        page: makePage({
          '/check-your-answers': {
            rpaDetails: {
              title: 'If you need help',
              content: '<p class="govuk-body">Email <a href="mailto:page@rpa.gov.uk">page@rpa.gov.uk</a></p>'
            }
          }
        })
      })

      expect($('.govuk-details__summary-text').text().trim()).toBe('If you need help')
      expect($('.govuk-details__text p').text().trim()).toBe('Email page@rpa.gov.uk')
      expect($('.govuk-details__text a[href="mailto:page@rpa.gov.uk"]').text()).toBe('page@rpa.gov.uk')
    })

    it('does not render the RPA details when only the title is configured', () => {
      const $ = renderPage({
        page: makePage({ '/check-your-answers': { rpaDetails: { title: 'If you need help' } } })
      })

      expect($('.govuk-details__summary-text')).toHaveLength(0)
    })
  })

  describe('submitButtonText', () => {
    it('renders the submit button with the resolved submitButtonText from context', () => {
      const $ = renderPage({ submitButtonText: 'Agree and submit' })
      expect($('.govuk-button-group .govuk-button').first().text().trim()).toBe('Agree and submit')
    })
  })
})
