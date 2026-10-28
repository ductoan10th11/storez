import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Lớp lỗi duy nhất ném ra từ service; onError đổi thành { error: { code, message, fields? } }
export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public extra: Record<string, unknown> = {},
    public headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export const errorBody = (code: string, message: string, fields?: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  error: { code, message, ...(fields ? { fields } : {}), ...extra },
})

export function onError(err: Error, c: Context) {
  if (err instanceof AppError) {
    for (const [k, v] of Object.entries(err.headers)) c.header(k, v)
    return c.json(errorBody(err.code, err.message, err.fields, err.extra), err.status)
  }
  if (err instanceof HTTPException) {
    // vd. JSON hỏng do zValidator
    const status = err.status === 400 || err.status === 404 || err.status === 413 || err.status === 415 ? err.status : 400
    const code = status === 404 ? 'not_found' : status === 413 ? 'payload_too_large' : status === 415 ? 'unsupported_media' : 'validation_failed'
    return c.json(errorBody(code, status === 400 ? 'Dữ liệu không hợp lệ' : err.message), status)
  }
  // Lỗi lạ: chỉ ghi tên lỗi, không ghi dữ liệu cá nhân
  console.error('internal_error', err.name, err.message)
  return c.json(errorBody('internal_error', 'Có lỗi xảy ra, vui lòng thử lại sau'), 500)
}

export const notFound = (c: Context) => c.json(errorBody('not_found', 'Không tìm thấy'), 404)

// Mọi route ghi (trừ upload) bắt buộc Content-Type: application/json (lớp phụ chống CSRF)
export async function requireJson(c: Context, next: () => Promise<void>) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const isUpload = c.req.method === 'POST' && c.req.path === '/api/admin/media'
    const type = c.req.header('content-type') ?? ''
    if (!isUpload && !/^application\/json\b/i.test(type)) {
      throw new AppError(415, 'unsupported_media', 'Yêu cầu phải có Content-Type: application/json')
    }
  }
  await next()
}
