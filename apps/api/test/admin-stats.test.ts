import { describe, expect, it } from 'vitest'
import { addDays } from '../src/lib/time'
import { adminCookie, env, get, post, quickOrder, today } from './helpers'

describe('GET /api/admin/stats', () => {
  it('số liệu khớp dữ liệu mẫu; collected tính từ payments', async () => {
    const admin = await adminCookie()
    const suv = await env.DB.prepare('SELECT id, base_price, name FROM products WHERE id = 6').first<any>()
    const o1 = await quickOrder({ productId: 1, phone: '0912345678' }) // xe máy 32.9M
    const o2 = await quickOrder({ productId: 6, phone: '0912345679' }) // ô tô
    const o3 = await quickOrder({ productId: 2, phone: '0912345670' }) // sẽ bị hủy
    const pay = (code: string, amount: number) => post(`/api/admin/orders/${code}/payments`, { amount, method: 'cash' }, admin.opts)
    await pay(o1.code, 10_000_000)
    await pay(o2.code, 20_000_000)
    await post(`/api/admin/orders/${o1.code}/status`, { status: 'confirmed' }, admin.opts)
    await post(`/api/admin/orders/${o3.code}/status`, { status: 'cancelled' }, admin.opts)

    const r = await get('/api/admin/stats', admin.opts)
    expect(r.status).toBe(200)
    const s = r.json
    expect(s.range).toEqual({ from: addDays(today(), -29), to: today() })
    expect(s.orders).toEqual({ total: 3, byStatus: { pending: 1, confirmed: 1, ready: 0, completed: 0, cancelled: 1, expired: 0 } })
    expect(s.collected).toBe(30_000_000)
    expect(s.cancelRate).toBeCloseTo(1 / 3)
    expect(s.byDay).toHaveLength(30)
    expect(s.byDay.at(-1)).toEqual({ date: today(), orders: 3, collected: 30_000_000 })
    expect(s.byDay.slice(0, -1).every((d: any) => d.orders === 0 && d.collected === 0)).toBe(true)
    expect(s.byCategory).toEqual([
      { category: 'o-to', orders: 1, collected: 20_000_000 },
      { category: 'xe-may', orders: 1, collected: 10_000_000 },
    ])
    // đơn bị hủy không tính vào xe bán chạy
    expect(s.topProducts).toEqual([
      { name: 'Phố Rider 125', qty: 1, revenue: 32_900_000 },
      { name: suv.name, qty: 1, revenue: suv.base_price },
    ].sort((a, b) => b.revenue - a.revenue))
  })

  it('lọc theo khoảng ngày; khoảng ngoài dữ liệu trả 0', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    await post(`/api/admin/orders/${o.code}/payments`, { amount: 5000, method: 'transfer' }, admin.opts)
    const past = await get(`/api/admin/stats?from=2020-01-01&to=2020-01-10`, admin.opts)
    expect(past.json.orders.total).toBe(0)
    expect(past.json.collected).toBe(0)
    expect(past.json.cancelRate).toBe(0)
    expect(past.json.byDay).toHaveLength(10)
    expect(past.json.topProducts).toEqual([])
    const day = await get(`/api/admin/stats?from=${today()}&to=${today()}`, admin.opts)
    expect(day.json.orders.total).toBe(1)
    expect(day.json.collected).toBe(5000)
  })

  it('khoảng ngày sai bị từ chối', async () => {
    const admin = await adminCookie()
    for (const q of ['from=abc', 'from=2026-02-30', 'from=2026-05-02&to=2026-05-01', 'from=2020-01-01&to=2026-01-01']) {
      expect((await get(`/api/admin/stats?${q}`, admin.opts)).status, q).toBe(400)
    }
  })
})
