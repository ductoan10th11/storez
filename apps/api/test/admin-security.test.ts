import { describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { adminCookie, call, registerUser } from './helpers'

// Tự quét bảng route để route admin mới thêm vào cũng bị kiểm tra
const adminRoutes = app.routes
  .filter((r) => r.path.startsWith('/api/admin') && r.method !== 'ALL')
  .map((r) => ({ method: r.method, path: r.path.replace(/:[A-Za-z]+/g, 'x') }))

describe('route admin', () => {
  it('đã quét được đủ các route', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(28)
    expect(adminRoutes.map((r) => r.path)).toEqual(expect.arrayContaining(['/api/admin/media', '/api/admin/orders', '/api/admin/users', '/api/admin/stats']))
  })

  it('401 khi chưa đăng nhập, 403 khi là khách thường, và qua được auth khi là admin', async () => {
    const customer = await registerUser()
    const admin = await adminCookie()
    for (const { method, path } of adminRoutes) {
      const label = `${method} ${path}`
      const body = method === 'GET' || method === 'DELETE' ? undefined : {}
      const anon = await call(method, path, body)
      expect(anon.status, `${label} (chưa đăng nhập)`).toBe(401)
      expect(anon.json.error.code).toBe('unauthorized')
      const cust = await call(method, path, body, { cookie: customer.cookie })
      expect(cust.status, `${label} (khách thường)`).toBe(403)
      expect(cust.json.error.code).toBe('forbidden')
      const adm = await call(method, path, body, admin.opts)
      expect([401, 403], `${label} (admin)`).not.toContain(adm.status)
    }
  })

  it('khách bị khóa hoặc bị hạ quyền mất quyền admin ngay', async () => {
    const admin = await adminCookie()
    expect((await call('GET', '/api/admin/stats', undefined, admin.opts)).status).toBe(200)
    const { env } = await import('./helpers')
    await env.DB.prepare(`UPDATE users SET role = 'customer' WHERE id = ?`).bind(admin.user.id).run()
    expect((await call('GET', '/api/admin/stats', undefined, admin.opts)).status).toBe(403)
  })
})
