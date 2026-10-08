#!/usr/bin/env node
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { EXAMPLES_DIRECTORY, prepareExampleGrants, ROOT } from './prepare-example-grants.js'

const COMPOSE_ARGS = ['compose', '-f', 'compose.infra.yml', '-f', 'compose.grants-ui.yml']

function docker(args, input) {
  const result = spawnSync('docker', [...COMPOSE_ARGS, ...args], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000
  })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr ?? `Docker exited ${result.status}`)
  }
  return result.stdout
}

function mongo(script) {
  const output = docker([
    'exec',
    '-T',
    'mongodb',
    'mongosh',
    '--quiet',
    '--norc',
    'mongodb://localhost:27017/grants-ui-backend',
    '--eval',
    script
  ])
  const line = output.split('\n').find((line) => line.startsWith('EXAMPLES:'))
  if (!line) {
    throw new Error('No result returned from Mongo; are the local containers running?')
  }
  return JSON.parse(line.slice('EXAMPLES:'.length))
}

function aws(args, input) {
  return docker(['exec', '-T', 'floci', 'aws', '--endpoint-url=http://localhost:4566', ...args], input)
}

export function publishedVersionsScript(grants) {
  return `
const grants = ${JSON.stringify(grants)};
const versions = {};
for (const doc of db.getSiblingDB('grants-config-broker').getCollection('config-versions').find({ grant: { $in: grants } })) {
  (versions[doc.grant] ??= []).push(doc.version);
}
// Local form-definition overrides can occupy patch versions unknown to the broker.
for (const doc of db.getCollection('config__form_definitions').find({ grantCode: { $in: grants } })) {
  (versions[doc.grantCode] ??= []).push([doc.major, doc.minor, doc.patch].join('.'));
}
print('EXAMPLES:' + JSON.stringify(versions));
`
}

export function resetApplicationsScript(grants) {
  return `
const grants = ${JSON.stringify(grants)};
const removed = {};
for (const collection of ['state__grant_application_state', 'state__grant_application_locks', 'state__grant_application_submissions', 'grant_application_submissions', 'submissions']) {
  removed[collection] = db.getCollection(collection).deleteMany({ grantCode: { $in: grants } }).deletedCount;
}
print('EXAMPLES:' + JSON.stringify(removed));
`
}

export function readinessScript(bundles) {
  return `
const entries = ${JSON.stringify(bundles.map(({ grant, version }) => ({ grant, version })))};
const ready = entries.every(({ grant, version }) => {
  const [major, minor, patch] = version.split('.').map(Number);
  return !!db.getCollection('config__form_definitions').findOne({ grantCode: grant, major, minor, patch, status: 'active' });
});
print('EXAMPLES:' + JSON.stringify(ready));
`
}

/** Publish through the broker input queue, preserving its normal notifications to backend and GAS. */
export async function refreshExampleGrants({ dryRun = false, resetApplications = false } = {}) {
  if (dryRun) {
    console.log(
      `Would prepare and publish checked-in example grants${resetApplications ? ' and reset their applications' : ''}`
    )
    return
  }
  const grants = (await readdir(join(ROOT, EXAMPLES_DIRECTORY), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const publishedVersions = mongo(publishedVersionsScript(grants))
  const bundles = await prepareExampleGrants({ publishedVersions })
  for (const { grant, version, directory, files } of bundles) {
    console.log(`Publishing ${grant}@${version}…`)
    const manifest = []
    for (const relative of files) {
      const key = `${grant}/${version}/${relative.replaceAll('\\', '/')}`
      aws(
        ['s3', 'cp', '-', `s3://configs-bucket/${key}`, '--only-show-errors'],
        await readFile(join(directory, relative))
      )
      manifest.push(key)
    }
    aws([
      'sqs',
      'send-message',
      '--queue-url',
      'http://localhost:4566/000000000000/gfr__sqs___config_input',
      '--message-body',
      JSON.stringify({ grant, version, status: 'active', files: manifest, user: 'local-development' })
    ])
  }
  const deadline = Date.now() + 60000
  const ready = readinessScript(bundles)
  while (!mongo(ready)) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for example form definitions to be ingested; check broker/backend logs')
    }
    await setTimeout(500)
  }
  if (resetApplications) {
    console.log('Reset example application state, locks and submissions:', mongo(resetApplicationsScript(grants)))
  }
  console.log('Example grants refreshed. Reload the browser to use the updated definitions.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await refreshExampleGrants({
      dryRun: process.argv.includes('--dry-run'),
      resetApplications: process.argv.includes('--reset-applications')
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
