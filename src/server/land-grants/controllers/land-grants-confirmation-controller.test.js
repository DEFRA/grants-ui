import LandGrantsConfirmationController from './land-grants-confirmation-controller.js'

describe('LandGrantsConfirmationController', () => {
  let controller

  beforeEach(() => {
    controller = new LandGrantsConfirmationController()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('land-grants-confirmation-page.html')
  })
})
