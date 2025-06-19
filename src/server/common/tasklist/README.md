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

## Available Task Statuses

- `completed` / `COMPLETED`: Task is finished
- `in_progress` / `IN_PROGRESS`: Task has been started
- `not_yet_started` / `NOT_YET_STARTED`: Task can be started
- `cannot_start_yet` / `CANNOT_START_YET`: Task has unmet dependencies
