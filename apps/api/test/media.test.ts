import { describe, expect, it } from 'vitest'
import { adminCookie, count, del, env, fileOf, form, get, JPG, PNG, post, registerUser, textFile, upload, WEBP } from './helpers'
import { fake } from './fake-cloudinary'
import { cleanOrphanMedia } from '../src/services/media'

describe('POST /api/admin/media', () => {
  it('chấp nhận JPEG, PNG, WebP hợp lệ và lưu đúng Content-Type theo nội dung', async () => {
    const admin = await adminCookie()
    const cases = [
      [fileOf(JPG, 64, 'a.jpg', 'image/jpeg'), 'image/jpeg', 'jpg'],
      [fileOf(PNG, 64, 'a.png', 'image/png'), 'image/png', 'png'],
      [fileOf(WEBP, 64, 'a.webp', 'image/webp'), 'image/webp', 'webp'],
      // Content-Type và tên file sai nhưng nội dung đúng: lưu theo nội dung
      [fileOf(PNG, 64, 'sai-duoi.jpg', 'text/plain'), 'image/png', 'png'],
    ] as const
    for (const [file, mime, ext] of cases) {
      const r = await upload(file, admin.opts, { width: '800', height: '600' })
      expect(r.status).toBe(201)
      expect(r.json.media).toMatchObject({ mime, size: 64, width: 800, height: 600 })
      expect(r.json.media.url).toMatch(new RegExp(`^https://res\\.cloudinary\\.com/test-cloud/image/upload/v1/products/\\d{6}/[\\w-]{21}\\.(jpe?g|png|webp)$`))
      expect(r.json.media.url).not.toContain('sai-duoi')
      const publicId = r.json.media.url.replace(/^.*\/v1\//, '').replace(/\.\w+$/, '')
      expect(fake.images.get(publicId)?.type).toBe(mime) // gửi lên Cloudinary theo nội dung, không theo Content-Type của client
    }
    expect(await count('media')).toBe(67 + 4)
    const row = await env.DB.prepare('SELECT storage_key, created_by FROM media ORDER BY id DESC LIMIT 1').first<any>()
    expect(row.created_by).toBe(admin.user.id)
    expect(row.storage_key).toMatch(/^products\/\d{6}\//)
  })

  it('từ chối file giả đổi đuôi, SVG thật, HTML', async () => {
    const admin = await adminCookie()
    const bad = [
      textFile('đây chỉ là văn bản', 'anh.jpg'),
      textFile('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'x.svg', 'image/svg+xml'),
      textFile('<svg xmlns="http://www.w3.org/2000/svg"/>', 'x.png', 'image/png'),
      textFile('<html><script>alert(1)</script></html>', 'x.webp', 'image/webp'),
      new File([new Uint8Array(0)], 'rong.png', { type: 'image/png' }),
      fileOf([0x52, 0x49, 0x46, 0x46], 64), // RIFF nhưng không phải WEBP
    ]
    for (const f of bad) {
      const r = await upload(f, admin.opts)
      expect(r.status, f.name).toBe(415)
      expect(r.json.error.code).toBe('unsupported_media')
    }
    expect(await count('media')).toBe(67)
    expect(fake.calls).toEqual([])
  })

  it('quá 5 MB trả payload_too_large; đúng 5 MB vẫn nhận', async () => {
    const admin = await adminCookie()
    const big = await upload(fileOf(PNG, 5 * 1024 * 1024 + 1), admin.opts)
    expect(big.status).toBe(413)
    expect(big.json.error.code).toBe('payload_too_large')
    expect((await upload(fileOf(PNG, 5 * 1024 * 1024), admin.opts)).status).toBe(201)
    expect(fake.images.size).toBe(1)
  })

  it('Content-Length vượt 6 MB bị từ chối sớm', async () => {
    const admin = await adminCookie()
    const r = await post('/api/admin/media', form(fileOf(PNG)), { cookie: admin.cookie, headers: { 'content-length': String(7 * 1024 * 1024) } })
    expect(r.status).toBe(413)
  })

  it('chưa đăng nhập 401, khách thường 403, không lưu gì', async () => {
    const customer = await registerUser()
    expect((await post('/api/admin/media', form(fileOf(PNG)))).status).toBe(401)
    expect((await post('/api/admin/media', form(fileOf(PNG)), { cookie: customer.cookie })).status).toBe(403)
    expect(await count('media')).toBe(67)
    expect(fake.calls).toEqual([])
  })

  it('thiếu file, kích thước ảnh sai, sai Content-Type bị từ chối', async () => {
    const admin = await adminCookie()
    const f = new FormData()
    f.set('x', 'y')
    expect((await post('/api/admin/media', f, admin.opts)).status).toBe(400)
    for (const extra of <Record<string, string>[]>[{ width: '0' }, { width: '4001' }, { height: '-3' }, { width: 'abc' }, { height: '1.5' }]) {
      const r = await upload(fileOf(PNG), admin.opts, extra)
      expect(r.status, JSON.stringify(extra)).toBe(400)
      expect(r.json.error.code).toBe('validation_failed')
    }
    const json = await post('/api/admin/media', { file: 'abc' }, admin.opts)
    expect(json.status).toBe(415)
    expect(await count('media')).toBe(67)
  })

  it('giới hạn upload: lần thứ 31 trong 10 phút bị 429', async () => {
    const admin = await adminCookie()
    let last = 0
    for (let i = 0; i < 31; i++) last = (await upload(fileOf(PNG, 16), admin.opts)).status
    expect(last).toBe(429)
  })
})

describe('lưu ảnh ở Cloudinary', () => {
  it('gửi lên Cloudinary với chữ ký hợp lệ, public_id do server sinh (không chứa tên file gốc), url là https', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(WEBP, 100, 'ten-goc.png', 'image/png'), admin.opts)
    expect(up.status).toBe(201)
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].publicId).toMatch(/^products\/\d{6}\/[\w-]{21}$/)
    expect(up.json.media.url).toMatch(/^https:\/\/res\.cloudinary\.com\//)
    expect(up.json.media.url).not.toContain('ten-goc')
    const a = (await upload(fileOf(WEBP), admin.opts)).json.media.url
    const b = (await upload(fileOf(WEBP), admin.opts)).json.media.url
    expect(a).not.toBe(b)
  })

  it('kích thước lấy từ Cloudinary khi client không gửi', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(PNG), admin.opts)
    expect(up.json.media).toMatchObject({ width: 100, height: 80 })
  })

  it('Cloudinary lỗi thì trả storage_error và không ghi dòng media', async () => {
    const admin = await adminCookie()
    fake.fail = 'upload'
    const r = await upload(fileOf(PNG), admin.opts)
    expect(r.status).toBe(502)
    expect(r.json.error.code).toBe('storage_error')
    expect(r.text).not.toMatch(/boom|secret|test-secret/)
    expect(await count('media')).toBe(67)
  })

  it('chưa cấu hình Cloudinary thì trả 503 storage_unavailable, không gọi mạng', async () => {
    const admin = await adminCookie()
    const { app } = await import('../src/index')
    const res = await app.request(
      '/api/admin/media',
      { method: 'POST', headers: { cookie: admin.cookie, 'cf-connecting-ip': '7.7.7.7' }, body: form(fileOf(PNG)) },
      { ...env, CLOUD_API_SECRET: '' },
    )
    expect(res.status).toBe(503)
    expect((await res.json<any>()).error.code).toBe('storage_unavailable')
    expect(fake.calls).toEqual([])
  })

  it('không còn route /media/* (ảnh phục vụ thẳng từ Cloudinary)', async () => {
    const res = await get('/media/products/202601/x.png')
    expect(res.status).not.toBe(200)
  })
})

