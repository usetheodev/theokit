# fixtures/jobs-basic

Minimal TheoKit fixture exercising `defineJob` + `ctx.queue.enqueue`.

## Layout

```
server/
  jobs/
    process-document.ts  — async job; receives { documentId }
  routes/
    upload.ts            — POST → ctx.queue.enqueue('process-document', ...)
```
