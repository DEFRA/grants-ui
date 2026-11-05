// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { map } from '@defra/forms-engine-plugin/shared.js'
import { createApproximateLocation } from './approximate-location.js'

vi.mock('@defra/forms-engine-plugin/shared.js', () => ({ map: { latLongToEastingNorthing: vi.fn() } }))

const POINT = { lat: 53.82, long: -1.51 }
const LABEL = 'LS8, Leeds, England, UK'
const response = (label = LABEL) => ({ ok: true, json: vi.fn().mockResolvedValue({ label }) })
const label = () => document.querySelector('.app-approximate-location')

describe('approximate location display', () => {
  let update

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(map.latLongToEastingNorthing).mockReturnValue({ easting: 432100.4, northing: 436500.6 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
    document.body.innerHTML = '<div id="map_0"></div>'
    update = createApproximateLocation(document.getElementById('map_0'))
  })

  afterEach(() => {
    window.dispatchEvent(new window.Event('pagehide'))
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('renders a polite live label immediately below the map after a debounced lookup', async () => {
    update(POINT)
    expect(document.getElementById('map_0').nextElementSibling).toBe(label())
    expect(label().getAttribute('aria-live')).toBe('polite')
    expect(label().getAttribute('aria-atomic')).toBe('true')
    expect(label().classList.contains('govuk-!-margin-top-1')).toBe(true)
    await vi.advanceTimersByTimeAsync(299)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledWith('/api/map/approximate-location?easting=432100&northing=436501', {
      signal: expect.any(window.AbortSignal)
    })
    expect(label().textContent).toBe(`Approximate location: ${LABEL}`)
    expect(label().querySelector('strong').textContent).toBe('Approximate location:')
    expect(label().querySelector('strong').nextSibling.textContent).toBe(` ${LABEL}`)
  })

  test.each([
    ['Nearby location:', 'Nearby location:'],
    ['  Selected location:  ', 'Selected location:'],
    ['', 'Approximate location:'],
    ['   ', 'Approximate location:'],
    ['<em>Location:</em>', '<em>Location:</em>']
  ])('renders a configurable prefix as semantic strong text (%j)', async (prefix, expected) => {
    label().remove()
    update = createApproximateLocation(document.getElementById('map_0'), prefix)
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    expect(label().textContent).toBe(`${expected} ${LABEL}`)
    expect(label().querySelector('strong').textContent).toBe(expected)
    expect(label().querySelector('em')).toBeNull()
  })

  test('debounces successive updates and clears the old label immediately', async () => {
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    update(POINT)
    expect(label().textContent).toBe('')
    await vi.advanceTimersByTimeAsync(200)
    update(POINT)
    await vi.advanceTimersByTimeAsync(299)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(label().textContent).toContain(LABEL)
  })

  test('aborts previous requests and discards stale JSON even if the fetch ignores cancellation', async () => {
    let resolveOldJson
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveOldJson = resolve
        })
    })
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    const oldSignal = vi.mocked(fetch).mock.calls[0][1].signal
    update(POINT)
    expect(oldSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    resolveOldJson({ label: 'Stale place' })
    await vi.advanceTimersByTimeAsync(0)
    expect(label().textContent).toBe(`Approximate location: ${LABEL}`)
  })

  test('clears and cancels the label when the answer becomes invalid or empty', async () => {
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    update()
    expect(label().textContent).toBe('')
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(1)
    update(POINT)
    update()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test.each([
    { easting: NaN, northing: 1 },
    { easting: -1, northing: 1 },
    { easting: 700001, northing: 1 },
    { easting: 1, northing: 1300001 }
  ])('skips unusable converted coordinates (%j)', async (point) => {
    vi.mocked(map.latLongToEastingNorthing).mockReturnValue(point)
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('contains conversion failures without interrupting the map', () => {
    vi.mocked(map.latLongToEastingNorthing).mockImplementation(() => {
      throw new Error('Outside grid')
    })
    expect(() => update(POINT)).not.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  test.each(['network', 'http', 'json', 'empty', 'missing', 'null'])(
    'leaves no label after a %s result',
    async (failure) => {
      if (failure === 'network') {
        vi.mocked(fetch).mockRejectedValue(new Error('Network failed'))
      } else if (failure === 'http') {
        vi.mocked(fetch).mockResolvedValue({ ok: false })
      } else if (failure === 'json') {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error('Invalid JSON')) })
      } else {
        vi.mocked(fetch).mockResolvedValue(response(failure === 'empty' ? '' : failure === 'null' ? null : undefined))
        if (failure === 'missing') {
          vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) })
        }
      }
      update(POINT)
      await vi.advanceTimersByTimeAsync(300)
      expect(label().textContent).toBe('')
    }
  )

  test('renders provider labels as text', async () => {
    const providerLabel = '<img src=x onerror=alert(1)>'
    vi.mocked(fetch).mockResolvedValue(response(providerLabel))
    update(POINT)
    await vi.advanceTimersByTimeAsync(300)
    expect(label().textContent).toBe(`Approximate location: ${providerLabel}`)
    expect(label().querySelector('img')).toBeNull()
  })

  test('aborts slow lookups and ignores their late responses', async () => {
    let resolveResponse
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve
        })
    )
    update(POINT)
    await vi.advanceTimersByTimeAsync(3300)
    expect(vi.mocked(fetch).mock.calls[0][1].signal.aborted).toBe(true)
    resolveResponse(response())
    await vi.advanceTimersByTimeAsync(0)
    expect(label().textContent).toBe('')
  })

  test('cancels scheduled and in-flight work when leaving the page', async () => {
    update(POINT)
    window.dispatchEvent(new window.Event('pagehide'))
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).not.toHaveBeenCalled()
    update(POINT)
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(300)
    window.dispatchEvent(new window.Event('pagehide'))
    expect(vi.mocked(fetch).mock.calls[0][1].signal.aborted).toBe(true)
  })

  test('keeps multiple map labels independent', async () => {
    const second = document.createElement('div')
    document.body.append(second)
    const updateSecond = createApproximateLocation(second)
    vi.mocked(fetch).mockResolvedValueOnce(response('First place')).mockResolvedValueOnce(response('Second place'))
    update(POINT)
    updateSecond(POINT)
    await vi.advanceTimersByTimeAsync(300)
    const labels = document.querySelectorAll('.app-approximate-location')
    expect([...labels].map((element) => element.textContent)).toEqual([
      'Approximate location: First place',
      'Approximate location: Second place'
    ])
    update()
    expect(labels[1].textContent).toBe('Approximate location: Second place')
  })
})
