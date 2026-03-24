#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Grants UI Config API Upload Tool
 *
 * Upload form definitions from YAML files to grants-ui-config-api
 *
 * Usage:
 *   npm run upload:forms -- --all                              # Upload all forms
 *   npm run upload:forms -- --slug farm-payments              # Upload by slug (filename without .yaml)
 *
 * Environment variables:
 *   CONFIG_API_JWT_SECRET - JWT secret for authentication (required)
 *   CDP_API_KEY - CDP API key for x-api-key header (required for CDP services)
 *   CONFIG_API_URL - API endpoint (default: http://localhost:3001)
 *
 * Note: CDP_API_KEY is only needed when connecting to CDP-deployed services from
 * your local dev machine. Service-to-service calls in deployed environments don't need it.
 */

import 'dotenv/config'
import Jwt from '@hapi/jwt'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configuration
// const CONFIG_API_URL = process.env.CONFIG_API_URL || 'http://localhost:3001'
const CONFIG_API_URL = 'http://localhost:3011'
const JWT_SECRET = process.env.CONFIG_API_JWT_SECRET
const CDP_API_KEY = process.env.CDP_API_KEY
const FORMS_DIR = path.resolve(__dirname, '../src/server/common/forms/definitions')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  all: args.includes('--all'),
  slug: args.find((arg, i) => args[i - 1] === '--slug'),
  update: args.includes('--update'),
  dryRun: args.includes('--dry-run'),
  help: args.includes('--help') || args.includes('-h')
}

/**
 * Validate required credentials
 */
function validateCredentials() {
  if (!JWT_SECRET) {
    throw new Error('CONFIG_API_JWT_SECRET environment variable is required')
  }

  // CDP_API_KEY is required to access CDP-deployed services
  const isCdpEndpoint = CONFIG_API_URL.includes('cdp-int.defra.cloud')
  if (isCdpEndpoint && !CDP_API_KEY) {
    throw new Error(
      'CDP_API_KEY environment variable is required for CDP services. Get your API key from: https://portal.cdp-int.defra.cloud/user-profile or use a local API endpoint instead'
    )
  }
}

/**
 * Generate JWT token for Grants UI Config API authentication
 */
function generateToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required')
  }

  const now = Math.floor(Date.now() / 1000)

  return Jwt.token.generate(
    {
      serviceId: 'grants-ui',
      serviceName: 'Grants UI',
      iat: now,
      nbf: now,
      exp: now + 300 // 5 minutes
    },
    {
      key: JWT_SECRET,
      algorithm: 'HS256'
    }
  )
}

/**
 * Read and parse YAML file
 */
async function readYamlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  return parseYaml(content)
}

/**
 * Extract metadata from form definition
 */
function extractMetadata(formDef, slug) {
  return {
    title: formDef.name,
    organisation: formDef.metadata?.organisation || 'Defra',
    teamName: formDef.metadata?.teamName || 'Digital Delivery',
    teamEmail: formDef.metadata?.teamEmail || 'digitaldelivery@defra.gov.uk',
    notificationEmail: formDef.metadata?.notificationEmail || 'digitaldelivery@defra.gov.uk',
    slug
  }
}

/**
 * Get headers for API requests
 */
function getHeaders(token) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }

  // Only include x-api-key if it's set (needed for CDP services from local dev)
  if (CDP_API_KEY) {
    headers['x-api-key'] = CDP_API_KEY
  }

  return headers
}

/**
 * Create form in API
 */
