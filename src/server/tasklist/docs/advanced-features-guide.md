# Advanced Tasklist Features Guide

This guide demonstrates all the advanced features available in the configurable tasklist system using the `advanced-tasklist-features.yaml` example.

## Complex Condition Patterns

### 1. Nested AND/OR Logic

Create complex multi-level conditions by nesting logical operators:

```yaml
nestedAndOrCondition:
  type: conditional
  rules:
    - if:
        and:
          - field: 'demo-data.userType'
            equals: 'premium'
          - or:
              - field: 'demo-data.accountValue'
                gt: 10000
              - field: 'demo-data.yearsActive'
                gte: 5
      then: 'not_yet_started'
```

This condition means: Show if applicant type is farmer AND (project value > 10000 OR years trading >= 5)

### 2. Numeric Comparisons

All numeric operators available:

- `gt`: Greater than
- `gte`: Greater than or equal
- `lt`: Less than
- `lte`: Less than or equal

Range example:

```yaml
rules:
  - if:
      and:
        - field: 'numeric-demo.value'
          gte: 50
        - field: 'numeric-demo.value'
          lt: 200
    then: 'not_yet_started'
```

### 3. Array Operations

Check if a value is in or not in an array:

```yaml
# Include if option is in allowed list
- if:
    field: 'array-demo.selectedOption'
    in: ['option1', 'option2', 'option3']
  then: 'not_yet_started'

# Exclude if option is in restricted list
- if:
    field: 'array-demo.selectedOption'
    notIn: ['restricted1', 'restricted2']
  then: 'not_yet_started'
```

### 4. Field Existence and Empty Checks

Check if fields exist or have values:

```yaml
# Check if field exists (even if null)
- if:
    field: 'demo.optionalField'
    exists: true
  then: 'not_yet_started'

# Check if field has a value (not null/undefined/"")
- if:
    field: 'demo.textField'
    isEmpty: false
  then: 'not_yet_started'
```

### 5. NOT Operator

Negate any condition:

```yaml
- if:
    not:
      field: 'demo.restricted'
      equals: true
  then: 'not_yet_started'
```

## Dependency Patterns

### Simple Dependencies (All Of)

Default behavior - all must be complete:

```yaml
dependsOn: ['section1', 'section2', 'section3']
```

### Any Of Dependencies

At least one must be complete:

```yaml
dependsOn:
  anyOf: ['option-a', 'option-b', 'option-c']
```

### None Of Dependencies

None of these can be complete:

```yaml
dependsOn:
  noneOf: ['restricted1', 'restricted2']
```

### Dependency-Type Conditions

Use completion status to determine visibility:

```yaml
dependencyBasedCondition:
  type: dependency
  dependsOn:
    anyOf: ['setup-a', 'setup-b']
  statusMap:
    true: 'not_yet_started'
    false: 'cannot_start_yet'
```

## Status Rules

Compute status based on other sections:

```yaml
statusRules:
  final-review:
    type: allComplete
    dependsOn:
      - all-requirements
      - documentation
      - computed-section # Can reference other status rules
```

## Combining Features

You can combine multiple features:

```yaml
subsections:
  - id: complex-section
    title: Complex Section
    # Has dependencies
    dependsOn:
      anyOf: ['option1', 'option2']
    # AND conditions
    condition: complexCondition
```

## Testing Your Configuration

To test these features:

1. Create test data that triggers different conditions
2. Use the tasklist generator with various data states
3. Verify sections appear/hide based on your rules
4. Check that status calculations work correctly

## Common Patterns

### Progressive Disclosure

Show advanced options only after basic setup:

```yaml
advancedOptions:
  type: conditional
  rules:
    - if:
        field: 'setup.complete'
        equals: true
      then: 'not_yet_started'
  default: 'hidden'
```

### Eligibility Gates

Prevent progress until criteria are met:

```yaml
proceedCheck:
  type: conditional
  rules:
    - if:
        and:
          - field: 'eligibility.score'
            gte: 70
          - field: 'eligibility.verified'
            equals: true
      then: 'not_yet_started'
  default: 'cannot_start_yet'
```

### Dynamic Workflows

Different paths based on user choices:

```yaml
pathACondition:
  type: conditional
  rules:
    - if:
        field: 'choice.path'
        equals: 'A'
      then: 'not_yet_started'
  default: 'hidden'

pathBCondition:
  type: conditional
  rules:
    - if:
        field: 'choice.path'
        equals: 'B'
      then: 'not_yet_started'
  default: 'hidden'
```
