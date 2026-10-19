/* eslint-disable no-console */

import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { LOCAL_SERVICES, ROOT } from './constants.js'

/** Find a known service's sibling checkout with a root Dockerfile. */
export function getLocalServiceRepo(key, root = ROOT) {
  if (!LOCAL_SERVICES.some((service) => service.key === key)) {
    return null
  }
  const repo = resolve(root, '..', key)
  try {
    return statSync(resolve(repo, 'Dockerfile')).isFile() ? repo : null
  } catch {
    return null
  }
}

/** Build in a worker so Docker output and cancellation use the usual action UI. */
export function buildLocalImage(key, dryRun = false) {
  const repo = getLocalServiceRepo(key)
  if (!repo) {
    console.error(`No sibling checkout with a Dockerfile found for ${key}`)
    return 1
  }
  console.log(`docker build -t ${key}:local . (in ${repo})`)
  if (dryRun) {
    return 0
  }
  const result = spawnSync('docker', ['build', '-t', `${key}:local`, '.'], { cwd: repo, stdio: 'inherit' })
  if (result.error) {
    console.error(result.error)
  }
  return result.status ?? 1
}
