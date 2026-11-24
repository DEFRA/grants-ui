#!/usr/bin/env node
// NODE_ENV=production disables the engine's development file watchers for the CLI probe.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Hapi from '@hapi/hapi'
import { Engine } from '@hapi/catbox-memory'
import crumb from '@hapi/crumb'
import inert from '@hapi/inert'
import yar from '@hapi/yar'
import hapiPino from 'hapi-pino'
import { load } from 'cheerio'
import enginePlugin from '@defra/forms-engine-plugin'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import { shouldDisplayAnswer } from '../../../src/server/common/helpers/answer-components.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const govukPath = resolve(dirname(require.resolve('govuk-frontend/package.json')), 'dist/govuk')
const definition = JSON.parse(await readFile(resolve(here, 'definition.json'), 'utf8'))
const slug = 'v5-feature-probe'
const pagePath = `/${slug}/yes-no`
const statePath = `/_probe/state/${slug}`

async function createHost(formDefinition, port = 0) {
  const loader = new FileFormService()
  await loader.addForm(resolve(here, 'definition.json'), {
    id: '55555555-5555-4555-8555-555555555555',
    slug,
    title: 'Forms engine v5 spike'
  })
  const services = { formsService: loader.toFormsService() }
  const model = new FormModel(structuredClone(formDefinition), { basePath: slug }, services)
  const server = Hapi.server({
    port,
    host: '127.0.0.1',
    cache: [{ name: 'spike', engine: new Engine() }]
  })
  await server.register([
    { plugin: hapiPino, options: { level: 'silent' } },
    inert,
    {
      plugin: yar,
      options: {
        cache: { cache: 'spike', segment: 'session' },
        cookieOptions: { password: randomBytes(32).toString('hex'), isSecure: false }
      }
    },
    { plugin: crumb, options: { skip: () => true, cookieOptions: { isSecure: false } } },
    {
      plugin: enginePlugin,
      options: {
        model,
        services,
        cache: 'spike',
        baseUrl: `http://localhost:${port}`,
        viewContext: (request) => ({ currentPath: request.path, assetPath: '/assets' }),
        getLanguage(request) {
          const language = request.query.language
          if (language === 'cy' || language === 'en-GB') {
            request.yar.set('language', language)
          }
          return request.yar.get('language') ?? 'en-GB'
        },
        nunjucks: { baseLayoutPath: 'layout.njk', paths: [here] }
      }
    }
  ])
  server.route({
    method: 'GET',
    path: '/assets/{path*}',
    handler: { directory: { path: govukPath } }
  })
  server.route({
    method: 'GET',
    path: '/_probe/state/{slug}',
    handler: (request) => server.plugins['forms-engine-plugin'].cacheService.getState(request)
  })
  await server.initialize()
  return { server, model }
}

