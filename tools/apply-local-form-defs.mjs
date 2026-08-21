#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Apply or remove local form-definition overrides against the running
 * grants-ui-backend Mongo database.
 *
 * Usage:
 *   node tools/apply-local-form-defs.mjs <enable|disable>
 *
 * enable  - for each override under compose/config-broker/local-form-definitions,
 *           clone the current active `config__form_definitions` document for the
 *           grant, overlay the parsed override FormDefinition, bump the version by
 *           one patch above the repo version (e.g. 1.2.3 -> 1.2.4) and upsert it so
 *           it becomes the highest-semver (active) version the frontend serves.
 * disable - delete the bumped-version document and purge the dependent
 *           state/locks/submissions for that grant version, so the frontend
 *           cleanly reverts to the repo version with no orphaned drafts.
 *
 * Mongo is reached through the already-running `mongodb` compose service via a
 * SINGLE `docker compose exec -T mongodb mongosh` invocation (mongosh ships in
 * the mongo image), so no new runtime dependency is required. All grants — and,
 * for enable, all waiting/retrying — are handled inside that one mongosh process
 * (server-side polling), instead of re-spawning docker for every grant/attempt.
 * This is both far faster and more reliable than one exec per grant per retry.
 */

import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import semver from 'semver'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const FORM_DEFS_DIR = resolve(ROOT, 'compose/config-broker/local-form-definitions')
const CONFIG_BROKER_LOCAL = resolve(ROOT, 'compose/config-broker-local')

// Directory scanned for sibling config-repo checkouts (e.g. grants-config-grasslands).
// Defaults to the folder grants-ui itself lives in, so a checkout placed next to
// grants-ui is picked up automatically. Overridable for tests / bespoke layouts.
const SIBLING_REPOS_DIR = process.env.GRANTS_UI_SIBLING_CONFIG_DIR || resolve(ROOT, '..')
// Only directories named `grants-config-*` are treated as candidate config repos.
const SIBLING_REPO_PREFIX = 'grants-config-'
// Source key / label used for the in-repo local-form-definitions folder overrides.
const LOCAL_SOURCE = 'local-form-definitions'
// YAML files that live alongside a grant's grants-ui form definition but are NOT
// form definitions themselves and must never be published as one. `allowlist.yaml`
// (access control) sorts alphabetically before `<grant>.yaml`, so a naive
// first-YAML pick would wrongly publish it as the form def — its top-level
// `dev/test/perf-test/ext-test/prod` keys then fail form-definition schema
// validation in grants-ui.
const NON_FORM_DEF_YAML = new Set(['allowlist.yaml', 'allowlist.yml'])
// Env var (comma-separated override ids) restricting which overrides enable/disable
// act on. Unset = act on every discovered override (legacy behaviour).
const SELECTION_ENV = 'GRANTS_UI_FORMDEF_SELECTION'

// Compose service that runs Mongo, and the physical database the backend uses.
const MONGO_SERVICE = process.env.GRANTS_UI_MONGO_SERVICE || 'mongodb'
const MONGO_DB = process.env.GRANTS_UI_BACKEND_DB || 'grants-ui-backend'

// Compose file that defines the `mongodb` service. The stack no longer ships a
// single default `compose.yml` (it was split into `compose.infra.yml` +
// `compose.grants-ui.yml` when localstack was migrated to floci), so a bare
// `docker compose exec` finds no configuration and cannot resolve the service.
// The `mongodb` service lives in `compose.infra.yml`, so target it explicitly.
const MONGO_COMPOSE_FILE = process.env.GRANTS_UI_MONGO_COMPOSE_FILE || 'compose.infra.yml'

// Backend collections. Form definitions live in the mongoConfig logical DB;
// application state/locks/submissions share the same physical database.
const FORM_DEFS_COLLECTION = 'config__form_definitions'
const STATE_COLLECTION = 'state__grant_application_state'
const LOCKS_COLLECTION = 'state__grant_application_locks'
// Submissions collection name has varied; try the known candidates on purge.
const SUBMISSION_COLLECTIONS = ['submissions', 'state__grant_application_submissions', 'grant_application_submissions']

// How long enable polls (server-side, inside a single mongosh process) for the
// repo definition to be ingested after a fresh `up` — the base document must
// exist before it can be cloned. When the stack is already healthy the very
// first poll succeeds, so this only costs time on a cold start.
const ENABLE_WAIT_MS = Number(process.env.GRANTS_UI_FORMDEF_WAIT_MS || 30000)
const ENABLE_POLL_MS = Number(process.env.GRANTS_UI_FORMDEF_POLL_MS || 500)

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Bump a semver string by a single patch (1.2.3 -> 1.2.4).
 * @param {string} version
 * @returns {string}
 */
