import { describe, expect, it } from 'vitest'
import { addItem, del, env, get, newCart, put, registerUser, post } from './helpers'

const DEFAULT_ID = '1~ban.tieu-chuan~goi.khong~mau.cam'

describe('giỏ khách (KV)', () => {
  it('thiếu x-cart-id trả 400 định dạng lỗi chuẩn', async () => {
    const r = await get('/api/cart')
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
    expect((await get('/api/cart', { cart: 'ngan' })).status).toBe(400)
    expect((await post('/api/cart/items', { productId: 1 })).status).toBe(400)
  })

  it('giỏ trống', async () => {
    const r = await get('/api/cart', { cart: newCart() })
    expect(r.json).toEqual({ items: [], total: 0, count: 0 })
    expect(r.res.headers.get('cache-control')).toBe('no-store')
  })

  it('thêm mặc định lấy lựa chọn đầu, id dòng đúng định dạng, giá đúng', async () => {
    const cart = newCart()
    const r = await addItem(cart, 1)
    expect(r.status).toBe(200)
    const [it] = r.json.items
    expect(it.id).toBe(DEFAULT_ID)
    expect(it.qty).toBe(1)
    expect(it.unitPrice).toBe(32900000)
    expect(it.image).toBe('/vehicles/xe-may-pho-rider--cam.svg')
    expect(it.options.map((o: any) => o.choice)).toEqual(['Cam', 'Tiêu chuẩn', 'Không'])
    expect(it.options[0]).toMatchObject({ group: 'Màu sắc', hex: '#ff7a1a', price: 0 })
    expect(it.product.id).toBe(1)
    expect(r.json.total).toBe(32900000)
    expect(r.json.count).toBe(1)
  })

  it('lựa chọn có phụ phí, ảnh đổi theo màu', async () => {
    const r = await addItem(newCart(), 1, { mau: 'den', ban: 'cao-cap', goi: 'chong-trom' })
    const [it] = r.json.items
    expect(it.id).toBe('1~ban.cao-cap~goi.chong-trom~mau.den')
    expect(it.unitPrice).toBe(32900000 + 3000000 + 1500000)
    expect(it.image).toBe('/vehicles/xe-may-pho-rider--den.svg')
  })

  it('cùng xe cùng lựa chọn thì cộng dồn; khác lựa chọn thì dòng khác', async () => {
    const cart = newCart()
    await addItem(cart, 1, undefined, 2)
    await addItem(cart, 1, { mau: 'cam' }, 3)
    const r = await addItem(cart, 1, { mau: 'den' })
    expect(r.json.items).toHaveLength(2)
    expect(r.json.items[0].qty).toBe(5)
    expect(r.json.count).toBe(6)
    expect(r.json.total).toBe(6 * 32900000)
  })

  it('lựa chọn sai được thay bằng lựa chọn đầu; qty chặn ở 99', async () => {
    const cart = newCart()
    const r = await addItem(cart, 1, { mau: 'khong-co', ban: 'x' }, 500)
    expect(r.json.items[0].id).toBe(DEFAULT_ID)
    expect(r.json.items[0].qty).toBe(99)
    expect((await addItem(cart, 1, undefined, 10)).json.items[0].qty).toBe(99)
  })

  it('PUT đặt số lượng; qty = 0 xóa dòng; chặn 99; DELETE xóa hết', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    await addItem(cart, 2)
    const id = encodeURIComponent(DEFAULT_ID)
    expect((await put(`/api/cart/items/${id}`, { qty: 7 }, { cart })).json.items[0].qty).toBe(7)
    expect((await put(`/api/cart/items/${id}`, { qty: 1000 }, { cart })).json.items[0].qty).toBe(99)
    const removed = await put(`/api/cart/items/${id}`, { qty: 0 }, { cart })
    expect(removed.json.items).toHaveLength(1)
    expect(removed.json.items[0].product.id).toBe(2)
    const cleared = await del('/api/cart', { cart })
    expect(cleared.json).toEqual({ items: [], total: 0, count: 0 })
    expect((await get('/api/cart', { cart })).json.items).toHaveLength(0)
  })

  it('dòng giỏ cũ không có id vẫn đọc được (id = "<productId>~")', async () => {
    const cart = newCart()
    // Xe 15 không có nhóm tùy chọn? dùng xe bất kỳ: giỏ cũ chưa có picks
    await env.CART.put(`cart:${cart}`, JSON.stringify([{ productId: 1, qty: 2 }]))
    const r = await get('/api/cart', { cart })
    expect(r.json.items[0].id).toBe('1~')
    expect(r.json.items[0].qty).toBe(2)
    expect(r.json.items[0].unitPrice).toBe(32900000)
    // Sửa số lượng bằng id cũ
    expect((await put(`/api/cart/items/${encodeURIComponent('1~')}`, { qty: 4 }, { cart })).json.items[0].qty).toBe(4)
  })

  it('sản phẩm không tồn tại: 404; xe active = 0: product_unavailable', async () => {
    const cart = newCart()
    const nf = await addItem(cart, 9999)
    expect(nf.status).toBe(404)
    expect(nf.json.error.code).toBe('not_found')
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    const r = await addItem(cart, 1)
    expect(r.status).toBe(409)
    expect(r.json.error).toMatchObject({ code: 'product_unavailable', productId: 1 })
  })

  it('xe bị ẩn sau khi đã vào giỏ vẫn hiện nhưng báo hết hàng', async () => {
    const cart = newCart()
    await addItem(cart, 1)
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    const r = await get('/api/cart', { cart })
    expect(r.json.items[0].product.availability).toBe('out_of_stock')
  })

  it('body sai kiểu trả validation_failed có fields', async () => {
    const r = await post('/api/cart/items', { productId: 'abc' }, { cart: newCart() })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
    expect(r.json.error.fields).toHaveProperty('productId')
  })

  it('ghi không có Content-Type JSON bị từ chối 415', async () => {
    const r = await post('/api/cart/items', undefined, { cart: newCart(), headers: { 'content-type': 'text/plain' } })
    expect(r.status).toBe(415)
    expect(r.json.error.code).toBe('unsupported_media')
  })
})

describe('giỏ tài khoản (D1)', () => {
  it('người đã đăng nhập dùng giỏ D1, bỏ qua x-cart-id', async () => {
    const u = await registerUser()
    const guest = newCart()
    await addItem(guest, 2)
    const r = await addItem(guest, 1, undefined, 2, { cookie: u.cookie })
    expect(r.json.items).toHaveLength(1)
    expect(r.json.items[0].id).toBe(DEFAULT_ID)
    // giỏ khách không bị lẫn
    expect((await get('/api/cart', { cart: guest })).json.items).toHaveLength(1)
    // không cần x-cart-id
    expect((await get('/api/cart', { cookie: u.cookie })).json.count).toBe(2)
    // cộng dồn / đặt số lượng / xóa
    await addItem('x', 1, undefined, 1, { cookie: u.cookie })
    expect((await get('/api/cart', { cookie: u.cookie })).json.count).toBe(3)
    expect((await put(`/api/cart/items/${encodeURIComponent(DEFAULT_ID)}`, { qty: 0 }, { cookie: u.cookie })).json.items).toHaveLength(0)
    await addItem('x', 3, undefined, 1, { cookie: u.cookie })
    expect((await del('/api/cart', { cookie: u.cookie })).json.count).toBe(0)
  })
})
