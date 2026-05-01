import AxeBuilder from '@axe-core/webdriverio'

const IGNORED_VIOLATIONS = [
  {
    description: 'Ensure all page content is contained by landmarks',
    ignoredTargets: [
      '.govuk-back-link',
      '.govuk-skip-link',
      '.govuk-width-container:nth-child(7)',
      '.govuk-width-container:nth-child(8)'
    ]
  }
]

export async function analyzeAccessibility() {
  const results = await new AxeBuilder({ client: browser })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()

  const unexpectedViolations = extractUnexpectedViolations(results.violations)

  expect(unexpectedViolations).toEqual([])
}

function extractUnexpectedViolations(violations) {
  return violations
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter((node) => !isIgnoredNode(node, violation))
    }))
    .filter((violation) => violation.nodes.length > 0)
}

function isIgnoredNode(node, violation) {
  return IGNORED_VIOLATIONS.some((ignored) => {
    return (
      ignored.description === violation.description &&
      ignored.ignoredTargets.some((ignoredTarget) => node.target[0] === ignoredTarget)
    )
  })
}
