# Server common work

## Custom Error Classes (New Pattern)

This pattern introduces a base `AppError` class and a small set of domain-specific error classes used to improve error clarity, structured logging, and maintainability.

### Base class

Located at:

```
src/server/common/errors/AppError.js
```

It supports:

- `code` – internal error code
- `context` – structured metadata for logs
- `alreadyLogged` – prevents duplicate logging in `catchAll`

### Usage

Throw error classes instead of generic Error, for example:

```
throw new TokenError('Failed to decode JWT token', {
  tokenLength: token.length
})
```

These error classes currently replace only selected auth-related errors.
Future PRs may expand usage.
