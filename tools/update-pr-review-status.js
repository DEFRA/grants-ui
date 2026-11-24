import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const STATUS_FIELD_NAME = 'Status'
const REVIEW_STATUS_OPTIONS = ['Draft', 'Awaiting review', 'Changes requested', 'Approved']

export function getReviewStatus({ isDraft, reviewDecision }) {
  if (isDraft) {
    return 'Draft'
  }

  if (reviewDecision === 'APPROVED') {
    return 'Approved'
  }

  if (reviewDecision === 'CHANGES_REQUESTED') {
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
        isDraft
        reviewDecision
        state
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

  return { id: project.id, fieldId: field.id, options }
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

async function updateReviewStatus(token, projectId, itemId, fieldId, optionId) {
  const mutation = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }`

  await graphql(token, mutation, { projectId, itemId, fieldId, optionId })
}

export async function run() {
  const token = process.env.GRANTS_PROJECTS_TOKEN
  const projectNumber = Number(process.env.GRANTS_ENABLEMENT_PROJECT_NUMBER)
  const eventPath = process.env.GITHUB_EVENT_PATH
  const repository = process.env.GITHUB_REPOSITORY

  if (!token) {
    throw new Error('Missing GRANTS_PROJECTS_TOKEN secret')
  }
  if (!Number.isInteger(projectNumber) || projectNumber < 1) {
    throw new Error('GRANTS_ENABLEMENT_PROJECT_NUMBER must be a positive project number')
  }
  if (!eventPath || !repository) {
    throw new Error('Missing GitHub event or repository context')
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'))
  const pullRequest = event.pull_request
  if (!pullRequest?.number) {
    throw new Error('The GitHub event does not contain a pull request')
  }

  const [owner, repo] = repository.split('/')
  const project = await getProject(token, owner, projectNumber)
  const { pullRequest: currentPullRequest, item } = await findProjectItem(
    token,
    owner,
    repo,
    pullRequest.number,
    project.id
  )

  if (currentPullRequest.state !== 'OPEN') {
    process.stdout.write(`Skipping pull request ${owner}/${repo}#${pullRequest.number} in state ${currentPullRequest.state}\n`)
    return
  }

  let itemId = item?.id
  if (!itemId) {
    try {
      itemId = await addProjectItem(token, project.id, currentPullRequest.id)
    } catch (error) {
      const { item: existingItem } = await findProjectItem(token, owner, repo, pullRequest.number, project.id)
      if (!existingItem) {
        throw error
      }
      itemId = existingItem.id
    }
  }

  const status = getReviewStatus(currentPullRequest)
  await updateReviewStatus(token, project.id, itemId, project.fieldId, project.options.get(status))

  process.stdout.write(`Set ${owner}/${repo}#${pullRequest.number} Status to "${status}"\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
