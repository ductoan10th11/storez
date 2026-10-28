import { z } from 'zod'
import { AppError } from '../middleware/errors'
import { now as nowSec } from '../lib/time'
import { auditStmt } from './audit'
import { availabilityOf, fold } from './catalog'

// ---------- Schema ProductInput (docs/04 mục 9.1) ----------

const key = z.string().trim().min(1, 'Không được để trống').max(40).regex(/^[a-z0-9-]+$/, 'Chỉ gồm a-z, 0-9 và dấu gạch ngang')
const label = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max, `Tối đa ${max} ký tự`)
const nullableInt = z
  .number()
  .int('Phải là số nguyên')
  .min(0, 'Không được âm')
  .nullish()
  .transform((v) => v ?? null)

const choiceSchema = z.object({
  key,
  name: label(80),
  priceDelta: z.number().int('Phải là số nguyên').min(0, 'Không được âm'),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #rrggbb')
    .transform((s) => s.toLowerCase())
    .optional(),
  mediaId: z.number().int().nullish().transform((v) => v ?? null),
})

const groupSchema = z
  .object({
    key,
    name: label(80),
    type: z.enum(['color', 'choice']),
    choices: z.array(choiceSchema).min(1, 'Mỗi nhóm cần ít nhất một lựa chọn'),
  })
  .superRefine((g, ctx) => {
    const seen = new Set<string>()
    g.choices.forEach((c, i) => {
      if (g.type === 'color' && !c.hex) ctx.addIssue({ code: 'custom', path: ['choices', i, 'hex'], message: 'Nhóm màu cần mã màu #rrggbb' })
      if (seen.has(c.key)) ctx.addIssue({ code: 'custom', path: ['choices', i, 'key'], message: 'Khóa lựa chọn bị trùng' })
      seen.add(c.key)
    })
  })

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự').max(120, 'Tên tối đa 120 ký tự'),
    slug: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Chỉ gồm a-z, 0-9 và dấu gạch ngang')
      .optional(),
    category: z.string().trim().min(1, 'Chọn danh mục'),
    description: z.string().trim().max(2000, 'Tối đa 2000 ký tự').default(''),
    spec: z.string().trim().max(200, 'Tối đa 200 ký tự').default(''),
    badge: z.string().trim().max(20, 'Tối đa 20 ký tự').default(''),
    basePrice: z.number().int('Phải là số nguyên').min(0, 'Không được âm'),
    stock: nullableInt,
    leadTimeDays: nullableInt,
    active: z.boolean().default(true),
    images: z.array(z.number().int()).default([]),
    options: z.array(groupSchema).default([]),
  })
  .superRefine((p, ctx) => {
    const keys = new Set<string>()
    p.options.forEach((g, i) => {
      if (keys.has(g.key)) ctx.addIssue({ code: 'custom', path: ['options', i, 'key'], message: 'Khóa nhóm bị trùng' })
      keys.add(g.key)
    })
    const imgs = new Set<number>()
    p.images.forEach((m, i) => {
      if (imgs.has(m)) ctx.addIssue({ code: 'custom', path: ['images', i], message: 'Ảnh bị lặp' })
      imgs.add(m)
    })
  })
export type ProductInput = z.output<typeof productInputSchema>

export const quickPatchSchema = z.object({
  active: z.boolean().optional(),
  stock: nullableInt.optional(),
})

const validationFailed = (fields: Record<string, string>) => new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', fields)

// ---------- Đọc ----------

type Row = {
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

const PRODUCT_SELECT = `SELECT p.id, p.slug, c.slug AS category, p.name, p.description, p.spec, p.badge, p.base_price, p.stock, p.lead_time_days, p.active
  FROM products p JOIN categories c ON c.id = p.category_id`

export async function loadAdminProduct(db: D1Database, id: number) {
  const p = await db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).bind(id).first<Row>()
  if (!p) return null
  const [images, groups, choices] = await db.batch([
    db.prepare(`SELECT m.id, m.url FROM product_images pi JOIN media m ON m.id = pi.media_id WHERE pi.product_id = ? ORDER BY pi.sort, m.id`).bind(id),
    db.prepare('SELECT id, key, name, type FROM option_groups WHERE product_id = ? ORDER BY sort, id').bind(id),
    db.prepare(
      `SELECT c.group_id, c.key, c.name, c.price_delta, c.hex, c.media_id, m.url AS image
       FROM option_choices c JOIN option_groups g ON g.id = c.group_id LEFT JOIN media m ON m.id = c.media_id
       WHERE g.product_id = ? ORDER BY c.sort, c.id`,
    ).bind(id),
  ])
  const choicesBy = new Map<number, unknown[]>()
  for (const c of choices.results as { group_id: number; key: string; name: string; price_delta: number; hex: string | null; media_id: number | null; image: string | null }[]) {
    const list = choicesBy.get(c.group_id) ?? choicesBy.set(c.group_id, []).get(c.group_id)!
    list.push({ key: c.key, name: c.name, priceDelta: c.price_delta, hex: c.hex ?? undefined, mediaId: c.media_id, image: c.image })
  }
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    description: p.description,
    spec: p.spec,
    badge: p.badge,
    basePrice: p.base_price,
    stock: p.stock,
    leadTimeDays: p.lead_time_days,
    active: p.active === 1,
    images: images.results as { id: number; url: string }[],
    options: (groups.results as { id: number; key: string; name: string; type: string }[]).map((g) => ({
      key: g.key,
      name: g.name,
      type: g.type,
      choices: choicesBy.get(g.id) ?? [],
    })),
  }
}

