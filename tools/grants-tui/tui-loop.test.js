// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import {
  buildMainMenuItems,
  handleChecksCommand,
  handleGasStateTool,
  handleTailscaleCommand,
  handleTailscaleSharesCommand,
  handleToolsCommand,
  refreshRuntimeStatus
} from './tui-loop.js'
import { getGasGrant, listGasApplications, updateGasApplication } from './gas-state.js'
import { journeySteps } from './journey.js'
import { journeyCrnOptions, wontCompleteReason } from '../../src/server/dev-tools/journey-runner/journey-meta.js'
import { YELLOW } from './constants.js'
import { promptText, radioMenu, setRuntimeStatusLine, toggleMenu } from './tui.js'
import { getRunningComposeFiles, getRunningAppBaseUrl, getRunningServices } from './docker.js'
import { getGasStatus } from './gas.js'
import { getLastRun, runInteractiveAction, setActionMenu } from './actions.js'
import { viewOutput } from './output.js'
import { inspectState } from './state-inspector.js'
import { getTailscaleSharingPolicyStatus } from './tailscale-policy.js'

vi.mock('./tui.js', () => ({
  promptText: vi.fn(),
  radioMenu: vi.fn(),
  toggleMenu: vi.fn(),
  setRuntimeStatusLine: vi.fn()
}))
vi.mock('./docker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getRunningComposeFiles: vi.fn(),
  getRunningServices: vi.fn(),
  getRunningAppBaseUrl: vi.fn(() => 'https://test.example.ts.net')
}))
vi.mock('./gas.js', async (importOriginal) => ({ ...(await importOriginal()), getGasStatus: vi.fn() }))
vi.mock('./actions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runInteractiveAction: vi.fn(),
  getLastRun: vi.fn(),
  setActionMenu: vi.fn()
}))
vi.mock('./output.js', () => ({ viewOutput: vi.fn() }))
vi.mock('./state-inspector.js', () => ({ inspectState: vi.fn() }))
vi.mock('./tailscale-policy.js', () => ({ getTailscaleSharingPolicyStatus: vi.fn() }))
vi.mock('./journey.js', () => ({
  listJourneys: () => ['test-grant'],
  journeySteps: vi.fn(() => [])
}))
vi.mock('../../src/server/dev-tools/journey-runner/journey-meta.js', () => ({
  journeyCrnOptions: vi.fn(() => [{ crn: 'test-crn', note: 'Test user' }]),
  wontCompleteReason: vi.fn(() => null)
}))
vi.mock('./gas-state.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getGasGrant: vi.fn(),
  listGasApplications: vi.fn(),
  updateGasApplication: vi.fn()
}))

test('GAS picker retains the current position in yellow and selecting it makes no update', async () => {
  vi.mocked(listGasApplications).mockReturnValue([
    {
      code: 'example',
      clientRef: 'example-ref',
      currentPhase: 'REVIEW',
      currentStage: 'CHECKS',
      currentStatus: 'PASSED'
    }
  ])
  vi.mocked(getGasGrant).mockReturnValue({
    phases: [{ code: 'REVIEW', stages: [{ code: 'CHECKS', statuses: ['PENDING', 'PASSED'] }] }]
  })
  vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('status').mockResolvedValueOnce('1')

  expect(stripVTControlCharacters(await handleGasStateTool())).toBe('GAS status unchanged')
  expect(vi.mocked(radioMenu).mock.calls[2][0]).toEqual([
    { key: '0', label: 'REVIEW > CHECKS > PENDING', colour: undefined, description: '' },
    { key: '1', label: 'REVIEW > CHECKS > PASSED', colour: YELLOW, description: '' }
  ])
  expect(vi.mocked(radioMenu).mock.calls[2][2]).toMatchObject({ initialKey: '1' })
  expect(updateGasApplication).not.toHaveBeenCalled()
})

