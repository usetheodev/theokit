import { defineRoute, parseRequestBody, requireAuth } from 'theokit/server'
import type { z } from 'zod'
import { attachments } from '../../db/schema.js'
import type { RequestContext } from '../context.js'

interface UploadResult {
  id: string
  filename: string
  mimeType: string
  size: number
}

export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodUndefined,
  z.ZodUndefined,
  RequestContext,
  Response | UploadResult
>({
  handler: async ({ request, ctx }) => {
    requireAuth(ctx.session)
    const parsed = await parseRequestBody(
      request as unknown as Parameters<typeof parseRequestBody>[0],
    )
    if (!parsed.files || parsed.files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no_file' }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      )
    }
    const file = parsed.files[0]!
    const [row] = await ctx.db
      .insert(attachments)
      .values({
        userId: ctx.session.userId,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
      })
      .returning()
    // In a real app the buffer goes to S3/R2/disk here.
    return {
      id: row!.id,
      filename: row!.filename,
      mimeType: row!.mimeType,
      size: row!.size,
    }
  },
})
