const { Pact } = require('@pact-foundation/pact')
const path = require('path')

describe('CommonJS Pact Test', () => {
  let provider

  beforeAll(async () => {
    provider = new Pact({
      consumer: 'commonjs-consumer',
      provider: 'commonjs-provider',
      port: 5555,
      log: path.resolve(__dirname, '../logs', 'commonjs.log'),
      dir: path.resolve(__dirname, '../pacts'),
      logLevel: 'INFO',
      spec: 2
    })
    
    await provider.setup()
  })

  afterAll(async () => {
    await provider.finalize()
  })

  it('should work with CommonJS', async () => {
    await provider.addInteraction({
      uponReceiving: 'a CommonJS request',
      withRequest: {
        method: 'GET',
        path: '/commonjs'
      },
      willRespondWith: {
        status: 200,
        body: 'CommonJS Works'
      }
    })
    
    const response = await fetch('http://localhost:5555/commonjs')
    const text = await response.text()
    
    console.log('CommonJS Response status:', response.status)
    console.log('CommonJS Response text:', text)
    
    expect(response.status).toBe(200)
    expect(text).toBe('CommonJS Works')
    
    await provider.verify()
  })
})