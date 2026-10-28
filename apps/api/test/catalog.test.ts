import { describe, expect, it } from 'vitest'
import { count, env, get, setStock } from './helpers'

describe('GET /api/products', () => {
  it('trả mảng 15 xe, đúng trường, options đã parse', async () => {
    const r = await get('/api/products')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.json)).toBe(true)
    expect(r.json).toHaveLength(15)
    expect(r.json.map((p: any) => p.id)).toEqual([...Array(15)].map((_, i) => i + 1))
    const p = r.json[0]
    // Trường cũ giữ nguyên tên
    for (const k of ['id', 'name', 'description', 'price', 'image', 'category', 'badge', 'spec', 'options']) expect(p).toHaveProperty(k)
    // Trường mới chỉ thêm
    for (const k of ['slug', 'images', 'availability', 'leadTimeDays']) expect(p).toHaveProperty(k)
    expect(p).toMatchObject({ id: 1, slug: 'xe-may-pho-rider', category: 'xe-may', price: 32900000, image: '/vehicles/xe-may-pho-rider.svg' })
    expect(Array.isArray(p.options)).toBe(true)
    expect(p.options[0]).toMatchObject({ id: 'mau', name: 'Màu sắc', type: 'color' })
    expect(p).not.toHaveProperty('stock')
    expect(p).not.toHaveProperty('active')
  })

  it('52 lựa chọn màu đều có ảnh riêng, ảnh nhóm khác null', async () => {
    const r = await get('/api/products')
    const choices = r.json.flatMap((p: any) => p.options.flatMap((g: any) => g.choices.map((c: any) => ({ g, c }))))
    const colors = choices.filter((x: any) => x.g.type === 'color')
    expect(colors).toHaveLength(52)
    expect(colors.every((x: any) => typeof x.c.image === 'string' && x.c.hex)).toBe(true)
    expect(colors[0].c.image).toBe('/vehicles/xe-may-pho-rider--cam.svg')
    expect(choices.filter((x: any) => x.g.type === 'choice').every((x: any) => x.c.image === null)).toBe(true)
  })

  it('availability theo kho: >0 in_stock, 0 out_of_stock, NULL preorder', async () => {
    expect((await get('/api/products')).json[0].availability).toBe('preorder')
    await setStock(1, 3)
    expect((await get('/api/products')).json[0].availability).toBe('in_stock')
    await setStock(1, 0)
    expect((await get('/api/products')).json[0].availability).toBe('out_of_stock')
  })

  it('lọc theo danh mục, tìm không dấu, sắp xếp giá', async () => {
    const cat = await get('/api/products?category=o-to')
    expect(cat.json.length).toBeGreaterThan(0)
    expect(cat.json.every((p: any) => p.category === 'o-to')).toBe(true)
    const q = await get('/api/products?q=pho%20rider')
    expect(q.json.map((p: any) => p.slug)).toContain('xe-may-pho-rider')
    const asc = (await get('/api/products?sort=price_asc')).json.map((p: any) => p.price)
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    const desc = (await get('/api/products?sort=price_desc')).json.map((p: any) => p.price)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
  })

  it('xe active = 0 không có trong danh sách và chi tiết trả 404', async () => {
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    const list = await get('/api/products')
    expect(list.json).toHaveLength(14)
    expect(list.json.find((p: any) => p.id === 1)).toBeUndefined()
    const one = await get('/api/products/xe-may-pho-rider')
    expect(one.status).toBe(404)
    expect(one.json.error.code).toBe('not_found')
  })
})

describe('chi tiết, danh mục, cấu hình', () => {
  it('GET /api/products/:slug', async () => {
    const r = await get('/api/products/xe-may-pho-rider')
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ id: 1, slug: 'xe-may-pho-rider' })
    expect(r.json.images).toEqual(['/vehicles/xe-may-pho-rider.svg'])
    expect((await get('/api/products/khong-co')).status).toBe(404)
  })

  it('GET /api/categories đếm xe active', async () => {
    const r = await get('/api/categories')
    expect(r.json).toHaveLength(5)
    expect(r.json[0]).toMatchObject({ slug: 'xe-may', name: 'Xe máy', count: 3 })
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    expect((await get('/api/categories')).json[0].count).toBe(2)
  })

  it('GET /api/settings/public chỉ trả phần công khai', async () => {
    const r = await get('/api/settings/public')
    expect(r.json.showroom.name).toBe('Speed Showroom')
    expect(r.json.pickup).toEqual({ open: '08:00', close: '18:00', days: [0, 1, 2, 3, 4, 5, 6], slotMinutes: 60 })
    expect(r.text).not.toMatch(/capacity|minNoticeHours|maxAdvanceDays|pendingHoldHours/)
  })

  it('xóa sản phẩm thì nhóm, lựa chọn, product_images xóa theo; media giữ lại', async () => {
    const media = await count('media')
    await env.DB.prepare('DELETE FROM products WHERE id = 1').run()
    expect(await count('media')).toBe(media)
    const left = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n
    expect(await left('SELECT COUNT(*) AS n FROM option_groups WHERE product_id = 1')).toBe(0)
    expect(await left('SELECT COUNT(*) AS n FROM product_images WHERE product_id = 1')).toBe(0)
    expect(await left('SELECT COUNT(*) AS n FROM option_choices WHERE group_id IN (1,2,3)')).toBe(0)
  })

  it('route lạ trong /api trả 404 định dạng chuẩn', async () => {
    const r = await get('/api/khong-co-route')
    expect(r.status).toBe(404)
    expect(r.json.error.code).toBe('not_found')
  })
})
