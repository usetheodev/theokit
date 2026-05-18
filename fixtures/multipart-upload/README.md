# multipart-upload

Demonstrates file upload via `parseRequestBody` with `multipart/form-data`.

## Configuration

```ts
// theo.config.ts
export default defineConfig({
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10 MB per file
    maxFiles: 5,                   // max files per request
  },
})
```

When the request `Content-Type` is `multipart/form-data`, `parseRequestBody` returns `{ fields, files }`. Files are buffered in memory by default — for very large uploads, stream directly to disk/S3 instead.

## Route shape

```ts
import { defineRoute, parseRequestBody } from 'theokit/server'

export const POST = defineRoute({
  handler: async ({ request }) => {
    const parsed = await parseRequestBody(request)
    const file = parsed.files[0]
    // file.filename, file.size, file.mimeType, file.buffer
  },
})
```

## Limits

- `maxFileSize`: rejected with 413 if any file exceeds.
- `maxFiles`: rejected with 413 if too many files in one request.
- `maxFieldSize`: rejected if a single text field exceeds.

## Run

```bash
npx vitest run tests/unit/fixture-multipart-upload.test.ts
```
