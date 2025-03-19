import { getTrustStoreCerts } from '~/src/server/common/helpers/secure-context/get-trust-store-certs.js'

describe('#getTrustStoreCerts', () => {
  const mockProcessEnvWithCerts = {
    TRUSTSTORE_CA_ONE:
      'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCm1vY2stY2VydC1kb3JpcwotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==',
    UNRELATED_ENV: 'not-a-cert'
  }

  test('Should provide expected result with "certs"', () => {
    expect(getTrustStoreCerts(mockProcessEnvWithCerts)).toEqual([
      '-----BEGIN CERTIFICATE-----\nmock-cert-doris\n-----END CERTIFICATE-----'
    ])
  })

  test('Should provide expected empty array', () => {
    expect(getTrustStoreCerts({})).toEqual([])
  })
})