export async function listAdminProducts(
  db: D1Database,
  q: { q?: string; category?: string; active?: '0' | '1'; page: number; pageSize: number },
) {
  const { results } = await db
    .prepare(
      `${PRODUCT_SELECT} ORDER BY p.id`,
    )
    .all<Row>()
  const imgs = await db
    .prepare(
      `SELECT pi.product_id, m.url FROM product_images pi JOIN media m ON m.id = pi.media_id
       WHERE pi.sort = (SELECT MIN(sort) FROM product_images x WHERE x.product_id = pi.product_id)
       ORDER BY pi.product_id, pi.media_id`,
    )
    .all<{ product_id: number; url: string }>()
  const mainImage = new Map<number, string>()
  for (const r of imgs.results) if (!mainImage.has(r.product_id)) mainImage.set(r.product_id, r.url)

  const needle = q.q?.trim() ? fold(q.q.trim()) : null
  const filtered = results.filter(
    (r) =>
      (!q.category || r.category === q.category) &&
      (q.active === undefined || String(r.active) === q.active) &&
      (!needle || fold(`${r.name} ${r.slug}`).includes(needle)),
  )
  const start = (q.page - 1) * q.pageSize
  return {
    items: filtered.slice(start, start + q.pageSize).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      category: r.category,
      price: r.base_price,
      image: mainImage.get(r.id) ?? '',
      stock: r.stock,
      active: r.active === 1,
      availability: availabilityOf(r.stock),
      leadTimeDays: r.lead_time_days,
    })),
    total: filtered.length,
    page: q.page,
    pageSize: q.pageSize,
  }
}

// ---------- Ghi ----------

const slugify = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'san-pham'

async function uniqueSlug(db: D1Database, base: string) {
  const { results } = await db.prepare(`SELECT slug FROM products WHERE slug = ? OR slug LIKE ?`).bind(base, `${base}-%`).all<{ slug: string }>()
  const taken = new Set(results.map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

// Kiểm tra danh mục và ảnh tồn tại; trả id danh mục
async function resolveRefs(db: D1Database, input: ProductInput) {
  const cat = await db.prepare('SELECT id FROM categories WHERE slug = ?').bind(input.category).first<{ id: number }>()
  if (!cat) throw validationFailed({ category: 'Danh mục không tồn tại' })

  const wanted = new Map<number, string>() // mediaId -> đường dẫn trường
  input.images.forEach((id, i) => wanted.set(id, `images.${i}`))
  input.options.forEach((g, gi) =>
    g.choices.forEach((c, ci) => {
      if (c.mediaId !== null && !wanted.has(c.mediaId)) wanted.set(c.mediaId, `options.${gi}.choices.${ci}.mediaId`)
    }),
  )
  if (wanted.size) {
    const ids = [...wanted.keys()]
    const { results } = await db.prepare(`SELECT id FROM media WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number }>()
    const have = new Set(results.map((r) => r.id))
    const missing = ids.filter((id) => !have.has(id))
    if (missing.length) throw validationFailed(Object.fromEntries(missing.map((id) => [wanted.get(id)!, 'Ảnh không tồn tại'])))
  }
  return cat.id
}

// Câu lệnh ghi ảnh và tùy chọn, tham chiếu sản phẩm qua id; dùng chung cho tạo và sửa (upsert theo key)
function optionStatements(db: D1Database, productId: number | { slug: string }, input: ProductInput) {
  const pid = typeof productId === 'number' ? { sql: '?', bind: productId } : { sql: '(SELECT id FROM products WHERE slug = ?)', bind: productId.slug }
  const groupId = `(SELECT id FROM option_groups WHERE product_id = ${pid.sql} AND key = ?)`
  const stmts: D1PreparedStatement[] = []

  input.images.forEach((mediaId, sort) => {
    stmts.push(db.prepare(`INSERT INTO product_images (product_id, media_id, sort) VALUES (${pid.sql}, ?, ?)`).bind(pid.bind, mediaId, sort))
  })

  input.options.forEach((g, gi) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO option_groups (product_id, key, name, type, sort) VALUES (${pid.sql}, ?, ?, ?, ?)
           ON CONFLICT (product_id, key) DO UPDATE SET name = excluded.name, type = excluded.type, sort = excluded.sort`,
        )
        .bind(pid.bind, g.key, g.name, g.type, gi),
    )
  })
  input.options.forEach((g) => {
    // Lựa chọn thiếu trong dữ liệu mới thì xóa
    stmts.push(
      db
        .prepare(`DELETE FROM option_choices WHERE group_id = ${groupId} AND key NOT IN (${g.choices.map(() => '?').join(',')})`)
        .bind(pid.bind, g.key, ...g.choices.map((c) => c.key)),
    )
    g.choices.forEach((c, ci) => {
      stmts.push(
        db
          .prepare(
            `INSERT INTO option_choices (group_id, key, name, price_delta, hex, media_id, sort) VALUES (${groupId}, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (group_id, key) DO UPDATE SET name = excluded.name, price_delta = excluded.price_delta,
               hex = excluded.hex, media_id = excluded.media_id, sort = excluded.sort`,
          )
          .bind(pid.bind, g.key, c.key, c.name, c.priceDelta, g.type === 'color' ? (c.hex ?? null) : null, c.mediaId, ci),
      )
    })
  })
  return stmts
}

