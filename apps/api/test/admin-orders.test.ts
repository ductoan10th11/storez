import { describe, expect, it } from 'vitest'
import { addDays, epochToVnDate, now } from '../src/lib/time'
import { TRANSITIONS, type OrderStatus } from '../src/services/orders'
import { adminCookie, count, env, get, patch, post, quickOrder, setStock, stockOf, registerUser } from './helpers'

const TOTAL = 32900000
const setStatus = (code: string, status: string) => env.DB.prepare('UPDATE orders SET status = ? WHERE code = ?').bind(status, code).run()
const payFull = (code: string) => env.DB.prepare('UPDATE orders SET paid_total = total WHERE code = ?').bind(code).run()

describe('luồng đơn từ đầu đến cuối (E2)', () => {
  it('xác nhận, thu cọc, sẵn sàng, thu phần còn lại, giao xe; khách tra cứu thấy từng bước', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    const st = (status: string, note?: string) => post(`/api/admin/orders/${o.code}/status`, { status, note }, admin.opts)

    // đơn mới ở "Chờ xác nhận"
    const list = await get('/api/admin/orders?status=pending', admin.opts)
    expect(list.json.items.map((i: any) => i.code)).toEqual([o.code])
    expect(list.json.items[0]).toMatchObject({ contactName: 'Nguyễn Văn An', contactPhone: '0336436536', itemCount: 1, firstItemName: 'Phố Rider 125', overdue: false })

    expect((await st('confirmed', 'Đã gọi xác nhận')).json.order.status).toBe('confirmed')
    expect((await post(`/api/admin/orders/${o.code}/payments`, { amount: 10000000, method: 'transfer', note: 'Cọc' }, admin.opts)).json.order).toMatchObject({ paidTotal: 10000000, paymentStatus: 'partial' })
    expect((await st('ready')).json.order.status).toBe('ready')

    const early = await st('completed')
    expect(early.status).toBe(409)
    expect(early.json.error).toMatchObject({ code: 'payment_incomplete', remaining: TOTAL - 10000000 })

    await post(`/api/admin/orders/${o.code}/payments`, { amount: TOTAL - 10000000, method: 'cash' }, admin.opts)
    const done = await st('completed')
    expect(done.status).toBe(200)
    expect(done.json.order).toMatchObject({ status: 'completed', paymentStatus: 'paid', remaining: 0, canCancel: false })
    expect(done.json.order.payments.map((p: any) => [p.amount, p.method])).toEqual([[10000000, 'transfer'], [TOTAL - 10000000, 'cash']])
    expect(done.json.order.payments[0].receivedBy).toBe('Quản trị')

    const t = (await get(`/api/track/${o.code}`)).json.order
    expect(t.events.map((e: any) => e.status)).toEqual(['pending', 'confirmed', 'ready', 'completed'])
    expect(t).toMatchObject({ status: 'completed', paymentStatus: 'paid', paidTotal: TOTAL, remaining: 0 })
    const detail = (await get(`/api/admin/orders/${o.code}`, admin.opts)).json.order
    expect(detail.events.map((e: any) => e.actor)).toEqual([null, 'Quản trị', 'Quản trị', 'Quản trị'])
    expect(detail.events[1].note).toBe('Đã gọi xác nhận')
  })
})