export function bumpPatch(version) {
  const bumped = semver.inc(version, 'patch')
  if (!bumped) {
    throw new Error(`Invalid semver version: ${version}`)
  }
  return bumped
}

/**
 * Resolve the highest repo version pulled for a grant from the
 * `config-broker-local/<grant>@<version>` folder names.
 * @param {string} configBrokerLocalDir
 * @param {string} grant
 * @returns {string | null}
 */
export function findRepoVersion(configBrokerLocalDir, grant) {
  let entries
  try {
    entries = fs.readdirSync(configBrokerLocalDir, { withFileTypes: true })
  } catch {
    return null
  }
  const prefix = `${grant}@`
  const versions = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name.slice(prefix.length))
    .filter((v) => semver.valid(v))
  if (!versions.length) {
    return null
  }
  versions.sort(semver.compare)
  return versions[versions.length - 1]
}

/**
 * Find the first YAML file in a directory (optionally recursing).
 * @param {string} dir
 * @param {boolean} [recursive]
 * @returns {string | null}
 */
function firstYamlFile(dir, recursive = false) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      return join(dir, entry.name)
    }
  }
  if (recursive) {
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = firstYamlFile(join(dir, entry.name), true)
        if (found) {
          return found
        }
      }
    }
  }
  return null
}

/**
 * Pick the form-definition YAML for a grant from a grants-ui service folder.
 * Prefers the conventional `<grant>.yaml`, otherwise falls back to the first
 * YAML that is not a known non-form-def file (e.g. `allowlist.yaml`). Returns
 * null when the folder has no usable form-definition YAML.
 * @param {string} dir - the grants-ui service folder to scan
 * @param {string} grant - grant code, used to prefer `<grant>.yaml`
 * @returns {string | null}
 */
function pickFormDefYaml(dir, grant) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const yamls = entries
    .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
  // Prefer the conventional <grant>.yaml form definition.
  const named = yamls.find((n) => n === `${grant}.yaml` || n === `${grant}.yml`)
  if (named) {
    return join(dir, named)
  }
  // Otherwise the first YAML that is not a known non-form-def file (allowlist etc.).
  const candidate = yamls.find((n) => !NON_FORM_DEF_YAML.has(n.toLowerCase()))
  return candidate ? join(dir, candidate) : null
}

/**
 * Locate the override definition file for a grant, preferring the grants-ui
 * service folder and falling back to any YAML under the grant folder.
 * @param {string} grantDir
 * @param {string} grant
 * @returns {string | null}
 */
function findOverrideFile(grantDir, grant) {
  const preferred = pickFormDefYaml(join(grantDir, 'grants-ui'), grant)
  if (preferred) {
    return preferred
  }
  return firstYamlFile(grantDir, true)
}

/**
 * @typedef {object} OverrideEntry
 * @property {string} id - Stable identifier `<grant>::<sourceKey>` (selection key)
 * @property {string} grant - Grant code / folder name
 * @property {string} source - Human-readable source (folder name or sibling repo dir name)
 * @property {string} file - Absolute path to the override YAML file
 * @property {string} repoVersion - Repo version pulled into config-broker-local
 * @property {string} bumpedVersion - repoVersion + 1 patch
 */

/**
 * Build an override entry for a grant, resolving its pulled repo version.
 * Returns null (and pushes a warning) when the grant was never pulled into
 * config-broker-local, since without the repo version we cannot compute the
 * bumped version to publish.
 * @param {string} grant
 * @param {string} file
 * @param {string} source
 * @param {string} sourceKey
 * @param {string} configBrokerLocalDir
 * @param {string[]} warnings
 * @returns {OverrideEntry | null}
 */
function makeOverrideEntry(grant, file, source, sourceKey, configBrokerLocalDir, warnings) {
  const repoVersion = findRepoVersion(configBrokerLocalDir, grant)
  if (!repoVersion) {
    warnings.push(`Grant "${grant}" (${source}) has an override but was not pulled into config-broker-local — skipping`)
    return null
  }
  return { id: `${grant}::${sourceKey}`, grant, source, file, repoVersion, bumpedVersion: bumpPatch(repoVersion) }
}

/**
 * Discover overrides in the in-repo local-form-definitions folder.
 * @param {string} formDefsDir
 * @param {string} configBrokerLocalDir
 * @param {string[]} warnings
 * @returns {OverrideEntry[]}
 */