const isSlugConflict = (e: unknown) => /UNIQUE constraint failed: products\.slug/i.test(String((e as Error)?.message))
const slugConflict = () => new AppError(409, 'conflict', 'Slug đã tồn tại', { slug: 'Slug đã tồn tại' })

export async function createProduct(db: D1Database, input: ProductInput, actorId: string) {
  const categoryId = await resolveRefs(db, input)
  const slug = input.slug ?? (await uniqueSlug(db, slugify(input.name)))
  const t = nowSec()
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO products (slug, category_id, name, description, spec, badge, base_price, stock, lead_time_days, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(slug, categoryId, input.name, input.description, input.spec, input.badge, input.basePrice, input.stock, input.leadTimeDays, input.active ? 1 : 0, t, t),
      ...optionStatements(db, { slug }, input),
      db
        .prepare(`INSERT INTO audit_log (actor_id, action, target, detail, at) SELECT ?, 'product.create', 'product:' || id, ?, ? FROM products WHERE slug = ?`)
        .bind(actorId, JSON.stringify({ name: input.name, slug }), t, slug),
    ])
  } catch (e) {
    if (isSlugConflict(e)) throw slugConflict()
    throw e
  }
  const row = await db.prepare('SELECT id FROM products WHERE slug = ?').bind(slug).first<{ id: number }>()
  return (await loadAdminProduct(db, row!.id))!
}

export async function updateProduct(db: D1Database, id: number, input: ProductInput, actorId: string) {
  const existing = await db.prepare('SELECT id, slug FROM products WHERE id = ?').bind(id).first<{ id: number; slug: string }>()
  if (!existing) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  const categoryId = await resolveRefs(db, input)
  const t = nowSec()
  const groupKeys = input.options.map((g) => g.key)
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE products SET slug = ?, category_id = ?, name = ?, description = ?, spec = ?, badge = ?, base_price = ?,
             stock = ?, lead_time_days = ?, active = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(input.slug ?? existing.slug, categoryId, input.name, input.description, input.spec, input.badge, input.basePrice, input.stock, input.leadTimeDays, input.active ? 1 : 0, t, id),
      db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(id),
      // Nhóm thiếu trong dữ liệu mới thì xóa (lựa chọn xóa theo cascade)
      db
        .prepare(`DELETE FROM option_groups WHERE product_id = ?${groupKeys.length ? ` AND key NOT IN (${groupKeys.map(() => '?').join(',')})` : ''}`)
        .bind(id, ...groupKeys),
      ...optionStatements(db, id, input),
      auditStmt(db, { actorId, action: 'product.update', target: `product:${id}`, detail: { name: input.name } }, t),
    ])
  } catch (e) {
    if (isSlugConflict(e)) throw slugConflict()
    throw e
  }
  return (await loadAdminProduct(db, id))!
}