describe('thư viện và xóa ảnh', () => {
  it('liệt kê mới nhất trước, kèm inUse', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(PNG), admin.opts)
    const list = await get('/api/admin/media?pageSize=3', admin.opts)
    expect(list.json).toMatchObject({ total: 68, page: 1, pageSize: 3 })
    expect(list.json.items[0]).toMatchObject({ id: up.json.media.id, inUse: false, mime: 'image/png' })
    // ảnh seed đang dùng
    const inUse = (await get('/api/admin/media?pageSize=100&page=1', admin.opts)).json.items.filter((m: any) => m.inUse)
    expect(inUse.length).toBeGreaterThan(60)
  })

  it('xóa ảnh đang dùng bị từ chối media_in_use; ảnh không dùng xóa được khỏi R2 và bảng', async () => {
    const admin = await adminCookie()
    const inUse = await del('/api/admin/media/1', admin.opts)
    expect(inUse.status).toBe(409)
    expect(inUse.json.error.code).toBe('media_in_use')
    expect(await count('media')).toBe(67)

    const up = await upload(fileOf(PNG), admin.opts)
    const publicId = fake.calls[0].publicId
    expect(fake.images.has(publicId)).toBe(true)
    expect((await del(`/api/admin/media/${up.json.media.id}`, admin.opts)).status).toBe(204)
    expect(fake.images.has(publicId)).toBe(false)
    expect(fake.calls.at(-1)).toEqual({ op: 'destroy', publicId })
    expect(await count('media')).toBe(67)
    expect((await del(`/api/admin/media/${up.json.media.id}`, admin.opts)).status).toBe(404)
  })

  it('ảnh chỉ còn được bản chụp trong đơn cũ dùng thì vẫn được giữ', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(PNG), admin.opts)
    await env.DB.prepare(`INSERT INTO orders (id, code, contact_name, contact_phone, contact_email, pickup_at, subtotal, total, hold_expires_at) VALUES ('o1','SS-AAAAA-AAAAA','a','0912345678','a@b.c',1,0,0,1)`).run()
    await env.DB.prepare(`INSERT INTO order_items (order_id, name, image, unit_price, qty) VALUES ('o1','Xe', ?, 1, 1)`).bind(up.json.media.url).run()
    expect((await del(`/api/admin/media/${up.json.media.id}`, admin.opts)).json.error.code).toBe('media_in_use')
  })
})