function discoverFolderOverrides(formDefsDir, configBrokerLocalDir, warnings) {
  /** @type {OverrideEntry[]} */
  const overrides = []
  let grantEntries
  try {
    grantEntries = fs.readdirSync(formDefsDir, { withFileTypes: true })
  } catch {
    return overrides
  }

  grantEntries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of grantEntries) {
    if (!entry.isDirectory()) {
      continue
    }
    const grant = entry.name
    const file = findOverrideFile(join(formDefsDir, grant), grant)
    if (!file) {
      warnings.push(`No form-definition file found under ${grant}/ (expected e.g. ${grant}/grants-ui/${grant}.yaml)`)
      continue
    }
    const entryObj = makeOverrideEntry(grant, file, LOCAL_SOURCE, 'local', configBrokerLocalDir, warnings)
    if (entryObj) {
      overrides.push(entryObj)
    }
  }

  return overrides
}

/**
 * Discover overrides in sibling config-repo checkouts (`grants-config-*`) placed
 * next to grants-ui, mirroring the config-repo layout
 * `configurations/<grant>/grants-ui/<file>.yaml`. This lets a developer edit
 * "the real form definition" in its own repo (with diffs, history, etc.) and
 * pull it straight into grants-ui without copying it into the local folder.
 *
 * Sibling repos also hold non-grants-ui services (e.g. allowlists, land-grants
 * actions); those are silently ignored — only grants that expose a grants-ui
 * form definition become selectable overrides.
 * @param {string} siblingReposDir
 * @param {string} configBrokerLocalDir
 * @param {string[]} warnings
 * @returns {OverrideEntry[]}
 */
function discoverSiblingOverrides(siblingReposDir, configBrokerLocalDir, warnings) {
  /** @type {OverrideEntry[]} */
  const overrides = []
  let repoEntries
  try {
    repoEntries = fs.readdirSync(siblingReposDir, { withFileTypes: true })
  } catch {
    return overrides
  }

  repoEntries.sort((a, b) => a.name.localeCompare(b.name))

  for (const repo of repoEntries) {
    if (!repo.isDirectory() || !repo.name.startsWith(SIBLING_REPO_PREFIX)) {
      continue
    }
    const configurationsDir = join(siblingReposDir, repo.name, 'configurations')
    let grantEntries
    try {
      grantEntries = fs.readdirSync(configurationsDir, { withFileTypes: true })
    } catch {
      continue
    }
    grantEntries.sort((a, b) => a.name.localeCompare(b.name))

    for (const grantEntry of grantEntries) {
      if (!grantEntry.isDirectory()) {
        continue
      }
      const grant = grantEntry.name
      const file = pickFormDefYaml(join(configurationsDir, grant, 'grants-ui'), grant)
      if (!file) {
        // Sibling repos legitimately contain non-grants-ui services, or a
        // grants-ui folder that only holds non-form-def YAML (e.g. an
        // allowlist) — skip quietly.
        continue
      }
      const entryObj = makeOverrideEntry(grant, file, repo.name, repo.name, configBrokerLocalDir, warnings)
      if (entryObj) {
        overrides.push(entryObj)
      }
    }
  }

  return overrides
}

/**
 * Discover all available overrides, pairing each with its repo version. Overrides
 * come from two sources: the in-repo `local-form-definitions` folder and any
 * sibling `grants-config-*` repo checkouts placed next to grants-ui.
 * @param {{ formDefsDir?: string, configBrokerLocalDir?: string, siblingReposDir?: string }} [opts]
 * @returns {{ overrides: OverrideEntry[], warnings: string[] }}
 */
export function discoverOverrides({
  formDefsDir = FORM_DEFS_DIR,
  configBrokerLocalDir = CONFIG_BROKER_LOCAL,
  siblingReposDir = SIBLING_REPOS_DIR
} = {}) {
  /** @type {string[]} */
  const warnings = []
  const overrides = [
    ...discoverFolderOverrides(formDefsDir, configBrokerLocalDir, warnings),
    ...discoverSiblingOverrides(siblingReposDir, configBrokerLocalDir, warnings)
  ]
  return { overrides, warnings }
}

/**
 * Parse the selection env var into an array of override ids, or null when unset
 * (null = act on every discovered override — the legacy behaviour).
 * @param {string | undefined} value
 * @returns {string[] | null}
 */
