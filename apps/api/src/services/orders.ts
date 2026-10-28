import { AppError } from '../middleware/errors'
import { nanoid, newOrderCode } from '../lib/ids'
import { getSettings } from '../lib/settings'
import { now as nowSec } from '../lib/time'
import { loadProducts } from './catalog'
import type { CartStore, Line } from './cart'
import { picksValid, priceLine, type LineOption } from './pricing'
import { assertSlotAvailable } from './slots'
import type { AuditEntry } from './audit'

export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled' | 'expired'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready', 'completed', 'cancelled', 'expired']

// BR-ORD-1: các chuyển trạng thái hợp lệ
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  expired: [],
}

export type OrderRow = {
  id: string
  code: string
  user_id: string | null
  status: OrderStatus
  contact_name: string
  contact_phone: string
  contact_email: string
  contact_address: string | null
  note: string | null
  internal_note: string | null
  pickup_at: number
  subtotal: number
  total: number
  paid_total: number
  hold_expires_at: number
  last_token: string | null
  created_at: number
  updated_at: number
}

export const paymentStatusOf = (paid: number, total: number): PaymentStatus =>
  paid <= 0 ? 'unpaid' : paid < total ? 'partial' : 'paid'

export const canCancelStatus = (s: OrderStatus) => s === 'pending' || s === 'confirmed'

// ---------- Đọc đơn ----------

type ItemRow = { product_id: number | null; name: string; image: string; unit_price: number; qty: number; options: string }
type EventRow = { status: OrderStatus; note: string | null; at: number; actor: string | null }

