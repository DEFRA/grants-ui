#!/usr/bin/env node
/* eslint-disable no-console */

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_INPUT = resolve(ROOT, 'compose/config-broker/example-grants')
const FORM_FILE = /\.ya?ml$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLUGIN_COMMIT = '7406af5e63af954bd27f8013cf79047dd63560fe'
const PLUGIN_RELEASE = 'https://github.com/DEFRA/forms-engine-plugin/releases/tag/v5.0.0'

function packageMetadata() {
  const require = createRequire(import.meta.url)
  const pluginPackage = require.resolve('@defra/forms-engine-plugin/package.json')
  const pluginRoot = dirname(pluginPackage)
  const modelEntry = require.resolve('@defra/forms-model')
  const modelRoot = resolve(dirname(modelEntry), '../..')
  const plugin = JSON.parse(readFileSync(pluginPackage, 'utf8'))
  const model = JSON.parse(readFileSync(resolve(modelRoot, 'package.json'), 'utf8'))
  const lockPath = resolve(ROOT, 'package-lock.json')
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : undefined
  const lockPackage = (name) => lock?.packages?.[`node_modules/${name}`]

  return {
    plugin: {
      name: plugin.name,
      version: plugin.version,
      integrity: lockPackage(plugin.name)?.integrity,
      sourceCommit: PLUGIN_COMMIT,
      release: PLUGIN_RELEASE,
      packageRoot: pluginRoot
    },
    model: {
      name: model.name,
      version: model.version,
      integrity: lockPackage(model.name)?.integrity,
      packageRoot: modelRoot
    }
  }
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(path))
    } else if (entry.isFile() && FORM_FILE.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

export function collectYamlFiles(inputs) {
  const paths = inputs.length ? inputs : [DEFAULT_INPUT]
  const files = new Set()
  for (const input of paths) {
    const path = resolve(input)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path).forEach((file) => files.add(file))
    } else if (stat.isFile() && FORM_FILE.test(path)) {
      files.add(path)
    }
  }
  return [...files].sort()
}

function exclusionReason(path, definition) {
  const lower = path.toLowerCase()
  const file = basename(path).toLowerCase()
  if (file === 'allowlist.yaml' || file === 'allowlist.yml' || lower.includes(`${sep}allowlist${sep}`)) {
    return 'allowlist'
  }
  if (lower.split(sep).includes('gas')) {
    return 'gas'
  }
  if (file === 'release.yml' || file === 'release.yaml') {
    return 'release-metadata'
  }
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return 'not-an-object'
  }
  if (!definition.name || !Array.isArray(definition.pages)) {
    return 'not-a-form-definition'
  }
  return undefined
}

function familyFor(path) {
  if (path.includes(`${sep}compose${sep}config-broker${sep}example-grants${sep}`)) {
    return 'grants-ui examples'
  }
  if (path.includes(`${sep}compose${sep}config-broker-local${sep}`)) {
    return 'config-broker-local snapshot'
  }
  const match = path.match(new RegExp(`${sep}(grants-config-[^${sep}]+)${sep}`))
  return match ? match[1] : 'explicit input'
}

