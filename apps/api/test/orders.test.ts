import { describe, expect, it } from 'vitest'
import { addItem, contact, count, env, get, newCart, placeOrder, post, quickOrder, registerUser, setStock, slot, stockOf } from './helpers'

describe('POST /api/orders', () => {
  it('đặt thành công: orders, order_items (bản chụp), order_events, kho trừ, giỏ rỗng, mã đúng định dạng', async () => {
    await setStock(1, 5)
    const cart = newCart()
    await addItem(cart, 1, { mau: 'den', ban: 'cao-cap' }, 2)
    const at = await slot()
    const r = await placeOrder(cart, { contact: contact({ address: ' 12 Lê Lợi ' }), pickupAt: at, note: ' Đến sau 9 giờ ' })
    expect(r.status).toBe(201)
    const o = r.json.order
    expect(o.code).toMatch(/^SS-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(o).toMatchObject({ status: 'pending', paymentStatus: 'unpaid', pickupAt: at, paidTotal: 0, canCancel: true, note: 'Đến sau 9 giờ' })
    const unit = 32900000 + 3000000
    expect(o.total).toBe(unit * 2)
    expect(o.remaining).toBe(unit * 2)
    // người vừa đặt thấy đầy đủ thông tin, SĐT/email đã chuẩn hóa
    expect(o.contact).toEqual({ name: 'Nguyễn Văn An', phone: '0336436536', email: 'an@example.com', address: '12 Lê Lợi' })
    expect(o.items).toHaveLength(1)
    expect(o.items[0]).toMatchObject({
      name: 'Phố Rider 125', image: '/vehicles/xe-may-pho-rider--den.svg', unitPrice: unit, qty: 2, productId: 1,
    })
    expect(o.items[0].options.map((x: any) => x.choice)).toEqual(['Đen', 'Cao cấp (đèn LED, khóa thông minh)', 'Không'])
    expect(o.events).toHaveLength(1)
    expect(o.events[0]).toMatchObject({ status: 'pending', note: null })
    expect(o.holdExpiresAt).toBeGreaterThan(o.createdAt + 47 * 3600)

    const row = await env.DB.prepare('SELECT subtotal, total, hold_expires_at, created_at FROM orders WHERE code = ?').bind(o.code).first<any>()
    expect(row.total).toBe(row.subtotal)
    expect(row.hold_expires_at - row.created_at).toBe(48 * 3600)
    expect(await stockOf(1)).toBe(3)
    expect((await get('/api/cart', { cart })).json.items).toEqual([])
    expect(r.res.headers.get('cache-control')).toBe('no-store')
  })

  it('không nhận giá từ client: price/total gửi lên bị bỏ qua', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    const r = await post(
      '/api/orders',
      { contact: contact(), pickupAt: await slot(), total: 1, subtotal: 1, price: 1, items: [{ productId: 1, price: 1, qty: 1 }], paidTotal: 999 },
      { cart },
    )
    expect(r.status).toBe(201)
    expect(r.json.order.total).toBe(32900000)
    expect(r.json.order.paidTotal).toBe(0)
  })

  it('hết kho làm hỏng cả batch: không có orders/order_items/order_events, kho không đổi', async () => {
    await setStock(1, 1)
    await setStock(2, 10)
    const cart = newCart()
    await addItem(cart, 2, undefined, 1)
    await addItem(cart, 1, undefined, 1)
    // kho xe 1 bị người khác lấy mất sau khi khách đã thêm giỏ nhưng trước khi bước kiểm tra sớm
    await setStock(1, 0)
    const r = await placeOrder(cart)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'out_of_stock', productId: 1, available: 0 })
    expect(await count('orders')).toBe(0)
    expect(await count('order_items')).toBe(0)
    expect(await count('order_events')).toBe(0)
    expect(await stockOf(2)).toBe(10)
    expect(await stockOf(1)).toBe(0)
  })

  it('vượt kho thì từ chối cả đơn, không tạo đơn một phần', async () => {
    await setStock(1, 2)
    const cart = newCart()
    await addItem(cart, 1, undefined, 3)
    const r = await placeOrder(cart)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'out_of_stock', productId: 1, available: 2 })
    expect(await stockOf(1)).toBe(2)
    expect(await count('orders')).toBe(0)
  })

  it('cùng xe ở nhiều dòng giỏ được cộng khi so với kho', async () => {
    await setStock(1, 3)
    const cart = newCart()
    await addItem(cart, 1, { mau: 'cam' }, 2)
    await addItem(cart, 1, { mau: 'den' }, 2)
    const r = await placeOrder(cart)
    expect(r.json.error).toMatchObject({ code: 'out_of_stock', productId: 1, available: 3 })
  })

  it('chốt chặn thật là CHECK: kho bị đổi sau bước kiểm tra sớm vẫn rollback cả batch', async () => {
    // Mô phỏng đua: kiểm tra sớm thấy đủ kho, nhưng UPDATE trừ kho vi phạm CHECK. Ép bằng 2 yêu cầu song song.
    await setStock(1, 1)
    await setStock(2, 5)
    const mk = async () => {
      const c = newCart()
      await addItem(c, 2)
      await addItem(c, 1)
      return c
    }
    const [a, b] = [await mk(), await mk()]
    const at = await slot()
    const rs = await Promise.all([placeOrder(a, { pickupAt: at }), placeOrder(b, { pickupAt: at })])
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409])
    const loser = rs.find((r) => r.status === 409)!
    expect(loser.json.error.code).toBe('out_of_stock')
    expect(await stockOf(1)).toBe(0)
    // thua cuộc thì xe 2 cũng không bị trừ (rollback cả batch)
    expect(await stockOf(2)).toBe(4)
    expect(await count('orders')).toBe(1)
    expect(await count('order_items')).toBe(2)
  })

  it('đồng thời: hai yêu cầu đặt chiếc xe cuối cùng thì đúng một thành công', async () => {
    await setStock(3, 1)
    const [a, b] = [newCart(), newCart()]
    await addItem(a, 3)
    await addItem(b, 3)
    const at = await slot()
    const rs = await Promise.all([placeOrder(a, { pickupAt: at }), placeOrder(b, { pickupAt: at })])
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409])
    expect(rs.find((r) => r.status === 409)!.json.error.code).toBe('out_of_stock')
    expect(await stockOf(3)).toBe(0)
    expect(await count('orders')).toBe(1)
  })

  it('xe làm theo đơn (stock NULL): không trừ kho, đặt được số lượng lớn', async () => {
    const cart = newCart()
    await addItem(cart, 1, undefined, 99)
    const r = await placeOrder(cart)
    expect(r.status).toBe(201)
    expect(r.json.order.items[0].qty).toBe(99)
    expect(await stockOf(1)).toBeNull()
  })

  it('cart_empty', async () => {
    const r = await placeOrder(newCart())
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('cart_empty')
  })

  it('product_unavailable khi xe bị ẩn sau khi vào giỏ', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    const r = await placeOrder(cart)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'product_unavailable', productId: 1 })
  })

  it('product_unavailable khi dòng giỏ trỏ tới xe không còn tồn tại', async () => {
    const cart = newCart()
    await env.CART.put(`cart:${cart}`, JSON.stringify([{ productId: 9999, qty: 1 }]))
    expect((await placeOrder(cart)).json.error.code).toBe('product_unavailable')
  })

  it('option_invalid khi lựa chọn trong giỏ không còn tồn tại', async () => {
    const cart = newCart()
    await addItem(cart, 1, { mau: 'den' })
    await env.DB.prepare(`DELETE FROM option_choices WHERE "key" = 'den' AND group_id = 1`).run()
    const r = await placeOrder(cart)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'option_invalid', productId: 1 })
    expect(await count('orders')).toBe(0)
    // giỏ còn nguyên để khách làm mới
    expect((await get('/api/cart', { cart })).json.items).toHaveLength(1)
  })

  it('validation_failed có fields cho từng trường', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    const r = await post(
      '/api/orders',
      { contact: { name: 'A', phone: '123', email: 'khong-phai-email', address: 'x'.repeat(201) }, note: 'x'.repeat(501), pickupAt: 'mai' },
      { cart },
    )
    expect(r.status).toBe(400)
    expect(Object.keys(r.json.error.fields)).toEqual(
      expect.arrayContaining(['contact.name', 'contact.phone', 'contact.email', 'contact.address', 'note', 'pickupAt']),
    )
    expect(await count('orders')).toBe(0)
  })

  it('email bắt buộc, địa chỉ không bắt buộc', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    const noEmail = await post('/api/orders', { contact: { name: 'Nguyễn An', phone: '0336436536' }, pickupAt: await slot() }, { cart })
    expect(noEmail.status).toBe(400)
    expect(noEmail.json.error.fields).toHaveProperty('contact.email')
    const ok = await placeOrder(cart, { contact: { ...contact(), address: '' } })
    expect(ok.status).toBe(201)
    expect(ok.json.order.contact.address).toBeNull()
  })

  it('bản chụp đơn bất biến: đổi giá và tên sản phẩm sau khi đặt, đơn cũ không đổi', async () => {
    const o = await quickOrder({ productId: 1 })
    await env.DB.prepare(`UPDATE products SET base_price = 1, name = 'Đã đổi tên' WHERE id = 1`).run()
    await env.DB.prepare(`UPDATE option_choices SET price_delta = 99 WHERE group_id = 2 AND "key" = 'cao-cap'`).run()
    const t = await get(`/api/track/${o.code}`)
    expect(t.json.order.total).toBe(32900000)
    expect(t.json.order.items[0]).toMatchObject({ name: 'Phố Rider 125', unitPrice: 32900000 })
  })

  it('xóa sản phẩm: đơn cũ giữ bản chụp, product_id thành NULL', async () => {
    const o = await quickOrder({ productId: 1 })
    await env.DB.prepare('DELETE FROM products WHERE id = 1').run()
    const row = await env.DB.prepare('SELECT product_id, name FROM order_items').first<any>()
    expect(row).toEqual({ product_id: null, name: 'Phố Rider 125' })
    expect((await get(`/api/track/${o.code}`)).json.order.items[0].name).toBe('Phố Rider 125')
  })

  it('đơn đặt bằng SĐT đã có tài khoản (chưa đăng nhập) thì user_id được gắn', async () => {
    const u = await registerUser({ phone: '0912345678' })
    const o = await quickOrder({ phone: '0912 345 678' })
    const row = await env.DB.prepare('SELECT user_id FROM orders WHERE code = ?').bind(o.code).first<any>()
    expect(row.user_id).toBe(u.user.id)
  })

  it('đơn đặt khi đã đăng nhập gắn user_id, dùng giỏ tài khoản và làm rỗng giỏ đó', async () => {
    const u = await registerUser({ phone: '0912345678' })
    await addItem('x', 1, undefined, 1, { cookie: u.cookie })
    const r = await placeOrder('khong-dung-den', { contact: contact({ phone: '0333444555' }) }, { cookie: u.cookie })
    expect(r.status).toBe(201)
    const row = await env.DB.prepare('SELECT user_id FROM orders WHERE code = ?').bind(r.json.order.code).first<any>()
    expect(row.user_id).toBe(u.user.id) // theo người đăng nhập, không theo SĐT trong form
    expect((await get('/api/cart', { cookie: u.cookie })).json.items).toEqual([])
  })

  it('đơn của khách chưa có tài khoản có user_id NULL', async () => {
    const o = await quickOrder({ phone: '0336436536' })
    const row = await env.DB.prepare('SELECT user_id FROM orders WHERE code = ?').bind(o.code).first<any>()
    expect(row.user_id).toBeNull()
  })
})

describe('giới hạn tần suất đặt hàng', () => {
  it('order-create: vượt 5 đơn/giờ từ một IP trả 429 kèm Retry-After', async () => {
    const ip = '203.0.113.9'
    const at = await slot()
    const results = []
    for (let i = 0; i < 6; i++) {
      const cart = newCart()
      await addItem(cart, 1)
      results.push(await placeOrder(cart, { contact: contact({ phone: `09123456${10 + i}` }), pickupAt: at }, { ip }))
    }
    expect(results.slice(0, 5).map((r) => r.status)).toEqual([201, 201, 201, 201, 201])
    expect(results[5].status).toBe(429)
    expect(results[5].json.error.code).toBe('rate_limited')
    expect(Number(results[5].res.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('order-phone: vượt 5 đơn/24 giờ cùng một SĐT trả 429', async () => {
    const at = await slot()
    const statuses = []
    for (let i = 0; i < 6; i++) {
      const cart = newCart()
      await addItem(cart, 1)
      statuses.push((await placeOrder(cart, { contact: contact({ phone: '0912345678' }), pickupAt: at })).status)
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
  })
})
