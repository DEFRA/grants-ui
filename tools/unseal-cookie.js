/* eslint-disable */
import Iron from '@hapi/iron'

if (process.argv.length < 4) {
  console.error('usage: node unseal.js <sealedCookie> <password>')
  process.exit(2)
}

const sealed = decodeURIComponent(process.argv[2].replace(/^s:/, '')) // strip s: and decode
const password = process.argv[3]

const ironOptions = {
  ...Iron.defaults,
  ttl: 0,
  format: 'compact'
}

;(async () => {
  try {
    const result = await Iron.unseal(sealed, password, ironOptions)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('unseal failed:', err.message)
    process.exit(1)
  }
})()
