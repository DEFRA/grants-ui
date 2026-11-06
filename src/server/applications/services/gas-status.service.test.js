import { beforeEach, expect, it, vi } from 'vitest'
import { readGasStatuses } from './gas-status.service.js'
import { readGasApplicationStatus } from '../../common/request-pipeline/redirects/forms-status-redirect.js'

vi.mock('../../common/request-pipeline/redirects/forms-status-redirect.js', () => ({
  readGasApplicationStatus: vi.fn()
}))

const request = { params: { slug: 'test-grant' } }
const application = (applicationRef) => ({ applicationRef })

beforeEach(() => {
  vi.clearAllMocks()
})

it('reads GAS once per application, with one short attempt, and keys the statuses by reference', async () => {
  const gas = { 'REF-A': 'RECEIVED', 'REF-B': 'APPLICATION_AMEND' }
  readGasApplicationStatus.mockImplementation(async (_request, _grantCode, ref) => gas[ref])

  const result = await readGasStatuses(request, 'test-grant', [application('REF-A'), application('REF-B')])

  expect(readGasApplicationStatus).toHaveBeenCalledTimes(2)
  const oneShortAttempt = { maxAttempts: 1, timeout: 5000 }
  expect(readGasApplicationStatus).toHaveBeenCalledWith(request, 'test-grant', 'REF-A', oneShortAttempt)
  expect(readGasApplicationStatus).toHaveBeenCalledWith(request, 'test-grant', 'REF-B', oneShortAttempt)
  expect(result).toEqual(
    new Map([
      ['REF-A', 'RECEIVED'],
      ['REF-B', 'APPLICATION_AMEND']
    ])
  )
})

it('starts every read before waiting for any of them', async () => {
  let inFlight = 0
  let mostInFlight = 0
  readGasApplicationStatus.mockImplementation(() => {
    inFlight += 1
    mostInFlight = Math.max(mostInFlight, inFlight)
    return new Promise((resolve) =>
      setTimeout(() => {
        inFlight -= 1
        resolve('RECEIVED')
      }, 0)
    )
  })

  await readGasStatuses(request, 'test-grant', [application('REF-A'), application('REF-B'), application('REF-C')])

  expect(mostInFlight).toBe(3)
})

it('leaves out an application whose status could not be read, so its stored state stands', async () => {
  readGasApplicationStatus.mockResolvedValueOnce(undefined).mockResolvedValueOnce('RECEIVED')

  const result = await readGasStatuses(request, 'test-grant', [application('REF-A'), application('REF-B')])

  expect(result).toEqual(new Map([['REF-B', 'RECEIVED']]))
})

it('makes no GAS call for an empty list', async () => {
  const result = await readGasStatuses(request, 'test-grant', [])

  expect(result).toEqual(new Map())
  expect(readGasApplicationStatus).not.toHaveBeenCalled()
})
