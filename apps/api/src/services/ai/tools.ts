import { z } from 'zod'
import { getSettings } from '../../lib/settings'
import type { Bindings } from '../../env'
import { fold, listCategories, loadProducts, toPublic, type CatalogProduct, type Product } from '../catalog'
import { normalizePicks, priceLine, type Picks } from '../pricing'
import type { ToolDef } from './llm'
import { rerank } from './rerank'

// Công cụ để Speedy tra cứu sản phẩm. Mọi dữ liệu đọc thẳng từ D1 mỗi lần gọi nên luôn khớp với cửa hàng.
// Chỉ trả thông tin công khai: không lộ số lượng tồn kho, không có sản phẩm đã ẩn.

// Điểm reranker tối thiểu để coi là liên quan (0..1); chỉnh bằng scripts/eval-speedy.ts
export const RERANK_MIN_SCORE = 0.2
const MAX_CANDIDATES = 60
const MAX_RESULTS = 6

export type ToolContext = { env: Pick<Bindings, 'DB'> & Partial<Bindings> }
export type ToolResult = { data: unknown; products?: Product[] } // products: sản phẩm đã tra được, để UI dựng thẻ

export const priceText = (n: number) => {
  const fmt = (v: number, unit: string) => `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${unit}`
  if (n >= 1e9) return fmt(n / 1e9, 'tỷ đồng')
  if (n >= 1e6) return fmt(n / 1e6, 'triệu đồng')
  return `${new Intl.NumberFormat('vi-VN').format(n)} đồng`
}

const availabilityText = (p: Pick<Product, 'availability' | 'leadTimeDays'>) =>
  p.availability === 'in_stock'
    ? 'Có sẵn tại showroom'
    : p.availability === 'out_of_stock'
      ? 'Hết hàng'
      : p.leadTimeDays
        ? `Đặt trước, nhận xe sau khoảng ${p.leadTimeDays} ngày`
        : 'Đặt trước, làm theo đơn'

const categoryNames = async (db: D1Database) => new Map((await listCategories(db)).map((c) => [c.slug, c.name]))

const brief = (p: Product, cats: Map<string, string>) => ({
  slug: p.slug,
  name: p.name,
  category: cats.get(p.category) ?? p.category,
  priceVnd: p.price,
  price: `từ ${priceText(p.price)}`,
  spec: p.spec,
  ...(p.badge ? { badge: p.badge } : {}),
  availability: availabilityText(p),
  url: `/p/${p.slug}`,
})

const detail = (p: Product, cats: Map<string, string>) => ({
  ...brief(p, cats),
  description: p.description,
  options: p.options.map((g) => ({
    group: g.name,
    choices: g.choices.map((c) => ({ name: c.name, extra: c.price ? `+${priceText(c.price)}` : 'không phụ phí' })),
  })),
})

const STOP = new Set(['xe', 'cai', 'chiec', 'loai', 'mua', 'tim', 'can', 'muon', 'cho', 'toi', 'minh', 'co', 'khong', 'nao', 'la', 'va', 'the', 'ban', 'tu', 'van', 'gia'])
const tokens = (q: string) => fold(q).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t))

const haystack = (p: Product, catName: string) => fold(`${p.name} ${catName} ${p.spec} ${p.badge} ${p.description}`)

// ---------- search_products ----------

const searchArgs = z.object({
  query: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  min_price: z.number().nonnegative().optional(),
  max_price: z.number().nonnegative().optional(),
  in_stock_only: z.boolean().optional(),
  sort: z.enum(['price_asc', 'price_desc']).optional(),
  limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
})