async function createForm(metadata, token) {
  const response = await fetch(`${CONFIG_API_URL}/forms`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(metadata)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Failed to create form: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Update draft definition
 */
async function updateDraftDefinition(formId, definition, token) {
  const response = await fetch(`${CONFIG_API_URL}/forms/${formId}/definition/draft`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(definition)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Failed to update draft definition: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Publish draft to live
 */
async function publishToLive(formId, token) {
  const response = await fetch(`${CONFIG_API_URL}/forms/${formId}/create-live`, {
    method: 'POST',
    headers: getHeaders(token)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Failed to publish to live: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Get existing form by slug
 */
async function getFormBySlug(slug, token) {
  const response = await fetch(`${CONFIG_API_URL}/forms/slug/${slug}`, {
    method: 'GET',
    headers: getHeaders(token)
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Failed to get form by slug: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Create a draft definition (when no draft exists)
 * Copies the live definition to draft state
 */
async function createDraftDefinition(formId, token) {
  const response = await fetch(`${CONFIG_API_URL}/forms/${formId}/create-draft`, {
    method: 'POST',
    headers: getHeaders(token)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Failed to create draft definition: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Update existing form (create new version and publish)
 */
async function updateForm(filePath, slug, token, dryRun = false) {
  console.log(`\n 📝 Updating: ${slug}`)

  try {
    // Read and parse YAML
    const formDef = await readYamlFile(filePath)

    // Prepare definition
    const definition = {
      name: formDef.name,
      engine: formDef.engine,
      schema: formDef.schema,
      metadata: formDef.metadata,
      pages: formDef.pages || [],
      lists: formDef.lists || [],
      sections: formDef.sections || [],
      conditions: formDef.conditions || []
    }

    console.log(`   Title: ${formDef.name}`)
    console.log(`   ID: ${formDef.metadata?.id || 'none'}`)

    if (dryRun) {
      console.log('   ✓ Dry run - would update this form')
      return { success: true, slug }
    }

    // Get existing form
    console.log('   Fetching existing form...')
    const existingForm = await getFormBySlug(slug, token)

    if (!existingForm) {
      console.error('   ❌ Form not found - use without --update to create it')
      return { success: false, slug, error: 'Form not found' }
    }

    console.log(`   ✓ Found existing form with ID: ${existingForm.id}`)

    // Check if draft exists, if not create one first
    if (!existingForm.draft) {
      console.log('   ℹ No draft exists, creating draft from live version...')
      await createDraftDefinition(existingForm.id, token)
      console.log('   ✓ Draft created')
    }

    // Update draft definition
    console.log('   Updating draft definition...')
    await updateDraftDefinition(existingForm.id, definition, token)
    console.log('   ✓ Draft definition updated')

    // Publish to live
    console.log('   Publishing new version to live...')
    await publishToLive(existingForm.id, token)
    console.log('   ✓ Published new version to live')

    console.log(`   ✅ Successfully updated: ${slug}`)
    return { success: true, slug, formId: existingForm.id }
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`)
    return { success: false, slug, error: error.message }
  }
}

/**
 * Upload a single form (create new)
 */
async function uploadForm(filePath, token, dryRun = false) {
  const fileName = path.basename(filePath, '.yaml')
  console.log(`\n 📄 Processing: ${fileName}`)

  try {
    // Read and parse YAML
    const formDef = await readYamlFile(filePath)
    const metadata = extractMetadata(formDef, fileName)

    console.warn(metadata)

    // Prepare definition (without form-level metadata that goes in FormMetadata)
    const definition = {
      name: formDef.name,
      engine: formDef.engine,
      schema: formDef.schema,
      metadata: formDef.metadata,
      pages: formDef.pages || [],
      lists: formDef.lists || [],
      sections: formDef.sections || [],
      conditions: formDef.conditions || []
    }

    console.log(`   Title: ${metadata.title}`)
    console.log(`   Slug: ${metadata.slug}`)
    console.log(`   ID: ${formDef.metadata?.id || 'none'}`)

    if (dryRun) {
      console.log('   ✓ Dry run - would upload this form')
      return { success: true, slug: metadata.slug }
    }

    // Create form
    console.log('   Creating form...')
    const createResult = await createForm(metadata, token)
    console.log(`   ✓ Form created with ID: ${createResult.id}`)

    // Update draft definition
    console.log('   Uploading definition...')
    await updateDraftDefinition(createResult.id, definition, token)
    console.log('   ✓ Draft definition uploaded')

    // Publish to live if non-prod or enabledInProd is true
    if (!CONFIG_API_URL.includes('prod.cdp-int.defra.cloud') || formDef.metadata?.enabledInProd) {
      console.log('   Publishing to live...')
      await publishToLive(createResult.id, token)
      console.log('   ✓ Published to live')
    } else {
      console.log('   ⚠ Not publishing to live (enabledInProd: false)')
    }

    console.log(`   ✅ Successfully uploaded: ${metadata.slug}`)
    return { success: true, slug: metadata.slug, formId: createResult.id }
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`)
    return { success: false, slug: fileName, error: error.message }
  }
}

/**
 * Get all YAML files in forms directory
 */
async function getAllFormFiles() {
  const entries = await fs.readdir(FORMS_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(FORMS_DIR, entry.name))
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Upload form definitions from YAML files to grants-ui-config-api

Usage:
  npm run upload:forms -- [options]

Options:
  --all                Upload all form YAML files
  --slug <slug>        Upload by slug/filename without extension (e.g., farm-payments)
  --update             Update existing form (use with --slug only)
                       Creates new version and publishes to live
  --dry-run            Show what would be uploaded without making changes
  --help, -h           Show this help message

Environment Variables:
  CONFIG_API_JWT_SECRET     JWT secret for authentication (required)
  CDP_API_KEY                 CDP API key from user profile (required for CDP services)
                              Get from: https://portal.cdp-int.defra.cloud/user-profile
                              Not needed for local API or service-to-service calls
  CONFIG_API_URL   API endpoint (default: http://localhost:3001)

Examples:
  # Upload all forms (create new)
  npm run upload:forms -- --all

  # Upload by slug (create new)
  npm run upload:forms -- --slug farm-payments

  # Update existing form (new version)
  npm run upload:forms -- --slug farm-payments --update

  # Dry run to see what would be uploaded
  npm run upload:forms -- --slug farm-payments --dry-run
`)
}

/**
 * Main function
 */
async function main() {
  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log(' 📤 Grants UI Config API Upload Tool')
  console.log(`   API: ${CONFIG_API_URL}`)
  console.log(`   Forms directory: ${FORMS_DIR}`)

  if (options.dryRun) {
    console.log('   🔍 DRY RUN MODE - No changes will be made')
  }

  // Validate options
  if (!options.all && !options.slug) {
    throw new Error('You must specify --all or --slug. Run with --help for usage information')
  }

  // Validate --update usage
  if (options.update) {
    if (!options.slug) {
      throw new Error(
        '--update can only be used with --slug. Example: npm run upload:forms -- --slug farm-payments --update'
      )
    }
    if (options.all) {
      throw new Error('--update cannot be used with --all')
    }
  }

  // Validate credentials (will throw if missing)
  validateCredentials()

  const token = generateToken()

  let filesToUpload = []

  if (options.all) {
    filesToUpload = await getAllFormFiles()
    console.log(`\n 📋 Found ${filesToUpload.length} form file(s)`)
  } else if (options.slug) {
    const fileName = options.slug.endsWith('.yaml') ? options.slug : `${options.slug}.yaml`
    const filePath = path.resolve(FORMS_DIR, fileName)
    filesToUpload = [filePath]
  }

  // Upload or update forms
  const results = []
  for (const filePath of filesToUpload) {
    try {
      await fs.access(filePath)

      if (options.update && options.slug) {
        // Update existing form
        const result = await updateForm(filePath, options.slug, token, options.dryRun)
        results.push(result)
      } else {
        // Create new form
        const result = await uploadForm(filePath, token, options.dryRun)
        results.push(result)
      }
    } catch (error) {
      console.error(`\n ❌ File not found: ${filePath}`)
      results.push({ success: false, slug: path.basename(filePath), error: 'File not found' })
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📋 Summary')
  console.log('='.repeat(60))

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(` ✅ Successful: ${successful.length}`)
  if (successful.length > 0) {
    successful.forEach((r) => console.log(`   - ${r.slug}`))
  }

  if (failed.length > 0) {
    console.log(`\n ❌ Failed: ${failed.length}`)
    failed.forEach((r) => console.log(`   - ${r.slug}: ${r.error}`))
  }

  console.log('='.repeat(60))

  if (failed.length > 0) {
    throw new Error(`${failed.length} form(s) failed to upload`)
  }
}

// Run
main().catch((error) => {
  console.error('\n ❌ Unexpected error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
