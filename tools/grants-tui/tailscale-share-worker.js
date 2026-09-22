/* eslint-disable no-console */

import { revokeAllTailscaleShares } from './tailscale-share.js'

if (process.argv[2] !== 'revoke-all') {
  console.error('Unknown Tailscale share cleanup action.')
  process.exitCode = 1
} else {
  process.exitCode = await revokeAllTailscaleShares(false)
}