describe('cron dọn ảnh mồ côi', () => {
  it('chỉ xóa ảnh không được tham chiếu và quá 24 giờ; không đụng ảnh tĩnh', async () => {
    const admin = await adminCookie()
    const orphanOld = (await upload(fileOf(PNG), admin.opts)).json.media
    const orphanNew = (await upload(fileOf(PNG), admin.opts)).json.media
    const usedOld = (await upload(fileOf(PNG), admin.opts)).json.media
    await env.DB.prepare('INSERT INTO product_images (product_id, media_id, sort) VALUES (1, ?, 9)').bind(usedOld.id).run()
    const old = Math.floor(Date.now() / 1000) - 2 * 86400
    await env.DB.prepare('UPDATE media SET created_at = ? WHERE id IN (?, ?)').bind(old, orphanOld.id, usedOld.id).run()
    await env.DB.prepare('UPDATE media SET created_at = ? WHERE storage_key IS NULL').bind(old).run()

    expect(await cleanOrphanMedia(env)).toBe(1)
    const has = (m: { url: string }) => [...fake.images.keys()].some((id) => m.url.includes(id))
    expect(has(orphanOld)).toBe(false)
    expect(has(orphanNew)).toBe(true)
    expect(has(usedOld)).toBe(true)
    expect(await count('media')).toBe(67 + 2)
    expect(await cleanOrphanMedia(env)).toBe(0) // idempotent
  })
})

describe('xóa khi Cloudinary lỗi', () => {
  it('xóa lỗi thì giữ nguyên dòng media để thử lại', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(PNG), admin.opts)
    fake.fail = 'destroy'
    const r = await del(`/api/admin/media/${up.json.media.id}`, admin.opts)
    expect(r.status).toBe(502)
    expect(await count('media')).toBe(68)
    fake.fail = null
    expect((await del(`/api/admin/media/${up.json.media.id}`, admin.opts)).status).toBe(204)
  })

  it('ảnh đã mất trên Cloudinary ("not found") vẫn xóa được dòng', async () => {
    const admin = await adminCookie()
    const up = await upload(fileOf(PNG), admin.opts)
    fake.images.clear()
    expect((await del(`/api/admin/media/${up.json.media.id}`, admin.opts)).status).toBe(204)
  })
})
