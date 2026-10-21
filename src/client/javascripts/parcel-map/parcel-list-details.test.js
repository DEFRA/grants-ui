// @vitest-environment jsdom
import { createParcelListDetailsRenderer } from './parcel-list-details.js'
import { PARCEL_DETAILS_LOADING_DELAY_MS, PARCEL_DETAILS_LOADING_MIN_DURATION_MS } from './config.js'

const PARCEL_A = 'SO3757-3184'
const PARCEL_B = 'SO3757-3185'
const NOTICE = { intro: '', items: [], actionCount: 2 }
const statusRow = (id = PARCEL_A) =>
  document.querySelector(`[data-parcel-details="${id}"] [data-parcel-details-status]`)
const announcement = () => document.getElementById('parcel-list-status')?.textContent

describe('parcel list loading feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <div id="land-parcels">
        ${[PARCEL_A, PARCEL_B]
          .map(
            (id) => `
          <div data-parcel-details="${id}">
            <div data-parcel-actions-row hidden><span data-parcel-action-count></span></div>
            <div data-parcel-details-status hidden><span data-parcel-details-status-text></span></div>
          </div>`
          )
          .join('')}
      </div>
      <output id="parcel-list-status"></output>`
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('waits for the loading delay before showing or announcing loading', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS - 1)
    expect(statusRow()?.hasAttribute('hidden')).toBe(true)
    expect(announcement()).toBe('')
    vi.advanceTimersByTime(1)
    expect(statusRow()?.hasAttribute('hidden')).toBe(false)
    expect(announcement()).toBe('Loading available actions and requirements…')
  })

  it('never shows loading when the response arrives before the delay', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS - 1)
    renderer.render(PARCEL_A, NOTICE)
    expect(announcement()).toBe('2 available actions.')
    vi.runAllTimers()
    expect(statusRow()?.hasAttribute('hidden')).toBe(true)
    expect(announcement()).toBe('2 available actions.')
  })

  it.each([NOTICE, null])('keeps loading visible for at least the minimum duration before showing %j', (notice) => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS + 100)
    renderer.render(PARCEL_A, notice)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_MIN_DURATION_MS - 101)
    expect(announcement()).toBe('Loading available actions and requirements…')
    vi.advanceTimersByTime(1)
    expect(announcement()).toBe(
      notice
        ? '2 available actions.'
        : 'We could not load the available actions and requirements. Continue to check them on the next page.'
    )
  })

  it('renders a slow response immediately once the minimum display time has elapsed', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS + PARCEL_DETAILS_LOADING_MIN_DURATION_MS + 1)
    renderer.render(PARCEL_A, NOTICE)
    expect(announcement()).toBe('2 available actions.')
    expect(statusRow()?.hasAttribute('hidden')).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders cached details immediately without a loading message', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.render(PARCEL_A, NOTICE)
    expect(announcement()).toBe('2 available actions.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts the delay when a different parcel is selected', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS - 1)
    renderer.startLoading(PARCEL_B)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS - 1)
    expect(announcement()).toBe('')
    vi.advanceTimersByTime(1)
    expect(statusRow(PARCEL_A)?.hasAttribute('hidden')).toBe(true)
    expect(statusRow(PARCEL_B)?.hasAttribute('hidden')).toBe(false)
  })

  it('cancels delayed results when another parcel is selected', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS)
    renderer.render(PARCEL_A, NOTICE)
    renderer.startLoading(PARCEL_B)
    renderer.render(PARCEL_B, { ...NOTICE, actionCount: 5 })
    vi.runAllTimers()
    expect(announcement()).toBe('5 available actions.')
  })

  it('cancels pending feedback on deselection', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    renderer.clear()
    vi.runAllTimers()
    expect(announcement()).toBe('')
    expect(statusRow()?.hasAttribute('hidden')).toBe(true)
  })

  it('removes details already shown when no single parcel is selected', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.render(PARCEL_A, NOTICE)
    renderer.clear()
    const panel = document.querySelector(`[data-parcel-details="${PARCEL_A}"]`)
    expect(panel?.querySelector('[data-parcel-actions-row]')?.hasAttribute('hidden')).toBe(true)
    expect(panel?.querySelector('[data-parcel-action-count]')?.textContent).toBe('')
    expect(announcement()).toBe('')
  })

  it.each([
    [0, 'There are no actions available for this land parcel. Select another land parcel to continue.'],
    [1, '1 available action.'],
    [2, '2 available actions.']
  ])('announces a count of %i as the page words it', (actionCount, expected) => {
    createParcelListDetailsRenderer().render(PARCEL_A, { ...NOTICE, actionCount })
    expect(announcement()).toBe(expected)
  })

  it('announces requirements after the count and nothing for an unknown count', () => {
    const renderer = createParcelListDetailsRenderer()
    renderer.render(PARCEL_A, { intro: 'Some actions require:', items: ['SSSI consent', 'a HEFER'], actionCount: 1 })
    expect(announcement()).toBe('1 available action. Some actions require: SSSI consent, a HEFER')
    renderer.render(PARCEL_B, { intro: '', items: [] })
    expect(announcement()).toBe('')
  })

  it('does not announce list feedback while the map is visible', () => {
    document.getElementById('land-parcels')?.setAttribute('hidden', '')
    const renderer = createParcelListDetailsRenderer()
    renderer.startLoading(PARCEL_A)
    vi.advanceTimersByTime(PARCEL_DETAILS_LOADING_DELAY_MS)
    renderer.render(PARCEL_A, NOTICE)
    vi.runAllTimers()
    expect(announcement()).toBe('')
  })
})
