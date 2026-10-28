import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import { now } from '../lib/time'
import { lookupSession, renewSession, RENEW_AFTER, SESSION_TTL } from '../services/auth'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

// Không thêm Secure khi chạy http://localhost (Safari từ chối cookie Secure trên http)
export const setSessionCookie = (c: Context, token: string) =>
  setCookie(c, 'sid', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL,
    secure: new URL(c.req.url).protocol === 'https:',
  })

export const clearSessionCookie = (c: Context) => deleteCookie(c, 'sid', { path: '/' })

// Nạp user vào context nếu có cookie hợp lệ (không bắt buộc đăng nhập)
export const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null)
  c.set('sessionId', null)
  const token = getCookie(c, 'sid')
  if (token && TOKEN_RE.test(token)) {
    const found = await lookupSession(c.env.DB, token)
    if (found) {
      c.set('user', found.user)
      c.set('sessionId', found.sessionId)
      // Gia hạn trượt, không ghi D1 ở mọi yêu cầu
      if (now() - found.lastUsedAt > RENEW_AFTER) {
        await renewSession(c.env.DB, found.sessionId)
        setSessionCookie(c, token)
      }
    }
  }
  await next()
}
