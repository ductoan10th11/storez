import { AppError } from '../middleware/errors'
import type { Pickup } from '../lib/settings'
import { addDays, DAY, epochToVnDate, epochToVnMinutes, formatHm, isDate, parseHm, vnToEpoch, weekday } from '../lib/time'

// Đơn đang giữ chỗ trong khung giờ (BR-ORD-5)
const ACTIVE = `('pending','confirmed','ready')`

export type Slot = { startsAt: number; time: string; available: boolean; remaining: number }

const slotTimes = (p: Pickup) => {
  const out: number[] = []
  for (let t = parseHm(p.open); t + p.slotMinutes <= parseHm(p.close); t += p.slotMinutes) out.push(t)
  return out
}

async function bookedCounts(db: D1Database, from: number, to: number, excludeOrderId?: string) {
  const { results } = await db
    .prepare(
      `SELECT pickup_at, COUNT(*) AS n FROM orders
       WHERE pickup_at BETWEEN ? AND ? AND status IN ${ACTIVE} AND id != ? GROUP BY pickup_at`,
    )
    .bind(from, to, excludeOrderId ?? '')
    .all<{ pickup_at: number; n: number }>()
  return new Map(results.map((r) => [r.pickup_at, r.n]))
}

// Khung có nằm trong lịch của showroom (ngày mở cửa, giờ hợp lệ, đủ điều kiện báo trước/đặt xa) không
function inWindow(p: Pickup, startsAt: number, now: number) {
  const date = epochToVnDate(startsAt)
  if (!p.days.includes(weekday(date))) return false
  if (!slotTimes(p).includes(epochToVnMinutes(startsAt))) return false
  return startsAt >= now + p.minNoticeHours * 3600 && startsAt <= now + p.maxAdvanceDays * DAY
}

export async function pickupSlots(db: D1Database, p: Pickup, now: number, from: string, days: number) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const booked = await bookedCounts(db, vnToEpoch(from, 0), vnToEpoch(addDays(from, days), 0))
  const times = slotTimes(p)
  const out: { date: string; slots: Slot[] }[] = []
  for (const date of dates) {
    if (!p.days.includes(weekday(date))) continue
    const slots: Slot[] = []
    for (const t of times) {
      const startsAt = vnToEpoch(date, t)
      if (startsAt < now + p.minNoticeHours * 3600 || startsAt > now + p.maxAdvanceDays * DAY) continue
      const remaining = Math.max(0, p.capacity - (booked.get(startsAt) ?? 0))
      slots.push({ startsAt, time: formatHm(t), available: remaining > 0, remaining })
    }
    if (slots.length) out.push({ date, slots })
  }
  return out
}

// Kiểm tra khi đặt hàng / đổi lịch hẹn; excludeOrderId để đơn đang đổi lịch không tự chiếm chỗ của mình
export async function assertSlotAvailable(db: D1Database, p: Pickup, startsAt: number, now: number, excludeOrderId?: string) {
  const bad = () => new AppError(409, 'slot_unavailable', 'Khung giờ nhận xe không hợp lệ hoặc đã đầy', undefined, { pickupAt: startsAt })
  if (!inWindow(p, startsAt, now)) throw bad()
  const booked = await bookedCounts(db, startsAt, startsAt, excludeOrderId)
  if ((booked.get(startsAt) ?? 0) >= p.capacity) throw bad()
}

export const parseSlotRange = (from: string | undefined, days: number, today: string) => {
  const f = from ?? today
  if (!isDate(f)) throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { from: 'Ngày phải có dạng YYYY-MM-DD' })
  return { from: f, days }
}

export { slotTimes }
