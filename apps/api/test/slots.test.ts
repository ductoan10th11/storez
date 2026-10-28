import { describe, expect, it } from 'vitest'
import { epochToVnDate, epochToVnMinutes, now, vnToEpoch, addDays, weekday } from '../src/lib/time'
import { addItem, contact, env, get, newCart, placeOrder, quickOrder, slot } from './helpers'

const setPickup = (patch: Record<string, unknown>) =>
  env.DB.prepare(`UPDATE settings SET value = json_patch(value, ?) WHERE key = 'pickup'`).bind(JSON.stringify(patch)).run()

describe('GET /api/pickup-slots', () => {
  it('mỗi ngày 10 khung, khung cuối 17:00, startsAt khớp giờ Việt Nam', async () => {
    const r = await get('/api/pickup-slots?days=14')
    const full = r.json.days.filter((d: any) => d.slots.length === 10)
    expect(full.length).toBeGreaterThan(10)
    const d = full[0]
    expect(d.slots[0].time).toBe('08:00')
    expect(d.slots[9].time).toBe('17:00')
    expect(d.slots[0]).toMatchObject({ available: true, remaining: 5 })
    expect(epochToVnDate(d.slots[0].startsAt)).toBe(d.date)
    expect(epochToVnMinutes(d.slots[9].startsAt)).toBe(17 * 60)
  })

  it('không có khung quá gần (< 2 giờ) hoặc quá xa (> 30 ngày)', async () => {
    const r = await get('/api/pickup-slots?days=14')
    const starts = r.json.days.flatMap((d: any) => d.slots.map((s: any) => s.startsAt))
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(now() + 2 * 3600 - 2)
    const far = await get(`/api/pickup-slots?from=${addDays(epochToVnDate(now()), 40)}&days=3`)
    expect(far.json.days).toEqual([])
  })

  it('đổi giờ mở cửa/độ dài khung thì danh sách đổi theo', async () => {
    await setPickup({ open: '09:00', close: '17:00' })
    const r = await get('/api/pickup-slots?days=14')
    const d = r.json.days.find((x: any) => x.slots.length === 8)
    expect(d.slots.map((s: any) => s.time)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'])
    await setPickup({ slotMinutes: 120 })
    const r2 = await get('/api/pickup-slots?days=14')
    expect(r2.json.days.find((x: any) => x.slots.length === 4).slots.map((s: any) => s.time)).toEqual(['09:00', '11:00', '13:00', '15:00'])
  })

  it('ngày không thuộc days không xuất hiện', async () => {
    await setPickup({ days: [1, 2, 3, 4, 5] })
    const r = await get('/api/pickup-slots?days=14')
    expect(r.json.days.every((d: any) => weekday(d.date) >= 1 && weekday(d.date) <= 5)).toBe(true)
  })

  it('khung đã đầy vẫn xuất hiện với available false', async () => {
    await setPickup({ capacity: 1 })
    const at = await slot()
    await quickOrder({ pickupAt: at })
    const r = await get('/api/pickup-slots?days=14')
    const s = r.json.days.flatMap((d: any) => d.slots).find((x: any) => x.startsAt === at)
    expect(s).toMatchObject({ available: false, remaining: 0 })
  })

  it('from sai định dạng và days ngoài khoảng bị từ chối', async () => {
    expect((await get('/api/pickup-slots?from=hom-nay')).status).toBe(400)
    expect((await get('/api/pickup-slots?days=15')).status).toBe(400)
    expect((await get('/api/pickup-slots?days=0')).status).toBe(400)
  })
})

describe('kiểm tra khung khi đặt hàng', () => {
  const attempt = async (pickupAt: number) => {
    const cart = newCart()
    await addItem(cart, 1)
    return placeOrder(cart, { pickupAt })
  }

  it('chấp nhận khung hợp lệ', async () => {
    expect((await attempt(await slot())).status).toBe(201)
  })

  it('từ chối: ngoài giờ mở cửa, lệch lưới, quá gần, quá xa, ngày không mở', async () => {
    const day = addDays(epochToVnDate(now()), 3)
    const bad = {
      'ngoài giờ': vnToEpoch(day, 19 * 60),
      'trước giờ mở': vnToEpoch(day, 6 * 60),
      'lệch lưới': vnToEpoch(day, 9 * 60 + 30),
      'quá gần': now() + 3600,
      'quá khứ': now() - 86400,
      'quá xa': vnToEpoch(addDays(epochToVnDate(now()), 45), 9 * 60),
    }
    for (const [name, at] of Object.entries(bad)) {
      const cart = newCart()
      await addItem(cart, 1)
      const r = await placeOrder(cart, { pickupAt: at, contact: contact({ phone: `09${String(Math.abs(at) % 100000000).padStart(8, '0')}` }) })
      expect(r.status, name).toBe(409)
      expect(r.json.error.code, name).toBe('slot_unavailable')
    }
    await setPickup({ days: [0] })
    const monday = [...Array(14)].map((_, i) => addDays(epochToVnDate(now()), i + 1)).find((d) => weekday(d) === 1)!
    expect((await attempt(vnToEpoch(monday, 10 * 60))).json.error.code).toBe('slot_unavailable')
  })

  it('từ chối khung đã đầy capacity', async () => {
    await setPickup({ capacity: 2 })
    const at = await slot()
    await quickOrder({ pickupAt: at })
    await quickOrder({ pickupAt: at })
    const r = await attempt(at)
    expect(r.status).toBe(409)
    expect(r.json.error.code).toBe('slot_unavailable')
  })

  it('đơn hủy không chiếm chỗ trong khung', async () => {
    await setPickup({ capacity: 1 })
    const at = await slot()
    const o = await quickOrder({ pickupAt: at })
    await env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE code = ?`).bind(o.code).run()
    expect((await attempt(at)).status).toBe(201)
  })
})

