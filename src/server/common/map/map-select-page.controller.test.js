// @ts-nocheck
import { vi } from 'vitest'
import MapSelectPageController from './map-select-page.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { fetchActionsForParcel } from '~/src/server/land-grants/services/land-grants.service.js'
import { isNoActionsMockEnabled } from '~/src/server/dev-tools/mock-overrides.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { log, error, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const PAGE_PATH = '/select-land-parcel'

const noEligibleActionsError = (parcelReference) =>
  `There are no eligible actions for parcel ${parcelReference}.<br>` +
  'Change the parcel land cover or choose a different parcel to view eligible actions.'

function makePageDef(path = PAGE_PATH) {
  return { path }
}

function makeModel(config = {}, metadata = {}) {
  return { def: { metadata: { pageConfig: { [PAGE_PATH]: config }, ...metadata } } }
}

vi.mock('~/src/server/task-list/task-list.helper.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withTaskContext: (Base) => Base
  }
})

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchActionsForParcel: vi.fn()
}))

vi.mock('~/src/server/dev-tools/mock-overrides.js', () => ({
  isNoActionsMockEnabled: vi.fn().mockReturnValue(false)
}))

vi.mock('~/src/server/land-grants/services/land-grants-user-context.js', () => ({
  getLandGrantsUserContext: vi.fn().mockReturnValue({ defraIdToken: 'token', sbi: '123456789' })
}))

function makeController(config = {}, metadata = {}) {
  const controller = new MapSelectPageController(makeModel(config, metadata), makePageDef())
  setupControllerMocks(controller)
  controller.getViewModel = vi.fn().mockReturnValue({ pageTitle: 'Select a land parcel' })
  return controller
}

function makeRequest(payload = {}, path = '/select-land-parcel') {
  return { payload, path, query: {}, auth: { credentials: { sbi: '123456789', token: 'token' } } }
}

function makeContext(state = {}) {
  return { state }
}

function makeH() {
  return {
    view: vi.fn().mockReturnValue('view-response'),
    redirect: vi.fn().mockReturnValue('redirect-response')
  }
}

const expectNoActionsError = (h, parcelReferences = ['SD7148 9160'], selectedParcelIds = ['SD7148-9160']) =>
  expect(h.view).toHaveBeenCalledWith(
    'map-select-parcel',
    expect.objectContaining({
      errors: parcelReferences.map((reference) => ({
        html: noEligibleActionsError(reference),
        href: '#parcel-map'
      })),
      selectedParcelIds
    })
  )

