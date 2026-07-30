import { fileURLToPath } from 'node:url'
import path from 'node:path'
import nunjucks from 'nunjucks'
import { load } from 'cheerio'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'

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

/**
 * @param {{ govukBranding: boolean }} branding
 */
const renderPage = ({ govukBranding }) =>
  load(
    env.render('layouts/page.njk', {
      govukBranding,
      grantPhase: govukBranding ? 'public-beta' : 'private-beta',
      assetPath: '/public/assets/rebrand',
      defraAssetPath: '/public/assets/defra',
      serviceName: 'Farm and land service',
      serviceUrl: '/',
      getAssetPath: (asset) => `/public/${asset}`,
      cookiesPolicy: { confirmed: true, analytics: false },
      breadcrumbs: [],
      auth: {}
    })
  )

describe('page layout branding phases', () => {
  describe('private beta (restricted branding)', () => {
    const $ = renderPage({ govukBranding: false })

    test('renders the plain department brand bar instead of the GOV.UK crown header', () => {
      expect($('.govuk-header').length).toBe(0)
      expect($('.defra-brand-bar').text()).toContain('Department for Environment, Food & Rural Affairs')
    })

    test('applies the restricted typography body class', () => {
      expect($('body').attr('class')).toContain('app-brand-restricted')
      expect($('html').attr('class')).not.toContain('govuk-template--rebranded')
    })

    test('links the DEFRA favicon and no GOV.UK crown icons', () => {
      const iconHrefs = $('link[rel="icon"], link[rel="mask-icon"], link[rel="apple-touch-icon"]')
        .map((_i, el) => $(el).attr('href'))
        .get()

      expect(iconHrefs).toEqual(['/public/assets/defra/images/defra-favicon.ico'])
    })

    test('renders the footer without the GOV.UK rebrand crown', () => {
      expect($('.govuk-footer__crown').length).toBe(0)
    })
  })

  describe('public beta (full GOV.UK branding)', () => {
    const $ = renderPage({ govukBranding: true })

    test('renders the official GOV.UK header with the crown logo', () => {
      expect($('.govuk-header .govuk-header__logotype').length).toBe(1)
      expect($('.defra-brand-bar').length).toBe(0)
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