test.each([false, true])(
  'manage GAS displays progress while it queues an offer or previews it (dryRun=%s)',
  async (dryRun) => {
    const application = { code: 'woodland', clientRef: 'test-ref' }
    vi.mocked(listGasApplications).mockReturnValue([application])
    vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('offer')

    await handleGasStateTool(dryRun)

    expect(runInteractiveAction).toHaveBeenCalledWith('generate-offer', [application, dryRun], 'Generating offer')
    expect(updateGasApplication).not.toHaveBeenCalled()
    expect(vi.mocked(radioMenu).mock.calls[1][0].map((item) => item.label)).toEqual([
      'change status ⇢',
      'generate offer',
      'prepare claim'
    ])
  }
)

test('manage GAS prepares a claim as an output-captured action', async () => {
  const application = { code: 'woodland', clientRef: 'test-ref' }
  vi.mocked(listGasApplications).mockReturnValue([application])
  vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('prepare-claim')

  await handleGasStateTool()

  expect(runInteractiveAction).toHaveBeenCalledWith(
    'prepare-claim',
    [application, false],
    'Preparing claim and creating entitlement'
  )
})

test('status picker refreshes after preparing a claim and can restore the original status', async () => {
  const application = {
    _id: { $oid: 'test-application' },
    code: 'woodland',
    clientRef: 'test-ref',
    currentPhase: 'AGREEMENT',
    currentStage: 'OFFER',
    currentStatus: 'STATUS_AGREEMENT_READY_FOR_APPLICANT'
  }
  const fresh = {
    ...application,
    _id: { ...application._id },
    currentPhase: 'CLAIM',
    currentStage: 'CLAIM',
    currentStatus: 'STATUS_AWAITING_CLAIM'
  }
  vi.mocked(listGasApplications).mockReturnValueOnce([application]).mockReturnValue([fresh])
  vi.mocked(getGasGrant).mockReturnValue({
    phases: [
      { code: 'AGREEMENT', stages: [{ code: 'OFFER', statuses: ['STATUS_AGREEMENT_READY_FOR_APPLICANT'] }] },
      { code: 'CLAIM', stages: [{ code: 'CLAIM', statuses: ['STATUS_AWAITING_CLAIM'] }] }
    ]
  })
  vi.mocked(radioMenu)
    .mockResolvedValueOnce('0')
    .mockResolvedValueOnce('prepare-claim')
    .mockResolvedValueOnce('status')
    .mockResolvedValueOnce('0')

  await handleGasStateTool()

  expect(vi.mocked(radioMenu).mock.calls[3][2]).toMatchObject({ initialKey: '1' })
  expect(updateGasApplication).toHaveBeenCalledWith(application, {
    phase: 'AGREEMENT',
    stage: 'OFFER',
    status: 'STATUS_AGREEMENT_READY_FOR_APPLICANT'
  })
})

test('status changes stop if the selected application has disappeared', async () => {
  vi.mocked(listGasApplications)
    .mockReturnValueOnce([{ _id: 'removed', code: 'woodland', clientRef: 'test-ref' }])
    .mockReturnValue([])
  vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('status')

  expect(await handleGasStateTool()).toContain('Application no longer exists')
  expect(updateGasApplication).not.toHaveBeenCalled()
  expect(getGasGrant).not.toHaveBeenCalled()
})

test('escaping a selected GAS application returns to the GAS application list', async () => {
  vi.mocked(listGasApplications).mockReturnValue([{ code: 'woodland', clientRef: 'test-ref' }])
  vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('__quit__').mockResolvedValueOnce('__quit__')

  await handleGasStateTool()

  expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual([
    'Select a GAS application',
    'Manage GAS · woodland · test-ref',
    'Select a GAS application'
  ])
})

test('offer failures remain visible in the application submenu', async () => {
  const failure = { code: 1, signal: null, cancelled: false, label: 'Generating offer', logPath: '/tmp/offer.log' }
  vi.mocked(listGasApplications).mockReturnValue([{ code: 'woodland', clientRef: 'test-ref' }])
  vi.mocked(getLastRun).mockReturnValueOnce(null).mockReturnValueOnce(failure)
  vi.mocked(radioMenu).mockResolvedValueOnce('0').mockResolvedValueOnce('offer')

  await handleGasStateTool()

  expect(vi.mocked(radioMenu).mock.calls[2][2]?.statusLine).toContain('Generating offer — failed')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(getLastRun).mockReturnValue(null)
  vi.mocked(radioMenu).mockResolvedValue('__quit__')
  vi.mocked(getRunningComposeFiles).mockReturnValue(null)
  vi.mocked(getRunningServices).mockReturnValue([])
  vi.mocked(getGasStatus).mockResolvedValue('RECEIVED')
  vi.mocked(journeyCrnOptions).mockReturnValue([{ crn: 'test-crn', note: 'Test user' }])
  vi.mocked(wontCompleteReason).mockReturnValue(null)
  vi.mocked(getTailscaleSharingPolicyStatus).mockResolvedValue('needs-setup')
})