describe('MapSelectPageController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNoActionsMockEnabled.mockReturnValue(false)
  })

  describe('constructor', () => {
    it.each([
      ['defaults to false with no page config', {}, {}, false],
      ['is true when the page config sets it', { multiSelect: true }, {}, true],
      ['is false when the page config unsets it', { multiSelect: false }, {}, false],
      [
        'is forced false by grant-level singleParcelSubmission',
        { multiSelect: true },
        { singleParcelSubmission: true },
        false
      ],
      ['stays true when singleParcelSubmission is absent', { multiSelect: true }, {}, true]
    ])('multiSelect %s', (_name, config, metadata, expected) => {
      const controller = new MapSelectPageController(makeModel(config, metadata), makePageDef())
      expect(controller.multiSelect).toBe(expected)
    })

    it.each([
      ['defaults to [] when metadata omits it', {}, []],
      ['is ignored when metadata sets a non-array', { enabledLandActions: 'CLIG3' }, []],
      ['is taken from metadata', { enabledLandActions: ['CLIG3'] }, ['CLIG3']]
    ])('enabledLandActions %s', (_name, metadata, expected) => {
      const controller = new MapSelectPageController(makeModel({}, metadata), makePageDef())
      expect(controller.enabledLandActions).toEqual(expected)
    })
  })

  describe('handleGet', () => {
    it.each([
      ['defaults multiSelect false and sets formAction from the path', {}, { multiSelect: false }],
      ['passes multiSelect true when the page config sets it', { multiSelect: true }, { multiSelect: true }]
    ])('renders the map view — %s', (_name, config, expected) => {
      const h = makeH()

      makeController(config).handleGet(makeRequest({}, '/my-path'), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({ ...expected, formAction: '/my-path' })
      )
    })

    it('omits selectedParcelIds, so the view renders no pre-filled hidden inputs', () => {
      const h = makeH()

      makeController().handleGet(makeRequest(), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.not.objectContaining({ selectedParcelIds: expect.anything() })
      )
    })
  })

  describe('handlePost — validation', () => {
    it.each([
      ['no landParcels key', {}, {}, 'Select a land parcel on the map before you continue.'],
      ['an empty string', { landParcels: '' }, {}, 'Select a land parcel on the map before you continue.'],
      ['an empty array', { landParcels: [] }, {}, 'Select a land parcel on the map before you continue.'],
      [
        'nothing selected in multi-select mode',
        {},
        { multiSelect: true },
        'Select at least one land parcel on the map before you continue.'
      ]
    ])('re-renders with an error given %s', async (_name, payload, config, errorText) => {
      const controller = makeController(config)
      const h = makeH()

      await controller.handlePost(makeRequest(payload), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({ errors: [{ text: errorText, href: '#parcel-map' }] })
      )
      expect(controller.setState).not.toHaveBeenCalled()
    })
  })

  describe('handlePost — action eligibility', () => {
    const withActions = { enabledLandActions: ['CLIG3', 'CSAM3'] }
    const zeroFor = (code) => ({ code, availability: { value: 0, unit: 'ha' } })
    const savedActionsFor = (parcelId) => ({
      landParcels: { [parcelId]: { actionsObj: { CLIG3: { description: 'x', value: 1 } } } }
    })

    it('rejects every selected parcel without calling the API when the dev mock is on', async () => {
      isNoActionsMockEnabled.mockReturnValue(true)
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(fetchActionsForParcel).not.toHaveBeenCalled()
      expectNoActionsError(h)
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('skips the check entirely for grants without enabledLandActions, dev mock or not', async () => {
      isNoActionsMockEnabled.mockReturnValue(true)
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(fetchActionsForParcel).not.toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalled()
    })

    it('re-renders with the no-eligible-actions error, and logs it, when the parcel has none', async () => {
      fetchActionsForParcel.mockResolvedValue({ actions: [] })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(fetchActionsForParcel).toHaveBeenCalledWith(
        { sheetId: 'SD7148', parcelId: '9160', enabledLandActions: ['CLIG3', 'CSAM3'] },
        expect.anything()
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND,
        { sheetId: 'SD7148', parcelId: '9160' },
        expect.anything()
      )
      expectNoActionsError(h)
      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    it('escapes the parcel id echoed into the error HTML', async () => {
      fetchActionsForParcel.mockResolvedValue({ actions: [] })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: '<img src=x>-9160' }), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({
          errors: [expect.objectContaining({ html: expect.stringContaining('&lt;img src=x&gt; 9160') })]
        })
      )
    })

    it('proceeds when the parcel has eligible actions', async () => {
      fetchActionsForParcel.mockResolvedValue({ actions: [{ code: 'CLIG3' }] })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next-path?parcelId=SD7148-9160')
    })

    it('fails open, logging the failure, when the actions fetch throws', async () => {
      fetchActionsForParcel.mockRejectedValue(new Error('Land Grants API unavailable'))
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(error).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        expect.objectContaining({
          sbi: '123456789',
          sheetId: 'SD7148',
          parcelId: '9160',
          errorMessage: 'Land Grants API unavailable'
        }),
        expect.anything()
      )
      expect(controller.setState).toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    it('errors when any one of several multi-selected parcels has no actions', async () => {
      fetchActionsForParcel
        .mockResolvedValueOnce({ actions: [{ code: 'CLIG3' }] })
        .mockResolvedValueOnce({ actions: [] })
      const controller = makeController({ multiSelect: true }, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9161'] }), makeContext(), h)

      expectNoActionsError(h, ['SD7148 9161'], ['SD7148-9160', 'SD7148-9161'])
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('still rejects a parcel with no actions when a different parcel fetch fails', async () => {
      fetchActionsForParcel
        .mockRejectedValueOnce(new Error('Land Grants API unavailable'))
        .mockResolvedValueOnce({ actions: [] })
      const controller = makeController({ multiSelect: true }, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9161'] }), makeContext(), h)

      // The failure is logged against its own parcel, not the whole selection,
      // and it does not blanket-pass the parcel that genuinely has no actions.
      expect(error).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        expect.objectContaining({ sheetId: 'SD7148', parcelId: '9160' }),
        expect.anything()
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND,
        { sheetId: 'SD7148', parcelId: '9161' },
        expect.anything()
      )
      expectNoActionsError(h, ['SD7148 9161'], ['SD7148-9160', 'SD7148-9161'])
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('fails open, without calling the API, when the user context is unavailable', async () => {
      getLandGrantsUserContext.mockImplementationOnce(() => {
        throw new Error('Missing SBI in Land Grants user context')
      })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(error).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        expect.objectContaining({
          sbi: '123456789',
          sheetId: '',
          parcelId: '',
          errorMessage: 'Missing SBI in Land Grants user context'
        }),
        expect.anything()
      )
      expect(fetchActionsForParcel).not.toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalled()
    })

    it('rejects a parcel whose every action has no land left, though the API returned them', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [zeroFor('CLIG3'), zeroFor('CSAM3')]
      })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND,
        { sheetId: 'SD7148', parcelId: '9160' },
        expect.anything()
      )
      expectNoActionsError(h)
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('proceeds when only some of the parcel actions have no land left', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [zeroFor('CLIG3'), { code: 'CSAM3', availability: { value: 2.5, unit: 'ha' } }]
      })
      const controller = makeController({}, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    it('proceeds for an all-zero parcel that already has actions saved against it', async () => {
      // The select-actions page still renders a saved action with no land left,
      // so re-selecting such a parcel to change it must not be blocked here.
      fetchActionsForParcel.mockResolvedValue({ actions: [zeroFor('CLIG3')] })
      const controller = makeController({ multiSelect: true }, withActions)
      const h = makeH()

      await controller.handlePost(
        makeRequest({ landParcels: 'SD7148-9160' }),
        makeContext(savedActionsFor('SD7148-9160')),
        h
      )

      expect(controller.setState).toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    it('still rejects an all-zero parcel with saved actions in single-parcel-submission mode', async () => {
      // handlePost wipes landParcels here, so those saved actions would not
      // survive to the select-actions render.
      fetchActionsForParcel.mockResolvedValue({ actions: [zeroFor('CLIG3')] })
      const controller = makeController({}, { ...withActions, singleParcelSubmission: true })
      const h = makeH()

      await controller.handlePost(
        makeRequest({ landParcels: 'SD7148-9160' }),
        makeContext(savedActionsFor('SD7148-9160')),
        h
      )

      expectNoActionsError(h)
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('fetches each parcel once when the same parcel is submitted twice', async () => {
      fetchActionsForParcel.mockResolvedValue({ actions: [{ code: 'CLIG3' }] })
      const controller = makeController({ multiSelect: true }, withActions)
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9160'] }), makeContext(), h)

      expect(fetchActionsForParcel).toHaveBeenCalledTimes(1)
      expect(controller.setState).toHaveBeenCalled()
    })
  })

  describe('handlePost — single-select success', () => {
    it('saves the parcel to state and appends ?parcelId to the redirect', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedParcelId: 'SD7148-9160',
          selectedParcelIds: ['SD7148-9160'],
          selectedParcelsDisplay: 'SD7148-9160'
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next-path?parcelId=SD7148-9160')
    })

    it('URL-encodes the parcel ID in the redirect', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD 71/48' }), makeContext(), h)

      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next-path?parcelId=SD%2071%2F48')
    })

    it('handles array payload with one item', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160'] }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedParcelId: 'SD7148-9160' })
      )
    })
  })

  describe('handlePost — single-parcel-submission', () => {
    const existingParcels = { landParcels: { 'SD0000-0001': { size: {}, actionsObj: {} } } }

    it('clears existing landParcels object when a parcel is selected', async () => {
      const controller = makeController({}, { singleParcelSubmission: true })
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(existingParcels), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedParcelId: 'SD7148-9160', landParcels: {} })
      )
    })

    it('does not clear landParcels when singleParcelSubmission is not set', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(existingParcels), h)

      expect(controller.setState).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(existingParcels))
    })
  })

  describe('handlePost — multi-select success', () => {
    it('saves every parcel, omits selectedParcelId, and does not append ?parcelId', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9161'] }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedParcelIds: ['SD7148-9160', 'SD7148-9161'],
          selectedParcelsDisplay: 'SD7148-9160, SD7148-9161'
        })
      )
      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ selectedParcelId: expect.anything() })
      )
      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next-path')
    })

    it('filters non-string values from array payload', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handlePost(
        makeRequest({ landParcels: ['SD7148-9160', 123, null, 'SD7148-9161'] }),
        makeContext(),
        h
      )

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedParcelIds: ['SD7148-9160', 'SD7148-9161'] })
      )
    })
  })

  // These wrappers override base-class stubs that return a canned view/redirect,
  // so without this coverage the overrides could be deleted and every other test
  // here would still pass.
  describe('route handler wrappers', () => {
    it('makeGetRouteHandler delegates to handleGet', async () => {
      const controller = makeController()
      controller.handleGet = vi.fn().mockResolvedValue('get-response')
      const handler = controller.makeGetRouteHandler()

      const result = await handler('req', 'ctx', 'h')

      expect(controller.handleGet).toHaveBeenCalledWith('req', 'ctx', 'h')
      expect(result).toBe('get-response')
    })

    it('makePostRouteHandler delegates to handlePost', async () => {
      const controller = makeController()
      controller.handlePost = vi.fn().mockResolvedValue('post-response')
      const handler = controller.makePostRouteHandler()

      const result = await handler('req', 'ctx', 'h')

      expect(controller.handlePost).toHaveBeenCalledWith('req', 'ctx', 'h')
      expect(result).toBe('post-response')
    })
  })
})