function bundleVersion(path) {
  const segment = path.split(sep).find((part) => /@\d+\.\d+\.\d+(?:[-+][^/]+)?$/.test(part))
  return segment?.slice(segment.indexOf('@') + 1)
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function issuePath(detail) {
  return detail.path?.length ? detail.path.join('.') : '$'
}

function schemaIssues(error) {
  const details = error?.details
  if (!Array.isArray(details)) {
    return [{ path: '$', code: error?.constructor?.name ?? 'validation-error' }]
  }
  return details.map((detail) => ({ path: issuePath(detail), code: detail.type ?? 'validation-error' }))
}

function controllerIssue(error) {
  const name = error?.constructor?.name ?? 'Error'
  const message = String(error?.message ?? '').split('\n')[0]
  if (/unknown.*controller|controller.*does not exist/i.test(message)) {
    return { code: 'custom-controller', message }
  }
  if (name === 'SchemaValidationError') {
    return { code: 'schema-validation', issues: schemaIssues(error) }
  }
  return { code: name, message }
}

function decodeChildResult(output) {
  const match = output.match(/__RESULT__([A-Za-z0-9_-]+)__END__/)
  if (!match) {
    throw new Error('child probe returned no result marker')
  }
  return JSON.parse(Buffer.from(match[1], 'base64url').toString())
}
function modelProbe(rawDefinition, preparedDefinition, noModel) {
  const require = createRequire(import.meta.url)
  const pluginPackage = require.resolve('@defra/forms-engine-plugin/package.json')
  const modelPath = pathToFileURL(
    resolve(dirname(pluginPackage), '.server/server/plugins/engine/models/FormModel.js')
  ).href
  const payload = Buffer.from(JSON.stringify({ rawDefinition, preparedDefinition, noModel })).toString('base64')
  const script = `
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = () => true
    import { createRequire } from 'node:module'
    const require = createRequire(import.meta.url)
    const model = require('@defra/forms-model')
    const { FormModel } = await import(${JSON.stringify(modelPath)})
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const input = JSON.parse(Buffer.from(Buffer.concat(chunks).toString(), 'base64url').toString())
    const issuePath = (detail) => detail.path?.length ? detail.path.join('.') : '$'
    const schemaIssues = (error) => (error.details ?? []).map((detail) => ({
      path: issuePath(detail),
      code: detail.type ?? 'validation-error'
    }))
    const issue = (error) => {
      const name = error?.constructor?.name ?? 'Error'
      const message = String(error?.message ?? '').split('\\\\n')[0]
      if (/unknown.*controller|controller.*does not exist/i.test(message)) return { code: 'custom-controller', message }
      if (name === 'SchemaValidationError') return { code: 'schema-validation', issues: schemaIssues(error) }
      return { code: name, message }
    }
    const validate = (definition) => {
      const selected = definition.schema === 2 ? model.formDefinitionV2Schema : model.formDefinitionSchema
      const result = selected.validate(definition, { abortEarly: false })
      return {
        schemaVersion: definition.schema === undefined ? 1 : definition.schema,
        valid: !result.error,
        issues: result.error ? schemaIssues(result.error) : []
      }
    }
    const construct = (definition) => {
      try {
        new FormModel(structuredClone(definition), { basePath: '/' })
        return { valid: true }
      } catch (error) {
        return { valid: false, issue: issue(error) }
      }
    }
    const output = {
      raw: { schema: validate(input.rawDefinition), ...(input.noModel ? {} : { model: construct(input.rawDefinition) }) },
      prepared: {
        schema: validate(input.preparedDefinition),
        ...(input.noModel ? {} : { model: construct(input.preparedDefinition) })
      }
    }
    write('__RESULT__' + Buffer.from(JSON.stringify(output)).toString('base64url') + '__END__', () => process.exit(0))
  `
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    input: payload,
    env: { ...process.env, LOG_LEVEL: 'silent', LOG_FORMAT: 'ecs', LOG_ENABLED: 'false' },
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024
  })
  if (child.status !== 0 || child.error) {
    const message = child.stderr?.split('\n').slice(0, 5).join(' ') ?? child.error?.message ?? 'model probe failed'
    throw Object.assign(new Error(message), { code: 'model-probe-failed' })
  }
  return decodeChildResult(child.stdout)
}

function preprocessDefinition(definition) {
  const modulePath = pathToFileURL(resolve(ROOT, 'src/server/common/forms/services/form.js')).href
  const encoded = Buffer.from(JSON.stringify(definition)).toString('base64')
  const script = `
    import { hoistPageConfig, configureFormDefinition } from ${JSON.stringify(modulePath)}
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const definition = JSON.parse(Buffer.from(Buffer.concat(chunks).toString(), 'base64url').toString())
    configureFormDefinition(hoistPageConfig(definition))
    process.stdout.write('__RESULT__' + Buffer.from(JSON.stringify(definition)).toString('base64url') + '__END__')
  `
  const child = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    input: encoded,
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024
  })
  if (child.status !== 0 || child.error) {
    const message = child.stderr?.split('\n').slice(0, 5).join(' ') ?? child.error?.message ?? 'preprocessing failed'
    throw Object.assign(new Error(message), { code: 'preprocessing-failed' })
  }
  return decodeChildResult(child.stdout)
}

function listReferences(definition) {
  const refs = { names: 0, uuids: 0, other: 0, total: 0 }
  const visit = (value) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      return value.forEach(visit)
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'list' && typeof child === 'string') {
        refs.total++
        if (UUID.test(child)) {
          refs.uuids++
        } else if (/^[A-Za-z0-9_-]+$/.test(child)) {
          refs.names++
        } else {
          refs.other++
        }
      }
      visit(child)
    }
  }
  visit(definition)
  return refs
}

function definitionSignals(definition) {
  const schemaVersion = definition.schema === undefined ? 1 : definition.schema
  const translations = definition.metadata?.translations
  return {
    engine: definition.engine ?? null,
    schemaVersion,
    legacySchema: schemaVersion !== 2,
    listReferences: listReferences(definition),
    welsh: {
      available: Boolean(translations?.cy),
      prerequisite: 'metadata.translations.cy',
      translationLanguages: translations && typeof translations === 'object' ? Object.keys(translations).sort() : []
    }
  }
}