afterEach(() => vi.unstubAllEnvs())

test('the main menu groups checks into one entry', () => {
  const keys = buildMainMenuItems(null, false).map((item) => item.key)
  expect(keys).toContain('checks')
  expect(keys).not.toContain('tailscale')
  expect(keys).not.toEqual(expect.arrayContaining(['lint']))
  expect(keys.filter((key) => ['format', 'test', 'sonar', 'snyk', 'check'].includes(key))).toEqual([])
})

test('Tailscale and sharing is available from Tools while running and reflects the actual mode', async () => {
  vi.mocked(radioMenu).mockResolvedValue('__quit__')

  await handleToolsCommand(false, { containersRunning: true, tailscaleOn: true, tailscaleServiceRunning: true })

  const item = vi.mocked(radioMenu).mock.calls[0][0].find((i) => i.key === 'tailscale')
  if (!item) {
    throw new Error('Expected Tailscale menu item')
  }
  expect(item).toMatchObject({ label: 'tailscale & sharing ⇢', description: expect.stringContaining('Tailscale on') })
  expect(item.colour).toBeUndefined()
  expect(item.disabled).toBeUndefined()
})

test('Tailscale toggle is disabled with an install hint when unavailable', async () => {
  vi.mocked(radioMenu).mockResolvedValue('__quit__')

  await handleToolsCommand(false, {
    containersRunning: false,
    tailscaleOn: false,
    tailscaleAvailable: false,
    tailscaleAvailabilityDescription: 'Install Tailscale CLI'
  })

  const item = vi.mocked(radioMenu).mock.calls[0][0].find((i) => i.key === 'tailscale')
  if (!item) {
    throw new Error('Expected Tailscale menu item')
  }
  expect(item).toMatchObject({ disabled: true, description: 'Install Tailscale CLI' })
})

test('Tailscale menu makes managed external shares obvious', async () => {
  vi.mocked(radioMenu).mockResolvedValue('__quit__')

  await handleToolsCommand(false, {
    savedState: { tailscaleShareIds: ['one', 'two'] },
    containersRunning: true,
    tailscaleOn: true,
    tailscaleServiceRunning: true
  })

  const item = vi.mocked(radioMenu).mock.calls[0][0].find((i) => i.key === 'tailscale')
  if (!item) {
    throw new Error('Expected Tailscale menu item')
  }
  expect(item.description).toContain('2 share(s) active')
})

test('policy setup and active shares require an API key entered in gt', async () => {
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', 'tskey-share')

  await handleTailscaleCommand({
    dryRun: false,
    savedState: null,
    containersRunning: false,
    tailscaleOn: false,
    tailscaleServiceRunning: true
  })

  const items = vi.mocked(radioMenu).mock.calls[0][0]
  expect(items.find((item) => item.key === 'shares')).toMatchObject({
    disabled: true,
    description: 'Enter an API key in this menu first'
  })
  expect(items.find((item) => item.key === 'policy')).toMatchObject({
    disabled: true,
    description: 'Enter an API key in this menu first'
  })
})

