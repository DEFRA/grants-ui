import { mockServerClient } from 'mockserver-client'

class Gas {
  async clearExpectation(expectationId) {
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    await client.clearById(expectationId)
  }

  async getApplicationSubmission(referenceNumber) {
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    const requests = await client.retrieveRecordedRequests({
      path: '/grants/[^/]+/applications'
    })
    return requests.find((r) => r.body.json.metadata.clientRef === referenceNumber.toLowerCase())
  }

  async setApplicationSubmissionResponse(sbi, httpStatusCode, errorText, times) {
    const expectationId = `applications-sbi-${sbi}-${httpStatusCode}`
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    await client.mockAnyResponse({
      id: expectationId,
      priority: 999,
      httpRequest: {
        method: 'POST',
        path: '/grants/[^/]+/applications',
        body: {
          type: 'JSON',
          json: {
            metadata: {
              sbi
            }
          }
        }
      },
      httpResponse: {
        statusCode: httpStatusCode,
        body: {
          type: 'JSON',
          json: {
            error: errorText
          }
        }
      },
      times: {
        remainingTimes: times,
        unlimited: false
      }
    })
    return expectationId
  }

  async setDefaultStatusQuery404Response() {
    const expectationId = 'applications-status-404-override'
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    await client.mockAnyResponse({
      id: expectationId,
      priority: 998,
      httpRequest: {
        method: 'GET',
        path: '/grants/.*/applications/.*/status'
      },
      httpResponse: {
        statusCode: 404
      }
    })
    return expectationId
  }

  async setStatusQueryResponse(referenceNumber, gasStatus) {
    const expectationId = `applications-${referenceNumber}-status-200`
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    await client.mockAnyResponse({
      id: expectationId,
      priority: 999,
      httpRequest: {
        method: 'GET',
        path: `/grants/[^/]+/applications/${referenceNumber.toLowerCase()}/status`
      },
      httpResponse: {
        statusCode: 200,
        body: {
          type: 'JSON',
          json: {
            status: gasStatus
          }
        }
      }
    })
    return expectationId
  }
}

export default new Gas()
