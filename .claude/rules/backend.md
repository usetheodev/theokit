---
paths:
  - "server/**/*.ts"
  - "packages/server/**/*.ts"
---

# Backend Rules

## Routes

- All routes use `defineRoute` with Zod schema
- Routes live in `server/routes/`
- File path maps to URL: `server/routes/users.ts` → `/api/users`
- Export named HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- Input validation is automatic via Zod schema
- Output type is inferred from handler return

## Server Actions

- All actions use `defineAction` with Zod schema
- Actions live in `server/actions/`
- Actions are invocable from frontend components
- CSRF protection is automatic
- Actions share context, auth, and middleware with routes

## Middleware

- Defined in `server/middleware.ts`
- Applied to ALL routes and actions
- Order is explicit (array order = execution order)
- Each middleware can modify context or short-circuit

## Context

- Defined in `server/context.ts`
- Factory function creates per-request context
- Contains: db, user, session, tracing, logger
- Shared between routes and actions

## Error Handling

- Use typed errors extending `TheoError`
- Never `catch (e) {}` — always handle or propagate
- Errors carry: code, statusCode, message, details
- Validation errors use `ValidationError` with Zod flatten
- Never return null/undefined for errors — throw typed error

## OpenAPI

- Generated automatically from `defineRoute` schemas
- Available at `/api/docs` (Swagger UI) and `/api/openapi.json`
- Zero manual configuration
