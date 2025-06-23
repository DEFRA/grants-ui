# Config-Driven Tasklist Generator

## Logical Operators

- `and`: All sub-conditions must be true
- `or`: At least one sub-condition must be true
- `not`: Inverts the result of the sub-condition

## Field Comparison Operators

| Operator    | Description                | Example                   |
| ----------- | -------------------------- | ------------------------- |
| `equals`    | Exact match                | `equals: "value"`         |
| `notEquals` | Not equal                  | `notEquals: "value"`      |
| `in`        | Value in array             | `in: ["val1", "val2"]`    |
| `notIn`     | Value not in array         | `notIn: ["val1", "val2"]` |
| `gt`        | Greater than (numbers)     | `gt: 100`                 |
| `gte`       | Greater than or equal      | `gte: 100`                |
| `lt`        | Less than (numbers)        | `lt: 100`                 |
| `lte`       | Less than or equal         | `lte: 100`                |
| `exists`    | Field exists/doesn't exist | `exists: true`            |
| `isEmpty`   | Field is empty/not empty   | `isEmpty: false`          |

# Configurable Tasklist System

A flexible, configuration-driven tasklist system for creating dynamic multi-step workflows.

## Quick Start

1. Create a YAML configuration file in `configs/` directory
2. Register the tasklist route in your application
3. The system handles status tracking, dependencies, and conditional logic

```javascript
// In the router
import { createTasklistRoute } from './generic-tasklist-controller.js'

await server.register(createTasklistRoute('my-tasklist'))
```

## Basic Example

```yaml
tasklist:
  id: my-tasklist
  title: My Application Process
  sections:
    - id: basic-info
      title: Basic Information
      subsections:
        - id: personal-details
          title: Personal Details
          href: personal-details
        - id: contact-info
          title: Contact Information
          href: contact-info
          dependsOn: ['personal-details']
```

## Key Features

- **YAML Configuration**: Define your entire workflow in YAML
- **Conditional Logic**: Show/hide sections based on user data
- **Dependencies**: Control section availability based on completion
- **Status Tracking**: Automatic status calculation (completed, in-progress, etc.)
- **Session Integration**: Works with existing session management

## Documentation

- [Advanced Features Guide](docs/advanced-features-guide.md) - Complex conditions and patterns
- [API Reference](docs/api-reference.md) - Complete configuration options
- `configs/example-tasklist.yaml` - Basic example
- `configs/advanced-tasklist-features.yaml` - Demonstrates all features

## Configuration Structure

```yaml
tasklist:
  id: string # Unique identifier
  title: string # Display title
  closingDate: string # Optional closing date
  helpText: string # Optional help text

  conditions: # Define reusable conditions
    conditionName:
      type: conditional|dependency
      # ... condition configuration

  sections: # List of sections
    - id: string
      title: string
      subsections:
        - id: string
          title: string
          href: string # URL path
          condition: string # Reference to condition
          dependsOn: array # Dependencies

  statusRules: # Computed status rules
    ruleName:
      type: allComplete
      dependsOn: array
```

## Status Types

- `completed` - Section has been completed
- `inProgress` - User has visited but not completed
- `notYetStarted` - Available to start
- `cannotStartYet` - Dependencies not met
- `hidden` - Not shown to user
