import { describe, expect, it } from 'vitest'
import { env, get, patch, post, quickOrder, registerUser, setStock, sidOf, stockOf } from './helpers'

describe('xác thực bắt buộc', () => {
  it('mọi route /api/account/* trả 401 khi chưa đăng nhập', async () => {
    for (const [m, p] of [['GET', '/api/account/orders'], ['GET', '/api/account/orders/SS-AAAAA-AAAAA'], ['POST', '/api/account/orders/SS-AAAAA-AAAAA/cancel'], ['PATCH', '/api/account'], ['POST', '/api/account/password']] as const) {
      const r = await (m === 'GET' ? get(p) : m === 'PATCH' ? patch(p, {}) : post(p, {}))
      expect(r.status, `${m} ${p}`).toBe(401)
      expect(r.json.error.code).toBe('unauthorized')
    }
  })
})

describe('hồ sơ và mật khẩu', () => {
  it('PATCH /api/account đổi tên/email; trùng email trả email_taken; SĐT không đổi được', async () => {
    const a = await registerUser({ email: 'a@example.com' })
    const b = await registerUser({ email: 'b@example.com' })
    const r = await patch('/api/account', { name: 'Tên Mới', email: 'NEW@example.com', phone: '0999999999' }, { cookie: a.cookie })
    expect(r.status).toBe(200)
    expect(r.json.user).toMatchObject({ name: 'Tên Mới', email: 'new@example.com', phone: a.phone })
    const dup = await patch('/api/account', { email: 'b@example.com' }, { cookie: a.cookie })
    expect(dup.status).toBe(409)
    expect(dup.json.error.code).toBe('email_taken')
    const clear = await patch('/api/account', { email: null }, { cookie: b.cookie })
    expect(clear.json.user.email).toBeNull()
    expect((await patch('/api/account', { name: 'A' }, { cookie: a.cookie })).status).toBe(400)
  })

  it('đổi mật khẩu: sai mật khẩu hiện tại bị từ chối; thành công thì phiên khác bị hủy, phiên hiện tại giữ', async () => {
    const u = await registerUser({ phone: '0912345678', password: 'mat-khau-cu-1' })
    const other = await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cu-1' })
    const otherCookie = sidOf(other.res)

    const bad = await post('/api/account/password', { currentPassword: 'sai-roi-nhe', newPassword: 'mat-khau-moi-2' }, { cookie: u.cookie })
    expect(bad.status).toBe(401)
    expect(bad.json.error.code).toBe('invalid_credentials')
    expect((await get('/api/auth/me', { cookie: otherCookie })).json.user).not.toBeNull()

    const short = await post('/api/account/password', { currentPassword: 'mat-khau-cu-1', newPassword: 'ngan' }, { cookie: u.cookie })
    expect(short.status).toBe(400)

    const ok = await post('/api/account/password', { currentPassword: 'mat-khau-cu-1', newPassword: 'mat-khau-moi-2' }, { cookie: u.cookie })
    expect(ok.status).toBe(204)
    expect((await get('/api/auth/me', { cookie: u.cookie })).json.user).not.toBeNull()
    expect((await get('/api/auth/me', { cookie: otherCookie })).json.user).toBeNull()
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-cu-1' })).status).toBe(401)
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'mat-khau-moi-2' })).status).toBe(200)
  })
})

