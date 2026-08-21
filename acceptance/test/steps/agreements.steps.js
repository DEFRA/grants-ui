import { Then } from '@cucumber/cucumber'
import jwt from 'jsonwebtoken'
import expect from '../support/expect.js'
import AgreementsUi from '../utils/agreements-ui.js'

Then(
  'the agreements service should have been called with an x-encrypted-auth header JWT for SBI {string}',
  async function (sbi) {
    const request = await AgreementsUi.getLastRequest()
    expect(request).not.toBeNull()

    const headerName = Object.keys(request.headers).find((name) => name.toLowerCase() === 'x-encrypted-auth')
    const [token] = (headerName && request.headers[headerName]) ?? []
    expect(token).toBeDefined()

    const payload = jwt.verify(token, process.env.AGREEMENTS_JWT_SECRET, { ignoreExpiration: true })

    expect(payload.sbi).toEqual(sbi)
    expect(payload.exp - payload.iat).toEqual(Number(process.env.AGREEMENTS_JWT_TTL_SEC ?? 300))
    expect(payload.iss).toEqual(process.env.AGREEMENTS_JWT_ISSUER ?? 'grants-ui')
  }
)
