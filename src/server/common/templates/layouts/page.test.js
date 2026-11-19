import { fileURLToPath } from 'node:url'
import path from 'node:path'
import nunjucks from 'nunjucks'
import { load } from 'cheerio'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '../../../../..')

const env = nunjucks.configure(
  [
    path.join(projectRoot, 'node_modules/govuk-frontend/dist/'),
    path.normalize(path.resolve(dirname, '..')),
    path.normalize(path.join(projectRoot, 'src/server/common/components'))
  ],
  {
    trimBlocks: true,
    lstripBlocks: true
  }
)

Object.entries(globals).forEach(([name, global]) => env.addGlobal(name, global))
Object.entries(filters).forEach(([name, filter]) => env.addFilter(name, filter))
env.addFilter('evaluate', (value) => value)

/**
 * @param {{ govukBranding: boolean, layout: string, request?: Parameters<typeof buildNavigation>[0] }} branding
 */
const renderPage = ({ govukBranding, layout, request }) =>
  load(
    env.render(layout, {
      govukBranding,
      grantPhase: govukBranding ? 'public-beta' : 'private-beta',
      assetPath: '/public/assets/rebrand',
      defraAssetPath: '/public/assets/defra',
      serviceName: 'Farm and Land Service',
      serviceUrl: '/',
      navigation: buildNavigation(request),
      getAssetPath: (asset) => `/public/${asset}`,
      cookiesPolicy: { confirmed: true, analytics: false },
      breadcrumbs: [],
      auth: {}
    })
  )

describe.each(['layouts/page.njk', 'layouts/dxt-form.njk'])('%s branding phases', (layout) => {
  describe('service navigation links', () => {
    test.each([undefined, false, 'true', true])('renders the applications link only when enabled (%j)', (enabled) => {
      const $ = renderPage({
        govukBranding: false,
        layout,
        request: {
          path: '/test-grant/confirmation',
          params: { slug: 'test-grant' },
          app: { model: { def: { metadata: { allowMultipleApplications: /** @type {any} */ (enabled) } } } }
        }
      })
      const $links = $('.govuk-service-navigation__list a')

      if (enabled === true) {
        expect($links).toHaveLength(1)
        expect($links.text().trim()).toBe('Manage your applications')
        expect($links.attr('href')).toBe('/test-grant/applications')
        expect($links.attr('aria-current')).toBeUndefined()
        expect($('.govuk-service-navigation__item--active')).toHaveLength(0)
      } else {
        expect($links).toHaveLength(0)
      }
    })
  })

  test.each([false, true])('uses the refreshed GDS service navigation with govukBranding=%s', (govukBranding) => {
    const $ = renderPage({ govukBranding, layout })

    expect($('html').attr('class')).toContain('govuk-template--rebranded')
    expect($('section.govuk-service-navigation[data-module="govuk-service-navigation"]')).toHaveLength(1)
    expect($('.govuk-service-navigation__service-name a').attr('href')).toBe('/')
    expect($('.govuk-service-navigation__service-name').text().trim()).toBe('Farm and Land Service')
  })

  describe('private beta (restricted branding)', () => {
    const $ = renderPage({ govukBranding: false, layout })

    test('renders the blue DEFRA crest brand bar instead of the GOV.UK crown header', () => {
      expect($('.govuk-header')).toHaveLength(0)

      const $logo = $('.defra-brand-bar a.defra-brand-bar__link img.defra-brand-bar__logotype')
      expect($logo.attr('src')).toBe('/public/assets/defra/images/defra-crest.png')
      expect($logo.attr('alt')).toBe('Department for Environment, Food & Rural Affairs')
    })

    test('applies the restricted typography body class', () => {
      expect($('body').attr('class')).toContain('app-brand-restricted')
    })

    test('links the DEFRA favicon and no GOV.UK crown icons', () => {
      const iconHrefs = $('link[rel="icon"], link[rel="mask-icon"], link[rel="apple-touch-icon"]')
        .map((_i, el) => $(el).attr('href'))
        .get()

      expect(iconHrefs).toEqual(['/public/assets/defra/images/defra-favicon.ico'])
    })

    test('renders the footer without the GOV.UK rebrand crown', () => {
      expect($('.govuk-footer__crown')).toHaveLength(0)
    })
  })

  describe('public beta (full GOV.UK branding)', () => {
    const $ = renderPage({ govukBranding: true, layout })

    test('renders the official GOV.UK header with the crown logo', () => {
      expect($('.govuk-header .govuk-header__logotype')).toHaveLength(1)
      expect($('.defra-brand-bar')).toHaveLength(0)
    })

    test('does not apply the restricted typography body class', () => {
      expect($('body').attr('class')).not.toContain('app-brand-restricted')
      expect($('html').attr('class')).toContain('govuk-template--rebranded')
    })

    test('links the GOV.UK favicon set', () => {
      const iconHrefs = $('link[rel="icon"], link[rel="mask-icon"], link[rel="apple-touch-icon"]')
        .map((_i, el) => $(el).attr('href'))
        .get()

      expect(iconHrefs).toContain('/public/assets/rebrand/images/favicon.ico')
      expect(iconHrefs).not.toContain('/public/assets/defra/images/defra-favicon.ico')
    })
  })
})