describe('đơn của tôi', () => {
  it('danh sách phân trang, mới nhất trước, kèm tóm tắt xe', async () => {
    const u = await registerUser({ phone: '0912345678' })
    const codes: string[] = []
    for (let i = 0; i < 3; i++) codes.push((await quickOrder({ cookie: u.cookie, phone: '0912345678', productId: i + 1 })).code)
    const list = await get('/api/account/orders?pageSize=2', { cookie: u.cookie })
    expect(list.json).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(list.json.items.map((o: any) => o.code)).toEqual([codes[2], codes[1]])
    expect(list.json.items[0]).toMatchObject({ status: 'pending', paymentStatus: 'unpaid' })
    expect(list.json.items[0].items[0]).toHaveProperty('name')
    const p2 = await get('/api/account/orders?pageSize=2&page=2', { cookie: u.cookie })
    expect(p2.json.items.map((o: any) => o.code)).toEqual([codes[0]])
  })

  it('người dùng không xem được đơn của người khác: 404 order_not_found', async () => {
    const a = await registerUser({ phone: '0912345678' })
    const b = await registerUser({ phone: '0987654321' })
    const o = await quickOrder({ cookie: a.cookie, phone: '0912345678' })
    expect((await get(`/api/account/orders/${o.code}`, { cookie: a.cookie })).status).toBe(200)
    const r = await get(`/api/account/orders/${o.code}`, { cookie: b.cookie })
    expect(r.status).toBe(404)
    expect(r.json.error.code).toBe('order_not_found')
    // hủy đơn người khác bị từ chối
    const c = await post(`/api/account/orders/${o.code}/cancel`, {}, { cookie: b.cookie })
    expect(c.status).toBe(404)
    expect((await get(`/api/account/orders/${o.code}`, { cookie: a.cookie })).json.order.status).toBe('pending')
    // đơn khách vãng lai (chưa gắn ai) cũng là 404
    const guest = await quickOrder({ phone: '0333444555' })
    expect((await get(`/api/account/orders/${guest.code}`, { cookie: a.cookie })).status).toBe(404)
  })

  it('hủy đơn: chủ đơn hủy được khi pending, kho được trả, tra cứu hiện đã hủy', async () => {
    await setStock(1, 5)
    const u = await registerUser({ phone: '0912345678' })
    const o = await quickOrder({ cookie: u.cookie, phone: '0912345678', qty: 2 })
    expect(await stockOf(1)).toBe(3)
    const r = await post(`/api/account/orders/${o.code}/cancel`, { reason: ' Đổi ý ' }, { cookie: u.cookie })
    expect(r.status).toBe(200)
    expect(r.json.order).toMatchObject({ status: 'cancelled', canCancel: false })
    expect(r.json.order.events.map((e: any) => e.status)).toEqual(['pending', 'cancelled'])
    expect(r.json.order.events[1].note).toBe('Đổi ý')
    expect(await stockOf(1)).toBe(5)
    expect((await get(`/api/track/${o.code}`)).json.order.status).toBe('cancelled')
  })

  it('hủy không cần body; hủy được khi confirmed; không hủy được khi ready/completed', async () => {
    const u = await registerUser({ phone: '0912345678' })
    const mk = async (status: string) => {
      const o = await quickOrder({ cookie: u.cookie, phone: '0912345678' })
      await env.DB.prepare('UPDATE orders SET status = ? WHERE code = ?').bind(status, o.code).run()
      return o.code as string
    }
    const confirmed = await mk('confirmed')
    expect((await post(`/api/account/orders/${confirmed}/cancel`, undefined, { cookie: u.cookie })).status).toBe(200)
    for (const s of ['ready', 'completed', 'cancelled']) {
      const code = await mk(s)
      const r = await post(`/api/account/orders/${code}/cancel`, {}, { cookie: u.cookie })
      expect(r.status, s).toBe(409)
      expect(r.json.error.code).toBe('invalid_transition')
    }
  })

  it('hủy hai lần đồng thời chỉ trả kho một lần và chỉ có một sự kiện', async () => {
    await setStock(1, 5)
    const u = await registerUser({ phone: '0912345678' })
    const o = await quickOrder({ cookie: u.cookie, phone: '0912345678', qty: 2 })
    const rs = await Promise.all([
      post(`/api/account/orders/${o.code}/cancel`, {}, { cookie: u.cookie }),
      post(`/api/account/orders/${o.code}/cancel`, {}, { cookie: u.cookie }),
    ])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
    expect(rs.find((r) => r.status === 409)!.json.error.code).toBe('invalid_transition')
    expect(await stockOf(1)).toBe(5)
    const events = await env.DB.prepare(`SELECT COUNT(*) AS n FROM order_events WHERE status = 'cancelled'`).first<any>()
    expect(events.n).toBe(1)
  })

  it('lý do hủy quá dài bị từ chối', async () => {
    const u = await registerUser({ phone: '0912345678' })
    const o = await quickOrder({ cookie: u.cookie, phone: '0912345678' })
    const r = await post(`/api/account/orders/${o.code}/cancel`, { reason: 'x'.repeat(201) }, { cookie: u.cookie })
    expect(r.status).toBe(400)
    expect(r.json.error.fields).toHaveProperty('reason')
  })
})