test('a Tailscale API key can be pasted into gt for the current session', async () => {
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', '')
  vi.mocked(radioMenu).mockResolvedValueOnce('api-key').mockResolvedValueOnce('__quit__')
  vi.mocked(promptText).mockResolvedValue('tskey-api-session-only')

  await handleTailscaleCommand({
    dryRun: false,
    savedState: null,
    containersRunning: false,
    tailscaleOn: false,
    tailscaleServiceRunning: true
  })

  expect(promptText).toHaveBeenCalledWith(
    'Paste Tailscale Admin API access token',
    expect.objectContaining({ mask: true })
  )
  expect(process.env.GRANTS_UI_TAILSCALE_API_KEY).toBe('tskey-api-session-only')
  const firstMenuItems = vi.mocked(radioMenu).mock.calls[0][0]
  expect(firstMenuItems.find((item) => item.key === 'api-key')).toMatchObject({
    description: 'Paste a Tailscale Admin API access token (not saved)'
  })
  const secondMenuItems = vi.mocked(radioMenu).mock.calls[1][0]
  expect(secondMenuItems.find((item) => item.key === 'shares')).toMatchObject({ disabled: false })
  expect(secondMenuItems.find((item) => item.key === 'policy')).toMatchObject({ disabled: false })
})

test('the empty active-shares view is informational and backs out to its parent menu', async () => {
  vi.mocked(radioMenu).mockResolvedValueOnce('__quit__')

  await expect(handleTailscaleSharesCommand(false, [])).resolves.toBe('__back__')

  expect(vi.mocked(radioMenu).mock.calls[0][0]).toEqual([
    { key: 'none', label: 'no active shares', description: 'No shares created by gt', disabled: true }
  ])
})

test('Tailscale address follows GAS in the persistent runtime footer', async () => {
  await refreshRuntimeStatus(['compose.infra.yml', 'compose.grants-ui.yml', 'compose.tailscale.yml'])
  const text = String(vi.mocked(setRuntimeStatusLine).mock.lastCall?.[0])
  expect(stripVTControlCharacters(text)).toContain('GAS: RECEIVED  │  Tailscale: https://test.example.ts.net')
  expect(text).not.toContain('\n')
  expect(getRunningAppBaseUrl).toHaveBeenCalledTimes(1)
})

test('Tailscale footer disappears after disabling, regardless of saved selection', async () => {
  await refreshRuntimeStatus(['compose.infra.yml', 'compose.grants-ui.yml'])
  expect(setRuntimeStatusLine).toHaveBeenCalledWith(expect.not.stringContaining('Tailscale:'))
  expect(getRunningAppBaseUrl).not.toHaveBeenCalled()
})

test('Tailscale footer remains visible when mode is enabled but the app is not running', async () => {
  await refreshRuntimeStatus(null, true)
  expect(stripVTControlCharacters(String(vi.mocked(setRuntimeStatusLine).mock.lastCall?.[0]))).toContain(
    'Tailscale: enabled · app not running'
  )
  expect(getRunningAppBaseUrl).not.toHaveBeenCalled()
})

test('switching Tailscale mode returns to the Tailscale and sharing menu', async () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(['compose.infra.yml', 'compose.tailscale.yml'])
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(radioMenu).mockResolvedValueOnce('mode').mockResolvedValueOnce('__quit__')

  await expect(
    handleTailscaleCommand({
      dryRun: false,
      savedState: null,
      containersRunning: true,
      tailscaleOn: false,
      tailscaleServiceRunning: true
    })
  ).resolves.toBe('')

  expect(runInteractiveAction).toHaveBeenCalledWith('tailscale', [true, false], 'Enabling Tailscale mode')
  expect(vi.mocked(radioMenu).mock.calls.filter((call) => call[1] === 'Tailscale & sharing')).toHaveLength(2)
  expect(setRuntimeStatusLine).toHaveBeenCalledWith(expect.stringContaining('Tailscale: https://test.example.ts.net'))
})

test('sharing an app returns to Tailscale and sharing before returning to Tools', async () => {
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(radioMenu)
    .mockResolvedValueOnce('tailscale')
    .mockResolvedValueOnce('create')
    .mockResolvedValueOnce('__quit__')
    .mockResolvedValueOnce('__quit__')

  await handleToolsCommand(false, {
    containersRunning: true,
    tailscaleOn: true,
    tailscaleServiceRunning: true,
    tailscaleSession: { apiKeyEntered: true }
  })

  expect(runInteractiveAction).toHaveBeenCalledWith(
    'tailscale-share:create',
    [false],
    'Creating single-use Tailscale share'
  )
  expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual([
    'Tools',
    'Tailscale & sharing',
    'Tailscale & sharing',
    'Tools'
  ])
})

