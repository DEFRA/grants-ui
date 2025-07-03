# Tasklist API Reference

Complete reference for the configurable tasklist system.

## Configuration File Structure

### Root Configuration

```yaml
tasklist:
  id: string # Required. Unique identifier for the tasklist
  title: string # Required. Display title for the tasklist
  closingDate: string # Optional. Closing date to display
  helpText: string # Optional. Help text shown on the page
  conditions: {} # Optional. Named conditions for reuse
  sections: [] # Required. Array of sections
  statusRules: {} # Optional. Computed status rules
```

### Sections

```yaml
sections:
  - id: string # Required. Unique section identifier
    title: string # Required. Section display title
    subsections: [] # Required. Array of subsections
```

### Subsections

```yaml
subsections:
  - id: string # Required. Unique subsection identifier
    title: string # Required. Subsection display title
    href: string # Optional. URL path (defaults to id)
    required: boolean # Optional. Default: true
    condition: string # Optional. Reference to named condition
    dependsOn: # Optional. Dependencies
      # Can be array or object (see Dependencies section)
```

## Conditions

### Conditional Type

Evaluates rules based on data fields.

```yaml
conditions:
  myCondition:
    type: conditional
    rules:
      - if: <condition>
        then: <status>
    default: <status> # Required. Default status if no rules match
```

### Dependency Type

Evaluates based on completion of other sections.

```yaml
conditions:
  myDependency:
    type: dependency
    dependsOn: <dependencies>
    statusMap:
      true: <status> # When dependencies are met
      false: <status> # When dependencies are not met
      default: <status> # Optional. Fallback status
```

## Condition Operators

### Comparison Operators

| Operator    | Description           | Example                                                   |
| ----------- | --------------------- | --------------------------------------------------------- |
| `equals`    | Exact match           | `field: "applicant.type"`<br>`equals: "farmer"`           |
| `notEquals` | Not equal             | `field: "application.status"`<br>`notEquals: "withdrawn"` |
| `gt`        | Greater than          | `field: "project.value"`<br>`gt: 100000`                  |
| `gte`       | Greater than or equal | `field: "business.yearsTrading"`<br>`gte: 2`              |
| `lt`        | Less than             | `field: "grant.fundingRemaining"`<br>`lt: 50000`          |
| `lte`       | Less than or equal    | `field: "grant.matchPercentage"`<br>`lte: 50`             |

### Array Operators

| Operator | Description        | Example                                                                         |
| -------- | ------------------ | ------------------------------------------------------------------------------- |
| `in`     | Value in array     | `field: "business.sector"`<br>`in: ["agriculture", "horticulture", "forestry"]` |
| `notIn`  | Value not in array | `field: "project.category"`<br>`notIn: ["residential", "retail"]`               |

### Existence Operators

| Operator  | Description    | Example                                             |
| --------- | -------------- | --------------------------------------------------- |
| `exists`  | Field exists   | `field: "business.companyNumber"`<br>`exists: true` |
| `isEmpty` | Field is empty | `field: "business.description"`<br>`isEmpty: false` |

### Logical Operators

| Operator | Description                 | Example                                                                                                                     |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `and`    | All conditions must be true | `and:`<br>`  - field: "business.verified"`<br>`    equals: true`<br>`  - field: "business.yearsTrading"`<br>`    gte: 2`    |
| `or`     | Any condition must be true  | `or:`<br>`  - field: "applicant.type"`<br>`    equals: "farmer"`<br>`  - field: "applicant.type"`<br>`    equals: "grower"` |
| `not`    | Negates condition           | `not:`<br>`  field: "applicant.excluded"`<br>`  equals: true`                                                               |

## Dependencies

### Simple Array (All Of)

All listed sections must be complete:

```yaml
dependsOn: ['section1', 'section2', 'section3']
```

### All Of (Explicit)

```yaml
dependsOn:
  allOf: ['section1', 'section2', 'section3']
```

### Any Of

At least one must be complete:

```yaml
dependsOn:
  anyOf: ['option1', 'option2', 'option3']
```

### None Of

None can be complete:

```yaml
dependsOn:
  noneOf: ['restricted1', 'restricted2']
```

## Status Rules

Compute status based on other sections:

```yaml
statusRules:
  myComputedSection:
    type: allComplete
    dependsOn:
      - section1
      - section2
      - otherComputedSection # Can reference other status rules
```

## Available Statuses

| Status           | Description              | User Experience             |
| ---------------- | ------------------------ | --------------------------- |
| `completed`      | Section is complete      | Green checkmark             |
| `inProgress`     | Started but not complete | Blue "In progress" tag      |
| `notYetStarted`  | Can be started           | Blue "Not yet started" tag  |
| `cannotStartYet` | Dependencies not met     | Grey "Cannot start yet" tag |
| `hidden`         | Not visible              | Section not shown           |

## Field Path Syntax

Access nested data using dot notation:

```yaml
field: 'applicant.business.contact.email'
```

## Complete Example

```yaml
tasklist:
  id: grant-application
  title: Agricultural Grant Application

  conditions:
    isEligible:
      type: conditional
      rules:
        - if:
            and:
              - field: 'eligibility.businessSize'
                in: ['small', 'medium']
              - field: 'eligibility.yearsTrading'
                gte: 2
          then: 'not_yet_started'
      default: 'hidden'

    requiresDocuments:
      type: dependency
      dependsOn:
        allOf: ['business-details', 'eligibility-check']
      statusMap:
        true: 'not_yet_started'
        false: 'cannot_start_yet'

  sections:
    - id: application
      title: Application Form
      subsections:
        - id: business-details
          title: Business Details
          href: business-details

        - id: eligibility-check
          title: Eligibility Check
          href: eligibility
          dependsOn: ['business-details']

        - id: project-details
          title: Project Details
          href: project-details
          condition: isEligible

        - id: supporting-documents
          title: Supporting Documents
          href: supporting-documents
          condition: requiresDocuments

  statusRules:
    review-application:
      type: allComplete
      dependsOn:
        - business-details
        - eligibility-check
        - project-details
        - supporting-documents
```

## JavaScript Integration

### Creating a Route

```javascript
import { createTasklistRoute } from './generic-tasklist-controller.js'

const plugin = createTasklistRoute('my-tasklist')
await server.register(plugin)
```

### Session Data

The tasklist reads from:

- Cache data via `server.app.cacheTemp.get(sessionId)`
- Visited sections via `request.yar.get('visitedSubSections')`

### Data Structure

Section completion is determined by presence of section ID in data:

```javascript
// Data structure
{
  "basic-info": { /* section data */ },
  "eligibility-check": { /* section data */ }
}

// Visited sections
["business-plan", "documents"]
```
