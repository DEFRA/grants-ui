import Hapi from '@hapi/hapi'
import vision from '@hapi/vision'
import nunjucks from 'nunjucks'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import multiApplication from './multi-application.js'

// The unit tests mock the view manager; this one renders through the real Vision pipeline so a
// template change or a Vision/nunjucks upgrade that breaks the link rewriting is caught.
const PAGE = `<a href="/{{ slug }}/tasks">tasks</a>
<a href="/{{ slug }}">root</a>
<a href="remove-parcel?parcelId=1&amp;x=2">relative</a>
<form action="/{{ slug }}/management-control-of-land" method="post"></form>
<a href="/auth/sign-out">sign out</a>
<a href="/other-grant/tasks">other grant</a>
<a href="#top">anchor</a>
<a href="https://www.gov.uk/">external</a>
`

describe('multi-application plugin on a real Hapi server with Vision', () => {
  let server

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'multi-application-'))
    writeFileSync(join(dir, 'page.njk'), PAGE)

    server = Hapi.server()
    await server.register(vision)
    server.views({
      engines: { njk: { compile: (src) => (context) => nunjucks.compile(src).render(context) } },
      relativeTo: dir,
      path: '.'
    })
    await server.register(multiApplication)
    server.route([
      { method: 'GET', path: '/{slug}/{path}', handler: (request, h) => h.view('page', { slug: request.params.slug }) },
      { method: 'GET', path: '/{slug}/go/{where}', handler: (request, h) => h.redirect(`/${request.params.where}`) }
    ])
    await server.initialize()
  })

  afterAll(() => server.stop())

  const hrefs = (html) => [...html.matchAll(/(?:href|action)="([^"]*)"/g)].map((m) => m[1])

  it('adds the ref to every same-grant link and form action of the rendered page, and nothing else', async () => {
    const res = await server.inject('/grasslands/confirm-land-and-actions?ref=GLD-ABC-123')

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(hrefs(res.payload)).toEqual([
      '/grasslands/tasks?ref=GLD-ABC-123',
      '/grasslands?ref=GLD-ABC-123',
      'remove-parcel?parcelId=1&amp;x=2&amp;ref=GLD-ABC-123',
      '/grasslands/management-control-of-land?ref=GLD-ABC-123',
      '/auth/sign-out',
      '/other-grant/tasks',
      '#top',
      'https://www.gov.uk/'
    ])
  })

  it('leaves the page untouched when the request carries no ref', async () => {
    const res = await server.inject('/grasslands/confirm-land-and-actions')

    expect(res.statusCode).toBe(200)
    expect(hrefs(res.payload)).toEqual([
      '/grasslands/tasks',
      '/grasslands',
      'remove-parcel?parcelId=1&amp;x=2',
      '/grasslands/management-control-of-land',
      '/auth/sign-out',
      '/other-grant/tasks',
      '#top',
      'https://www.gov.uk/'
    ])
  })

  it('adds the ref to a same-grant redirect but not to one that leaves the journey', async () => {
    const inJourney = await server.inject('/grasslands/go/grasslands%2Ftasks?ref=GLD-ABC-123')
    const offJourney = await server.inject('/grasslands/go/home?ref=GLD-ABC-123')

    expect(inJourney.headers.location).toBe('/grasslands/tasks?ref=GLD-ABC-123')
    expect(offJourney.headers.location).toBe('/home')
  })
})
