import { describe, expect, it } from 'vitest'
import { addItem, env, get, newCart, newPhone, post, quickOrder, registerUser, sidOf } from './helpers'
import { sha256Hex } from '../src/lib/password'

describe('POST /api/auth/register', () => {
  it('201, cookie HttpOnly SameSite=Lax, mật khẩu băm, token lưu dạng hash', async () => {
    const phone = '0912 345 678'
    const r = await post('/api/auth/register', { phone, password: 'matkhau-123', name: ' Nguyễn Văn An ', email: 'An@Example.com' })
    expect(r.status).toBe(201)
    expect(r.json.user).toMatchObject({ phone: '0912345678', name: 'Nguyễn Văn An', email: 'an@example.com', role: 'customer' })
    expect(r.json).toMatchObject({ linkedOrders: 0, mergedCartLines: 0 })
    expect(r.json.user.id).toMatch(/^[\w-]{21}$/)
    expect(r.text).not.toMatch(/password|pbkdf2/)
    const cookie = r.res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^sid=[\w-]{43};/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Max-Age=2592000/)
    expect(cookie).not.toMatch(/Secure/i) // http://localhost

    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE phone = ?').bind('0912345678').first<any>()
    expect(row.password_hash).toMatch(/^pbkdf2\$sha256\$\d+\$/)
    expect(row.password_hash).not.toContain('matkhau-123')

    // token gốc không có trong sessions, chỉ có hash của nó
    const token = sidOf(r.res).slice(4)
    const sessions = await env.DB.prepare('SELECT id FROM sessions').all<any>()
    expect(sessions.results.map((s) => s.id)).toEqual([await sha256Hex(token)])
    expect(JSON.stringify(sessions.results)).not.toContain(token)
  })

  it('thêm Secure khi yêu cầu là https', async () => {
    const { app } = await import('../src/index')
    const res = await app.request(
      'https://store.example.com/api/auth/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' },
        body: JSON.stringify({ phone: newPhone(), password: 'matkhau-123', name: 'Trần Bình' }),
      },
      env,
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('set-cookie')).toMatch(/Secure/)
  })

  it('trùng SĐT/email trả phone_taken/email_taken', async () => {
    await registerUser({ phone: '0912345678', email: 'a@example.com' })
    const p = await post('/api/auth/register', { phone: '+84 912 345 678', password: 'matkhau-123', name: 'Khác' })
    expect(p.status).toBe(409)
    expect(p.json.error.code).toBe('phone_taken')
    const e = await post('/api/auth/register', { phone: newPhone(), password: 'matkhau-123', name: 'Khác', email: 'A@EXAMPLE.com' })
    expect(e.status).toBe(409)
    expect(e.json.error.code).toBe('email_taken')
  })

  it('nhiều tài khoản không email được phép (NULL không vi phạm UNIQUE)', async () => {
    await registerUser()
    await registerUser()
    await registerUser({ email: '' as any })
  })

  it('SĐT/mật khẩu/tên/email sai định dạng trả validation_failed có fields', async () => {
    const r = await post('/api/auth/register', { phone: '12345', password: 'ngan', name: 'A', email: 'sai' })
    expect(r.status).toBe(400)
    expect(Object.keys(r.json.error.fields).sort()).toEqual(['email', 'name', 'password', 'phone'])
    expect((await post('/api/auth/register', { phone: newPhone(), password: 'x'.repeat(129), name: 'Trần Bình' })).status).toBe(400)
  })

  it('giới hạn register: lần thứ 6 trong 1 giờ trả 429', async () => {
    const ip = '192.0.2.50'
    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await post('/api/auth/register', { phone: newPhone(), password: 'matkhau-123', name: 'Trần Bình' }, { ip })).status)
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
  })
})