export async function patchProduct(db: D1Database, id: number, patch: z.output<typeof quickPatchSchema>, actorId: string) {
  const sets: string[] = []
  const binds: (number | null)[] = []
  if (patch.active !== undefined) {
    sets.push('active = ?')
    binds.push(patch.active ? 1 : 0)
  }
  if (patch.stock !== undefined) {
    sets.push('stock = ?')
    binds.push(patch.stock)
  }
  const t = nowSec()
  if (!(await db.prepare('SELECT 1 AS ok FROM products WHERE id = ?').bind(id).first())) {
    throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  }
  if (sets.length) {
    await db.batch([
      db.prepare(`UPDATE products SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, t, id),
      auditStmt(db, { actorId, action: 'product.patch', target: `product:${id}`, detail: patch }, t),
    ])
  }
  const p = await loadAdminProduct(db, id)
  if (!p) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  return p
}

export async function deleteProduct(db: D1Database, id: number, actorId: string) {
  const p = await db.prepare('SELECT name, slug FROM products WHERE id = ?').bind(id).first<{ name: string; slug: string }>()
  if (!p) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  // Cascade xóa nhóm, lựa chọn, ảnh, dòng giỏ; order_items.product_id thành NULL; media giữ nguyên
  await db.batch([
    db.prepare('DELETE FROM products WHERE id = ?').bind(id),
    auditStmt(db, { actorId, action: 'product.delete', target: `product:${id}`, detail: p }),
  ])
}

// ---------- Danh mục ----------

export const categoryCreateSchema = z.object({
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Chỉ gồm a-z, 0-9 và dấu gạch ngang'),
  name: label(60),
  sort: z.number().int().optional(),
})
export const categoryUpdateSchema = z.object({ name: label(60), sort: z.number().int().default(0) })

export async function listAdminCategories(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.sort, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS count
       FROM categories c ORDER BY c.sort, c.id`,
    )
    .all()
  return results
}

export async function createCategory(db: D1Database, input: z.output<typeof categoryCreateSchema>, actorId: string) {
  try {
    const sort = input.sort ?? ((await db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM categories').first<{ n: number }>())!.n)
    const res = await db.batch([
      db.prepare('INSERT INTO categories (slug, name, sort) VALUES (?, ?, ?)').bind(input.slug, input.name, sort),
      auditStmt(db, { actorId, action: 'category.create', target: `category:${input.slug}`, detail: input }),
    ])
    return { id: res[0].meta.last_row_id, slug: input.slug, name: input.name, sort, count: 0 }
  } catch (e) {
    if (/UNIQUE constraint failed: categories\.slug/i.test(String((e as Error)?.message))) {
      throw new AppError(409, 'conflict', 'Slug đã tồn tại', { slug: 'Slug đã tồn tại' })
    }
    throw e
  }
}

export async function updateCategory(db: D1Database, id: number, input: z.output<typeof categoryUpdateSchema>, actorId: string) {
  if (!(await db.prepare('SELECT 1 AS ok FROM categories WHERE id = ?').bind(id).first())) {
    throw new AppError(404, 'not_found', 'Không tìm thấy danh mục')
  }
  await db.batch([
    db.prepare('UPDATE categories SET name = ?, sort = ? WHERE id = ?').bind(input.name, input.sort, id),
    auditStmt(db, { actorId, action: 'category.update', target: `category:${id}`, detail: input }),
  ])
  return (await listAdminCategories(db)).find((c) => (c as { id: number }).id === id)
}

export async function deleteCategory(db: D1Database, id: number, actorId: string) {
  const c = await db
    .prepare('SELECT slug, (SELECT COUNT(*) FROM products WHERE category_id = categories.id) AS n FROM categories WHERE id = ?')
    .bind(id)
    .first<{ slug: string; n: number }>()
  if (!c) throw new AppError(404, 'not_found', 'Không tìm thấy danh mục')
  if (c.n > 0) throw new AppError(409, 'category_in_use', 'Danh mục còn sản phẩm, không thể xóa')
  try {
    await db.batch([
      db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
      auditStmt(db, { actorId, action: 'category.delete', target: `category:${c.slug}` }),
    ])
  } catch (e) {
    // Có sản phẩm được thêm vào đúng lúc xóa: khóa ngoại chặn
    if (/FOREIGN KEY/i.test(String((e as Error)?.message))) throw new AppError(409, 'category_in_use', 'Danh mục còn sản phẩm, không thể xóa')
    throw e
  }
}
