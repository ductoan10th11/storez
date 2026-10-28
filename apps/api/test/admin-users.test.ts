import { describe, expect, it } from 'vitest'
import { adminCookie, count, env, get, patch, post, quickOrder, registerUser } from './helpers'

describe('quản lý người dùng', () => {
  it('danh sách có tìm kiếm, lọc vai trò, orderCount, phân trang', async () => {
    const admin = await adminCookie()
    const a = await registerUser({ phone: '0912345678', name: 'Lê Văn Cường', email: 'cuong@example.com' })
    await registerUser({ phone: '0987654321', name: 'Phạm Thu Hà' })
    await quickOrder({ phone: '0912345678' })

    const all = await get('/api/admin/users', admin.opts)
    expect(all.json).toMatchObject({ total: 3, page: 1, pageSize: 20 })
    const row = all.json.items.find((u: any) => u.id === a.user.id)
    expect(row).toMatchObject({ phone: '0912345678', name: 'Lê Văn Cường', email: 'cuong@example.com', role: 'customer', disabled: false })
    expect(row.createdAt).toBeGreaterThan(0)
    expect(row).not.toHaveProperty('password_hash')
    expect(all.text).not.toMatch(/pbkdf2|password/)
    // quickOrder đặt sau khi tài khoản đã có nên đơn được gắn vào tài khoản
    expect(row.orderCount).toBe(1)

    expect((await get('/api/admin/users?q=0987', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/users?q=' + encodeURIComponent('Cường'), admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/users?q=CUONG@example', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/users?role=admin', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/users?pageSize=1&page=2', admin.opts)).json.items).toHaveLength(1)
  })

  it('khóa tài khoản hủy mọi phiên; mở khóa đăng nhập lại được', async () => {
    const admin = await adminCookie()
    const u = await registerUser({ phone: '0912345678', password: 'mat-khau-cua-toi' })
    const second = await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cua-toi' })
    expect(await count('sessions')).toBe(3)

    const r = await patch(`/api/admin/users/${u.user.id}`, { disabled: true }, admin.opts)
    expect(r.json.user.disabled).toBe(true)
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').bind(u.user.id).first<any>()
    expect(left.n).toBe(0)
    expect((await get('/api/auth/me', { cookie: u.cookie })).json.user).toBeNull()
    expect(second.status).toBe(200)
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cua-toi' })).json.error.code).toBe('account_disabled')

    await patch(`/api/admin/users/${u.user.id}`, { disabled: false }, admin.opts)
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cua-toi' })).status).toBe(200)
  })

  it('đổi vai trò; hạ quyền hủy phiên', async () => {
    const admin = await adminCookie()
    const u = await registerUser()
    expect((await patch(`/api/admin/users/${u.user.id}`, { role: 'admin', name: 'Tên Mới' }, admin.opts)).json.user).toMatchObject({ role: 'admin', name: 'Tên Mới' })
    expect((await get('/api/admin/stats', { cookie: u.cookie })).status).toBe(200)
    await patch(`/api/admin/users/${u.user.id}`, { role: 'customer' }, admin.opts)
    expect((await get('/api/admin/stats', { cookie: u.cookie })).status).toBe(401) // phiên đã bị hủy
  })

  it('admin không tự khóa hoặc tự hạ quyền mình (self_action)', async () => {
    const admin = await adminCookie()
    for (const body of [{ disabled: true }, { role: 'customer' }]) {
      const r = await patch(`/api/admin/users/${admin.user.id}`, body, admin.opts)
      expect(r.status).toBe(409)
      expect(r.json.error.code).toBe('self_action')
    }
    expect((await patch(`/api/admin/users/${admin.user.id}`, { name: 'Vẫn đổi tên được' }, admin.opts)).status).toBe(200)
    expect((await get('/api/admin/stats', admin.opts)).status).toBe(200)
  })

  it('người dùng không tồn tại: 404; body sai: 400', async () => {
    const admin = await adminCookie()
    expect((await patch('/api/admin/users/khong-co', { disabled: true }, admin.opts)).status).toBe(404)
    expect((await patch(`/api/admin/users/${admin.user.id}`, { role: 'sieu-nhan' }, admin.opts)).status).toBe(400)
  })

  it('đặt lại mật khẩu: hủy mọi phiên, mật khẩu cũ hết hiệu lực, mật khẩu mới dùng được', async () => {
    const admin = await adminCookie()
    const u = await registerUser({ phone: '0912345678', password: 'mat-khau-cu-123' })
    const short = await post(`/api/admin/users/${u.user.id}/reset-password`, { newPassword: 'ngan' }, admin.opts)
    expect(short.status).toBe(400)
    const r = await post(`/api/admin/users/${u.user.id}/reset-password`, { newPassword: 'mat-khau-moi-123' }, admin.opts)
    expect(r.status).toBe(204)
    expect((await get('/api/auth/me', { cookie: u.cookie })).json.user).toBeNull()
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cu-123' })).status).toBe(401)
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-moi-123' })).status).toBe(200)
    expect((await post('/api/admin/users/khong-co/reset-password', { newPassword: 'mat-khau-moi-123' }, admin.opts)).status).toBe(404)
  })
})