describe('ma trận chuyển trạng thái', () => {
  const all: OrderStatus[] = ['pending', 'confirmed', 'ready', 'completed', 'cancelled', 'expired']
  const targets = ['confirmed', 'ready', 'completed', 'cancelled'] as const

  it('mọi chuyển hợp lệ thành công, mọi chuyển còn lại trả invalid_transition', async () => {
    const admin = await adminCookie()
    for (const from of all) {
      for (const to of targets) {
        const o = await quickOrder({ phone: `09${String(10000000 + all.indexOf(from) * 10 + targets.indexOf(to))}` })
        await setStatus(o.code, from)
        await payFull(o.code) // bỏ qua điều kiện thu đủ để kiểm tra riêng ma trận
        const r = await post(`/api/admin/orders/${o.code}/status`, { status: to }, admin.opts)
        const legal = TRANSITIONS[from].includes(to)
        expect(r.status, `${from} -> ${to}`).toBe(legal ? 200 : 409)
        if (legal) expect(r.json.order.status).toBe(to)
        else expect(r.json.error.code, `${from} -> ${to}`).toBe('invalid_transition')
      }
    }
  })

  it('không đặt được pending/expired qua API (validation_failed)', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    for (const status of ['pending', 'expired', 'khac']) {
      expect((await post(`/api/admin/orders/${o.code}/status`, { status }, admin.opts)).status).toBe(400)
    }
  })

  it('hủy từ ready trả kho (admin được phép)', async () => {
    await setStock(1, 4)
    const admin = await adminCookie()
    const o = await quickOrder({ qty: 3 })
    expect(await stockOf(1)).toBe(1)
    await setStatus(o.code, 'ready')
    expect((await post(`/api/admin/orders/${o.code}/status`, { status: 'cancelled' }, admin.opts)).status).toBe(200)
    expect(await stockOf(1)).toBe(4)
  })

  it('đơn không tồn tại: 404 order_not_found', async () => {
    const admin = await adminCookie()
    const r = await post('/api/admin/orders/SS-AAAAA-AAAAA/status', { status: 'confirmed' }, admin.opts)
    expect(r.status).toBe(404)
    expect(r.json.error.code).toBe('order_not_found')
  })
})

describe('thu tiền', () => {
  it('cộng dồn paid_total, trạng thái thanh toán suy ra đúng', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    const pay = (amount: number) => post(`/api/admin/orders/${o.code}/payments`, { amount, method: 'cash' }, admin.opts)
    expect((await pay(1000)).json.order).toMatchObject({ paidTotal: 1000, paymentStatus: 'partial' })
    expect((await pay(2000)).json.order.paidTotal).toBe(3000)
    expect((await pay(TOTAL - 3000)).json.order).toMatchObject({ paymentStatus: 'paid', remaining: 0 })
    expect(await count('payments')).toBe(3)
  })

  it('thu vượt tổng bị từ chối và không ghi dòng payments (rollback)', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    await post(`/api/admin/orders/${o.code}/payments`, { amount: TOTAL - 500, method: 'cash' }, admin.opts)
    const r = await post(`/api/admin/orders/${o.code}/payments`, { amount: 501, method: 'cash' }, admin.opts)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'overpay', remaining: 500 })
    expect(await count('payments')).toBe(1)
    const row = await env.DB.prepare('SELECT paid_total FROM orders WHERE code = ?').bind(o.code).first<any>()
    expect(row.paid_total).toBe(TOTAL - 500)
    // audit cũng không ghi cho lần thất bại
    const a = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order.payment'`).first<any>()
    expect(a.n).toBe(1)
  })

  it('không thu được với đơn đã hủy/hết hạn; số tiền sai bị từ chối', async () => {
    const admin = await adminCookie()
    for (const s of ['cancelled', 'expired']) {
      const o = await quickOrder()
      await setStatus(o.code, s)
      const r = await post(`/api/admin/orders/${o.code}/payments`, { amount: 1000, method: 'cash' }, admin.opts)
      expect(r.status, s).toBe(409)
      expect(r.json.error.code).toBe('invalid_transition')
    }
    expect(await count('payments')).toBe(0)
    const o = await quickOrder()
    for (const body of [{ amount: 0, method: 'cash' }, { amount: -5, method: 'cash' }, { amount: 1.5, method: 'cash' }, { amount: 100, method: 'the' }]) {
      expect((await post(`/api/admin/orders/${o.code}/payments`, body, admin.opts)).status).toBe(400)
    }
  })
})

