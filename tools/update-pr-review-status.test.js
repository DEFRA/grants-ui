import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getReviewStatus, run } from './update-pr-review-status.js'

describe('getReviewStatus', () => {
  it('marks draft pull requests as Draft regardless of review decision', () => {
    expect(getReviewStatus({ isDraft: true, reviewDecision: 'APPROVED' })).toBe('Draft')
  })

  it('maps aggregate approval and changes-requested decisions', () => {
    expect(getReviewStatus({ isDraft: false, reviewDecision: 'APPROVED' })).toBe('Approved')
    expect(getReviewStatus({ isDraft: false, reviewDecision: 'CHANGES_REQUESTED' })).toBe('Changes requested')
  })

  it('treats missing or required review decisions as awaiting review', () => {
    expect(getReviewStatus({ isDraft: false, reviewDecision: 'REVIEW_REQUIRED' })).toBe('Awaiting review')
    expect(getReviewStatus({ isDraft: false, reviewDecision: null })).toBe('Awaiting review')
  })
})

describe('run', () => {
  let eventDirectory

  beforeEach(async () => {
    eventDirectory = await mkdtemp(join(tmpdir(), 'grants-ui-project-review-'))
    await writeFile(join(eventDirectory, 'event.json'), JSON.stringify({ pull_request: { number: 42 } }))
    vi.stubEnv('GRANTS_PROJECTS_TOKEN', 'test-token')
    vi.stubEnv('GRANTS_ENABLEMENT_PROJECT_NUMBER', '7')
    vi.stubEnv('GITHUB_EVENT_PATH', join(eventDirectory, 'event.json'))
    vi.stubEnv('GITHUB_REPOSITORY', 'DEFRA/grants-ui')
    vi.stubEnv('GITHUB_API_URL', 'https://api.github.com')
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    await rm(eventDirectory, { recursive: true, force: true })
  })

  it('updates the project status using the current aggregate review decision', async () => {
    const fetch = vi.fn(async (_url, { body }) => {
      const { query } = JSON.parse(body)
      if (query.includes('organization(login:')) {
        return graphQlResponse({
          organization: {
            projectV2: {
              id: 'project-id',
              fields: { nodes: [reviewStatusField()] }
            }
          }
        })
      }

      if (query.includes('repository(owner:')) {
        return graphQlResponse({
          repository: {
            pullRequest: {
              id: 'pull-request-id',
              isDraft: false,
              reviewDecision: 'CHANGES_REQUESTED',
              state: 'OPEN',
              projectItems: { nodes: [{ id: 'project-item-id', project: { id: 'project-id' } }] }
            }
          }
        })
      }

      return graphQlResponse({ updateProjectV2ItemFieldValue: { projectV2Item: { id: 'project-item-id' } } })
    })
    vi.stubGlobal('fetch', fetch)

    await run()

    const update = JSON.parse(fetch.mock.calls[2][1].body)
    expect(update.variables).toEqual({
      projectId: 'project-id',
      itemId: 'project-item-id',
      fieldId: 'review-status-field-id',
      optionId: 'changes-requested-option-id'
    })
  })

  it('adds a pull request to the project before setting its review status', async () => {
    const fetch = vi.fn(async (_url, { body }) => {
      const { query } = JSON.parse(body)
      if (query.includes('organization(login:')) {
        return graphQlResponse({
          organization: {
            projectV2: {
              id: 'project-id',
              fields: { nodes: [reviewStatusField()] }
            }
          }
        })
      }

      if (query.includes('repository(owner:')) {
        return graphQlResponse({
          repository: {
            pullRequest: {
              id: 'pull-request-id',
              isDraft: false,
              reviewDecision: 'APPROVED',
              state: 'OPEN',
              projectItems: { nodes: [] }
            }
          }
        })
      }

      if (query.includes('addProjectV2ItemById')) {
        return graphQlResponse({ addProjectV2ItemById: { item: { id: 'new-project-item-id' } } })
      }

      return graphQlResponse({ updateProjectV2ItemFieldValue: { projectV2Item: { id: 'new-project-item-id' } } })
    })
    vi.stubGlobal('fetch', fetch)

    await run()

    expect(JSON.parse(fetch.mock.calls[2][1].body).query).toContain('addProjectV2ItemById')
    expect(JSON.parse(fetch.mock.calls[3][1].body).variables).toMatchObject({
      itemId: 'new-project-item-id',
      optionId: 'approved-option-id'
    })
  })
})

function graphQlResponse(data) {
  return { ok: true, status: 200, json: async () => ({ data }) }
}

function reviewStatusField() {
  return {
    id: 'review-status-field-id',
    name: 'Review Status',
    options: [
      { id: 'draft-option-id', name: 'Draft' },
      { id: 'awaiting-review-option-id', name: 'Awaiting review' },
      { id: 'changes-requested-option-id', name: 'Changes requested' },
      { id: 'approved-option-id', name: 'Approved' }
    ]
  }
}
