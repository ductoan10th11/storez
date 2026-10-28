import { env } from 'cloudflare:workers'
import { app } from '../src/index'
import { epochToVnDate, now } from '../src/lib/time'

let ipCounter = 0
const nextIp = () => `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`

export type Opts = { headers?: Record<string, string>; cookie?: string; cart?: string; ip?: string }

export async function call(method: string, path: string, body?: unknown, o: Opts = {}) {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? nextIp(), ...o.headers }
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] ??= 'application/json'
  else if (method !== 'GET' && method !== 'HEAD' && !(body instanceof FormData)) headers['content-type'] ??= 'application/json'
  if (o.cookie) headers.cookie = o.cookie
  if (o.cart) headers['x-cart-id'] = o.cart
  const res = await app.request(
    path,
    { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) },
    env,
  )
  const text = /^image\//.test(res.headers.get('content-type') ?? '') ? '' : await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // không phải JSON
  }
  return { res, status: res.status, json, text }
}

export const get = (path: string, o?: Opts) => call('GET', path, undefined, o)
export const post = (path: string, body?: unknown, o?: Opts) => call('POST', path, body, o)
export const put = (path: string, body?: unknown, o?: Opts) => call('PUT', path, body, o)
export const patch = (path: string, body?: unknown, o?: Opts) => call('PATCH', path, body, o)
export const del = (path: string, o?: Opts) => call('DELETE', path, undefined, o)

export const sidOf = (res: Response) => {
  const m = /(?:^|,\s*)sid=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')
  return m ? `sid=${m[1]}` : ''
}

let phoneCounter = 0
export const newPhone = () => `09${String(10000000 + phoneCounter++).slice(-8)}`

export async function registerUser(over: Partial<{ phone: string; name: string; email: string; password: string }> = {}, o?: Opts) {
  const phone = over.phone ?? newPhone()
  const r = await post('/api/auth/register', { phone, password: over.password ?? 'matkhau-123', name: over.name ?? 'Nguyễn Văn An', email: over.email }, o)
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text}`)
  return { phone, cookie: sidOf(r.res), user: r.json.user as { id: string }, body: r.json }
}

export async function adminCookie() {
  const u = await registerUser({ name: 'Quản trị' })
  await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).bind(u.user.id).run()
  return { ...u, opts: { cookie: u.cookie } as Opts }
}

let cartCounter = 0
export const newCart = () => `cart-test-${++cartCounter}-abcdefgh`

export async function addItem(cart: string, productId: number, picks?: Record<string, string>, qty = 1, o: Opts = {}) {
  return post('/api/cart/items', { productId, picks, qty }, { ...o, cart })
}

// Khung giờ còn trống đầu tiên (hoặc thứ n)
export async function slot(n = 0, ip?: string): Promise<number> {
  const r = await get(`/api/pickup-slots?days=14`, { ip })
  const all = r.json.days.flatMap((d: any) => d.slots).filter((s: any) => s.available)
  return all[n].startsAt
}

export const contact = (over: Partial<{ name: string; phone: string; email: string; address: string }> = {}) => ({
  name: 'Nguyễn Văn An',
  phone: '0336 436 536',
  email: 'An@Example.com',
  address: '',
  ...over,
})

export async function placeOrder(cart: string, over: { contact?: ReturnType<typeof contact>; pickupAt?: number; note?: string } = {}, o: Opts = {}) {
  const pickupAt = over.pickupAt ?? (await slot())
  return post('/api/orders', { contact: over.contact ?? contact(), note: over.note, pickupAt }, { ...o, cart })
}

// Tạo đơn nhanh: 1 xe vào giỏ rồi đặt
export async function quickOrder(over: { productId?: number; qty?: number; phone?: string; pickupAt?: number; cookie?: string } = {}) {
  const cart = newCart()
  await addItem(cart, over.productId ?? 1, undefined, over.qty ?? 1, { cookie: over.cookie })
  const r = await placeOrder(cart, { contact: contact({ phone: over.phone ?? '0336436536' }), pickupAt: over.pickupAt }, { cookie: over.cookie })
  if (r.status !== 201) throw new Error(`order failed: ${r.status} ${r.text}`)
  return r.json.order as any
}

export const stockOf = async (id: number) => (await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(id).first<{ stock: number | null }>())!.stock
export const setStock = (id: number, stock: number | null) => env.DB.prepare('UPDATE products SET stock = ? WHERE id = ?').bind(stock, id).run()
export const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n

export const today = () => epochToVnDate(now())
export { env }

// ---- Ảnh thử cho test upload ----
export const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
export const JPG = [0xff, 0xd8, 0xff, 0xe0]
export const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

export function fileOf(head: number[], size = 64, name = 'anh.png', type = 'image/png') {
  const bytes = new Uint8Array(size)
  bytes.set(head)
  return new File([bytes], name, { type })
}

export const textFile = (content: string, name: string, type = 'image/jpeg') => new File([content], name, { type })

export function form(file: File, extra: Record<string, string> = {}) {
  const f = new FormData()
  f.set('file', file)
  for (const [k, v] of Object.entries(extra)) f.set(k, v)
  return f
}

export const upload = (file: File, admin: Opts, extra?: Record<string, string>) => post('/api/admin/media', form(file, extra), admin)
