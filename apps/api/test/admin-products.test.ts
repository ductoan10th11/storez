import { describe, expect, it } from 'vitest'
import { adminCookie, addItem, count, del, env, fileOf, get, newCart, patch, PNG, post, put, quickOrder, setStock, upload } from './helpers'

const product = (over: Record<string, unknown> = {}) => ({
  name: 'Xe Thử Nghiệm',
  category: 'xe-may',
  description: 'Mô tả',
  spec: '110cc · Số',
  badge: 'Mới',
  basePrice: 25_000_000,
  stock: 3,
  leadTimeDays: null,
  active: true,
  images: [] as number[],
  options: [] as any[],
  ...over,
})

async function uploads(admin: any, n: number) {
  const ids: number[] = []
  for (let i = 0; i < n; i++) ids.push((await upload(fileOf(PNG, 32 + i), admin.opts)).json.media.id)
  return ids
}

describe('tạo sản phẩm', () => {
  it('xe mới có 3 màu, mỗi màu một ảnh tải lên; hiện ngay ở cửa hàng; đổi màu đổi ảnh; đặt được và kho giảm (E7)', async () => {
    const admin = await adminCookie()
    const [main, red, blue, green] = await uploads(admin, 4)
    const r = await post(
      '/api/admin/products',
      product({
        images: [main],
        options: [
          {
            key: 'mau', name: 'Màu sắc', type: 'color',
            choices: [
              { key: 'do', name: 'Đỏ', priceDelta: 0, hex: '#FF0000', mediaId: red },
              { key: 'xanh', name: 'Xanh dương', priceDelta: 500_000, hex: '#0000ff', mediaId: blue },
              { key: 'luc', name: 'Xanh lá', priceDelta: 0, hex: '#00ff00', mediaId: green },
            ],
          },
          { key: 'ban', name: 'Phiên bản', type: 'choice', choices: [{ key: 'tieu-chuan', name: 'Tiêu chuẩn', priceDelta: 0 }, { key: 'cao-cap', name: 'Cao cấp', priceDelta: 2_000_000 }] },
        ],
      }),
      admin.opts,
    )
    expect(r.status).toBe(201)
    const p = r.json.product
    expect(p.slug).toBe('xe-thu-nghiem')
    expect(p.id).toBeGreaterThan(15)
    expect(p.options[0].choices.map((c: any) => [c.key, c.hex, c.mediaId])).toEqual([['do', '#ff0000', red], ['xanh', '#0000ff', blue], ['luc', '#00ff00', green]])

    // hiện ngay ở trang chủ
    const shop = await get('/api/products/xe-thu-nghiem')
    expect(shop.status).toBe(200)
    expect(shop.json).toMatchObject({ name: 'Xe Thử Nghiệm', category: 'xe-may', price: 25_000_000, availability: 'in_stock', badge: 'Mới' })
    expect(shop.json.image).toMatch(/^https:\/\/res\.cloudinary\.com\//)
    const colors = shop.json.options[0].choices
    expect(new Set(colors.map((c: any) => c.image)).size).toBe(3) // đổi màu thì ảnh đổi
    expect((await get('/api/products')).json).toHaveLength(16)

    // vào giỏ: ảnh theo màu đã chọn
    const cart = newCart()
    const added = await addItem(cart, p.id, { mau: 'xanh', ban: 'cao-cap' }, 2)
    expect(added.json.items[0].image).toBe(colors[1].image)
    expect(added.json.items[0].unitPrice).toBe(25_000_000 + 500_000 + 2_000_000)

    // đặt xe được và kho giảm
    const { placeOrder } = await import('./helpers')
    const order = await placeOrder(cart)
    expect(order.status).toBe(201)
    expect(order.json.order.items[0].image).toBe(colors[1].image)
    expect(await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(p.id).first('stock')).toBe(1)
  })

  it('slug tự sinh bỏ dấu và không trùng; slug trùng khi chỉ định thì 409', async () => {
    const admin = await adminCookie()
    const a = await post('/api/admin/products', product({ name: 'Xe Đặc Biệt Ê' }), admin.opts)
    expect(a.json.product.slug).toBe('xe-dac-biet-e')
    const b = await post('/api/admin/products', product({ name: 'Xe Đặc Biệt Ê' }), admin.opts)
    expect(b.json.product.slug).toBe('xe-dac-biet-e-2')
    const dup = await post('/api/admin/products', product({ slug: a.json.product.slug }), admin.opts)
    expect(dup.status).toBe(409)
    expect(dup.json.error.code).toBe('conflict')
    expect(await count('audit_log')).toBe(2)
  })

  it('lỗi kiểm tra có đường dẫn trường, ví dụ options.0.choices.1.hex', async () => {
    const admin = await adminCookie()
    const r = await post(
      '/api/admin/products',
      product({
        name: 'X',
        category: 'khong-co',
        basePrice: -1,
        options: [
          { key: 'mau', name: 'Màu', type: 'color', choices: [{ key: 'do', name: 'Đỏ', priceDelta: 0, hex: '#ff0000' }, { key: 'xanh', name: 'Xanh', priceDelta: 0 }, { key: 'do', name: 'Đỏ 2', priceDelta: -5, hex: 'đỏ' }] },
          { key: 'mau', name: 'Trùng', type: 'choice', choices: [] },
        ],
      }),
      admin.opts,
    )
    expect(r.status).toBe(400)
    const f = r.json.error.fields
    expect(f).toHaveProperty('name')
    expect(f).toHaveProperty('basePrice')
    expect(f).toHaveProperty(['options.0.choices.1.hex'])
    expect(f).toHaveProperty(['options.0.choices.2.hex'])
    expect(f).toHaveProperty(['options.0.choices.2.priceDelta'])
    expect(f).toHaveProperty(['options.0.choices.2.key'])
    expect(f).toHaveProperty(['options.1.choices'])
    expect(f).toHaveProperty(['options.1.key'])
    expect(await count('products')).toBe(15)
    // danh mục và ảnh không tồn tại
    const cat = await post('/api/admin/products', product({ category: 'khong-co' }), admin.opts)
    expect(cat.json.error.fields).toHaveProperty('category')
    const img = await post('/api/admin/products', product({ images: [99999] }), admin.opts)
    expect(img.json.error.fields).toHaveProperty(['images.0'])
    expect(await count('products')).toBe(15)
  })

  it('tạo thất bại giữa chừng không để lại dữ liệu nửa vời (một batch)', async () => {
    const admin = await adminCookie()
    const r = await post('/api/admin/products', product({ slug: 'xe-may-pho-rider' }), admin.opts)
    expect(r.status).toBe(409)
    expect(await count('products')).toBe(15)
    expect(await count('audit_log')).toBe(0)
  })
})

describe('PUT: đối chiếu theo key', () => {
  async function seedProduct(admin: any) {
    const [a, b, c] = await uploads(admin, 3)
    const r = await post(
      '/api/admin/products',
      product({
        images: [a, b],
        options: [
          { key: 'mau', name: 'Màu', type: 'color', choices: [{ key: 'do', name: 'Đỏ', priceDelta: 0, hex: '#ff0000', mediaId: a }, { key: 'xanh', name: 'Xanh', priceDelta: 100, hex: '#0000ff', mediaId: b }] },
          { key: 'ban', name: 'Phiên bản', type: 'choice', choices: [{ key: 'tc', name: 'TC', priceDelta: 0 }] },
        ],
      }),
      admin.opts,
    )
    return { p: r.json.product, media: { a, b, c } }
  }

  it('sửa tên giữ nguyên key, thêm lựa chọn mới, xóa lựa chọn thiếu, sắp xếp lại; id nội bộ giữ nguyên', async () => {
    const admin = await adminCookie()
    const { p, media } = await seedProduct(admin)
    const before = await env.DB.prepare(`SELECT id FROM option_choices WHERE "key" = 'xanh' AND group_id IN (SELECT id FROM option_groups WHERE product_id = ?)`).bind(p.id).first<any>()
    const r = await put(
      `/api/admin/products/${p.id}`,
      product({
        name: 'Tên Đã Đổi', basePrice: 30_000_000, stock: null, leadTimeDays: 14, images: [media.c, media.a],
        options: [
          { key: 'ban', name: 'Bản', type: 'choice', choices: [{ key: 'cc', name: 'Cao cấp', priceDelta: 900 }, { key: 'tc', name: 'Tiêu chuẩn', priceDelta: 0 }] },
          { key: 'mau', name: 'Màu sắc', type: 'color', choices: [{ key: 'xanh', name: 'Xanh dương', priceDelta: 200, hex: '#0000aa', mediaId: media.c }, { key: 'tim', name: 'Tím', priceDelta: 0, hex: '#800080' }] },
        ],
      }),
      admin.opts,
    )
    expect(r.status).toBe(200)
    const n = r.json.product
    expect(n).toMatchObject({ name: 'Tên Đã Đổi', basePrice: 30_000_000, stock: null, leadTimeDays: 14, slug: p.slug })
    expect(n.images.map((i: any) => i.id)).toEqual([media.c, media.a])
    expect(n.options.map((g: any) => g.key)).toEqual(['ban', 'mau']) // sắp xếp lại
    expect(n.options[0].choices.map((c: any) => c.key)).toEqual(['cc', 'tc'])
    expect(n.options[1].choices.map((c: any) => [c.key, c.name, c.priceDelta, c.hex])).toEqual([['xanh', 'Xanh dương', 200, '#0000aa'], ['tim', 'Tím', 0, '#800080']])
    // lựa chọn "do" đã bị xóa; "xanh" giữ nguyên id nội bộ
    const after = await env.DB.prepare(`SELECT id FROM option_choices WHERE "key" = 'xanh' AND group_id IN (SELECT id FROM option_groups WHERE product_id = ?)`).bind(p.id).first<any>()
    expect(after.id).toBe(before.id)
    const gone = await env.DB.prepare(`SELECT COUNT(*) AS n FROM option_choices WHERE "key" = 'do' AND group_id IN (SELECT id FROM option_groups WHERE product_id = ?)`).bind(p.id).first<any>()
    expect(gone.n).toBe(0)
    // cửa hàng thấy thay đổi, preorder vì stock null
    const shop = (await get(`/api/products/${p.slug}`)).json
    expect(shop).toMatchObject({ name: 'Tên Đã Đổi', price: 30_000_000, availability: 'preorder', leadTimeDays: 14 })
    expect(shop.options[0].id).toBe('ban')
  })

  it('xóa cả nhóm khi thiếu trong dữ liệu mới; options rỗng xóa hết', async () => {
    const admin = await adminCookie()
    const { p } = await seedProduct(admin)
    const r = await put(`/api/admin/products/${p.id}`, product({ options: [], images: [] }), admin.opts)
    expect(r.json.product.options).toEqual([])
    expect(r.json.product.images).toEqual([])
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM option_groups WHERE product_id = ?`).bind(p.id).first<any>()
    expect(left.n).toBe(0)
  })

  it('giỏ chứa lựa chọn đã xóa vẫn tính giá hợp lệ (rơi về mặc định); đặt hàng báo option_invalid', async () => {
    const admin = await adminCookie()
    const { p } = await seedProduct(admin)
    const cart = newCart()
    await addItem(cart, p.id, { mau: 'xanh', ban: 'tc' })
    await put(
      `/api/admin/products/${p.id}`,
      product({ options: [{ key: 'mau', name: 'Màu', type: 'color', choices: [{ key: 'do', name: 'Đỏ', priceDelta: 0, hex: '#ff0000' }] }] }),
      admin.opts,
    )
    const c = (await get('/api/cart', { cart })).json
    expect(c.items[0].unitPrice).toBe(25_000_000)
    expect(c.items[0].options.map((o: any) => o.choice)).toEqual(['Đỏ'])
    const { placeOrder } = await import('./helpers')
    expect((await placeOrder(cart)).json.error.code).toBe('option_invalid')
  })

  it('đổi slug sang slug của xe khác bị 409 và không đổi gì (rollback)', async () => {
    const admin = await adminCookie()
    const { p } = await seedProduct(admin)
    const r = await put(`/api/admin/products/${p.id}`, product({ slug: 'xe-may-pho-rider', name: 'Sẽ không lưu', images: [], options: [] }), admin.opts)
    expect(r.status).toBe(409)
    const row = await env.DB.prepare('SELECT name FROM products WHERE id = ?').bind(p.id).first<any>()
    expect(row.name).toBe('Xe Thử Nghiệm')
    expect((await get(`/api/admin/products/${p.id}`, admin.opts)).json.product.options).toHaveLength(2) // options cũ còn nguyên
  })

  it('xe không tồn tại: 404', async () => {
    const admin = await adminCookie()
    expect((await put('/api/admin/products/9999', product(), admin.opts)).status).toBe(404)
    expect((await get('/api/admin/products/9999', admin.opts)).status).toBe(404)
    expect((await get('/api/admin/products/abc', admin.opts)).status).toBe(404)
  })
})

describe('đọc, sửa nhanh, xóa', () => {
  it('danh sách admin có stock/active, lọc q/category/active, phân trang; xe ẩn vẫn thấy', async () => {
    const admin = await adminCookie()
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    await setStock(2, 7)
    const all = await get('/api/admin/products', admin.opts)
    expect(all.json).toMatchObject({ total: 15, page: 1, pageSize: 20 })
    expect(all.json.items[0]).toMatchObject({ id: 1, active: false, stock: null, availability: 'preorder', image: '/vehicles/xe-may-pho-rider.svg' })
    expect(all.json.items[1]).toMatchObject({ id: 2, stock: 7, availability: 'in_stock' })
    expect((await get('/api/admin/products?active=0', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/products?active=1', admin.opts)).json.total).toBe(14)
    expect((await get('/api/admin/products?category=o-to', admin.opts)).json.items.every((p: any) => p.category === 'o-to')).toBe(true)
    expect((await get('/api/admin/products?q=pho%20rider', admin.opts)).json.total).toBe(1)
    expect((await get('/api/admin/products?pageSize=5&page=3', admin.opts)).json.items).toHaveLength(5)
  })

  it('chi tiết admin đầy đủ để sửa', async () => {
    const admin = await adminCookie()
    const p = (await get('/api/admin/products/1', admin.opts)).json.product
    expect(p).toMatchObject({ id: 1, slug: 'xe-may-pho-rider', category: 'xe-may', basePrice: 32_900_000, stock: null, active: true })
    expect(p.images).toEqual([{ id: 1, url: '/vehicles/xe-may-pho-rider.svg' }])
    expect(p.options[0].choices[0]).toMatchObject({ key: 'cam', name: 'Cam', priceDelta: 0, hex: '#ff7a1a', image: '/vehicles/xe-may-pho-rider--cam.svg' })
    expect(typeof p.options[0].choices[0].mediaId).toBe('number')
    // dữ liệu lấy ra sửa rồi PUT lại nguyên văn được (không đổi gì)
    const body = { ...p, images: p.images.map((i: any) => i.id), options: p.options.map((g: any) => ({ ...g, choices: g.choices.map(({ image, ...c }: any) => c) })) }
    delete body.id
    const again = await put('/api/admin/products/1', body, admin.opts)
    expect(again.status).toBe(200)
    expect(again.json.product).toEqual(p)
  })

  it('PATCH đổi nhanh active/stock', async () => {
    const admin = await adminCookie()
    const r = await patch('/api/admin/products/1', { active: false, stock: 4 }, admin.opts)
    expect(r.json.product).toMatchObject({ active: false, stock: 4 })
    expect((await get('/api/products/xe-may-pho-rider')).status).toBe(404)
    expect((await patch('/api/admin/products/1', { stock: null }, admin.opts)).json.product.stock).toBeNull()
    expect((await patch('/api/admin/products/1', { stock: -1 }, admin.opts)).status).toBe(400)
    expect((await patch('/api/admin/products/9999', { active: true }, admin.opts)).status).toBe(404)
  })

  it('xóa sản phẩm: đơn cũ giữ bản chụp, product_id NULL, giỏ cascade, media giữ nguyên', async () => {
    const admin = await adminCookie()
    const o = await quickOrder({ productId: 1 })
    await addItem('x', 1, undefined, 1, { cookie: admin.cookie })
    const media = await count('media')
    expect((await del('/api/admin/products/1', admin.opts)).status).toBe(204)
    expect((await get('/api/products/xe-may-pho-rider')).status).toBe(404)
    const item = await env.DB.prepare('SELECT product_id, name FROM order_items').first<any>()
    expect(item).toEqual({ product_id: null, name: 'Phố Rider 125' })
    expect((await get(`/api/track/${o.code}`)).json.order.items[0].name).toBe('Phố Rider 125')
    expect(await count('cart_items')).toBe(0)
    expect(await count('media')).toBe(media)
    expect((await del('/api/admin/products/1', admin.opts)).status).toBe(404)
  })
})

describe('danh mục', () => {
  it('CRUD; danh mục còn sản phẩm không xóa được (category_in_use)', async () => {
    const admin = await adminCookie()
    const created = await post('/api/admin/categories', { slug: 'xe-dap', name: 'Xe đạp' }, admin.opts)
    expect(created.status).toBe(201)
    expect(created.json.category).toMatchObject({ slug: 'xe-dap', name: 'Xe đạp', sort: 6, count: 0 })
    const id = created.json.category.id
    expect((await post('/api/admin/categories', { slug: 'xe-dap', name: 'Trùng' }, admin.opts)).json.error.code).toBe('conflict')
    expect((await post('/api/admin/categories', { slug: 'Sai Slug', name: 'X' }, admin.opts)).status).toBe(400)

    const list = await get('/api/admin/categories', admin.opts)
    expect(list.json).toHaveLength(6)
    expect(list.json[0]).toMatchObject({ slug: 'xe-may', count: 3 })

    const upd = await put(`/api/admin/categories/${id}`, { name: 'Xe đạp điện', sort: 0 }, admin.opts)
    expect(upd.json.category).toMatchObject({ name: 'Xe đạp điện', slug: 'xe-dap', sort: 0 })
    expect((await put('/api/admin/categories/9999', { name: 'Không có' }, admin.opts)).status).toBe(404)

    const inUse = await del('/api/admin/categories/1', admin.opts)
    expect(inUse.status).toBe(409)
    expect(inUse.json.error.code).toBe('category_in_use')
    expect((await del(`/api/admin/categories/${id}`, admin.opts)).status).toBe(204)
    expect((await del(`/api/admin/categories/${id}`, admin.opts)).status).toBe(404)
    expect(await count('categories')).toBe(5)
  })
})