test('setting up the sharing policy returns to Tailscale and sharing', async () => {
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(radioMenu).mockResolvedValueOnce('policy').mockResolvedValueOnce('apply').mockResolvedValueOnce('__quit__')

  await handleTailscaleCommand({
    dryRun: false,
    savedState: null,
    containersRunning: true,
    tailscaleOn: true,
    tailscaleServiceRunning: true,
    tailscaleSession: { apiKeyEntered: true }
  })

  expect(runInteractiveAction).toHaveBeenCalledWith(
    'tailscale-policy:setup',
    [true],
    'Previewing and applying Tailscale sharing policy'
  )
  expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual([
    'Tailscale & sharing',
    'Set up Tailscale sharing policy',
    'Tailscale & sharing'
  ])
})

test('checks exposes each suite directly and escape starts no action', async () => {
  vi.mocked(radioMenu).mockResolvedValue('__quit__')
  await expect(handleChecksCommand(false)).resolves.toBe('')
  const items = vi.mocked(radioMenu).mock.calls[0][0]
  expect(items.map((item) => item.key)).toEqual([
    'format',
    'lint',
    'test:unit',
    'test:contracts',
    'test:acceptance',
    'all-tests',
    'sonar',
    'snyk',
    'check'
  ])
  expect(items.some((item) => item.label.includes('⇢'))).toBe(false)
  expect(runInteractiveAction).not.toHaveBeenCalled()
})

test('the tools submenu exposes audit scripts with descriptions and escape starts no action', async () => {
  expect(buildMainMenuItems(null, false)).toContainEqual(expect.objectContaining({ key: 'tools', label: 'tools ⇢' }))
  expect(buildMainMenuItems(null, true).some((item) => item.key === 'journey')).toBe(false)
  await expect(handleToolsCommand(false)).resolves.toBe('')
  const items = vi.mocked(radioMenu).mock.calls[0][0]
  expect(items.map((item) => item.key)).toEqual([
    'state',
    'journey',
    'gas:state',
    'tailscale',
    'audit:logs',
    'audit:queue',
    'audit:clear'
  ])
  expect(items.every((item) => item.description.length > 0)).toBe(true)
  expect(items[6].description).toMatch(/Purge.*queue.*restart grants-ui/)
  expect(items[2]).toMatchObject({ disabled: true, description: expect.stringContaining('GAS addon') })
  expect(items[1]).toMatchObject({ label: 'journey ⇢', disabled: true, description: expect.stringContaining('Chrome') })
  expect(runInteractiveAction).not.toHaveBeenCalled()
})

test('application state opens the inspector and returns to Tools without starting a worker', async () => {
  vi.mocked(radioMenu).mockResolvedValueOnce('state')

  await handleToolsCommand(false)

  expect(inspectState).toHaveBeenCalledExactlyOnceWith(false)
  expect(runInteractiveAction).not.toHaveBeenCalled()
  expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools'])
})

test.each(['headless', 'headed'])('journey runs from Tools with arrows only for further prompts (%s)', async (mode) => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(['compose.infra.yml', 'compose.grants-ui.yml'])
  vi.mocked(journeySteps).mockReturnValue([])
  for (const choice of ['journey', 'test-grant', mode, 'keep', ...(mode === 'headed' ? ['__end__'] : [])]) {
    vi.mocked(radioMenu).mockResolvedValueOnce(choice)
  }

  await handleToolsCommand(true)

  const calls = vi.mocked(radioMenu).mock.calls
  expect(calls[0][0].find((item) => item.key === 'journey')).toMatchObject({ disabled: false })
  expect(calls[1][0][0].label).toBe('test-grant ⇢')
  expect(calls[2][0].every((item) => item.label.endsWith(' ⇢'))).toBe(true)
  expect(calls[3][0].every((item) => item.label.endsWith(' ⇢'))).toBe(mode === 'headed')
  if (mode === 'headed') {
    expect(calls[4][0][0].label).toBe('Run to the end')
  }
  expect(calls.at(-1)?.[1]).toBe('Tools')
  expect(runInteractiveAction).toHaveBeenCalledWith(
    'journey',
    ['test-grant', expect.objectContaining({ headed: mode === 'headed', clear: false }), true],
    expect.any(String)
  )
})

