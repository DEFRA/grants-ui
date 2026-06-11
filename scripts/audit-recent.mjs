// Prints the N most recent FCP Audit messages from the local `fcp_audit`.
//
// Received messages are hidden for the queue's visibility timeout (~30s), so for
// a short while after running this they won't reappear in `npm run audit:queue`.
// They are NOT deleted — they return once the timeout lapses.
import { execFileSync } from 'node:child_process'

const QUEUE_URL = 'http://localhost:4566/000000000000/fcp_audit'
const LIMIT = Number(process.argv[2] ?? 10)
const MAX_EMPTY_POLLS = 3 // stop once this many polls in a row add nothing new

const receiveBatch = () => {
  const out = execFileSync(
    'docker',
    [
      'compose', 'exec', '-T', 'localstack',
      'awslocal', 'sqs', 'receive-message',
      '--queue-url', QUEUE_URL,
      '--max-number-of-messages', '10',
      '--wait-time-seconds', '1'
    ],
    { encoding: 'utf8' }
  ).trim()
  if (!out) {
    return []
  }
  return JSON.parse(out).Messages ?? []
}

const byId = new Map()
let emptyPolls = 0
while (emptyPolls < MAX_EMPTY_POLLS) {
  const before = byId.size
  for (const m of receiveBatch()) {
    byId.set(m.MessageId, m)
  }
  emptyPolls = byId.size === before ? emptyPolls + 1 : 0
}

const events = [...byId.values()]
  .map((m) => {
    try {
      return JSON.parse(m.Body)
    } catch {
      return { datetime: '', _unparsed: m.Body }
    }
  })
  .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))

const print = (line = '') => process.stdout.write(`${line}\n`)

print(`Found ${events.length} message(s) in the queue. Showing ${Math.min(LIMIT, events.length)} most recent:\n`)
for (const [i, e] of events.slice(0, LIMIT).entries()) {
  const entity = e.audit?.entities?.[0] ?? {}
  print(`${i + 1}. ${e.datetime}  action=${entity.action} entity=${entity.entity} entityid=${entity.entityid}`)
  print(JSON.stringify(e.audit ?? e, null, 2).replace(/^/gm, '   '))
  print()
}
