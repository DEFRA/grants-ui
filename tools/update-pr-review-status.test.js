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

  it.each([
    { pendingReviewers: [], optionId: 'changes-requested-option-id' },
    { pendingReviewers: ['another-reviewer'], optionId: 'changes-requested-option-id' },
    { pendingReviewers: ['original-reviewer'], optionId: 'awaiting-review-option-id' }
  ])(
    'updates the Project to $optionId for pending reviewers $pendingReviewers',
    async ({ pendingReviewers, optionId }) => {
      const fetch = vi.fn(async (_url, { body }) => {
        const { query } = JSON.parse(body)
        if (query.includes('organization(login:')) {
          return graphQlResponse({
            organization: {
              projectV2: {
                id: 'project-id',
                fields: { nodes: [statusField()] }
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
                reviewRequests: {
                  nodes: pendingReviewers.map((login) => ({ requestedReviewer: { login } }))
                },
                latestOpinionatedReviews: {
                  nodes: [{ state: 'CHANGES_REQUESTED', author: { login: 'original-reviewer' } }]
                },
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
        fieldId: 'status-field-id',
        value: { singleSelectOptionId: optionId }
      })
      expect(fetch).toHaveBeenCalledTimes(3)
    }
  )

  it.each(['CLOSED', 'MERGED'])('skips Project mutations for a PR in state %s', async (state) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        graphQlResponse({
          organization: { projectV2: { id: 'project-id', fields: { nodes: [statusField()] } } }
        })
      )
      .mockResolvedValueOnce(
        graphQlResponse({
          repository: { pullRequest: { id: 'pull-request-id', state, projectItems: { nodes: [] } } }
        })
      )
    vi.stubGlobal('fetch', fetch)

    await run()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails when the Project number is unset', async () => {
    vi.stubEnv('GRANTS_ENABLEMENT_PROJECT_NUMBER', '')

    await expect(run()).rejects.toThrow('GRANTS_ENABLEMENT_PROJECT_NUMBER must be a positive project number')
  })

  it('fails before making any Project writes when the Status field is missing', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      graphQlResponse({
        organization: { projectV2: { id: 'project-id', fields: { nodes: [] } } }
      })
    )
    vi.stubGlobal('fetch', fetch)

    await expect(run()).rejects.toThrow('Project is missing the single-select field "Status"')

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('adds a pull request to the project before setting its status and author', async () => {
    const fetch = vi.fn(async (_url, { body }) => {
      const { query } = JSON.parse(body)
      if (query.includes('organization(login:')) {
        return graphQlResponse({
          organization: {
            projectV2: {
              id: 'project-id',
              fields: { nodes: [statusField(), { id: 'author-field-id', name: 'PR Author', dataType: 'TEXT' }] }
            }
          }
        })
      }

      if (query.includes('repository(owner:')) {
        return graphQlResponse({
          repository: {
            pullRequest: {
              id: 'pull-request-id',
              author: { login: 'example-author' },
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
      value: { singleSelectOptionId: 'approved-option-id' }
    })
    expect(JSON.parse(fetch.mock.calls[4][1].body).variables).toEqual({
      projectId: 'project-id',
      itemId: 'new-project-item-id',
      fieldId: 'author-field-id',
      value: { text: 'example-author' }
    })
  })
})

function graphQlResponse(data) {
  return { ok: true, status: 200, json: async () => ({ data }) }
}

function statusField() {
  return {
    id: 'status-field-id',
    name: 'Status',
    options: [
      { id: 'draft-option-id', name: 'Draft' },
      { id: 'awaiting-review-option-id', name: 'Awaiting review' },
      { id: 'changes-requested-option-id', name: 'Changes requested' },
      { id: 'approved-option-id', name: 'Approved' }
    ]
  }
}
