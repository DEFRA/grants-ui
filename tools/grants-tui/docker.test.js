// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'
import { buildStatusLine, getAllServices, getRunningComposeFiles, getRunningServices } from './docker.js'
import { ROOT } from './constants.js'
import { buildMainMenuItems } from './tui-loop.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('./cli-state.js', () => ({ loadState: vi.fn(() => null) }))

const composePsArgs = ['compose', '-f', 'compose.infra.yml', '-f', 'compose.grants-ui.yml', 'ps', '--orphans']
const result = (stdout = '', status = 0) => ({ stdout, status, stderr: '', pid: 1, signal: null, output: [] })

beforeEach(() => vi.mocked(spawnSync).mockReset())

test.each([
  [[], 'Running'],
  [['/tmp/grants-ui-cli-debug-override-123.yml'], 'Debugging']
])('runtime status describes the stack without a command-result icon', (extraFiles, label) => {
  const status = buildStatusLine([
    'compose.infra.yml',
    'compose.grants-ui.yml',
    'compose.land-grants.yml',
    ...extraFiles
  ])
  expect(stripVTControlCharacters(status)).toBe(`${label}: Core, Land Grants`)
})

test('detects a worktree stack through Compose and enables the running-stack menu actions', () => {
  const files = [`${ROOT}/compose.infra.yml`, `${ROOT}/compose.grants-ui.yml`, `${ROOT}/compose.land-grants.yml`]
  vi.mocked(spawnSync)
    .mockReturnValueOnce(result('worktree-container-id\n'))
    .mockReturnValueOnce(result(files.join(',') + '\n'))

  const running = getRunningComposeFiles()
  expect(running).toEqual(files)
  expect(spawnSync).toHaveBeenNthCalledWith(1, 'docker', [...composePsArgs, '--status', 'running', '--quiet'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  expect(spawnSync).toHaveBeenNthCalledWith(
    2,
    'docker',
    [
      'inspect',
      'worktree-container-id',
      '--format',
      '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'
    ],
    { encoding: 'utf8' }
  )
  const items = buildMainMenuItems(null, !!running)
  expect(items.find((item) => item.key === 'up')?.disabled).toBe(true)
  expect(
    items.filter((item) => ['down', 'debug', 'restart', 'journey'].includes(item.key)).map((item) => item.disabled)
  ).toEqual([false, false, false, false])
})

test('running and stopped service discovery uses the same project and includes addons', () => {
  vi.mocked(spawnSync)
    .mockReturnValueOnce(result('grants-ui\nland-grants-backend\n'))
    .mockReturnValueOnce(result('grants-ui\ngrants-ui\nland-grants-backend\nmongo-ready\n'))
  expect(getRunningServices()).toEqual(['grants-ui', 'land-grants-backend'])
  expect(getAllServices()).toEqual(['grants-ui', 'land-grants-backend', 'mongo-ready'])
  expect(spawnSync).toHaveBeenNthCalledWith(1, 'docker', [...composePsArgs, '--status', 'running', '--services'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  expect(spawnSync).toHaveBeenNthCalledWith(2, 'docker', [...composePsArgs, '--all', '--services'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
})

test.each([result(), result('partial output', 1)])(
  'does not inspect containers when discovery returns none or fails',
  (ps) => {
    vi.mocked(spawnSync).mockReturnValueOnce(ps)
    expect(getRunningComposeFiles()).toBeNull()
    expect(spawnSync).toHaveBeenCalledTimes(1)
  }
)
