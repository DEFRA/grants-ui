import { vi } from 'vitest'
import * as landGrantsService from '~/src/server/land-grants/services/land-grants.service.js'
import * as woodlandService from '~/src/server/woodland/woodland.service.js'
import * as paymentViewModel from '~/src/server/land-grants/view-models/payment.view-model.js'
import * as paymentUtils from '~/src/server/common/utils/payment.js'
import { paymentStrategies } from './payment-strategies.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js')
vi.mock('~/src/server/woodland/woodland.service.js')
vi.mock('~/src/server/land-grants/view-models/payment.view-model.js')
vi.mock('~/src/server/common/utils/payment.js')

describe('paymentStrategies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(paymentUtils.formatPrice).mockImplementation((pence) => `£${(pence / 100).toFixed(2)}`)
  })

  describe('multiAction.calculatePayment', () => {
    const mockState = { landParcels: ['parcel1'] }
    const mockPayment = { annualTotalPence: 5000 }
    const mockActionGroups = [{ groupId: 'G1' }]
    const mockParcelItems = [{ parcelId: 'parcel1', amount: 5000 }]
    const mockAdditionalPayments = [{ description: 'bonus', amount: 1000 }]

    beforeEach(() => {
      vi.mocked(landGrantsService.calculateLandActionsPayment).mockResolvedValue({
        payment: mockPayment
      })
      vi.mocked(landGrantsService.fetchParcelsGroups).mockResolvedValue(mockActionGroups)
      vi.mocked(paymentViewModel.mapPaymentInfoToParcelItems).mockReturnValue(mockParcelItems)
      vi.mocked(paymentViewModel.mapAdditionalYearlyPayments).mockReturnValue(mockAdditionalPayments)
    })

    it('fetches payment and parcel groups in parallel', async () => {
      await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(landGrantsService.calculateLandActionsPayment).toHaveBeenCalledWith(mockState)
      expect(landGrantsService.fetchParcelsGroups).toHaveBeenCalledWith(mockState)
    })

    it('returns mapped result with totalPence, totalPayment, parcelItems and additionalYearlyPayments', async () => {
      const result = await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(result).toEqual({
        totalPence: 5000,
        totalPayment: '£50.00',
        payment: mockPayment,
        parcelItems: mockParcelItems,
        additionalYearlyPayments: mockAdditionalPayments
      })
    })

    it('maps parcel items using payment and actionGroups', async () => {
      await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(paymentViewModel.mapPaymentInfoToParcelItems).toHaveBeenCalledWith(mockPayment, mockActionGroups)
    })

    it('maps additional yearly payments using payment', async () => {
      await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(paymentViewModel.mapAdditionalYearlyPayments).toHaveBeenCalledWith(mockPayment)
    })

    it('defaults totalPence to 0 when annualTotalPence is missing', async () => {
      vi.mocked(landGrantsService.calculateLandActionsPayment).mockResolvedValue({ payment: {} })

      const result = await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(result.totalPence).toBe(0)
    })

    it('defaults totalPence to 0 when payment is null', async () => {
      vi.mocked(landGrantsService.calculateLandActionsPayment).mockResolvedValue({ payment: null })

      const result = await paymentStrategies.multiAction.calculatePayment(mockState)

      expect(result.totalPence).toBe(0)
    })
  })

  describe('wmp.calculatePayment', () => {
    const mockState = {
      landParcels: ['parcel1', 'parcel2'],
      hectaresUnderTenYearsOld: 5.5,
      hectaresTenOrOverYearsOld: 2.0
    }
    const mockPayment = { someWmpData: true }

    beforeEach(() => {
      vi.mocked(woodlandService.calculateWmpPayment).mockResolvedValue({
        payment: mockPayment,
        totalPence: 12000
      })
    })

    it('calls calculateWmpPayment with parcelIds and area values from state', async () => {
      await paymentStrategies.wmp.calculatePayment(mockState)

      expect(woodlandService.calculateWmpPayment).toHaveBeenCalledWith({
        parcelIds: ['parcel1', 'parcel2'],
        hectaresUnderTenYearsOld: 5.5,
        hectaresTenOrOverYearsOld: 2.0
      })
    })

    it('returns totalPence, totalPayment and payment', async () => {
      const result = await paymentStrategies.wmp.calculatePayment(mockState)

      expect(result).toEqual({
        totalPence: 12000,
        totalPayment: '£120.00',
        payment: mockPayment
      })
    })

    it('defaults landParcels to empty array when not in state', async () => {
      await paymentStrategies.wmp.calculatePayment({ hectaresUnderTenYearsOld: 1, hectaresTenOrOverYearsOld: 0 })

      expect(woodlandService.calculateWmpPayment).toHaveBeenCalledWith(expect.objectContaining({ parcelIds: [] }))
    })

    it('defaults hectaresUnderTenYearsOld to 0 when not in state', async () => {
      await paymentStrategies.wmp.calculatePayment({ landParcels: [] })

      expect(woodlandService.calculateWmpPayment).toHaveBeenCalledWith(
        expect.objectContaining({ hectaresUnderTenYearsOld: 0 })
      )
    })

    it('defaults hectaresTenOrOverYearsOld to 0 when not in state', async () => {
      await paymentStrategies.wmp.calculatePayment({ landParcels: [] })

      expect(woodlandService.calculateWmpPayment).toHaveBeenCalledWith(
        expect.objectContaining({ hectaresTenOrOverYearsOld: 0 })
      )
    })
  })
})
