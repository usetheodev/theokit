# adapter-aws-lambda

Compile-only fixture for the **`aws-lambda`** build target.

```bash
pnpm theokit build --target=aws-lambda
# emits .theo/aws/handler.mjs (API Gateway HTTP API v2)
```

## What the adapter emits

- `.theo/aws/handler.mjs` — exports `handler` for API Gateway HTTP API v2 (default)
- Helpers convert v2 event ↔ Web `Request` and Web `Response` ↔ v2 result
- Binary content types (`application/octet-stream`, `application/pdf`, `application/zip`, `image/*`, `audio/*`, `video/*`) get base64-encoded on the response

## Deploy

Bundle the emitted file with your IaC tool of choice (SAM, CDK, Terraform, Serverless). API Gateway HTTP API v2 only; the older REST API (v1) isn't supported.

Compile-only — see ADR D2.
