import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'
import { now } from '../lib/time'
import { AppError } from './errors'

// Giới hạn tần suất bằng KV, cửa sổ cố định. Bộ đếm xấp xỉ (KV nhất quán cuối cùng).
export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local'

export async function checkRate(kv: KVNamespace, name: string, subject: string, limit: number, windowSec: number) {
  const t = now()
  const bucket = Math.floor(t / windowSec)
  const key = `rl:${name}:${subject}:${bucket}`
  const count = Number(await kv.get(key)) || 0
  if (count >= limit) {
    const retry = Math.max(1, (bucket + 1) * windowSec - t)
    throw new AppError(429, 'rate_limited', 'Bạn thao tác quá nhanh, vui lòng thử lại sau', undefined, {}, { 'Retry-After': String(retry) })
  }
  await kv.put(key, String(count + 1), { expirationTtl: Math.max(60, windowSec) })
}

// Giới hạn theo IP; với chủ thể khác (SĐT, user) gọi checkRate trực tiếp trong handler
export const rateLimit =
  (name: string, limit: number, windowSec: number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await checkRate(c.env.CART, name, clientIp(c), limit, windowSec)
    await next()
  }
