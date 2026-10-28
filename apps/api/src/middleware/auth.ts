import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'
import { AppError } from './errors'

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new AppError(401, 'unauthorized', 'Bạn cần đăng nhập')
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user
  if (!user) throw new AppError(401, 'unauthorized', 'Bạn cần đăng nhập')
  if (user.role !== 'admin') throw new AppError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này')
  await next()
}

// Phản hồi cá nhân không được cache
export const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
}
