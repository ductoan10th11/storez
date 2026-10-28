// Đọc sản phẩm cùng nhóm tùy chọn, lựa chọn, ảnh; tính tình trạng xe (BR-STK-2).
export type Availability = 'in_stock' | 'preorder' | 'out_of_stock'

export type Choice = { id: string; name: string; price: number; hex?: string; image: string | null }
export type OptionGroup = { id: string; name: string; type: 'color' | 'choice'; choices: Choice[] }

export type Product = {
  id: number
  slug: string
  category: string
  name: string
  description: string
  spec: string
  badge: string
  price: number
  image: string
  images: string[]
  availability: Availability
  leadTimeDays: number | null
  options: OptionGroup[]
}

// Bản dùng nội bộ: thêm active và stock (không lộ ra cửa hàng)
export type CatalogProduct = Product & { active: boolean; stock: number | null }

type ProductRow = {
  id: number
  slug: string
  category: string
  name: string
  description: string
  spec: string
  badge: string
  base_price: number
  stock: number | null
  lead_time_days: number | null
  active: number
}

export const availabilityOf = (stock: number | null): Availability =>
  stock === null ? 'preorder' : stock > 0 ? 'in_stock' : 'out_of_stock'

// D1 giới hạn số tham số bind; quá ngưỡng thì đọc không lọc rồi lọc ở bộ nhớ
const IN_LIMIT = 80

const inFilter = (column: string, ids: number[] | null) =>
  ids && ids.length <= IN_LIMIT ? { sql: ` WHERE ${column} IN (${ids.map(() => '?').join(',') || 'NULL'})`, binds: ids } : { sql: '', binds: [] as number[] }

export async function loadProducts(
  db: D1Database,
  opts: { ids?: number[]; slug?: string; includeInactive?: boolean } = {},
): Promise<CatalogProduct[]> {
  const where: string[] = []
  const binds: (string | number)[] = []
  if (opts.ids) {
    where.push(`p.id IN (${opts.ids.map(() => '?').join(',') || 'NULL'})`)
    binds.push(...opts.ids)
  }
  if (opts.slug !== undefined) {
    where.push('p.slug = ?')
    binds.push(opts.slug)
  }
  if (!opts.includeInactive) where.push('p.active = 1')

  const { results: rows } = await db
    .prepare(
      `SELECT p.id, p.slug, c.slug AS category, p.name, p.description, p.spec, p.badge, p.base_price,
              p.stock, p.lead_time_days, p.active
       FROM products p JOIN categories c ON c.id = p.category_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.id`,
    )
    .bind(...binds)
    .all<ProductRow>()
  if (!rows.length) return []

  const ids = rows.map((r) => r.id)
  const idSet = new Set(ids)
  const f = inFilter('pi.product_id', ids)
  const g = inFilter('g.product_id', ids)

  const [images, groups, choices] = await db.batch([
    db.prepare(
      `SELECT pi.product_id, m.url FROM product_images pi JOIN media m ON m.id = pi.media_id${f.sql}
       ORDER BY pi.product_id, pi.sort, pi.media_id`,
    ).bind(...f.binds),
    db.prepare(
      `SELECT g.id, g.product_id, g.key, g.name, g.type FROM option_groups g${g.sql} ORDER BY g.product_id, g.sort, g.id`,
    ).bind(...g.binds),
    db.prepare(
      `SELECT c.group_id, c.key, c.name, c.price_delta, c.hex, m.url AS image
       FROM option_choices c JOIN option_groups g ON g.id = c.group_id LEFT JOIN media m ON m.id = c.media_id${g.sql}
       ORDER BY c.group_id, c.sort, c.id`,
    ).bind(...g.binds),
  ])

  const imagesBy = new Map<number, string[]>()
  for (const r of images.results as { product_id: number; url: string }[]) {
    if (idSet.has(r.product_id)) (imagesBy.get(r.product_id) ?? imagesBy.set(r.product_id, []).get(r.product_id)!).push(r.url)
  }
  const choicesBy = new Map<number, Choice[]>()
  for (const r of choices.results as { group_id: number; key: string; name: string; price_delta: number; hex: string | null; image: string | null }[]) {
    const list = choicesBy.get(r.group_id) ?? choicesBy.set(r.group_id, []).get(r.group_id)!
    list.push({ id: r.key, name: r.name, price: r.price_delta, ...(r.hex ? { hex: r.hex } : {}), image: r.image })
  }
  const groupsBy = new Map<number, OptionGroup[]>()
  for (const r of groups.results as { id: number; product_id: number; key: string; name: string; type: 'color' | 'choice' }[]) {
    const cs = choicesBy.get(r.id)
    if (!cs?.length || !idSet.has(r.product_id)) continue // nhóm rỗng bị loại
    const list = groupsBy.get(r.product_id) ?? groupsBy.set(r.product_id, []).get(r.product_id)!
    list.push({ id: r.key, name: r.name, type: r.type, choices: cs })
  }

  return rows.map((r) => {
    const imgs = imagesBy.get(r.id) ?? []
    return {
      id: r.id,
      slug: r.slug,
      category: r.category,
      name: r.name,
      description: r.description,
      spec: r.spec,
      badge: r.badge,
      price: r.base_price,
      image: imgs[0] ?? '',
      images: imgs,
      availability: availabilityOf(r.stock),
      leadTimeDays: r.lead_time_days,
      options: groupsBy.get(r.id) ?? [],
      active: r.active === 1,
      stock: r.stock,
    }
  })
}

export const toPublic = ({ active: _a, stock: _s, ...p }: CatalogProduct): Product => p

// Bỏ dấu, hạ chữ thường để tìm kiếm không phân biệt dấu
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export async function listProducts(db: D1Database, q: { category?: string; q?: string; sort?: 'price_asc' | 'price_desc' }) {
  let list = await loadProducts(db)
  if (q.category) list = list.filter((p) => p.category === q.category)
  if (q.q?.trim()) {
    const needle = fold(q.q.trim())
    list = list.filter((p) => fold(`${p.name} ${p.spec}`).includes(needle))
  }
  if (q.sort === 'price_asc') list.sort((a, b) => a.price - b.price || a.id - b.id)
  if (q.sort === 'price_desc') list.sort((a, b) => b.price - a.price || a.id - b.id)
  return list.map(toPublic)
}

export async function listCategories(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.slug, c.name,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS count
       FROM categories c ORDER BY c.sort, c.id`,
    )
    .all<{ id: number; slug: string; name: string; count: number }>()
  return results
}
