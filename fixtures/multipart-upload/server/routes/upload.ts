import { defineRoute, parseRequestBody, type UploadedFile } from 'theokit/server'
import type { z } from 'zod'

interface UploadResult {
  filename: string
  size: number
  mimeType: string
  description?: string
}

/**
 * Multipart file upload route. Expects:
 *   - file: <binary>
 *   - description: <text>  (optional)
 *
 * Returns metadata about the uploaded file. In real apps you'd persist
 * the buffer to S3/disk/etc.
 */
export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodUndefined,
  z.ZodUndefined,
  unknown,
  Response | UploadResult | { error: string }
>({
  handler: async ({ request }) => {
    // The body parser detects multipart/form-data by Content-Type.
    const parsed = await parseRequestBody(
      request as unknown as Parameters<typeof parseRequestBody>[0],
    )

    if (!('files' in parsed) || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing file field in multipart body' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      })
    }

    const file = parsed.files[0] as UploadedFile
    return {
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      description: parsed.fields?.description,
    }
  },
})