const parseOptions = (s: string): LineOption[] => {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export async function loadOrderParts(db: D1Database, orderId: string) {
  const [items, events] = await db.batch([
    db.prepare('SELECT product_id, name, image, unit_price, qty, options FROM order_items WHERE order_id = ? ORDER BY id').bind(orderId),
    db.prepare(
      `SELECT e.status, e.note, e.at, u.name AS actor FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.order_id = ? ORDER BY e.at, e.id`,
    ).bind(orderId),
  ])
  return { items: items.results as ItemRow[], events: events.results as EventRow[] }
}

// Đơn đầy đủ (không che) cho chủ đơn và người vừa đặt
export function buildOrder(row: OrderRow, parts: { items: ItemRow[]; events: EventRow[] }) {
  return {
    code: row.code,
    status: row.status,
    paymentStatus: paymentStatusOf(row.paid_total, row.total),
    total: row.total,
    paidTotal: row.paid_total,
    remaining: row.total - row.paid_total,
    pickupAt: row.pickup_at,
    createdAt: row.created_at,
    holdExpiresAt: row.status === 'pending' ? row.hold_expires_at : null,
    items: parts.items.map((i) => ({
      name: i.name,
      image: i.image,
      unitPrice: i.unit_price,
      qty: i.qty,
      options: parseOptions(i.options),
      productId: i.product_id,
    })),
    events: parts.events.map((e) => ({ status: e.status, note: e.note, at: e.at })),
    contact: { name: row.contact_name, phone: row.contact_phone, email: row.contact_email, address: row.contact_address },
    note: row.note,
    canCancel: canCancelStatus(row.status),
  }
}
export type Order = ReturnType<typeof buildOrder>

export async function findOrder(db: D1Database, where: 'code' | 'id', value: string) {
  return db.prepare(`SELECT * FROM orders WHERE ${where} = ?`).bind(value).first<OrderRow>()
}

export async function getFullOrder(db: D1Database, row: OrderRow) {
  return buildOrder(row, await loadOrderParts(db, row.id))
}

// ---------- Tạo đơn (docs/03 mục 6.1) ----------

export type CreateOrderInput = {
  contact: { name: string; phone: string; email: string; address: string | null }
  note: string | null
  pickupAt: number
}

const isCheck = (e: unknown, what: RegExp) => {
  const msg = String((e as Error)?.message ?? e)
  return /CHECK constraint failed/i.test(msg) && what.test(msg)
}

export async function createOrder(
  db: D1Database,
  opts: { input: CreateOrderInput; store: CartStore; userId: string | null; guestKv?: { kv: KVNamespace; cartId: string }; newCode?: () => string },
) {
  const { input, store } = opts
  const lines = await store.read()
  if (!lines.length) throw new AppError(400, 'cart_empty', 'Giỏ hàng đang trống')

  // Nạp sản phẩm; kiểm tra từng dòng
  const products = await loadProducts(db, { ids: [...new Set(lines.map((l) => l.productId))], includeInactive: true })
  const byId = new Map(products.map((p) => [p.id, p]))
  const qtyBy = new Map<number, number>()
  const priced = lines.map((l: Line) => {
    const p = byId.get(l.productId)
    if (!p || !p.active) throw new AppError(409, 'product_unavailable', 'Có xe trong giỏ không còn được bán', undefined, { productId: l.productId })
    if (!picksValid(p, l.picks)) throw new AppError(409, 'option_invalid', 'Lựa chọn trong giỏ không còn hợp lệ, vui lòng làm mới giỏ hàng', undefined, { productId: p.id })
    qtyBy.set(p.id, (qtyBy.get(p.id) ?? 0) + l.qty)
    return { line: l, product: p, ...priceLine(p, l.picks ?? {}) }
  })
  for (const [id, qty] of qtyBy) {
    const stock = byId.get(id)!.stock
    if (stock !== null && stock < qty) throw outOfStock(id, stock)
  }

  const settings = await getSettings(db)
  const t = nowSec()
  await assertSlotAvailable(db, settings.pickup, input.pickupAt, t)

  const subtotal = priced.reduce((s, i) => s + i.unitPrice * i.line.qty, 0)
  const orderId = nanoid()
  const holdExpiresAt = t + settings.orders.pendingHoldHours * 3600

  // Người đặt chưa đăng nhập mà SĐT đã có tài khoản thì đơn vẫn gắn vào tài khoản đó (BR-ACC-1)
  const ownerSql = opts.userId ? '?' : '(SELECT id FROM users WHERE phone = ?)'
  const ownerBind = opts.userId ?? input.contact.phone

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = (opts.newCode ?? newOrderCode)()
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO orders (id, code, user_id, status, contact_name, contact_phone, contact_email, contact_address, note,
                               pickup_at, subtotal, total, hold_expires_at, created_at, updated_at)
           VALUES (?, ?, ${ownerSql}, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          orderId, code, ownerBind, input.contact.name, input.contact.phone, input.contact.email, input.contact.address, input.note,
          input.pickupAt, subtotal, subtotal, holdExpiresAt, t, t,
        ),
      ...priced.map((i) =>
        db
          .prepare('INSERT INTO order_items (order_id, product_id, name, image, unit_price, qty, options) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(orderId, i.product.id, i.product.name, i.image, i.unitPrice, i.line.qty, JSON.stringify(i.options)),
      ),
      db.prepare(`INSERT INTO order_events (order_id, status, at) VALUES (?, 'pending', ?)`).bind(orderId, t),
      ...[...qtyBy].flatMap(([id, qty]) =>
        byId.get(id)!.stock === null
          ? []
          : [db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock IS NOT NULL').bind(qty, t, id)],
      ),
    ]
    if (opts.userId) stmts.push(db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(opts.userId))

    try {
      await db.batch(stmts)
    } catch (e) {
      if (/UNIQUE constraint failed: orders\.code/i.test(String((e as Error)?.message))) continue
      if (isCheck(e, /stock/i)) throw await outOfStockFromDb(db, qtyBy)
      throw e
    }

    // KV không nằm trong giao dịch; xóa thất bại cũng không sao, giỏ cũ tự hết hạn
    if (opts.guestKv) await opts.guestKv.kv.delete(`cart:${opts.guestKv.cartId}`).catch(() => {})
    const row = (await findOrder(db, 'id', orderId))!
    return getFullOrder(db, row)
  }
  throw new AppError(500, 'internal_error', 'Không tạo được mã đơn, vui lòng thử lại')
}

const outOfStock = (productId: number, available: number) =>
  new AppError(409, 'out_of_stock', 'Số lượng xe trong kho không đủ', undefined, { productId, available })

async function outOfStockFromDb(db: D1Database, qtyBy: Map<number, number>) {
  const ids = [...qtyBy.keys()]
  const { results } = await db
    .prepare(`SELECT id, stock FROM products WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<{ id: number; stock: number | null }>()
  const short = results.find((r) => r.stock !== null && r.stock < (qtyBy.get(r.id) ?? 0)) ?? results[0]
  return outOfStock(short?.id ?? ids[0], short?.stock ?? 0)
}

// ---------- Đổi trạng thái có chống đua (docs/03 mục 6.2, 6.3) ----------

// Cùng điều kiện token nhưng cho audit chỉ ghi khi lần gọi này thật sự thắng
const tokenGuard = `EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_token = ?)`

export async function transitionOrder(
  db: D1Database,
  order: Pick<OrderRow, 'id' | 'code' | 'status'>,
  opts: { to: OrderStatus; note?: string | null; actorId?: string | null; requirePaid?: boolean; audit?: Omit<AuditEntry, 'target'> },
) {
  if (!TRANSITIONS[order.status].includes(opts.to)) {
    throw new AppError(409, 'invalid_transition', 'Không thể chuyển đơn sang trạng thái này')
  }
  const token = nanoid()
  const t = nowSec()
  const restock = opts.to === 'cancelled' || opts.to === 'expired'
  const items = restock
    ? (await db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').bind(order.id).all<{ product_id: number; qty: number }>()).results
    : []

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE orders SET status = ?, last_token = ?, updated_at = ?
         WHERE id = ? AND status = ?${opts.requirePaid ? ' AND paid_total = total' : ''}`,
      )
      .bind(opts.to, token, t, order.id, order.status),
    db
      .prepare(`INSERT INTO order_events (order_id, status, note, actor_id, at) SELECT ?, ?, ?, ?, ? WHERE ${tokenGuard}`)
      .bind(order.id, opts.to, opts.note ?? null, opts.actorId ?? null, t, order.id, token),
    ...items.map((i) =>
      db
        .prepare(`UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND stock IS NOT NULL AND ${tokenGuard}`)
        .bind(i.qty, t, i.product_id, order.id, token),
    ),
  ]
  if (opts.audit) {
    stmts.push(
      db
        .prepare(`INSERT INTO audit_log (actor_id, action, target, detail, at) SELECT ?, ?, ?, ?, ? WHERE ${tokenGuard}`)
        .bind(opts.audit.actorId, opts.audit.action, `order:${order.code}`, opts.audit.detail === undefined ? null : JSON.stringify(opts.audit.detail), t, order.id, token),
    )
  }
  await db.batch(stmts)

  const after = await findOrder(db, 'id', order.id)
  if (!after) throw new AppError(404, 'order_not_found', 'Không tìm thấy đơn hàng')
  if (after.last_token !== token) {
    if (opts.requirePaid && after.status === order.status && after.paid_total !== after.total) {
      throw new AppError(409, 'payment_incomplete', 'Cần thu đủ tiền trước khi giao xe', undefined, { remaining: after.total - after.paid_total })
    }
    throw new AppError(409, 'invalid_transition', 'Đơn đã được xử lý bởi người khác')
  }
  return after
}

