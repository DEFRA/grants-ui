import {
  DEFAULT_GRID_COLUMN_CLASS,
  GRID_COLUMN_CLASSES,
  gridColumnClass,
  widthToGridColumnClass
} from '~/src/config/nunjucks/grid-column.js'

describe('#widthToGridColumnClass', () => {
  test('maps two-thirds to the two-thirds column', () => {
    expect(widthToGridColumnClass('two-thirds')).toBe('govuk-grid-column-two-thirds')
  })

  test('maps three-quarters to the three-quarters column', () => {
    expect(widthToGridColumnClass('three-quarters')).toBe('govuk-grid-column-three-quarters-from-desktop')
  })

  test('maps full to the full column', () => {
    expect(widthToGridColumnClass('full')).toBe('govuk-grid-column-full')
  })

  test('defaults to two-thirds for unknown values', () => {
    expect(widthToGridColumnClass('half')).toBe(DEFAULT_GRID_COLUMN_CLASS)
    expect(widthToGridColumnClass('govuk-grid-column-full')).toBe(DEFAULT_GRID_COLUMN_CLASS)
  })

  test('defaults to two-thirds when width is missing', () => {
    expect(widthToGridColumnClass()).toBe(DEFAULT_GRID_COLUMN_CLASS)
    expect(widthToGridColumnClass(undefined)).toBe(DEFAULT_GRID_COLUMN_CLASS)
  })

  test('exposes the default as two-thirds', () => {
    expect(DEFAULT_GRID_COLUMN_CLASS).toBe(GRID_COLUMN_CLASSES['two-thirds'])
  })
})

describe('#gridColumnClass', () => {
  const makePage = (path, pageConfig) => ({
    path,
    def: { metadata: { pageConfig } }
  })

  test('reads the width from the page config for the current path', () => {
    const page = makePage('/task-list', { '/task-list': { width: 'full' } })
    expect(gridColumnClass(page)).toBe('govuk-grid-column-full')
  })

  test('resolves three-quarters from the page config', () => {
    const page = makePage('/summary', { '/summary': { width: 'three-quarters' } })
    expect(gridColumnClass(page)).toBe('govuk-grid-column-three-quarters-from-desktop')
  })

  test('defaults to two-thirds when the page has no matching config', () => {
    const page = makePage('/other', { '/task-list': { width: 'full' } })
    expect(gridColumnClass(page)).toBe(DEFAULT_GRID_COLUMN_CLASS)
  })

  test('defaults to two-thirds when there is no page config at all', () => {
    expect(gridColumnClass(makePage('/task-list', undefined))).toBe(DEFAULT_GRID_COLUMN_CLASS)
    expect(gridColumnClass({ path: '/task-list' })).toBe(DEFAULT_GRID_COLUMN_CLASS)
  })

  test('defaults to two-thirds when the page is undefined', () => {
    expect(gridColumnClass()).toBe(DEFAULT_GRID_COLUMN_CLASS)
    expect(gridColumnClass(undefined)).toBe(DEFAULT_GRID_COLUMN_CLASS)
  })

  test('defaults to two-thirds when the page has no path', () => {
    expect(gridColumnClass({ def: { metadata: { pageConfig: { '/x': { width: 'full' } } } } })).toBe(
      DEFAULT_GRID_COLUMN_CLASS
    )
  })

  test('uses the provided default width keyword when the page has no width config', () => {
    expect(gridColumnClass(makePage('/map', undefined), 'full')).toBe('govuk-grid-column-full')
    expect(gridColumnClass(undefined, 'full')).toBe('govuk-grid-column-full')
  })

  test('configured width overrides the provided default width', () => {
    const page = makePage('/map', { '/map': { width: 'two-thirds' } })
    expect(gridColumnClass(page, 'full')).toBe('govuk-grid-column-two-thirds')
  })

  test('returns a literal default class fallback verbatim when it is not a keyword', () => {
    expect(gridColumnClass(makePage('/x', undefined), 'govuk-grid-column-two-thirds-from-desktop')).toBe(
      'govuk-grid-column-two-thirds-from-desktop'
    )
    const configured = makePage('/x', { '/x': { width: 'full' } })
    expect(gridColumnClass(configured, 'govuk-grid-column-two-thirds-from-desktop')).toBe('govuk-grid-column-full')
  })
})