test('journey with more than one known-good CRN prompts for a choice, and the pick reaches the run', async () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(['compose.infra.yml', 'compose.grants-ui.yml'])
  vi.mocked(journeySteps).mockReturnValue([])
  vi.mocked(journeyCrnOptions).mockReturnValue([
    { crn: '1102838829', note: 'happy path' },
    { crn: '1103313150', note: 'no eligible actions' }
  ])
  for (const choice of ['journey', 'test-grant', '1103313150', 'headless', 'keep']) {
    vi.mocked(radioMenu).mockResolvedValueOnce(choice)
  }

  await handleToolsCommand(true)

  const calls = vi.mocked(radioMenu).mock.calls
  expect(calls[2][1]).toBe("Select a CRN for 'test-grant'")
  expect(calls[2][0]).toEqual([
    expect.objectContaining({ key: '1102838829', description: 'happy path' }),
    expect.objectContaining({ key: '1103313150', description: 'no eligible actions' })
  ])
  expect(runInteractiveAction).toHaveBeenCalledWith(
    'journey',
    ['test-grant', expect.objectContaining({ crn: '1103313150' }), true],
    expect.any(String)
  )
})

test.each([
  ['run', true],
  ['cancel', false]
])(
  "won't-complete journey shows an acknowledgement prompt, and choosing '%s' %s the run",
  async (choice, shouldRun) => {
    vi.mocked(getRunningComposeFiles).mockReturnValue(['compose.infra.yml', 'compose.grants-ui.yml'])
    vi.mocked(journeySteps).mockReturnValue([])
    vi.mocked(wontCompleteReason).mockReturnValue(['It stops halfway through.'])
    for (const menuChoice of ['journey', 'test-grant', 'headless', 'keep', choice]) {
      vi.mocked(radioMenu).mockResolvedValueOnce(menuChoice)
    }

    const statusLine = await handleToolsCommand(true)

    const calls = vi.mocked(radioMenu).mock.calls
    expect(calls[4][1]).toBe("⚠  'test-grant' will NOT complete — run anyway?")
    if (shouldRun) {
      expect(runInteractiveAction).toHaveBeenCalledWith('journey', expect.any(Array), expect.any(String))
    } else {
      expect(runInteractiveAction).not.toHaveBeenCalled()
      expect(statusLine).toContain("Journey 'test-grant' cancelled")
    }
  }
)

test('GAS state is enabled only while the GAS compose service is running', async () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(['compose.infra.yml', 'compose.grants-ui.yml', 'compose.gas.yml'])
  vi.mocked(getRunningServices).mockReturnValue(['grants-ui', 'fg-gas-backend'])

  await handleToolsCommand(false)

  expect(vi.mocked(radioMenu).mock.calls[0][0].find((item) => item.key === 'gas:state')).toMatchObject({
    disabled: false,
    description: expect.stringContaining('change')
  })
})

test.each(['audit:logs', 'audit:queue', 'audit:clear'])(
  '%s runs and returns to Tools with output available',
  async (action) => {
    const completed = { label: action, code: 0, logPath: '/tmp/gt-audit.log' }
    vi.mocked(radioMenu).mockResolvedValueOnce(action).mockResolvedValueOnce('__output__')
    vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(completed)
      return 0
    })

    await expect(handleToolsCommand(true)).resolves.toContain('completed')

    expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(action, [true], expect.any(String))
    expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools', 'Tools'])
    expect(vi.mocked(radioMenu).mock.calls[1][2]).toMatchObject({ outputAvailable: true })
    expect(setActionMenu).toHaveBeenCalledWith(expect.any(Array), 'Tools')
    expect(viewOutput).toHaveBeenCalledWith(completed)
    expect(viewOutput).toHaveBeenCalledTimes(action === 'audit:clear' ? 1 : 2)
  }
)

