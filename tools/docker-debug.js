import { spawnSync } from 'child_process'

const ps = spawnSync(
  'docker',
  ['ps', '--filter', 'label=com.docker.compose.service=grants-ui', '--format', '{{.ID}}'],
  { encoding: 'utf8' }
)

const containerId = ps.stdout.trim()

if (!containerId) {
  // eslint-disable-next-line no-console
  console.error('Error: grants-ui service not running or not started via docker compose')
  process.exit(1)
}

const inspect = spawnSync(
  'docker',
  ['inspect', containerId, '--format', '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'],
  { encoding: 'utf8' }
)

if (inspect.status !== 0 || !inspect.stdout.trim()) {
  // eslint-disable-next-line no-console
  console.error('Error: could not read compose config from container labels')
  process.exit(1)
}

const composeFiles = inspect.stdout.trim().split(',')
const fileArgs = composeFiles.flatMap((f) => ['-f', f.trim()])

spawnSync('docker', ['compose', ...fileArgs, 'stop', 'grants-ui'], { stdio: 'inherit' })
spawnSync(
  'docker',
  [
    'compose',
    ...fileArgs,
    'run',
    '--service-ports',
    '--name',
    'grants-ui-debug',
    '--rm',
    'grants-ui',
    'npm',
    'run',
    'dev:debug'
  ],
  { stdio: 'inherit' }
)