async function checkFile(path, options) {
  const content = readFileSync(path, 'utf8')
  let definition
  try {
    definition = parseYaml(content)
  } catch (error) {
    return {
      path,
      source: { family: familyFor(path), bundleVersion: bundleVersion(path), sha256: digest(content) },
      status: 'error',
      errors: [{ phase: 'parse', code: error.code ?? 'yaml-parse-error' }]
    }
  }

  const excluded = exclusionReason(path, definition)
  if (excluded) {
    return { path, status: 'excluded', reason: excluded }
  }

  const source = { family: familyFor(path), bundleVersion: bundleVersion(path), sha256: digest(content) }
  const result = {
    path,
    source,
    status: 'checked',
    signals: definitionSignals(definition),
    raw: {},
    prepared: {},
    model: {}
  }

  const prepared = structuredClone(definition)
  try {
    const preparedDefinition = preprocessDefinition(prepared)
    const probe = modelProbe(definition, preparedDefinition, options.noModel)
    result.raw = probe.raw ?? {}
    result.prepared = { ...(probe.prepared ?? {}), valid: probe.prepared?.schema?.valid ?? false }
    result.model.raw = probe.raw?.model
    result.model.prepared = probe.prepared?.model
  } catch (error) {
    const rawProbe = modelProbe(definition, definition, options.noModel)
    result.raw = rawProbe.raw ?? {}
    result.model.raw = rawProbe.raw?.model
    result.prepared = { valid: false, issue: controllerIssue(error) }
  }
  return result
}

function summary(results) {
  const checked = results.filter((result) => result.status === 'checked')
  const errors = results.filter((result) => result.status === 'error')
  const modelFailures = (key) => checked.filter((result) => result.model?.[key] && !result.model[key].valid).length
  return {
    files: results.length,
    checked: checked.length,
    excluded: results.filter((result) => result.status === 'excluded').length,
    parseErrors: errors.length,
    rawSchemaFailures: checked.filter((result) => result.raw.schema && !result.raw.schema.valid).length,
    preparedSchemaFailures: checked.filter((result) => result.prepared.schema && !result.prepared.schema.valid).length,
    preprocessingFailures: checked.filter((result) => result.prepared.issue).length,
    rawModelFailures: modelFailures('raw'),
    preparedModelFailures: modelFailures('prepared')
  }
}

export async function run(inputs = [], options = {}) {
  const metadata = packageMetadata()
  const files = collectYamlFiles(inputs)
  const results = []
  for (const file of files) {
    results.push(await checkFile(file, options))
  }
  return { provenance: metadata, summary: summary(results), results }
}

function printHuman(report) {
  console.log(
    `forms-engine-plugin ${report.provenance.plugin.version} / forms-model ${report.provenance.model.version}`
  )
  console.log(
    `Checked ${report.summary.checked} form definitions; excluded ${report.summary.excluded}; parse errors ${report.summary.parseErrors}`
  )
  for (const result of report.results) {
    if (result.status === 'excluded') {
      continue
    }
    const raw = result.raw?.schema?.valid ? 'raw-schema:ok' : 'raw-schema:FAIL'
    const prepared = result.prepared?.schema
      ? result.prepared.schema.valid
        ? 'prepared-schema:ok'
        : 'prepared-schema:FAIL'
      : `prepared:${result.prepared?.issue?.code ?? 'unavailable'}`
    const model = result.model?.prepared
      ? result.model.prepared.valid
        ? 'model:ok'
        : `model:${result.model.prepared.issue?.code ?? 'FAIL'}`
      : ''
    console.log(`${raw} ${prepared} ${model} ${result.path}`)
    for (const issue of result.raw?.schema?.issues ?? []) {
      console.log(`  raw ${issue.path} (${issue.code})`)
    }
    for (const issue of result.prepared?.schema?.issues ?? []) {
      console.log(`  prepared ${issue.path} (${issue.code})`)
    }
  }
}

function usage() {
  console.log('Usage: node tools/forms-engine-v5/schema-check.mjs [--json] [--no-model] <yaml-file-or-directory>...')
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  usage()
} else {
  const json = args.includes('--json')
  const noModel = args.includes('--no-model')
  const inputs = args.filter((arg) => !arg.startsWith('--'))
  try {
    const report = await run(inputs, { noModel })
    if (json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printHuman(report)
    }
    process.exitCode =
      report.summary.parseErrors ||
      report.summary.rawSchemaFailures ||
      report.summary.preparedSchemaFailures ||
      report.summary.preprocessingFailures ||
      report.summary.rawModelFailures ||
      report.summary.preparedModelFailures
        ? 1
        : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