describe('POST /api/auth/login', () => {
  it('đăng nhập bằng SĐT và bằng email; sai mật khẩu và không có tài khoản cùng lỗi', async () => {
    const u = await registerUser({ phone: '0912345678', email: 'an@example.com', password: 'dung-mat-khau' })
    const byPhone = await post('/api/auth/login', { identifier: '0912 345 678', password: 'dung-mat-khau' })
    expect(byPhone.status).toBe(200)
    expect(byPhone.json.user.id).toBe(u.user.id)
    expect(sidOf(byPhone.res)).toMatch(/^sid=/)
    const byEmail = await post('/api/auth/login', { identifier: 'AN@example.com', password: 'dung-mat-khau' })
    expect(byEmail.status).toBe(200)

    const wrong = await post('/api/auth/login', { identifier: '0912345678', password: 'sai-mat-khau' })
    const none = await post('/api/auth/login', { identifier: '0999999999', password: 'sai-mat-khau' })
    const noneEmail = await post('/api/auth/login', { identifier: 'khong@co.com', password: 'sai-mat-khau' })
    const badPhone = await post('/api/auth/login', { identifier: 'abc', password: 'sai-mat-khau' })
    for (const r of [wrong, none, noneEmail, badPhone]) {
      expect(r.status).toBe(401)
      expect(r.json).toEqual(wrong.json)
    }
    expect(wrong.json.error.code).toBe('invalid_credentials')
    expect(wrong.res.headers.get('set-cookie')).toBeNull()
  })

  it('tài khoản bị khóa trả account_disabled (chỉ khi đúng mật khẩu)', async () => {
    const u = await registerUser({ phone: '0912345678', password: 'dung-mat-khau' })
    await env.DB.prepare('UPDATE users SET disabled = 1 WHERE id = ?').bind(u.user.id).run()
    const r = await post('/api/auth/login', { identifier: '0912345678', password: 'dung-mat-khau' })
    expect(r.status).toBe(403)
    expect(r.json.error.code).toBe('account_disabled')
    expect((await post('/api/auth/login', { identifier: '0912345678', password: 'sai' })).status).toBe(401)
  })

  it('giới hạn login: lần thứ 11 trong 15 phút bị 429', async () => {
    await registerUser({ phone: '0912345678' })
    const ip = '192.0.2.99'
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await post('/api/auth/login', { identifier: '0912345678', password: 'sai-mat-khau' }, { ip })).status)
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('giới hạn login-ip: dò nhiều tài khoản từ một IP bị chặn ở lần thứ 31', async () => {
    const ip = '192.0.2.77'
    const statuses = []
    for (let i = 0; i < 31; i++) statuses.push((await post('/api/auth/login', { identifier: `09${String(30000000 + i)}`, password: 'sai-mat-khau' }, { ip })).status)
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true)
    expect(statuses[30]).toBe(429)
  })

  it('đăng nhập gộp giỏ khách vào giỏ tài khoản (cộng dồn, tối đa 99) và xóa KV', async () => {
    const u = await registerUser({ phone: '0912345678', password: 'dung-mat-khau' })
    await addItem('x', 1, undefined, 60, { cookie: u.cookie }) // giỏ tài khoản đã có 60 xe 1
    const guest = newCart()
    await addItem(guest, 1, undefined, 50)
    await addItem(guest, 2, undefined, 1)
    const r = await post('/api/auth/login', { identifier: '0912345678', password: 'dung-mat-khau' }, { cart: guest })
    expect(r.json.mergedCartLines).toBe(2)
    const cart = (await get('/api/cart', { cookie: sidOf(r.res) })).json
    expect(cart.items).toHaveLength(2)
    expect(cart.items.find((i: any) => i.product.id === 1).qty).toBe(99)
    expect(await env.CART.get(`cart:${guest}`)).toBeNull()
  })

  it('đăng ký cũng gộp giỏ khách', async () => {
    const guest = newCart()
    await addItem(guest, 1, undefined, 2)
    await addItem(guest, 2, undefined, 1)
    const u = await registerUser({}, { cart: guest })
    expect(u.body.mergedCartLines).toBe(2)
    expect((await get('/api/cart', { cookie: u.cookie })).json.count).toBe(3)
    expect(await env.CART.get(`cart:${guest}`)).toBeNull()
  })
})