export function parseSelectionEnv(value) {
  if (value == null) {
    return null
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Restrict overrides to a selection of ids. A null selection returns every
 * override unchanged.
 * @template {{ id: string }} T
 * @param {T[]} overrides
 * @param {string[] | null} selection
 * @returns {T[]}
 */
export function filterOverridesBySelection(overrides, selection) {
  if (!selection) {
    return overrides
  }
  const set = new Set(selection)
  return overrides.filter((o) => set.has(o.id))
}

/**
 * Collapse overrides so at most one source is active per grant — two sources for
 * the same grant would resolve to the same bumped version document, so the second
 * is ignored with a warning. The first occurrence (folder overrides are
 * discovered before sibling repos) wins deterministically.
 * @template {{ grant: string, source: string }} T
 * @param {T[]} overrides
 * @returns {{ overrides: T[], warnings: string[] }}
 */
export function dedupeByGrant(overrides) {
  /** @type {Map<string, T>} */
  const byGrant = new Map()
  /** @type {string[]} */
  const warnings = []
  for (const o of overrides) {
    const existing = byGrant.get(o.grant)
    if (existing) {
      warnings.push(
        `Multiple overrides selected for grant "${o.grant}" — using ${existing.source}, ignoring ${o.source}`
      )
      continue
    }
    byGrant.set(o.grant, o)
  }
  return { overrides: [...byGrant.values()], warnings }
}

/**
 * Split a semver string into { version, major, minor, patch }.
 * @param {string} version
 * @returns {{ version: string, major: number, minor: number, patch: number }}
 */
function versionParts(version) {
  const [major, minor, patch] = version.split('.').map(Number)
  return { version, major, minor, patch }
}

/**
 * Marker appended to a form definition's `name` while a local override is
 * active. Besides making an overridden definition obviously distinguishable in
 * the UI, it doubles as a file-independent, queryable record of which
 * definition documents were written by `enable`, so `disable` can purge them
 * even after the source override files have been deleted or moved.
 * @type {string}
 */
export const LOCAL_OVERRIDE_NAME_SUFFIX = ' (local override active)'

/**
 * Append the ` (local override active)` suffix to the form definition's
 * `name`, so a locally-overridden definition is obviously distinguishable from
 * the real repo version wherever the name is surfaced (frontend, backend docs).
 * Idempotent: re-applying does not stack the suffix. The definition is mutated
 * in place and returned for convenience.
 * @template {{ name?: string }} T
 * @param {T} definition
 * @returns {T}
 */
export function applyLocalOverrideNameSuffix(definition) {
  const suffix = LOCAL_OVERRIDE_NAME_SUFFIX
  if (typeof definition.name === 'string' && !definition.name.endsWith(suffix)) {
    definition.name = `${definition.name}${suffix}`
  }
  return definition
}

// ---------------------------------------------------------------------------
// mongosh script builders (exported for unit testing)
//
// Both builders emit ONE script covering every override, printing a single
// `RESULT:<grant>:<OK|SKIP|ERR>[:detail]` line per grant that the Node side
// parses. Doing all grants (and, for enable, all polling) in one process is the
// core performance/reliability fix.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} EnablePayload
 * @property {string} grant
 * @property {{ major: number, minor: number, patch: number }} repo - repo version identity
 * @property {{ version: string, major: number, minor: number, patch: number }} bumped - override version identity
 * @property {object} definition - parsed FormDefinition to overlay
 */

/**
 * Build the mongosh script that, for every override, clones the active repo
 * definition doc, overlays the override and upserts it at the bumped version.
 *
 * Reliability rules baked into the script:
 *  - the base is selected by the *repo* version first (deterministic), falling
 *    back to the highest non-bumped version doc for the grant;
 *  - an already-present bumped doc counts as a valid template, so a previously
 *    written override is re-applied (idempotent) and reported OK rather than
 *    failing with "no base definition document" even though the doc exists;
 *  - it polls server-side (single connection) until every grant resolves or the
 *    deadline passes, so a just-started backend that is still ingesting is
 *    tolerated without re-spawning docker.
 *
 * @param {Array<Pick<OverrideEntry, 'grant' | 'repoVersion' | 'bumpedVersion'>>} overrides
 * @param {{ definitionsByGrant: Record<string, object>, waitMs?: number, pollMs?: number }} opts
 * @returns {string}
 */
export function buildEnableScript(overrides, { definitionsByGrant, waitMs = ENABLE_WAIT_MS, pollMs = ENABLE_POLL_MS }) {
  /** @type {EnablePayload[]} */
  const entries = overrides.map((o) => {
    const bumped = versionParts(o.bumpedVersion)
    const repo = versionParts(o.repoVersion)
    return {
      grant: o.grant,
      repo: { major: repo.major, minor: repo.minor, patch: repo.patch },
      bumped,
      definition: definitionsByGrant[o.grant]
    }
  })

  const config = {
    collection: FORM_DEFS_COLLECTION,
    waitMs,
    pollMs,
    entries
  }

  return `
const CONFIG = ${JSON.stringify(config)};
const coll = db.getCollection(CONFIG.collection);
const grantMatch = (g) => ([
  { grantCode: g }, { grant: g }, { code: g }, { slug: g }, { name: g },
  { 'definition.submission.grantCode': g }, { 'definition.metadata.slug': g }
]);
const sameVersion = (doc, v) =>
  Number(doc.major) === v.major && Number(doc.minor) === v.minor && Number(doc.patch) === v.patch;

function findBase(e) {
  const or = grantMatch(e.grant);
  // Prefer the exact repo-version document — deterministic and never the override itself.
  const repoDoc = coll.findOne({ major: e.repo.major, minor: e.repo.minor, patch: e.repo.patch, $or: or });
  if (repoDoc) { return repoDoc; }
  // Fall back to the highest version doc for the grant that is NOT the bumped override.
  const cands = coll.find({ $or: or }).toArray().filter((d) => !sameVersion(d, e.bumped));
  if (!cands.length) { return null; }
  cands.sort((a, b) =>
    (Number(a.major) - Number(b.major)) ||
    (Number(a.minor) - Number(b.minor)) ||
    (Number(a.patch) - Number(b.patch)));
  return cands[cands.length - 1];
}

function apply(e) {
  const existingBumped = coll.findOne({ major: e.bumped.major, minor: e.bumped.minor, patch: e.bumped.patch, $or: grantMatch(e.grant) });
  const base = findBase(e);
  // Ready when we have a repo/base doc to clone, OR the bumped doc already exists
  // (idempotent re-apply). Not ready yet -> return null so the caller keeps polling.
  const template = base || existingBumped;
  if (!template) { return null; }
  const doc = Object.assign({}, template);
  delete doc._id;
  doc.major = e.bumped.major;
  doc.minor = e.bumped.minor;
  doc.patch = e.bumped.patch;
  if ('version' in doc) { doc.version = e.bumped.version; }
  doc.definition = e.definition;
  // Stamp a fresh updatedAt so grants-ui's forms-engine model cache (keyed and
  // invalidated only when the definition doc's updatedAt changes) rebuilds the
  // compiled model with the override content. Without this the bumped doc
  // inherits the base doc's updatedAt, the cache key is unchanged, and the
  // stale (repo-version) model keeps being served even though the backend now
  // returns the override version.
  doc.updatedAt = new Date();
  const filter = { major: e.bumped.major, minor: e.bumped.minor, patch: e.bumped.patch };
  for (const f of ['grantCode', 'grant', 'code', 'slug', 'name']) {
    if (f in template) { filter[f] = template[f]; break; }
  }
  coll.replaceOne(filter, doc, { upsert: true });
  return e.bumped.version;
}

const results = {};
let pending = CONFIG.entries.slice();
const deadline = Date.now() + CONFIG.waitMs;
while (pending.length) {
  const stillPending = [];
  for (const e of pending) {
    try {
      const applied = apply(e);
      if (applied) { results[e.grant] = 'OK:' + applied; }
      else { stillPending.push(e); }
    } catch (err) {
      results[e.grant] = 'ERR:' + (err && err.message ? err.message : err);
    }
  }
  pending = stillPending;
  if (!pending.length || Date.now() >= deadline) { break; }
  sleep(CONFIG.pollMs);
}
for (const e of pending) {
  results[e.grant] = 'SKIP:no base definition document found — grant not ingested by the backend yet';
}
for (const e of CONFIG.entries) { print('RESULT:' + e.grant + ':' + results[e.grant]); }
`
}

/**
 * Build the mongosh script that removes local overrides in two passes:
 *  1. for every override discovered from the file system, delete the
 *     bumped-version definition and purge dependent state/locks/submissions;
 *  2. sweep any remaining definition documents still stamped with the
 *     `LOCAL_OVERRIDE_NAME_SUFFIX` marker and purge them the same way.
 *
 * The second pass is the file-independent safety net: if the source override
 * YAML (or its `config-broker-local` folder) was deleted or moved before
 * disable ran, that override can no longer be discovered from the file system,
 * so pass 1 would leave the bumped document behind as the highest active
 * version. The name-suffix marker written by `enable` is a queryable record of
 * exactly which documents were applied, so disable can always find and purge
 * them — even when zero override files remain.
 *
 * The orphan sweep is skipped for a *targeted* disable (`sweepOrphans: false`),
 * e.g. when the TUI removes only the overrides a developer just deselected: the
 * marker is shared by every applied override, so an unconditional sweep would
 * also purge the overrides the developer chose to keep. A full disable (no
 * selection) keeps the sweep so leftover/orphaned overrides are always cleaned.
 * @param {Array<Pick<OverrideEntry, 'grant' | 'bumpedVersion'>>} overrides
 * @param {{ sweepOrphans?: boolean }} [opts]
 * @returns {string}
 */
export function buildDisableScript(overrides, { sweepOrphans = true } = {}) {
  const entries = overrides.map((o) => {
    const v = versionParts(o.bumpedVersion)
    return { grant: o.grant, version: v.version, major: v.major, minor: v.minor, patch: v.patch }
  })

  const config = {
    entries,
    defs: FORM_DEFS_COLLECTION,
    state: STATE_COLLECTION,
    locks: LOCKS_COLLECTION,
    submissions: SUBMISSION_COLLECTIONS,
    marker: LOCAL_OVERRIDE_NAME_SUFFIX
  }

  const orphanSweep = `
// Pass 2: sweep any documents still stamped as a local override. These are
// orphans whose source files were deleted or moved before disable ran, so they
// can no longer be discovered from the file system — the name-suffix marker is
// the file-independent record used to purge them.
let orphans = [];
try {
  orphans = defs
    .find({ 'definition.name': { $exists: true } })
    .toArray()
    .filter((d) => typeof d.definition.name === 'string' && d.definition.name.endsWith(CONFIG.marker));
} catch (e) {
  orphans = [];
}
for (const doc of orphans) {
  const g = grantOf(doc);
  try {
    const version = [doc.major, doc.minor, doc.patch].join('.');
    const defsRemoved = defs.deleteOne({ _id: doc._id }).deletedCount;
    const dependents = purgeDependents(g, version);
    print('RESULT:' + g + ':OK:swept orphaned override ' + version + ' defs=' + defsRemoved + ' ' + dependents);
  } catch (err) {
    print('RESULT:' + g + ':ERR:' + (err && err.message ? err.message : err));
  }
}
`

  return `
const CONFIG = ${JSON.stringify(config)};
const defs = db.getCollection(CONFIG.defs);
const grantMatch = (g) => ([
  { grantCode: g }, { grant: g }, { code: g }, { slug: g }, { name: g },
  { 'definition.submission.grantCode': g }, { 'definition.metadata.slug': g }
]);
const purge = (name, g, version) => {
  try {
    return db.getCollection(name).deleteMany({ grantCode: g, grantVersion: version }).deletedCount;
  } catch (e) {
    return 0;
  }
};
const purgeDependents = (g, version) => {
  const stateRemoved = purge(CONFIG.state, g, version);
  const locksRemoved = purge(CONFIG.locks, g, version);
  let submissionsRemoved = 0;
  for (const c of CONFIG.submissions) { submissionsRemoved += purge(c, g, version); }
  return 'state=' + stateRemoved + ' locks=' + locksRemoved + ' submissions=' + submissionsRemoved;
};
const grantOf = (doc) =>
  doc.grantCode || doc.grant || doc.code || doc.slug ||
  (doc.definition && doc.definition.submission && doc.definition.submission.grantCode) ||
  (doc.definition && doc.definition.metadata && doc.definition.metadata.slug) ||
  doc.name || 'unknown';

// Pass 1: remove overrides discovered from the file system (grant + bumped version).
for (const e of CONFIG.entries) {
  try {
    const defsRemoved = defs.deleteMany({
      major: e.major, minor: e.minor, patch: e.patch, $or: grantMatch(e.grant)
    }).deletedCount;
    const dependents = purgeDependents(e.grant, e.version);
    print('RESULT:' + e.grant + ':OK:defs=' + defsRemoved + ' ' + dependents);
  } catch (err) {
    print('RESULT:' + e.grant + ':ERR:' + (err && err.message ? err.message : err));
  }
}
${sweepOrphans ? orphanSweep : ''}`
}

// ---------------------------------------------------------------------------
// Mongo execution (via a single docker compose exec -T mongodb mongosh)
// ---------------------------------------------------------------------------

/**
 * Build the `docker compose … exec` argument list used to run a mongosh script
 * against the backend database.
 *
 * The stack no longer ships a single default `compose.yml` (it was split into
 * `compose.infra.yml` + `compose.grants-ui.yml` when localstack was migrated to
 * floci), so a bare `docker compose exec` finds no configuration file and cannot
 * resolve the `mongodb` service. The `-f ${MONGO_COMPOSE_FILE}` flag targets the
 * compose file that defines `mongodb` explicitly, so the applier keeps working
 * regardless of which compose files (if any) are auto-discovered.
 * @returns {string[]}
 */
export function mongoExecArgs() {
  return [
    'compose',
    '-f',
    MONGO_COMPOSE_FILE,
    'exec',
    '-T',
    MONGO_SERVICE,
    'mongosh',
    MONGO_DB,
    '--quiet',
    '--file',
    '/dev/stdin'
  ]
}

/**
 * Run a mongosh script against the backend database, passing the script on stdin
 * to avoid argv size and shell-quoting limits.
 *
 * The script is fed as a FILE (`--file /dev/stdin`) rather than piped into the
 * REPL. When mongosh consumes a piped script as REPL input it echoes its prompt
 * (`… grants-ui-backend> `) in front of every output line, which corrupts the
 * `RESULT:` markers the parser relies on and turns successful runs into false
 * failures. `--file /dev/stdin` runs the script non-interactively with clean,
 * prompt-free output. `/dev/stdin` resolves inside the Linux mongo container, so
 * this is independent of the host OS.
 * @param {string} script
 * @returns {{ status: number, stdout: string, stderr: string, error?: Error }}
 */
function runMongo(script) {
  const result = spawnSync('docker', mongoExecArgs(), { cwd: ROOT, input: script, encoding: 'utf8' })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error
  }
}

/** @returns {boolean} True when Mongo is reachable through the compose service. */
function pingMongo() {
  const result = runMongo('db.runCommand({ ping: 1 }); print("PONG")')
  return result.status === 0 && /PONG/.test(result.stdout)
}

/**
 * Parse the `RESULT:<grant>:<STATUS>[:detail]` lines emitted by the scripts.
 * @param {string} stdout
 * @returns {Record<string, { status: 'OK' | 'SKIP' | 'ERR', detail: string }>}
 */
function parseResults(stdout) {
  /** @type {Record<string, { status: 'OK' | 'SKIP' | 'ERR', detail: string }>} */
  const map = {}
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    // Match `RESULT:<grant>:<STATUS>[:detail]` even if some older mongosh build
    // prefixes the line with a REPL prompt — the marker is anchored to the end.
    const m = /RESULT:(.+?):(OK|SKIP|ERR)(?::(.*))?$/.exec(line)
    if (m) {
      map[m[1]] = { status: /** @type {'OK' | 'SKIP' | 'ERR'} */ (m[2]), detail: m[3] ?? '' }
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * @param {OverrideEntry[]} overrides
 * @returns {{ ok: boolean, messages: { ok: boolean, message: string }[] }}
 */
function enableAll(overrides) {
  /** @type {Record<string, object>} */
  const definitionsByGrant = {}
  /** @type {{ ok: boolean, message: string }[]} */
  const messages = []
  /** @type {OverrideEntry[]} */
  const runnable = []

  for (const entry of overrides) {
    let definition
    try {
      definition = parseYaml(fs.readFileSync(entry.file, 'utf8'))
    } catch (err) {
      messages.push({
        ok: false,
        message: `${entry.grant}: invalid override YAML — ${/** @type {Error} */ (err).message}`
      })
      continue
    }
    if (!definition || typeof definition !== 'object') {
      messages.push({ ok: false, message: `${entry.grant}: override YAML did not parse to an object` })
      continue
    }
    definitionsByGrant[entry.grant] = applyLocalOverrideNameSuffix(definition)
    runnable.push(entry)
  }

  if (runnable.length) {
    const script = buildEnableScript(runnable, { definitionsByGrant })
    const result = runMongo(script)
    const parsed = parseResults(result.stdout)
    for (const entry of runnable) {
      const r = parsed[entry.grant]
      if (r && r.status === 'OK') {
        messages.push({
          ok: true,
          message: `${entry.grant} (${entry.source}): applied override`
        })
      } else if (r && r.status === 'SKIP') {
        messages.push({ ok: false, message: `${entry.grant}: ${r.detail || 'grant not ingested by the backend yet'}` })
      } else if (r && r.status === 'ERR') {
        messages.push({ ok: false, message: `${entry.grant}: mongosh error — ${r.detail}` })
      } else {
        const reason = result.error?.message || result.stderr.trim() || 'no result returned by mongosh'
        messages.push({ ok: false, message: `${entry.grant}: ${reason}` })
      }
    }
  }

  return { ok: messages.every((m) => m.ok), messages }
}

/**
 * @param {OverrideEntry[]} overrides
 * @param {{ sweepOrphans?: boolean }} [opts]
 * @returns {{ ok: boolean, messages: { ok: boolean, message: string }[] }}
 */
function disableAll(overrides, { sweepOrphans = true } = {}) {
  const script = buildDisableScript(overrides, { sweepOrphans })
  const result = runMongo(script)
  const parsed = parseResults(result.stdout)
  /** @type {{ ok: boolean, message: string }[]} */
  const messages = []
  /** @type {Set<string>} */
  const reported = new Set()

  for (const entry of overrides) {
    reported.add(entry.grant)
    const r = parsed[entry.grant]
    if (r && r.status === 'OK') {
      messages.push({ ok: true, message: `${entry.grant}: removed override ${entry.bumpedVersion} (${r.detail})` })
    } else if (r && r.status === 'ERR') {
      messages.push({ ok: false, message: `${entry.grant}: mongosh error — ${r.detail}` })
    } else {
      const reason = result.error?.message || result.stderr.trim() || 'no result returned by mongosh'
      messages.push({ ok: false, message: `${entry.grant}: ${reason}` })
    }
  }

  // Report orphaned overrides swept from Mongo whose source files were deleted
  // or moved before disable ran, so they are absent from `overrides`.
  for (const [grant, r] of Object.entries(parsed)) {
    if (reported.has(grant)) {
      continue
    }
    if (r.status === 'OK') {
      messages.push({ ok: true, message: `${grant}: ${r.detail}` })
    } else {
      messages.push({ ok: false, message: `${grant}: mongosh error — ${r.detail}` })
    }
  }

  if (!messages.length) {
    // No files discovered and nothing left in Mongo — a clean no-op.
    if (result.error || result.stderr.trim()) {
      const reason = result.error?.message || result.stderr.trim()
      messages.push({ ok: false, message: `disable failed — ${reason}` })
    } else {
      messages.push({ ok: true, message: 'No local form-definition overrides found in Mongo — nothing to do.' })
    }
  }

  return { ok: messages.every((m) => m.ok), messages }
}

/**
 * @param {string} mode - 'enable' | 'disable'
 * @returns {number} process exit code
 */
export function run(mode) {
  if (mode !== 'enable' && mode !== 'disable') {
    console.error('Usage: apply-local-form-defs.mjs <enable|disable>')
    return 2
  }

  // A selection (comma-separated override ids in GRANTS_UI_FORMDEF_SELECTION)
  // restricts which overrides we act on. Unset = act on every discovered
  // override — the legacy all-grants behaviour used by a bare CLI invocation.
  const selection = parseSelectionEnv(process.env[SELECTION_ENV])

  const { overrides: discovered, warnings } = discoverOverrides()
  for (const warning of warnings) {
    console.warn(`  ⚠  ${warning}`)
  }

  const { overrides: selected, warnings: dedupeWarnings } = dedupeByGrant(
    filterOverridesBySelection(discovered, selection)
  )
  for (const warning of dedupeWarnings) {
    console.warn(`  ⚠  ${warning}`)
  }

  // For enable, no selected overrides means there is nothing to apply. For a
  // *full* disable (no selection) we must NOT exit early: previously-applied
  // overrides whose source files were deleted or moved still live in Mongo as
  // the highest active version, and only the marker-based sweep in disableAll
  // can purge them. A *targeted* disable (selection given) with nothing selected
  // is a genuine no-op.
  if ((mode === 'enable' || selection) && !selected.length) {
    console.log('  No local form-definition overrides selected — nothing to do.')
    return 0
  }

  if (!pingMongo()) {
    console.error('  ✖  Cannot reach the mongodb service — is the stack running (`gt up`)?')
    return 1
  }

  // Only a full disable (no selection) sweeps every marker-stamped override; a
  // targeted disable must leave the overrides the developer kept selected alone.
  const sweepOrphans = selection == null
  const { ok, messages } = mode === 'enable' ? enableAll(selected) : disableAll(selected, { sweepOrphans })
  for (const m of messages) {
    if (m.ok) {
      console.log(`  ✔  ${m.message}`)
    } else {
      console.error(`  ✖  ${m.message}`)
    }
  }

  return ok ? 0 : 1
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv[2]))
}