describe('chống đua', () => {
  it('hai yêu cầu hủy cùng một đơn thì kho chỉ cộng một lần và chỉ có một sự kiện', async () => {
    await setStock(1, 5)
    const admin = await adminCookie()
    const o = await quickOrder({ qty: 2 })
    const rs = await Promise.all([
      post(`/api/admin/orders/${o.code}/status`, { status: 'cancelled' }, admin.opts),
      post(`/api/admin/orders/${o.code}/status`, { status: 'cancelled' }, admin.opts),
    ])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await stockOf(1)).toBe(5)
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM order_events WHERE status = 'cancelled'`).first<any>()
    expect(n.n).toBe(1)
    const audits = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order.status'`).first<any>()
    expect(audits.n).toBe(1)
  })

  it('hủy rồi hết hạn không cộng kho lại', async () => {
    await setStock(1, 5)
    const admin = await adminCookie()
    const o = await quickOrder({ qty: 2 })
    await post(`/api/admin/orders/${o.code}/status`, { status: 'cancelled' }, admin.opts)
    await env.DB.prepare('UPDATE orders SET hold_expires_at = 1 WHERE code = ?').bind(o.code).run()
    const { expireOrders } = await import('../src/services/orders')
    expect(await expireOrders(env.DB)).toBe(0)
    expect(await stockOf(1)).toBe(5)
  })

  it('đơn bị đổi trạng thái giữa chừng: người thua nhận invalid_transition', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    const { transitionOrder, findOrder } = await import('../src/services/orders')
    const stale = (await findOrder(env.DB, 'code', o.code))!
    await post(`/api/admin/orders/${o.code}/status`, { status: 'confirmed' }, admin.opts)
    await expect(transitionOrder(env.DB, stale, { to: 'cancelled' })).rejects.toMatchObject({ code: 'invalid_transition' })
    // đơn không bị cancelled
    expect((await get(`/api/admin/orders/${o.code}`, admin.opts)).json.order.status).toBe('confirmed')
  })
})