describe('phiên đăng nhập', () => {
  it('me trả user null khi chưa đăng nhập, trả người dùng khi đã đăng nhập', async () => {
    expect((await get('/api/auth/me')).json).toEqual({ user: null })
    const u = await registerUser({ name: 'Trần Bình' })
    const me = await get('/api/auth/me', { cookie: u.cookie })
    expect(me.json.user).toMatchObject({ id: u.user.id, name: 'Trần Bình', role: 'customer' })
    expect(me.res.headers.get('cache-control')).toBe('no-store')
    expect((await get('/api/auth/me', { cookie: 'sid=khong-hop-le' })).json).toEqual({ user: null })
  })

  it('phiên hết hạn coi như chưa đăng nhập; tài khoản bị khóa cũng vậy', async () => {
    const u = await registerUser()
    await env.DB.prepare('UPDATE sessions SET expires_at = 1').run()
    expect((await get('/api/auth/me', { cookie: u.cookie })).json.user).toBeNull()
    const v = await registerUser()
    await env.DB.prepare('UPDATE users SET disabled = 1 WHERE id = ?').bind(v.user.id).run()
    expect((await get('/api/auth/me', { cookie: v.cookie })).json.user).toBeNull()
  })

  it('gia hạn trượt khi quá 1 ngày, không ghi lại khi còn mới', async () => {
    const u = await registerUser()
    const fresh = await get('/api/auth/me', { cookie: u.cookie })
    expect(fresh.res.headers.get('set-cookie')).toBeNull()

    const old = Math.floor(Date.now() / 1000) - 2 * 86400
    await env.DB.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ?').bind(old, old + 28 * 86400).run()
    const r = await get('/api/auth/me', { cookie: u.cookie })
    expect(r.json.user).not.toBeNull()
    expect(r.res.headers.get('set-cookie')).toMatch(/^sid=/)
    const s = await env.DB.prepare('SELECT last_used_at, expires_at FROM sessions').first<any>()
    expect(s.last_used_at).toBeGreaterThan(old + 86400)
    expect(s.expires_at - s.last_used_at).toBe(30 * 86400)
  })

  it('đăng xuất xóa phiên, token cũ không dùng lại được', async () => {
    const u = await registerUser()
    const out = await post('/api/auth/logout', undefined, { cookie: u.cookie })
    expect(out.status).toBe(204)
    expect(out.res.headers.get('set-cookie')).toMatch(/sid=;/)
    expect((await get('/api/auth/me', { cookie: u.cookie })).json.user).toBeNull()
    expect((await post('/api/auth/logout', undefined, { cookie: u.cookie })).status).toBe(401)
  })
})

describe('gắn đơn theo SĐT', () => {
  it('đăng ký bằng SĐT A chỉ gắn đơn của A, không gắn đơn của B', async () => {
    const a1 = await quickOrder({ phone: '0912345678' })
    const a2 = await quickOrder({ phone: '091 234 5678' })
    const b1 = await quickOrder({ phone: '0987654321' })
    const u = await registerUser({ phone: '0912345678' })
    expect(u.body.linkedOrders).toBe(2)
    const rows = await env.DB.prepare('SELECT code, user_id FROM orders ORDER BY created_at, rowid').all<any>()
    const byCode = Object.fromEntries(rows.results.map((r) => [r.code, r.user_id]))
    expect(byCode[a1.code]).toBe(u.user.id)
    expect(byCode[a2.code]).toBe(u.user.id)
    expect(byCode[b1.code]).toBeNull()

    // tài khoản thấy đơn của A đầy đủ, không che
    const list = await get('/api/account/orders', { cookie: u.cookie })
    expect(list.json.total).toBe(2)
    const detail = await get(`/api/account/orders/${a1.code}`, { cookie: u.cookie })
    expect(detail.json.order.contact).toMatchObject({ name: 'Nguyễn Văn An', phone: '0912345678', email: 'an@example.com' })
  })

  it('đơn đã gắn cho tài khoản khác không bị gắn lại', async () => {
    const u1 = await registerUser({ phone: '0912345678' })
    const o = await quickOrder({ phone: '0912345678' }) // gắn ngay cho u1
    const row = await env.DB.prepare('SELECT user_id FROM orders WHERE code = ?').bind(o.code).first<any>()
    expect(row.user_id).toBe(u1.user.id)
  })
})
