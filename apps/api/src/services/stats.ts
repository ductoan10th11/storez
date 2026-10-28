import { AppError } from '../middleware/errors'
import { addDays, daysBetween, epochToVnDate, isDate, now as nowSec, vnToEpoch, VN_OFFSET } from '../lib/time'
import { ORDER_STATUSES, type OrderStatus } from './orders'

// Thống kê cho trang tổng quan admin. `collected` tính từ các khoản đã thu (payments.at), không phải giá trị đơn.
export async function adminStats(db: D1Database, fromQ?: string, toQ?: string) {
  const to = toQ ?? epochToVnDate(nowSec())
  const from = fromQ ?? addDays(to, -29)
  for (const [k, v] of [['from', from], ['to', to]] as const) {
    if (!isDate(v)) throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { [k]: 'Ngày phải có dạng YYYY-MM-DD' })
  }
  const span = daysBetween(from, to)
  if (span < 0 || span > 365) {
    throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { to: 'Khoảng ngày từ 1 đến 366 ngày và to không trước from' })
  }
  const start = vnToEpoch(from, 0)
  const end = vnToEpoch(addDays(to, 1), 0) // loại trừ
  const day = `date(%s + ${VN_OFFSET}, 'unixepoch')`
  const live = `o.status NOT IN ('cancelled','expired')`

  const [byStatus, collected, ordersByDay, paidByDay, itemRows, payRows, topRows] = await db.batch([
    db.prepare('SELECT status, COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status').bind(start, end),
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE at >= ? AND at < ?').bind(start, end),
    db.prepare(`SELECT ${day.replace('%s', 'created_at')} AS d, COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY d`).bind(start, end),
    db.prepare(`SELECT ${day.replace('%s', 'at')} AS d, SUM(amount) AS n FROM payments WHERE at >= ? AND at < ? GROUP BY d`).bind(start, end),
    // Giá trị từng dòng theo danh mục, của đơn tạo trong khoảng và không bị hủy
    db
      .prepare(
        `SELECT o.id AS order_id, o.subtotal, c.slug AS category, SUM(i.unit_price * i.qty) AS value
         FROM order_items i JOIN orders o ON o.id = i.order_id
         JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
         WHERE ${live} AND o.created_at >= ? AND o.created_at < ? GROUP BY o.id, c.slug`,
      )
      .bind(start, end),
    // Khoản thu trong khoảng, theo đơn
    db.prepare('SELECT order_id, SUM(amount) AS paid FROM payments WHERE at >= ? AND at < ? GROUP BY order_id').bind(start, end),
    db
      .prepare(
        `SELECT i.name, SUM(i.qty) AS qty, SUM(i.unit_price * i.qty) AS revenue
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE ${live} AND o.created_at >= ? AND o.created_at < ? GROUP BY i.name ORDER BY qty DESC, revenue DESC LIMIT 5`,
      )
      .bind(start, end),
  ])

  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>
  for (const r of byStatus.results as { status: OrderStatus; n: number }[]) statusCounts[r.status] = r.n
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  const ordersDay = new Map((ordersByDay.results as { d: string; n: number }[]).map((r) => [r.d, r.n]))
  const paidDay = new Map((paidByDay.results as { d: string; n: number }[]).map((r) => [r.d, r.n]))
  const byDay = Array.from({ length: span + 1 }, (_, i) => {
    const date = addDays(from, i)
    return { date, orders: ordersDay.get(date) ?? 0, collected: paidDay.get(date) ?? 0 }
  })

  // Theo danh mục: số đơn có xe thuộc danh mục; tiền thu chia theo tỉ trọng giá trị xe của danh mục trong đơn
  const paidBy = new Map((payRows.results as { order_id: string; paid: number }[]).map((r) => [r.order_id, r.paid]))
  const cats = new Map<string, { orders: number; collected: number }>()
  for (const r of itemRows.results as { order_id: string; subtotal: number; category: string; value: number }[]) {
    const c = cats.get(r.category) ?? cats.set(r.category, { orders: 0, collected: 0 }).get(r.category)!
    c.orders++
    c.collected += r.subtotal > 0 ? Math.round(((paidBy.get(r.order_id) ?? 0) * r.value) / r.subtotal) : 0
  }

  return {
    range: { from, to },
    orders: { total, byStatus: statusCounts },
    collected: (collected.results[0] as { n: number }).n,
    cancelRate: total ? (statusCounts.cancelled + statusCounts.expired) / total : 0,
    byDay,
    byCategory: [...cats].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.orders - a.orders || a.category.localeCompare(b.category)),
    topProducts: topRows.results as { name: string; qty: number; revenue: number }[],
  }
}
