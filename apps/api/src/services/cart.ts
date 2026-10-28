import { AppError } from '../middleware/errors'
import { loadProducts, toPublic } from './catalog'
import { lineId, normalizePicks, priceLine, type Picks } from './pricing'

// Một dòng giỏ. Giỏ cũ trong KV có thể thiếu id/picks.
export type Line = { id?: string; productId: number; qty: number; picks?: Picks }

export const CART_TTL = 60 * 60 * 24 * 30 // 30 ngày
export const MAX_QTY = 99

export const idOf = (l: Line) => l.id ?? `${l.productId}~`

// Hai nguồn giỏ: KV (khách vãng lai) và D1 (người đã đăng nhập)
export interface CartStore {
  read(): Promise<Line[]>
  add(line: Required<Line>): Promise<void>
  setQty(id: string, qty: number): Promise<void> // qty <= 0 thì xóa dòng
  clear(): Promise<void>
}

export const kvStore = (kv: KVNamespace, cartId: string): CartStore => {
  const key = `cart:${cartId}`
  const read = async () => (await kv.get<Line[]>(key, 'json')) ?? []
  const write = (lines: Line[]) => kv.put(key, JSON.stringify(lines), { expirationTtl: CART_TTL })
  return {
    read,
    async add(line) {
      const lines = await read()
      const found = lines.find((l) => idOf(l) === line.id)
      if (found) found.qty = Math.min(found.qty + line.qty, MAX_QTY)
      else lines.push(line)
      await write(lines)
    },
    async setQty(id, qty) {
      const lines = await read()
      await write(
        qty > 0
          ? lines.map((l) => (idOf(l) === id ? { ...l, qty: Math.min(qty, MAX_QTY) } : l))
          : lines.filter((l) => idOf(l) !== id),
      )
    },
    clear: () => kv.delete(key),
  }
}

export const dbStore = (db: D1Database, userId: string): CartStore => ({
  async read() {
    const { results } = await db
      .prepare('SELECT line_key, product_id, picks, qty FROM cart_items WHERE user_id = ? ORDER BY id')
      .bind(userId)
      .all<{ line_key: string; product_id: number; picks: string; qty: number }>()
    return results.map((r) => ({ id: r.line_key, productId: r.product_id, qty: r.qty, picks: safeJson(r.picks) }))
  },
  async add(line) {
    await db
      .prepare(
        `INSERT INTO cart_items (user_id, product_id, line_key, picks, qty) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, line_key) DO UPDATE SET qty = MIN(${MAX_QTY}, qty + excluded.qty)`,
      )
      .bind(userId, line.productId, line.id, JSON.stringify(line.picks), line.qty)
      .run()
  },
  async setQty(id, qty) {
    await (qty > 0
      ? db.prepare(`UPDATE cart_items SET qty = ? WHERE user_id = ? AND line_key = ?`).bind(Math.min(qty, MAX_QTY), userId, id)
      : db.prepare(`DELETE FROM cart_items WHERE user_id = ? AND line_key = ?`).bind(userId, id)
    ).run()
  },
  async clear() {
    await db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(userId).run()
  },
})

const safeJson = (s: string): Picks => {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export const CART_ID_RE = /^[\w-]{8,64}$/

// Ghép dòng giỏ với sản phẩm từ D1 và tính giá theo lựa chọn.
// Xe đã bị ẩn (active = 0) vẫn hiện trong giỏ nhưng báo hết hàng để khách bỏ ra; xe đã xóa thì bị loại.
export async function hydrate(db: D1Database, lines: Line[]) {
  if (!lines.length) return { items: [], total: 0, count: 0 }
  const products = await loadProducts(db, { ids: [...new Set(lines.map((l) => l.productId))], includeInactive: true })
  const byId = new Map(products.map((p) => [p.id, p]))
  const items = lines.flatMap((l) => {
    const p = byId.get(l.productId)
    if (!p) return []
    const picks = normalizePicks(p, l.picks)
    const { options, unitPrice, image } = priceLine(p, picks)
    const product = toPublic(p)
    if (!p.active) product.availability = 'out_of_stock'
    return [{ id: idOf(l), product, qty: l.qty, options, unitPrice, image }]
  })
  return {
    items,
    total: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    count: items.reduce((s, i) => s + i.qty, 0),
  }
}

export async function addToCart(
  db: D1Database,
  store: CartStore,
  input: { productId: number; picks?: Picks; qty?: number },
) {
  const [p] = await loadProducts(db, { ids: [input.productId], includeInactive: true })
  if (!p) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  if (!p.active) throw new AppError(409, 'product_unavailable', 'Sản phẩm không còn bán', undefined, { productId: p.id })
  const picks = normalizePicks(p, input.picks)
  const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(input.qty) || 1)))
  await store.add({ id: lineId(p.id, picks), productId: p.id, qty, picks })
  return hydrate(db, await store.read())
}

export async function setLineQty(db: D1Database, store: CartStore, id: string, qty: number) {
  await store.setQty(id, Math.floor(qty))
  return hydrate(db, await store.read())
}

export async function clearCart(store: CartStore) {
  await store.clear()
  return { items: [], total: 0, count: 0 }
}

// Gộp giỏ KV của khách vào giỏ tài khoản khi đăng nhập/đăng ký (cộng dồn, tối đa 99), rồi xóa KV.
export async function mergeGuestCart(db: D1Database, kv: KVNamespace, userId: string, cartId: string | undefined) {
  if (!cartId || !CART_ID_RE.test(cartId)) return 0
  const key = `cart:${cartId}`
  const lines = (await kv.get<Line[]>(key, 'json')) ?? []
  if (!lines.length) return 0
  const products = await loadProducts(db, { ids: [...new Set(lines.map((l) => l.productId))], includeInactive: true })
  const byId = new Map(products.map((p) => [p.id, p]))
  const stmts = lines.flatMap((l) => {
    const p = byId.get(l.productId)
    if (!p) return []
    const picks = normalizePicks(p, l.picks)
    return [
      db
        .prepare(
          `INSERT INTO cart_items (user_id, product_id, line_key, picks, qty) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id, line_key) DO UPDATE SET qty = MIN(${MAX_QTY}, qty + excluded.qty)`,
        )
        .bind(userId, p.id, lineId(p.id, picks), JSON.stringify(picks), Math.max(1, Math.min(MAX_QTY, l.qty))),
    ]
  })
  if (stmts.length) await db.batch(stmts)
  await kv.delete(key)
  return stmts.length
}
