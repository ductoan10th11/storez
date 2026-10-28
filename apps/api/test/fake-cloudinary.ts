import { vi } from 'vitest'

// Cloudinary giả: kiểm tra chữ ký SHA-1 thật như Cloudinary, lưu ảnh trong bộ nhớ
const CLOUD = 'test-cloud'
const KEY = '123456'
const SECRET = 'test-secret'

export const fake = {
  images: new Map<string, { size: number; type: string }>(),
  calls: [] as { op: 'upload' | 'destroy'; publicId: string }[],
  fail: null as null | 'upload' | 'destroy',
  reset() {
    this.images.clear()
    this.calls = []
    this.fail = null
  },
}

// Các fake khác (vd. fake-ai) đăng ký ở đây để dùng chung một bản thay fetch; trả undefined nghĩa là không xử lý
export const fetchHandlers: ((url: URL, init?: RequestInit) => Promise<Response | undefined> | Response | undefined)[] = []

const sha1 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function installFakeCloudinary() {
  fake.reset()
  const real = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    for (const h of fetchHandlers) {
      const res = await h(url, init)
      if (res) return res
    }
    const m = url.hostname === 'api.cloudinary.com' && /^\/v1_1\/([^/]+)\/image\/(upload|destroy)$/.exec(url.pathname)
    if (!m) return real(input as any, init)
    const op = m[2] as 'upload' | 'destroy'
    if (m[1] !== CLOUD) return json({ error: { message: 'Invalid cloud_name' } }, 401)
    const form = init?.body as FormData
    const publicId = String(form.get('public_id'))
    const timestamp = String(form.get('timestamp'))
    const expected = await sha1(`public_id=${publicId}&timestamp=${timestamp}${SECRET}`)
    if (form.get('api_key') !== KEY || form.get('signature') !== expected) return json({ error: { message: 'Invalid Signature' } }, 401)
    if (fake.fail === op) return json({ error: { message: 'boom' } }, 500)
    fake.calls.push({ op, publicId })
    if (op === 'upload') {
      const file = form.get('file') as unknown as File
      fake.images.set(publicId, { size: file.size, type: file.type })
      return json({
        public_id: publicId, width: 100, height: 80, bytes: file.size,
        secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${publicId}.${file.type.split('/')[1]}`,
      })
    }
    const had = fake.images.delete(publicId)
    return json({ result: had ? 'ok' : 'not found' })
  })
}