function createClient(server) {
  const cookies = new Map()
  return async (url, payload) => {
    const response = await server.inject({
      method: payload === undefined ? 'GET' : 'POST',
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
    })
    for (const cookie of response.headers['set-cookie'] ?? []) {
      const pair = cookie.split(';')[0]
      const separator = pair.indexOf('=')
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
    return response
  }
}

async function verify(formDefinition, scenario) {
  const { server, model } = await createHost(formDefinition)
  try {
    return await scenario(createClient(server), model)
  } finally {
    await server.stop()
  }
}

async function runProbe() {
  const report = { plugin: '5.0.0', checks: {} }
  report.checks.journey = await verify(definition, async (client, model) => {
    const page = await client(pagePath)
    assert.equal(page.statusCode, 200, page.request?.response?.stack ?? page.payload)
    const $ = load(page.payload)
    assert.equal($('input[name="visited"]').attr('type'), 'hidden')
    assert.equal($('input[name="visited"]').val(), 'true')
    const getState = (await client(statePath)).result
    assert.notEqual(getState.visited, true)

    const missing = await client(pagePath, { visited: 'true' })
    assert.ok(missing.payload.includes('Choose yes or no'), missing.payload)
    const invalidState = (await client(statePath)).result
    assert.notEqual(invalidState.visited, true)

    const falseTracking = await client(pagePath, { answer: 'false', visited: 'false' })
    assert.ok(load(falseTracking.payload)('.govuk-error-summary').length, falseTracking.payload)
    assert.notEqual((await client(statePath)).result.visited, true)

    const savedFalse = await client(pagePath, { answer: 'false', visited: 'true' })
    assert.equal(savedFalse.statusCode, 303, savedFalse.payload)
    const state = (await client(statePath)).result
    assert.equal(state.answer, false)
    assert.equal(state.visited, true)
    const summary = await client(savedFalse.headers.location)
    assert.equal(summary.statusCode, 200, summary.payload)
    const summaryKeys = load(summary.payload)('.govuk-summary-list__key')
      .map((_, element) => load(element).text().trim())
      .get()
    const savedTrue = await client(pagePath, { answer: 'true', visited: 'true' })
    assert.equal(savedTrue.statusCode, 303, savedTrue.payload)
    assert.equal((await client(statePath)).result.answer, true)

    const welsh = await client(`${pagePath}?language=cy`)
    assert.ok(welsh.payload.includes('Ateb Cymraeg?'), welsh.payload)
    assert.equal(load(welsh.payload)('html').attr('lang'), 'cy')
    assert.ok((await client(pagePath)).payload.includes('Ateb Cymraeg?'))
    const field = model.componentMap.get('visited')
    assert.equal(model.createTranslator('cy').tComponent(field.def, 'title'), 'Tracking marker')
    assert.equal(field.name, 'visited')
    assert.equal(field.def.id, definition.pages[0].components[1].id)
    return {
      missingAnswerCopy: 'Choose yes or no',
      yesAndNoPersistAsBooleans: true,
      trackingHiddenInputValue: 'true',
      trackingAfterGet: Object.hasOwn(getState, 'visited') ? getState.visited : 'absent',
      trackingAfterInvalidPost: Object.hasOwn(invalidState, 'visited') ? invalidState.visited : 'absent',
      trackingFalsePostRejected: true,
      trackingAfterValidPost: state.visited,
      engineSummaryKeys: summaryKeys,
      appWouldDisplayTracking: shouldDisplayAnswer(field.def),
      welshTitleAndLanguagePersist: true,
      missingWelshComponentTextFallsBack: true
    }
  })
  const mappedMessage = structuredClone(definition)
  mappedMessage.pages[0].components[0].options = {
    required: true,
    customValidationMessages: { 'any.required': 'Select a response for the spike' }
  }
  report.checks.mappedCustomMessage = await verify(mappedMessage, async (client) => {
    await client(pagePath)
    const response = await client(pagePath, { visited: 'true' })
    assert.ok(response.payload.includes('Select a response for the spike'), response.payload)
    return true
  })
  report.checks.welshCustomError = await verify(definition, async (client) => {
    await client(`${pagePath}?language=cy`)
    const response = await client(pagePath, { visited: 'true' })
    const errors = load(response.payload)('.govuk-error-summary__list').text().trim()
    assert.ok(errors, response.payload)
    return errors
  })
  const englishOnly = structuredClone(definition)
  delete englishOnly.metadata.translations
  report.checks.welshPreferenceWithoutTranslations = await verify(englishOnly, async (client) => {
    const response = await client(`${pagePath}?language=cy`)
    assert.equal(response.statusCode, 200, response.payload)
    assert.ok(response.payload.includes('Is the answer yes?'), response.payload)
    assert.equal(load(response.payload)('html').attr('lang'), 'en-GB')
    return 'en-GB'
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

if (process.argv.includes('--serve')) {
  const { server } = await createHost(definition, Number(process.env.PORT ?? 3099))
  await server.start()
  process.stdout.write(`FEATURE_PROBE_URL=${server.info.uri}${pagePath}\n`)
} else {
  await runProbe()
}