async function searchProducts(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const a = searchArgs.parse(raw)
  const cats = await categoryNames(ctx.env.DB)
  const limit = a.limit ?? MAX_RESULTS
  let list = (await loadProducts(ctx.env.DB)).map(toPublic)

  if (a.category) {
    const want = fold(a.category)
    const slug = [...cats].find(([s, n]) => fold(s) === want || fold(n) === want)?.[0]
    list = list.filter((p) => (slug ? p.category === slug : fold(cats.get(p.category) ?? '').includes(want)))
  }
  if (a.min_price !== undefined) list = list.filter((p) => p.price >= a.min_price!)
  if (a.max_price !== undefined) list = list.filter((p) => p.price <= a.max_price!)
  if (a.in_stock_only) list = list.filter((p) => p.availability === 'in_stock')

  let ranked = list
  let method: 'filter' | 'rerank' | 'keyword' = 'filter'
  if (a.query && list.length) {
    const terms = tokens(a.query)
    const hay = new Map(list.map((p) => [p.id, haystack(p, cats.get(p.category) ?? '')]))
    const hits = (p: Product) => terms.filter((t) => hay.get(p.id)!.includes(t)).length
    // Quá nhiều ứng viên thì chọn trước theo từ khóa để không gửi cả kho cho reranker
    const pool = list.length > MAX_CANDIDATES ? [...list].sort((x, y) => hits(y) - hits(x)).slice(0, MAX_CANDIDATES) : list
    const docs = pool.map((p) => `${p.name}. ${cats.get(p.category) ?? ''}. ${p.spec}. ${p.description}`)
    const scores = await rerank(ctx.env, a.query, docs)
    if (scores) {
      method = 'rerank'
      ranked = pool
        .map((p, i) => ({ p, s: scores[i] }))
        .filter((x) => x.s >= RERANK_MIN_SCORE)
        .sort((x, y) => y.s - x.s)
        .map((x) => x.p)
    } else {
      method = 'keyword'
      ranked = terms.length ? list.filter((p) => hits(p) > 0).sort((x, y) => hits(y) - hits(x)) : list
    }
  }

  if (a.sort === 'price_asc') ranked = [...ranked].sort((x, y) => x.price - y.price || x.id - y.id)
  if (a.sort === 'price_desc') ranked = [...ranked].sort((x, y) => y.price - x.price || x.id - y.id)

  const out = ranked.slice(0, limit)

  // Lọc "có sẵn" mà không có xe nào: cho mô hình biết các xe khớp nhưng chỉ nhận đặt trước, đừng thử lại vô ích
  let preorderOnly = 0
  if (a.in_stock_only && !ranked.length) {
    preorderOnly = (await searchProducts(ctx, { ...a, in_stock_only: false, limit: MAX_RESULTS })).products?.length ?? 0
  }
  return {
    data: {
      matched: ranked.length,
      shown: out.length,
      method,
      products: out.map((p) => brief(p, cats)),
      ...(ranked.length === 0
        ? {
            note: preorderOnly
              ? `Không có xe nào có sẵn tại showroom với điều kiện này, nhưng có ${preorderOnly} xe khớp nhu cầu nhận đặt trước (làm theo đơn). Hãy tìm lại KHÔNG dùng in_stock_only và nói rõ với khách đó là xe đặt trước.`
              : 'Không có sản phẩm nào phù hợp điều kiện này. Có thể nới lỏng điều kiện (giá, loại) rồi tìm lại.',
          }
        : {}),
    },
    products: out,
  }
}

// ---------- get_product / compare_products ----------

const bySlugOrName = (list: CatalogProduct[], key: string) => {
  const k = fold(key.trim())
  return list.find((p) => p.slug === key.trim()) ?? list.find((p) => fold(p.name) === k) ?? list.find((p) => fold(p.name).includes(k) && k.length >= 3)
}

async function getProduct(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const { slug } = z.object({ slug: z.string().trim().min(1).max(100) }).parse(raw)
  const all = await loadProducts(ctx.env.DB)
  const p = bySlugOrName(all, slug)
  if (!p) return { data: { error: 'Không tìm thấy sản phẩm này. Hãy dùng search_products để tìm đúng slug.' } }
  return { data: detail(toPublic(p), await categoryNames(ctx.env.DB)), products: [toPublic(p)] }
}

async function compareProducts(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const { slugs } = z.object({ slugs: z.array(z.string().trim().min(1).max(100)).min(2).max(4) }).parse(raw)
  const all = await loadProducts(ctx.env.DB)
  const cats = await categoryNames(ctx.env.DB)
  const found: Product[] = []
  const missing: string[] = []
  for (const s of slugs) {
    const p = bySlugOrName(all, s)
    if (p && !found.some((f) => f.id === p.id)) found.push(toPublic(p))
    else if (!p) missing.push(s)
  }
  return {
    data: { products: found.map((p) => detail(p, cats)), ...(missing.length ? { notFound: missing } : {}) },
    products: found,
  }
}

// ---------- quote ----------

// Chọn lựa chọn theo id hoặc tên (không phân biệt dấu); nhóm không khớp lấy mặc định và báo lại
function resolvePicks(p: CatalogProduct, wanted: Record<string, string>) {
  const picks: Picks = {}
  const assumed: string[] = []
  for (const g of p.options) {
    const entry = Object.entries(wanted).find(([k]) => fold(k) === fold(g.id) || fold(k) === fold(g.name))
    const choice = entry && g.choices.find((c) => fold(c.id) === fold(entry[1]) || fold(c.name) === fold(entry[1]))
    if (choice) picks[g.id] = choice.id
    else assumed.push(g.name)
  }
  return { picks: normalizePicks(p, picks), assumed }
}

async function quote(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const a = z.object({ slug: z.string().trim().min(1).max(100), choices: z.record(z.string(), z.string()).optional() }).parse(raw)
  const p = bySlugOrName(await loadProducts(ctx.env.DB), a.slug)
  if (!p) return { data: { error: 'Không tìm thấy sản phẩm này.' } }
  const { picks, assumed } = resolvePicks(p, a.choices ?? {})
  const line = priceLine(p, picks)
  return {
    data: {
      product: p.name,
      selections: line.options.map((o) => ({ group: o.group, choice: o.choice, extra: o.price ? `+${priceText(o.price)}` : 'không phụ phí' })),
      ...(assumed.length ? { defaultedGroups: assumed } : {}),
      basePrice: priceText(p.price),
      totalVnd: line.unitPrice,
      total: priceText(line.unitPrice),
    },
    products: [toPublic(p)],
  }
}

