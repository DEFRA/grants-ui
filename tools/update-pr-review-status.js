import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const STATUS_FIELD_NAME = 'Status'
const PR_AUTHOR_FIELD_NAME = 'PR Author'
const REVIEW_STATUS_OPTIONS = ['Draft', 'Awaiting review', 'Changes requested', 'Approved']

/**
 * @param {object} pullRequest
 * @param {boolean} pullRequest.isDraft
 * @param {string | null} pullRequest.reviewDecision
 * @param {{ nodes: ({ requestedReviewer: { login?: string } | null } | null)[] } | null} [pullRequest.reviewRequests]
 * @param {{ nodes: ({ state: string, author: { login: string } | null } | null)[] } | null} [pullRequest.latestOpinionatedReviews]
 */
export function getReviewStatus({ isDraft, reviewDecision, reviewRequests, latestOpinionatedReviews }) {
  if (isDraft) {
    return 'Draft'
  }

  if (reviewDecision === 'APPROVED') {
    return 'Approved'
  }

  if (reviewDecision === 'CHANGES_REQUESTED') {
    const reviewersWithRequestedChanges = new Set(
      latestOpinionatedReviews?.nodes
        .filter((review) => review?.state === 'CHANGES_REQUESTED')
        .map((review) => review?.author?.login)
        .filter(Boolean)
    )
    const awaitingRereview = reviewRequests?.nodes.some((request) =>
      reviewersWithRequestedChanges.has(request?.requestedReviewer?.login)
    )
    if (awaitingRereview) {
      return 'Awaiting review'
    }

    return 'Changes requested'
  }

  return 'Awaiting review'
}

async function graphql(token, query, variables) {
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com'
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/graphql`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })

  const result = await response.json()
  if (!response.ok || result.errors?.length) {
    const errors = result.errors?.map(({ message }) => message).join('; ')
    throw new Error(`GitHub GraphQL request failed (${response.status})${errors ? `: ${errors}` : ''}`)
  }

  return result.data
}

async function findProjectItem(token, owner, repo, number, projectId) {
  const query = `query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        author {
          login
        }
        isDraft
        reviewDecision
        state
        reviewRequests(first: 100) {
          nodes {
            requestedReviewer {
              ... on User {
                login
              }
            }
          }
        }
        latestOpinionatedReviews(last: 100) {
          nodes {
            state
            author {
              login
            }
          }
        }
        projectItems(first: 100) {
          nodes {
            id
            project {
              id
            }
          }
        }
      }
    }
  }`

  const data = await graphql(token, query, { owner, repo, number })
  const pullRequest = data.repository?.pullRequest
  if (!pullRequest) {
    throw new Error(`Could not find pull request ${owner}/${repo}#${number}`)
  }

  return {
    pullRequest,
    item: pullRequest.projectItems.nodes.find(({ project }) => project?.id === projectId)
  }
}

async function getProject(token, owner, projectNumber) {
  const query = `query($owner: String!, $number: Int!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        fields(first: 100) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }`

  const data = await graphql(token, query, { owner, number: projectNumber })
  const project = data.organization?.projectV2
  if (!project) {
    throw new Error(`Could not find organization Project number ${projectNumber}`)
  }

  const field = project.fields.nodes.find(({ name }) => name === STATUS_FIELD_NAME)
  if (!field) {
    throw new Error(`Project is missing the single-select field "${STATUS_FIELD_NAME}"`)
  }

  const options = new Map(field.options.map(({ id, name }) => [name, id]))
  const missingOptions = REVIEW_STATUS_OPTIONS.filter((name) => !options.has(name))
  if (missingOptions.length) {
    throw new Error(`"${STATUS_FIELD_NAME}" is missing options: ${missingOptions.join(', ')}`)
  }

  const authorField = project.fields.nodes.find(
    ({ name, dataType }) => name === PR_AUTHOR_FIELD_NAME && dataType === 'TEXT'
  )

  return { id: project.id, fieldId: field.id, authorFieldId: authorField?.id, options }
}

async function addProjectItem(token, projectId, pullRequestId) {
  const mutation = `mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }`

  const data = await graphql(token, mutation, { projectId, contentId: pullRequestId })
  return data.addProjectV2ItemById.item.id
}

async function updateProjectField(token, projectId, itemId, fieldId, value) {
  const mutation = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }
    ) {
      projectV2Item {
        id
      }
    }
  }`

  await graphql(token, mutation, { projectId, itemId, fieldId, value })
}

async function listOpenPullRequestNumbers(token, owner, repo) {
  const query = `query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 100, states: [OPEN], after: $cursor) {
        nodes {
          number
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`

  const numbers = []
  let cursor = null
  do {
    const data = await graphql(token, query, { owner, repo, cursor })
    const pullRequests = data.repository?.pullRequests
    if (!pullRequests) {
      throw new Error(`Could not list open pull requests for ${owner}/${repo}`)
    }
    numbers.push(...pullRequests.nodes.map(({ number }) => number))
    cursor = pullRequests.pageInfo.hasNextPage ? pullRequests.pageInfo.endCursor : null
  } while (cursor)

  return numbers
}

export async function run() {
  const token = process.env.GRANTS_PROJECTS_TOKEN
  const projectNumber = Number(process.env.GRANTS_ENABLEMENT_PROJECT_NUMBER)
  const eventPath = process.env.GITHUB_EVENT_PATH
  const repository = process.env.GITHUB_REPOSITORY
  const isBackfill = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'

  if (!token) {
    throw new Error('Missing GRANTS_PROJECTS_TOKEN secret')
  }
  if (!Number.isInteger(projectNumber) || projectNumber < 1) {
    throw new Error('GRANTS_ENABLEMENT_PROJECT_NUMBER must be a positive project number')
  }
  if (!repository || (!isBackfill && !eventPath)) {
    throw new Error('Missing GitHub event or repository context')
  }

  const [owner, repo] = repository.split('/')
  const numbers = isBackfill
    ? await listOpenPullRequestNumbers(token, owner, repo)
    : [await readPullRequestNumber(eventPath)]
  const project = await getProject(token, owner, projectNumber)
  for (const number of numbers) {
    await updatePullRequest(token, owner, repo, number, project)
  }
}

async function readPullRequestNumber(eventPath) {
  const event = JSON.parse(await readFile(eventPath, 'utf8'))
  const number = event.pull_request?.number
  if (!number) {
    throw new Error('The GitHub event does not contain a pull request')
  }
  return number
}

async function updatePullRequest(token, owner, repo, number, project) {
  const { pullRequest: currentPullRequest, item } = await findProjectItem(token, owner, repo, number, project.id)

  if (currentPullRequest.state !== 'OPEN') {
    process.stdout.write(`Skipping pull request ${owner}/${repo}#${number} in state ${currentPullRequest.state}\n`)
    return
  }

  const itemId = item?.id ?? (await addProjectItem(token, project.id, currentPullRequest.id))

  const status = getReviewStatus(currentPullRequest)
  await updateProjectField(token, project.id, itemId, project.fieldId, {
    singleSelectOptionId: project.options.get(status)
  })

  process.stdout.write(`Set ${owner}/${repo}#${number} Status to "${status}"\n`)

  const authorLogin = currentPullRequest.author?.login
  if (project.authorFieldId && authorLogin) {
    await updateProjectField(token, project.id, itemId, project.authorFieldId, { text: authorLogin })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