test.each(['audit:logs', 'audit:queue', 'audit:clear'])(
  '%s opens output automatically only for audit reads, before returning to Tools',
  async (action) => {
    const completed = { label: action, code: 0, logPath: '/tmp/gt-audit.log' }
    vi.mocked(radioMenu).mockResolvedValueOnce(action)
    vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
      expect(viewOutput).not.toHaveBeenCalled()
      vi.mocked(getLastRun).mockReturnValue(completed)
      return 0
    })

    await handleToolsCommand(false)

    if (action === 'audit:clear') {
      expect(viewOutput).not.toHaveBeenCalled()
    } else {
      expect(viewOutput).toHaveBeenCalledExactlyOnceWith(completed)
      expect(vi.mocked(viewOutput).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(radioMenu).mock.invocationCallOrder[1]
      )
    }
    expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools'])
  }
)

test.each([
  ['format', 'format', [true]],
  ['lint', 'lint', [true]],
  ['test:unit', 'test', ['unit', true]],
  ['test:contracts', 'test', ['contracts', true]],
  ['test:acceptance', 'test', ['acceptance', true]],
  ['all-tests', 'all-tests', [true]],
  ['sonar', 'sonar', [{ dryRun: true }]],
  ['snyk', 'snyk', [true]],
  ['check', 'check', [true]]
])('%s starts its action without a nested menu', async (selection, action, args) => {
  vi.mocked(radioMenu).mockResolvedValueOnce(String(selection))
  await handleChecksCommand(true)
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(action, args, expect.any(String))
  expect(radioMenu).toHaveBeenCalledTimes(2)
  expect(vi.mocked(radioMenu).mock.calls.every((call) => call[1] === 'Checks')).toBe(true)
  expect(setActionMenu).toHaveBeenCalledWith(expect.any(Array), 'Checks')
  expect(toggleMenu).not.toHaveBeenCalled()
})

test('checks keeps failures and output in the submenu and lets the user run another check', async () => {
  vi.mocked(radioMenu).mockResolvedValueOnce('lint').mockResolvedValueOnce('__output__').mockResolvedValueOnce('format')
  const failed = { label: 'Running lint checks', code: 1, logPath: '/tmp/gt-lint.log' }
  const passed = { label: 'Formatting code and docs', code: 0, logPath: '/tmp/gt-format.log' }
  vi.mocked(runInteractiveAction)
    .mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(failed)
      return 1
    })
    .mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(passed)
      return 0
    })

  await expect(handleChecksCommand(false)).resolves.toContain('completed')

  const prompts = vi.mocked(radioMenu).mock.calls
  expect(prompts.map((call) => call[1])).toEqual(['Checks', 'Checks', 'Checks', 'Checks'])
  expect(prompts[1][2]).toMatchObject({ statusLine: expect.stringContaining('failed (exit 1)'), outputAvailable: true })
  expect(prompts[2][2]?.statusLine).toBe(prompts[1][2]?.statusLine)
  expect(prompts[3][2]?.statusLine).toContain('completed')
  expect(viewOutput).toHaveBeenCalledExactlyOnceWith(failed)
  expect(runInteractiveAction).toHaveBeenCalledTimes(2)
})

test('checks refreshes runtime separately from the command result after an action', async () => {
  vi.mocked(getRunningComposeFiles)
    .mockReturnValueOnce(['compose.infra.yml', 'compose.grants-ui.yml', 'compose.land-grants.yml'])
    .mockReturnValueOnce(null)
  vi.mocked(radioMenu).mockResolvedValueOnce('test:acceptance')
  vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
    vi.mocked(getLastRun).mockReturnValue({ label: 'Acceptance tests', code: 0, logPath: '/tmp/gt-tests.log' })
    return 0
  })
  await handleChecksCommand(false)
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(1, expect.stringContaining('Land Grants'))
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(1, expect.stringContaining('RECEIVED'))
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(2, expect.stringContaining('No containers running'))
  const status = vi.mocked(radioMenu).mock.calls[1][2]?.statusLine
  expect(status).toContain('completed')
  expect(status).toContain('output')
  expect(status).not.toMatch(/Running:|GAS:/)
})
