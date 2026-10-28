import { AppError } from '../middleware/errors'
import { DAY, addDays, daysBetween, epochToVnDate, epochToVnMinutes, formatHm, isDate, now as nowSec, vnToEpoch, weekday } from '../lib/time'
import type { Pickup } from '../lib/settings'
import { normalizeCode } from '../lib/ids'
import { buildOrder, loadOrderParts, ORDER_STATUSES, paymentStatusOf, type OrderRow, type OrderStatus } from './orders'
import { slotTimes } from './slots'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export const isOverdue = (status: OrderStatus, pickupAt: number, now: number) =>
  (status === 'confirmed' || status === 'ready') && pickupAt < now - DAY

type SummaryRow = Pick<OrderRow, 'code' | 'status' | 'total' | 'paid_total' | 'contact_name' | 'contact_phone' | 'pickup_at' | 'created_at' | 'hold_expires_at'> & {
  item_count: number
  first_item: string | null
}

const SUMMARY_SELECT = `SELECT o.code, o.status, o.total, o.paid_total, o.contact_name, o.contact_phone, o.pickup_at, o.created_at, o.hold_expires_at,
  (SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id) AS item_count,
  (SELECT name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_item
  FROM orders o`

export const toSummary = (r: SummaryRow, now: number) => ({
  code: r.code,
  status: r.status,
  paymentStatus: paymentStatusOf(r.paid_total, r.total),
  total: r.total,
  paidTotal: r.paid_total,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  pickupAt: r.pickup_at,
  createdAt: r.created_at,
  holdExpiresAt: r.status === 'pending' ? r.hold_expires_at : null,
  overdue: isOverdue(r.status, r.pickup_at, now),
  itemCount: r.item_count,
  firstItemName: r.first_item ?? '',
})

export type OrderListQuery = { status?: string; q?: string; from?: number; to?: number; page: number; pageSize: number }

export async function listAdminOrders(db: D1Database, q: OrderListQuery) {
  const now = nowSec()
  const common: string[] = []
  const binds: (string | number)[] = []
  if (q.q?.trim()) {
    const raw = q.q.trim()
    const code = normalizeCode(raw)
    const parts = ['o.contact_name LIKE ? ESCAPE \'\\\'', 'o.contact_phone LIKE ? ESCAPE \'\\\'', 'o.code LIKE ? ESCAPE \'\\\'']
    binds.push(`%${escapeLike(raw)}%`, `%${escapeLike(raw.replace(/[\s.\-()]/g, ''))}%`, `%${escapeLike(raw.toUpperCase())}%`)
    if (code) {
      parts.push('o.code = ?')
      binds.push(code)
    }
    common.push(`(${parts.join(' OR ')})`)
  }
  if (q.from !== undefined) (common.push('o.created_at >= ?'), binds.push(q.from))
  if (q.to !== undefined) (common.push('o.created_at <= ?'), binds.push(q.to))
  const statuses = (q.status ?? '').split(',').map((s) => s.trim()).filter((s): s is OrderStatus => (ORDER_STATUSES as string[]).includes(s))
  const where = [...common]
  const listBinds = [...binds]
  if (statuses.length) {
    where.push(`o.status IN (${statuses.map(() => '?').join(',')})`)
    listBinds.push(...statuses)
  }
  const w = (parts: string[]) => (parts.length ? `WHERE ${parts.join(' AND ')}` : '')

  const [count, rows, counts] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM orders o ${w(where)}`).bind(...listBinds),
    db
      .prepare(`${SUMMARY_SELECT} ${w(where)} ORDER BY o.created_at DESC, o.rowid DESC LIMIT ? OFFSET ?`)
      .bind(...listBinds, q.pageSize, (q.page - 1) * q.pageSize),
    // counts không phụ thuộc bộ lọc status
    db.prepare(`SELECT o.status, COUNT(*) AS n FROM orders o ${w(common)} GROUP BY o.status`).bind(...binds),
  ])
  const countMap = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>
  for (const r of counts.results as { status: OrderStatus; n: number }[]) countMap[r.status] = r.n
  return {
    items: (rows.results as SummaryRow[]).map((r) => toSummary(r, now)),
    total: (count.results[0] as { n: number }).n,
    page: q.page,
    pageSize: q.pageSize,
    counts: countMap,
  }
}

export async function getAdminOrder(db: D1Database, row: OrderRow) {
  const parts = await loadOrderParts(db, row.id)
  const { results: payments } = await db
    .prepare(
      `SELECT p.amount, p.method, p.note, p.at, u.name AS received_by FROM payments p LEFT JOIN users u ON u.id = p.received_by
       WHERE p.order_id = ? ORDER BY p.at, p.id`,
    )
    .bind(row.id)
    .all<{ amount: number; method: 'cash' | 'transfer'; note: string | null; at: number; received_by: string | null }>()
  const base = buildOrder(row, parts)
  return {
    ...base,
    events: parts.events.map((e) => ({ status: e.status, note: e.note, at: e.at, actor: e.actor })),
    internalNote: row.internal_note,
    userId: row.user_id,
    payments: payments.map((p) => ({ amount: p.amount, method: p.method, note: p.note, at: p.at, receivedBy: p.received_by })),
    overdue: isOverdue(row.status, row.pickup_at, nowSec()),
  }
}

// Lịch nhận xe: đơn đang hoạt động theo ngày và khung giờ hẹn
export async function adminCalendar(db: D1Database, pickup: Pickup, from: string, to: string) {
  for (const [k, v] of [['from', from], ['to', to]] as const) {
    if (!isDate(v)) throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { [k]: 'Ngày phải có dạng YYYY-MM-DD' })
  }
  const span = daysBetween(from, to)
  if (span < 0 || span > 13) {
    throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { to: 'Khoảng ngày tối đa 14 ngày và to không trước from' })
  }
  const now = nowSec()
  const { results } = await db
    .prepare(`${SUMMARY_SELECT} WHERE o.status IN ('pending','confirmed','ready') AND o.pickup_at >= ? AND o.pickup_at < ? ORDER BY o.pickup_at, o.created_at`)
    .bind(vnToEpoch(from, 0), vnToEpoch(addDays(to, 1), 0))
    .all<SummaryRow>()

  const byStart = new Map<number, ReturnType<typeof toSummary>[]>()
  for (const r of results) (byStart.get(r.pickup_at) ?? byStart.set(r.pickup_at, []).get(r.pickup_at)!).push(toSummary(r, now))

  const days = []
  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i)
    const starts = new Set<number>(pickup.days.includes(weekday(date)) ? slotTimes(pickup).map((t) => vnToEpoch(date, t)) : [])
    for (const [s] of byStart) if (epochToVnDate(s) === date) starts.add(s)
    const slots = [...starts]
      .sort((a, b) => a - b)
      .map((startsAt) => ({
        startsAt,
        time: formatHm(epochToVnMinutes(startsAt)),
        orders: byStart.get(startsAt) ?? [],
      }))
    days.push({ date, slots })
  }
  return { days }
}