// Khách (chủ đơn) hoặc admin hủy đơn
export async function cancelOrder(
  db: D1Database,
  order: OrderRow,
  opts: { actorId: string | null; note?: string | null; byAdmin: boolean; audit?: Omit<AuditEntry, 'target'> },
) {
  if (!opts.byAdmin && !canCancelStatus(order.status)) {
    throw new AppError(409, 'invalid_transition', 'Đơn này không thể hủy nữa')
  }
  return transitionOrder(db, order, { to: 'cancelled', note: opts.note, actorId: opts.actorId, audit: opts.audit })
}

// Cron: đơn pending quá hạn giữ xe thành expired, trả kho. Idempotent, tối đa `limit` đơn mỗi lần.
export async function expireOrders(db: D1Database, now = nowSec(), limit = 200) {
  const { results } = await db
    .prepare(`SELECT id, code, status FROM orders WHERE status = 'pending' AND hold_expires_at < ? ORDER BY hold_expires_at LIMIT ?`)
    .bind(now, limit)
    .all<Pick<OrderRow, 'id' | 'code' | 'status'>>()
  let expired = 0
  for (const o of results) {
    try {
      await transitionOrder(db, o, { to: 'expired', actorId: null })
      expired++
    } catch (e) {
      if (!(e instanceof AppError)) throw e // thua cuộc đua với admin/khách: bỏ qua
    }
  }
  return expired
}

// ---------- Thu tiền (docs/03 mục 6.4) ----------

export async function recordPayment(
  db: D1Database,
  order: OrderRow,
  opts: { amount: number; method: 'cash' | 'transfer'; note: string | null; actorId: string },
) {
  if (order.status === 'cancelled' || order.status === 'expired') {
    throw new AppError(409, 'invalid_transition', 'Không thể thu tiền cho đơn đã hủy hoặc hết hạn')
  }
  const t = nowSec()
  const live = `EXISTS (SELECT 1 FROM orders WHERE id = ? AND status NOT IN ('cancelled','expired'))`
  let results: D1Result[]
  try {
    results = await db.batch([
      db
        .prepare(`INSERT INTO payments (order_id, amount, method, note, received_by, at) SELECT ?, ?, ?, ?, ?, ? WHERE ${live}`)
        .bind(order.id, opts.amount, opts.method, opts.note, opts.actorId, t, order.id),
      db
        .prepare(`UPDATE orders SET paid_total = paid_total + ?, updated_at = ? WHERE id = ? AND status NOT IN ('cancelled','expired')`)
        .bind(opts.amount, t, order.id),
      db
        .prepare(`INSERT INTO audit_log (actor_id, action, target, detail, at) SELECT ?, 'order.payment', ?, ?, ? WHERE ${live}`)
        .bind(opts.actorId, `order:${order.code}`, JSON.stringify({ amount: opts.amount, method: opts.method }), t, order.id),
    ])
  } catch (e) {
    if (isCheck(e, /paid_total/i)) {
      throw new AppError(409, 'overpay', 'Số tiền thu vượt quá tổng đơn', undefined, { remaining: order.total - order.paid_total })
    }
    throw e
  }
  if (results[1].meta.changes === 0) throw new AppError(409, 'invalid_transition', 'Không thể thu tiền cho đơn đã hủy hoặc hết hạn')
  return (await findOrder(db, 'id', order.id))!
}