// ---------- get_showroom_info ----------

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

async function showroomInfo(ctx: ToolContext): Promise<ToolResult> {
  const { showroom, pickup, orders } = await getSettings(ctx.env.DB)
  return {
    data: {
      name: showroom.name,
      address: showroom.address,
      phone: showroom.phone,
      openHours: `${pickup.open} - ${pickup.close}`,
      openDays: pickup.days.map((d) => WEEKDAYS[d]),
      howToBuy: `Khách đặt xe trên website và chọn khung giờ đến showroom nhận xe (mỗi khung ${pickup.slotMinutes} phút, đặt trước tối thiểu ${pickup.minNoticeHours} giờ, tối đa ${pickup.maxAdvanceDays} ngày). Đơn chờ xác nhận được giữ ${orders.pendingHoldHours} giờ. Không giao hàng, không có phí vận chuyển, không thanh toán trực tuyến; thanh toán trực tiếp tại showroom (cọc nếu có do nhân viên ghi nhận).`,
    },
  }
}

// ---------- Đăng ký ----------

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required })

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description:
        'Tìm sản phẩm đang bán theo nhu cầu và điều kiện. Dùng cho mọi câu hỏi gợi ý/tìm kiếm/lọc theo giá, loại, còn hàng. Có thể gọi không có query để liệt kê theo bộ lọc.',
      parameters: obj({
        query: { type: 'string', description: 'Mô tả nhu cầu bằng tiếng Việt, vd "xe điện đi trong phố", "máy bay 2 chỗ". Bỏ trống nếu chỉ lọc.' },
        category: { type: 'string', description: 'Loại sản phẩm: xe-may, o-to, may-bay, truc-thang, xe-tang' },
        min_price: { type: 'integer', description: 'Giá tối thiểu, đơn vị đồng (VND). 500 triệu = 500000000' },
        max_price: { type: 'integer', description: 'Giá tối đa, đơn vị đồng (VND). 1 tỷ = 1000000000' },
        in_stock_only: { type: 'boolean', description: 'Chỉ đặt true khi khách yêu cầu rõ "có sẵn / lấy ngay". Phần lớn xe là đặt trước (làm theo đơn) nên bật cờ này thường cho 0 kết quả.' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc'], description: 'Sắp xếp theo giá' },
        limit: { type: 'integer', description: `Số kết quả tối đa (1-${MAX_RESULTS})` },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description: 'Lấy chi tiết một sản phẩm: mô tả, thông số, tùy chọn (màu, phiên bản, phụ kiện) và phụ phí, tình trạng còn hàng/đặt trước.',
      parameters: obj({ slug: { type: 'string', description: 'slug lấy từ search_products, vd "o-to-city-ev" (hoặc tên sản phẩm)' } }, ['slug']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_products',
      description: 'So sánh 2-4 sản phẩm cạnh nhau (giá, thông số, tùy chọn, tình trạng).',
      parameters: obj({ slugs: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: 'Danh sách slug' } }, ['slugs']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'quote',
      description: 'Tính giá cuối cùng của một sản phẩm khi chọn màu/phiên bản/phụ kiện cụ thể (đã cộng phụ phí). Chọn không nói rõ thì lấy mặc định.',
      parameters: obj(
        {
          slug: { type: 'string' },
          choices: { type: 'object', description: 'Map tên nhóm -> tên lựa chọn, vd {"Màu sắc":"Đỏ","Phiên bản":"Cao cấp"}', additionalProperties: { type: 'string' } },
        },
        ['slug'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_showroom_info',
      description: 'Địa chỉ, số điện thoại, giờ mở cửa showroom và cách mua/nhận xe.',
      parameters: obj({}),
    },
  },
]

const EXECUTORS: Record<string, (ctx: ToolContext, args: unknown) => Promise<ToolResult>> = {
  search_products: searchProducts,
  get_product: getProduct,
  compare_products: compareProducts,
  quote,
  get_showroom_info: showroomInfo,
}

// Chạy một tool theo tên + chuỗi JSON đối số. Lỗi luôn đổi thành { error } để mô hình tự sửa, không làm hỏng cả cuộc trò chuyện.
export async function runTool(ctx: ToolContext, name: string, argsJson: string): Promise<ToolResult> {
  const exec = EXECUTORS[name]
  if (!exec) return { data: { error: `Không có công cụ "${name}"` } }
  let args: unknown
  try {
    args = argsJson.trim() ? JSON.parse(argsJson) : {}
  } catch {
    return { data: { error: 'Đối số không phải JSON hợp lệ' } }
  }
  try {
    return await exec(ctx, args)
  } catch (e) {
    if (e instanceof z.ZodError) return { data: { error: `Đối số không hợp lệ: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` } }
    console.error('tool_error', name, (e as Error)?.message)
    return { data: { error: 'Tra cứu thất bại, hãy thử lại hoặc nói với khách là hệ thống đang bận.' } }
  }
}
