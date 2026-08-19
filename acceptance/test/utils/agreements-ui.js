import { mockServerClient } from 'mockserver-client'

class AgreementsUi {
  async getLastRequest() {
    const client = mockServerClient(process.env.MOCKSERVER_HOST, process.env.MOCKSERVER_PORT)
    const requests = await client.retrieveRecordedRequests({
      method: 'GET',
      path: '/'
    })
    return requests[requests.length - 1]
  }
}

export default new AgreementsUi()