describe('danh sách đơn', () => {
  it('lọc theo trạng thái, tìm theo mã/SĐT/tên; counts không đổi theo bộ lọc status', async () => {
    const admin = await adminCookie()
    const a = await quickOrder({ phone: '0912345678' })
    const b = await quickOrder({ phone: '0987654321' })
    const c = await quickOrder({ phone: '0333444555' })
    await setStatus(b.code, 'confirmed')
    await setStatus(c.code, 'cancelled')

    const all = await get('/api/admin/orders', admin.opts)
    expect(all.json.total).toBe(3)
    expect(all.json.counts).toEqual({ pending: 1, confirmed: 1, ready: 0, completed: 0, cancelled: 1, expired: 0 })

    const filtered = await get('/api/admin/orders?status=confirmed,cancelled', admin.opts)
    expect(filtered.json.items.map((i: any) => i.code).sort()).toEqual([b.code, c.code].sort())
    expect(filtered.json.counts).toEqual(all.json.counts)

    expect((await get(`/api/admin/orders?q=${a.code}`, admin.opts)).json.items.map((i: any) => i.code)).toEqual([a.code])
    expect((await get(`/api/admin/orders?q=${a.code.toLowerCase()}`, admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/orders?q=0987654321', admin.opts)).json.items.map((i: any) => i.code)).toEqual([b.code])
    expect((await get('/api/admin/orders?q=098%20765', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/orders?q=' + encodeURIComponent('Nguyễn'), admin.opts)).json.total).toBe(3)
    expect((await get('/api/admin/orders?q=khong-ton-tai', admin.opts)).json.total).toBe(0)
    // ký tự LIKE không bị coi là ký tự đại diện
    expect((await get('/api/admin/orders?q=%25', admin.opts)).json.total).toBe(0)

    const page = await get('/api/admin/orders?pageSize=2&page=2', admin.opts)
    expect(page.json).toMatchObject({ total: 3, page: 2, pageSize: 2 })
    expect(page.json.items).toHaveLength(1)
    const range = await get(`/api/admin/orders?from=${now() + 100}`, admin.opts)
    expect(range.json.total).toBe(0)
  })

  it('đơn quá hẹn hơn 24 giờ được đánh dấu overdue', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    await env.DB.prepare(`UPDATE orders SET status = 'confirmed', pickup_at = ? WHERE code = ?`).bind(now() - 2 * 86400, o.code).run()
    expect((await get('/api/admin/orders', admin.opts)).json.items[0].overdue).toBe(true)
    expect((await get(`/api/admin/orders/${o.code}`, admin.opts)).json.order.overdue).toBe(true)
  })
})

describe('PATCH đơn và lịch nhận xe', () => {
  it('sửa ghi chú nội bộ (không lộ ra tra cứu/khách), đổi lịch hẹn phải hợp lệ', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    const r = await patch(`/api/admin/orders/${o.code}`, { internalNote: 'Khách quen, giảm giá miệng' }, admin.opts)
    expect(r.json.order.internalNote).toBe('Khách quen, giảm giá miệng')
    expect((await get(`/api/track/${o.code}`)).text).not.toContain('giảm giá')
    expect((await patch(`/api/admin/orders/${o.code}`, { pickupAt: o.pickupAt + 7 * 60 }, admin.opts)).json.error.code).toBe('slot_unavailable')
    const { slot } = await import('./helpers')
    const other = await slot(5)
    const moved = await patch(`/api/admin/orders/${o.code}`, { pickupAt: other }, admin.opts)
    expect(moved.json.order.pickupAt).toBe(other)
    expect((await patch(`/api/admin/orders/${o.code}`, { internalNote: null }, admin.opts)).json.order.internalNote).toBeNull()
    // khách vẫn thấy lịch mới nhưng không thấy ghi chú
    expect((await get(`/api/track/${o.code}`)).json.order.pickupAt).toBe(other)
  })

  it('calendar liệt kê đơn pending/confirmed/ready theo ngày và khung', async () => {
    const admin = await adminCookie()
    const { slot } = await import('./helpers')
    const at = await slot(3)
    const a = await quickOrder({ pickupAt: at })
    const b = await quickOrder({ pickupAt: at })
    const c = await quickOrder({ pickupAt: at })
    await setStatus(c.code, 'cancelled')
    const date = epochToVnDate(at)
    const r = await get(`/api/admin/calendar?from=${date}&to=${addDays(date, 1)}`, admin.opts)
    expect(r.status).toBe(200)
    expect(r.json.days.map((d: any) => d.date)).toEqual([date, addDays(date, 1)])
    const s = r.json.days[0].slots.find((x: any) => x.startsAt === at)
    expect(s.orders.map((x: any) => x.code).sort()).toEqual([a.code, b.code].sort())
    expect(s.time).toMatch(/^\d\d:00$/)
    expect((await get(`/api/admin/calendar?from=${date}&to=${addDays(date, 14)}`, admin.opts)).status).toBe(400)
    expect((await get('/api/admin/calendar?from=x&to=y', admin.opts)).status).toBe(400)
  })
})

describe('audit_log', () => {
  it('mỗi thao tác ghi của admin có một dòng, không chứa mật khẩu', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    const u = await registerUser({ phone: '0912345678' })
    await post(`/api/admin/orders/${o.code}/status`, { status: 'confirmed' }, admin.opts)
    await post(`/api/admin/orders/${o.code}/payments`, { amount: 1000, method: 'cash' }, admin.opts)
    await patch(`/api/admin/orders/${o.code}`, { internalNote: 'bí mật' }, admin.opts)
    await post(`/api/admin/users/${u.user.id}/reset-password`, { newPassword: 'mat-khau-bi-mat-9' }, admin.opts)
    const rows = await env.DB.prepare('SELECT actor_id, action, target, detail FROM audit_log ORDER BY id').all<any>()
    expect(rows.results.map((r) => r.action)).toEqual(['order.status', 'order.payment', 'order.update', 'user.reset-password'])
    expect(rows.results.every((r) => r.actor_id === admin.user.id)).toBe(true)
    const dump = JSON.stringify(rows.results)
    expect(dump).not.toContain('mat-khau-bi-mat-9')
    expect(dump).not.toContain('bí mật')
    expect(rows.results[0].target).toBe(`order:${o.code}`)
  })

  it('thao tác bị từ chối không ghi audit', async () => {
    const admin = await adminCookie()
    const o = await quickOrder()
    await post(`/api/admin/orders/${o.code}/status`, { status: 'completed' }, admin.opts) // pending -> completed: sai
    expect(await count('audit_log')).toBe(0)
  })
})
