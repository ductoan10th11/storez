import { describe, expect, it } from 'vitest'
import { addItem, contact, env, get, newCart, placeOrder, quickOrder, slot } from './helpers'

describe('GET /api/track/:code', () => {
  it('trả dữ liệu đã che đúng quy tắc và không chứa dữ liệu nhạy cảm', async () => {
    const cart = newCart()
    await addItem(cart, 1, { mau: 'den' }, 1)
    const placed = await placeOrder(
      cart,
      { contact: contact({ name: 'Nguyễn Văn An', phone: '0336436536', email: 'hdtoan.dev@gmail.com', address: '36 Z115 Thái Nguyên' }), note: 'Gọi trước khi giao nhé', pickupAt: await slot() },
    )
    const code = placed.json.order.code as string
    await env.DB.prepare(`UPDATE orders SET internal_note = 'khách khó tính' WHERE code = ?`).bind(code).run()

    const r = await get(`/api/track/${code}`)
    expect(r.status).toBe(200)
    expect(r.res.headers.get('cache-control')).toBe('no-store')
    const o = r.json.order
    expect(o.contact).toEqual({ name: 'N**** V** A*', phone: '033****536', email: 'h***@g***.com' })
    expect(o).toMatchObject({ code, status: 'pending', paymentStatus: 'unpaid', canCancel: false, paidTotal: 0 })
    expect(o.items[0]).toMatchObject({ name: 'Phố Rider 125', qty: 1 })
    expect(o.items[0]).not.toHaveProperty('productId')
    expect(o.events).toHaveLength(1)

    // Không chứa họ tên, SĐT, email đầy đủ, địa chỉ, ghi chú, id
    for (const secret of ['Nguyễn Văn An', '0336436536', 'hdtoan.dev@gmail.com', '36 Z115', 'Gọi trước', 'khó tính', 'internal', 'productId', 'userId', 'user_id', 'address']) {
      expect(r.text, secret).not.toContain(secret)
    }
  })

  it('chấp nhận mã nhập thường, có dấu cách, gạch, nhầm O/0', async () => {
    const o = await quickOrder()
    const variants = [o.code.toLowerCase(), o.code.replace(/-/g, ' '), o.code.replace(/-/g, '').toLowerCase(), o.code.replace(/0/g, 'o').replace(/1/g, 'l')]
    for (const v of variants) {
      const r = await get(`/api/track/${encodeURIComponent(v)}`)
      expect(r.status, v).toBe(200)
      expect(r.json.order.code).toBe(o.code)
    }
  })

  it('mã sai định dạng và mã không tồn tại cùng thông báo', async () => {
    const a = await get('/api/track/abc')
    const b = await get('/api/track/SS-ZZZZZ-ZZZZZ')
    expect(a.status).toBe(404)
    expect(b.status).toBe(404)
    expect(a.json).toEqual(b.json)
    expect(a.json.error.code).toBe('order_not_found')
    expect(a.res.headers.get('cache-control')).toBe('no-store')
  })

  it('dòng thời gian và số tiền đã thu cập nhật', async () => {
    const o = await quickOrder()
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'confirmed', paid_total = 1000 WHERE code = ?`).bind(o.code),
      env.DB.prepare(`INSERT INTO order_events (order_id, status) SELECT id, 'confirmed' FROM orders WHERE code = ?`).bind(o.code),
    ])
    const t = (await get(`/api/track/${o.code}`)).json.order
    expect(t.status).toBe('confirmed')
    expect(t.paymentStatus).toBe('partial')
    expect(t.paidTotal).toBe(1000)
    expect(t.remaining).toBe(t.total - 1000)
    expect(t.events.map((e: any) => e.status)).toEqual(['pending', 'confirmed'])
    expect(t.holdExpiresAt).toBeNull()
  })

  it('giới hạn tần suất: lần thứ 31 trong 1 phút bị 429 kèm Retry-After', async () => {
    const ip = '198.51.100.7'
    const statuses: number[] = []
    let last: Awaited<ReturnType<typeof get>> | undefined
    for (let i = 0; i < 31; i++) {
      last = await get('/api/track/SS-ZZZZZ-ZZZZZ', { ip })
      statuses.push(last.status)
    }
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true)
    expect(statuses[30]).toBe(429)
    expect(last!.json.error.code).toBe('rate_limited')
    expect(Number(last!.res.headers.get('retry-after'))).toBeGreaterThan(0)
    // IP khác không bị ảnh hưởng
    expect((await get('/api/track/SS-ZZZZZ-ZZZZZ', { ip: '198.51.100.8' })).status).toBe(404)
  })
})
