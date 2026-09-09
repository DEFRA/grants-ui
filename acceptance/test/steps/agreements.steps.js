import { Then } from '@cucumber/cucumber'
import jwt from 'jsonwebtoken'
import expect from '../support/expect.js'
import AgreementsUi from '../utils/agreements-ui.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'

Then(
  'the agreements service should have been called with an x-encrypted-auth header JWT containing the following values',
  async function (dataTable) {
    const { CRN: crn, SBI: sbi, 'GRANT CODE': grantCode, 'CLIENT REFERENCE': clientRef } = dataTable.rowsHash()

    const request = await AgreementsUi.getLastRequest()
    expect(request).not.toBeNull()

    const headerName = Object.keys(request.headers).find((name) => name.toLowerCase() === 'x-encrypted-auth')
    const [token] = (headerName && request.headers[headerName]) ?? []
    expect(token).toBeDefined()

    const payload = jwt.verify(token, process.env.AGREEMENTS_JWT_SECRET, { ignoreExpiration: true })

    expect(payload.aud).toEqual(['agreements-ui', 'gas'])
    expect(payload.exp - payload.iat).toEqual(300)
    expect(payload.iss).toEqual('grants-ui')
    expect(payload.sbi).toEqual(sbi)
    expect(payload.sub).toEqual(crn)
    expect(payload.grantCode).toEqual(grantCode)
    expect(payload.clientRef).toEqual(transformStepArgument(clientRef).toLowerCase())
  }
)
