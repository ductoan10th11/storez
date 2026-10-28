import { describe, expect, it } from 'vitest'
import { adminCookie, env, get, put, slot } from './helpers'

const pickup = {
  open: '09:00', close: '17:00', days: [1, 2, 3, 4, 5, 6], slotMinutes: 60, capacity: 2, minNoticeHours: 2, maxAdvanceDays: 30,
}

describe('cấu hình showroom', () => {
  it('GET trả đủ ba khóa, gồm cả phần nội bộ', async () => {
    const admin = await adminCookie()
    const r = await get('/api/admin/settings', admin.opts)
    expect(r.json.showroom.name).toBe('Speed Showroom')
    expect(r.json.pickup).toMatchObject({ capacity: 5, minNoticeHours: 2, maxAdvanceDays: 30, slotMinutes: 60 })
    expect(r.json.orders).toEqual({ pendingHoldHours: 48 })
  })

  it('đổi giờ mở cửa sang 9:00-17:00 thì khung giờ chỉ còn 9:00 đến 16:00 (E8) và có hiệu lực ngay', async () => {
    const admin = await adminCookie()
    const r = await put('/api/admin/settings/pickup', { value: pickup }, admin.opts)
    expect(r.status).toBe(200)
    expect(r.json).toEqual(pickup)
    const slots = await get('/api/pickup-slots?days=14')
    const day = slots.json.days.find((d: any) => d.slots.length === 8)
    expect(day.slots.map((s: any) => s.time)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'])
    expect(slots.json.days.every((d: any) => d.slots[0].remaining <= 2)).toBe(true)
    const pub = await get('/api/settings/public')
    expect(pub.json.pickup).toEqual({ open: '09:00', close: '17:00', days: [1, 2, 3, 4, 5, 6], slotMinutes: 60 })
    // ghi vào audit_log với trước/sau
    const a = await env.DB.prepare(`SELECT target, detail FROM audit_log WHERE action = 'settings.update'`).first<any>()
    expect(a.target).toBe('settings:pickup')
    expect(JSON.parse(a.detail).after.open).toBe('09:00')
  })

  it('đổi số giờ giữ xe có hiệu lực cho đơn mới', async () => {
    const admin = await adminCookie()
    await put('/api/admin/settings/orders', { value: { pendingHoldHours: 10 } }, admin.opts)
    const { quickOrder } = await import('./helpers')
    const o = await quickOrder()
    expect(o.holdExpiresAt - o.createdAt).toBe(10 * 3600)
  })

  it('kiểm tra từng khóa: open < close, slotMinutes chia hết khoảng mở cửa, days thuộc 0..6', async () => {
    const admin = await adminCookie()
    const bad = async (value: unknown, field: string, key = 'pickup') => {
      const r = await put(`/api/admin/settings/${key}`, { value }, admin.opts)
      expect(r.status, field).toBe(400)
      expect(r.json.error.code).toBe('validation_failed')
      expect(r.json.error.fields, field).toHaveProperty(field)
    }
    await bad({ ...pickup, open: '18:00', close: '09:00' }, 'close')
    await bad({ ...pickup, slotMinutes: 90 }, 'slotMinutes') // 480 phút không chia hết cho 90
    await bad({ ...pickup, days: [0, 7] }, 'days.1')
    await bad({ ...pickup, days: [] }, 'days')
    await bad({ ...pickup, days: [1, 1] }, 'days')
    await bad({ ...pickup, open: '9h' }, 'open')
    await bad({ ...pickup, capacity: 0 }, 'capacity')
    await bad({ name: '', address: 'x', phone: '1' }, 'name', 'showroom')
    await bad({ pendingHoldHours: 0 }, 'pendingHoldHours', 'orders')
    // không lưu gì khi lỗi
    expect((await get('/api/admin/settings', admin.opts)).json.pickup.open).toBe('08:00')
  })

  it('khóa lạ: 404; thân sai: 400', async () => {
    const admin = await adminCookie()
    expect((await put('/api/admin/settings/khac', { value: {} }, admin.opts)).status).toBe(404)
    expect((await put('/api/admin/settings/pickup', pickup, admin.opts)).status).toBe(400)
  })

  it('đơn cũ nằm ngoài khung giờ mới vẫn hiển thị; khung mới áp cho đơn mới', async () => {
    const admin = await adminCookie()
    const { quickOrder, placeOrder, addItem, newCart } = await import('./helpers')
    const early = await slot(0) // có thể là 8:00
    const o = await quickOrder({ pickupAt: early })
    await put('/api/admin/settings/pickup', { value: { ...pickup, open: '10:00', close: '12:00' } }, admin.opts)
    expect((await get(`/api/track/${o.code}`)).json.order.pickupAt).toBe(early)
    const cart = newCart()
    await addItem(cart, 1)
    const r = await placeOrder(cart, { pickupAt: early })
    expect(r.json.error.code).toBe('slot_unavailable')
  })
})
