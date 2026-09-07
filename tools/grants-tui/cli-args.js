/* eslint-disable no-console */

import { LOCAL_SERVICES, RED, RESET_COLOR, TEST_TARGETS } from './constants.js'

/**
 * Validate argv against known commands/flags.
 * Exits the process with code 1 on the first problem found.
 * @param {string[]} argv
 */
export function validateArgs(argv) {
  const knownCmds = new Set([
    'up',
    'down',
    'debug',
    'restart',
    'reset',
    'test',
    'sonar',
    'snyk',
    'check',
    'journey',
    'state'
  ])
  const testTargetKeys = new Set(argv.includes('test') ? TEST_TARGETS.map((t) => t.key) : [])
  const journeyIdx = argv.indexOf('journey')
  const stateIdx = argv.indexOf('state')
  const knownFlags = new Set([
    '--dry-run',
    '--help',
    '-h',
    '--version',
    '-v',
    '--scale',
    '--land-grants',
    '--gas',
    '--ha',
    '--down',
    '--skip-tests',
    '--changed',
    '--crn',
    '--stop',
    '--parcel',
    '--mock-no-actions',
    '--headed',
    '--clear',
    '--base-url',
    '--skip-install',
    '--sbi',
    '--grant-version',
    '--json',
    ...LOCAL_SERVICES.map((s) => `--local-${s.key}`)
  ])

  const valueFlagIdxs = new Set(
    ['--scale', '--crn', '--stop', '--parcel', '--base-url', '--sbi', '--grant-version']
      .map((f) => argv.indexOf(f))
      .filter((i) => i !== -1)
      .map((i) => i + 1)
  )
  const unknownCmd = argv.find(
    (a, i) =>
      !a.startsWith('-') &&
      !knownCmds.has(a) &&
      !testTargetKeys.has(a) &&
      !valueFlagIdxs.has(i) &&
      !(journeyIdx !== -1 && i === journeyIdx + 1) &&
      !(stateIdx !== -1 && i === stateIdx + 1)
  )
  const unknownFlag = argv.filter((a) => a.startsWith('-')).find((a) => !knownFlags.has(a))
  if (unknownCmd) {
    console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown command: '${unknownCmd}'. Run with --help for usage.\n`)
    process.exit(1)
  }
  if (unknownFlag) {
    console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown option: '${unknownFlag}'. Run with --help for usage.\n`)
    process.exit(1)
  }
}
