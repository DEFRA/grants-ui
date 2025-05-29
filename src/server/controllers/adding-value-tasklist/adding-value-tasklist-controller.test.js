import {
  addingValueTasklist,
  otherFarmersYesOrFruitStorageCondition,
  agentOrApplicantCondition,
  basedOnCompletion
} from './adding-value-tasklist-controller.js'

describe('adding-value-tasklist-controller', () => {
  describe('otherFarmersYesOrFruitStorageCondition', () => {
    it('should return "notRequired" when both smaller abattoir and fruit storage are false', () => {
      const data = {
        facilities: {
          isBuildingSmallerAbattoir: false,
          isBuildingFruitStorage: false
        }
      }
      expect(otherFarmersYesOrFruitStorageCondition(data)).toBe('notRequired')
    })

    it('should return "notYetStarted" when providing services to other farmers', () => {
      const data = {
        facilities: {
          isProvidingServicesToOtherFarmers: true,
          isBuildingSmallerAbattoir: true,
          isBuildingFruitStorage: false
        }
      }
      expect(otherFarmersYesOrFruitStorageCondition(data)).toBe('notYetStarted')
    })

    it('should return "notYetStarted" when providing fruit storage', () => {
      const data = {
        facilities: {
          isProvidingFruitStorage: true,
          isBuildingSmallerAbattoir: false,
          isBuildingFruitStorage: true
        }
      }
      expect(otherFarmersYesOrFruitStorageCondition(data)).toBe('notYetStarted')
    })

    it('should return "cannotStartYet" when conditions are not met', () => {
      const data = {
        facilities: {
          isProvidingServicesToOtherFarmers: false,
          isProvidingFruitStorage: false,
          isBuildingSmallerAbattoir: true,
          isBuildingFruitStorage: false
        }
      }
      expect(otherFarmersYesOrFruitStorageCondition(data)).toBe(
        'cannotStartYet'
      )
    })

    it('should return "cannotStartYet" when facilities data is missing', () => {
      const data = {}
      expect(otherFarmersYesOrFruitStorageCondition(data)).toBe(
        'cannotStartYet'
      )
    })
  })

  describe('agentOrApplicantCondition', () => {
    it('should return "notYetStarted" for applicant when applying-A1', () => {
      const data = {
        'who-is-applying': {
          grantApplicantType: 'applying-A1'
        }
      }
      expect(agentOrApplicantCondition(data, 'applicant')).toBe('notYetStarted')
    })

    it('should return "notYetStarted" for agent when applying-A2', () => {
      const data = {
        'who-is-applying': {
          grantApplicantType: 'applying-A2'
        }
      }
      expect(agentOrApplicantCondition(data, 'agent')).toBe('notYetStarted')
    })

    it('should return "notRequired" for agent when applying-A1', () => {
      const data = {
        'who-is-applying': {
          grantApplicantType: 'applying-A1'
        }
      }
      expect(agentOrApplicantCondition(data, 'agent')).toBe('notRequired')
    })

    it('should return "notRequired" for applicant when applying-A2', () => {
      const data = {
        'who-is-applying': {
          grantApplicantType: 'applying-A2'
        }
      }
      expect(agentOrApplicantCondition(data, 'applicant')).toBe('notRequired')
    })

    it('should return "cannotStartYet" when who-is-applying data is missing', () => {
      const data = {}
      expect(agentOrApplicantCondition(data, 'applicant')).toBe(
        'cannotStartYet'
      )
      expect(agentOrApplicantCondition(data, 'agent')).toBe('cannotStartYet')
    })

    it('should return "cannotStartYet" when grantApplicantType is null', () => {
      const data = {
        'who-is-applying': {}
      }
      expect(agentOrApplicantCondition(data, 'applicant')).toBe(
        'cannotStartYet'
      )
    })
  })

  describe('basedOnCompletion', () => {
    it('should return "completed" when page is in data', () => {
      const data = {
        'score-results': { someData: true }
      }
      const pageStatuses = {
        'business-status': 'completed',
        'project-preparation': 'completed'
      }
      const pageList = ['business-status', 'project-preparation']

      expect(
        basedOnCompletion('score-results', data, pageStatuses, pageList)
      ).toBe('completed')
    })

    it('should return "cannotStartYet" when any page has falsy status', () => {
      const data = {}
      const pageStatuses = {
        'business-status': 'completed',
        'project-preparation': 'notYetStarted',
        facilities: 'completed'
      }
      const pageList = ['business-status', 'project-preparation', 'facilities']

      expect(
        basedOnCompletion('score-results', data, pageStatuses, pageList)
      ).toBe('cannotStartYet')
    })

    it('should return "cannotStartYet" when page has inProgress status', () => {
      const data = {}
      const pageStatuses = {
        'business-status': 'completed',
        'project-preparation': 'inProgress'
      }
      const pageList = ['business-status', 'project-preparation']

      expect(
        basedOnCompletion('score-results', data, pageStatuses, pageList)
      ).toBe('cannotStartYet')
    })

    it('should return "notYetStarted" when all pages are completed', () => {
      const data = {}
      const pageStatuses = {
        'business-status': 'completed',
        'project-preparation': 'completed',
        facilities: 'completed'
      }
      const pageList = ['business-status', 'project-preparation', 'facilities']

      expect(
        basedOnCompletion('score-results', data, pageStatuses, pageList)
      ).toBe('notYetStarted')
    })
  })

  describe('addingValueTasklist plugin', () => {
    let server
    let mockRequest
    let mockH

    beforeEach(() => {
      server = {
        route: jest.fn(),
        app: {
          cacheTemp: {
            get: jest.fn()
          }
        }
      }
      mockRequest = {
        yar: {
          id: 'test-session-id',
          get: jest.fn()
        }
      }
      mockH = {
        view: jest.fn()
      }
    })

    it('should register the plugin correctly', () => {
      addingValueTasklist.plugin.register(server)
      expect(server.route).toHaveBeenCalledWith({
        method: 'GET',
        path: '/adding-value-tasklist',
        handler: expect.any(Function)
      })
    })

    it('should handle request with no data', async () => {
      server.app.cacheTemp.get.mockResolvedValue(null)
      mockRequest.yar.get.mockReturnValue([])

      addingValueTasklist.plugin.register(server)
      const handler = server.route.mock.calls[0][0].handler

      await handler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'views/adding-value-tasklist-page',
        expect.objectContaining({
          pageHeading: 'Apply for adding value grant',
          sections: expect.any(Array)
        })
      )
    })

    it('should handle request with completed sections', async () => {
      const mockData = {
        'business-status': { completed: true },
        facilities: {
          isBuildingSmallerAbattoir: true,
          isProvidingServicesToOtherFarmers: true
        }
      }
      server.app.cacheTemp.get.mockResolvedValue(mockData)
      mockRequest.yar.get.mockReturnValue([])

      addingValueTasklist.plugin.register(server)
      const handler = server.route.mock.calls[0][0].handler

      await handler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'views/adding-value-tasklist-page',
        expect.objectContaining({
          pageHeading: 'Apply for adding value grant',
          sections: expect.any(Array)
        })
      )
    })

    it('should handle in-progress sections', async () => {
      server.app.cacheTemp.get.mockResolvedValue({})
      mockRequest.yar.get.mockReturnValue(['project-preparation', 'costs'])

      addingValueTasklist.plugin.register(server)
      const handler = server.route.mock.calls[0][0].handler

      await handler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'views/adding-value-tasklist-page',
        expect.objectContaining({
          pageHeading: 'Apply for adding value grant',
          sections: expect.any(Array)
        })
      )
    })

    it('should preserve notRequired status for completed sections', async () => {
      const mockData = {
        facilities: {
          isBuildingSmallerAbattoir: false,
          isBuildingFruitStorage: false
        },
        'produce-processed': { someData: true },
        'project-impact': { someData: true }
      }
      server.app.cacheTemp.get.mockResolvedValue(mockData)
      mockRequest.yar.get.mockReturnValue([])

      addingValueTasklist.plugin.register(server)
      const handler = server.route.mock.calls[0][0].handler

      await handler(mockRequest, mockH)

      const viewData = mockH.view.mock.calls[0][1]
      const produceSection = viewData.sections
        .flatMap((s) => s.subsections)
        .find((sub) => sub.title?.text === 'Produce')
      const projectImpactSection = viewData.sections
        .flatMap((s) => s.subsections)
        .find((sub) => sub.title?.text === 'Project')

      expect(produceSection?.href).toBeNull()
      expect(projectImpactSection?.href).toBeNull()
    })

    it('should handle agent/applicant conditional sections', async () => {
      const mockData = {
        'who-is-applying': {
          grantApplicantType: 'applying-A1'
        },
        'applicant-details': { name: 'Test Applicant' }
      }
      server.app.cacheTemp.get.mockResolvedValue(mockData)
      mockRequest.yar.get.mockReturnValue([])

      addingValueTasklist.plugin.register(server)
      const handler = server.route.mock.calls[0][0].handler

      await handler(mockRequest, mockH)

      const viewData = mockH.view.mock.calls[0][1]
      const applicantSection = viewData.sections
        .flatMap((s) => s.subsections)
        .find((sub) => sub.title?.text === 'Applicant')
      const agentSection = viewData.sections
        .flatMap((s) => s.subsections)
        .find((sub) => sub.title?.text === 'Agent')

      expect(applicantSection?.href).toContain('applicant-details')
      expect(agentSection?.href).toBeNull()
    })
  })
})
