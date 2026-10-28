// Kiểu dữ liệu và hàm gọi API. Hợp đồng: docs/04-api-spec.md
export type Availability = 'in_stock' | 'preorder' | 'out_of_stock'
export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled' | 'expired'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export type Choice = { id: string; name: string; price: number; hex?: string; image: string | null }
export type OptionGroup = { id: string; name: string; type: 'color' | 'choice'; choices: Choice[] }
export type Picks = Record<string, string> // groupId -> choiceId

export type Product = {
  id: number
  slug: string
  name: string
  description: string
  price: number
  image: string
  images: string[]
  category: string
  badge: string
  spec: string
  availability: Availability
  leadTimeDays: number | null
  options: OptionGroup[]
}
export type LineOption = { group: string; choice: string; hex?: string; price: number }
export type CartItem = {
  id: string // id dòng giỏ hàng: xe + lựa chọn
  product: Product
  qty: number
  unitPrice: number // giá 1 xe đã cộng phụ phí lựa chọn
  image: string // ảnh theo màu đã chọn
  options: LineOption[]
}
export type Cart = { items: CartItem[]; total: number; count: number }
export type Category = { id: number; slug: string; name: string; count: number }

export type SessionUser = { id: string; phone: string; name: string; email: string | null; role: 'customer' | 'admin' }
export type Settings = {
  showroom: { name: string; address: string; phone: string }
  pickup: { open: string; close: string; days: number[]; slotMinutes: number; capacity: number; minNoticeHours: number; maxAdvanceDays: number }
  orders: { pendingHoldHours: number }
}
export type PublicSettings = { showroom: Settings['showroom']; pickup: Pick<Settings['pickup'], 'open' | 'close' | 'days' | 'slotMinutes'> }

export type Slot = { startsAt: number; time: string; available: boolean; remaining: number }
export type SlotDay = { date: string; slots: Slot[] }

export type OrderItem = { name: string; image: string; unitPrice: number; qty: number; options: LineOption[]; productId?: number | null }
export type OrderEvent = { status: OrderStatus; note: string | null; at: number; actor?: string | null }
export type Order = {
  code: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  paidTotal: number
  remaining: number
  pickupAt: number
  createdAt: number
  holdExpiresAt: number | null
  items: OrderItem[]
  events: OrderEvent[]
  contact: { name: string; phone: string; email: string; address?: string | null }
  note?: string | null
  canCancel: boolean
}
export type Payment = { amount: number; method: 'cash' | 'transfer'; note: string | null; at: number; receivedBy: string | null }
export type AdminOrder = Order & { internalNote: string | null; userId: string | null; payments: Payment[]; overdue: boolean }
export type OrderSummary = {
  code: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  paidTotal: number
  contactName: string
  contactPhone: string
  pickupAt: number
  createdAt: number
  holdExpiresAt: number | null
  overdue: boolean
  itemCount: number
  firstItemName: string
}
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }
export type AdminUser = { id: string; phone: string; name: string; email: string | null; role: 'customer' | 'admin'; disabled: boolean; createdAt: number; orderCount: number }
export type MediaItem = { id: number; url: string; mime: string; size: number; width: number | null; height: number | null; createdAt: number; inUse: boolean }

export type ProductInput = {
  name: string
  slug?: string
  category: string
  description: string
  spec: string
  badge: string
  basePrice: number
  stock: number | null
  leadTimeDays: number | null
  active: boolean
  images: number[]
  options: { key: string; name: string; type: 'color' | 'choice'; choices: { key: string; name: string; priceDelta: number; hex?: string; mediaId?: number | null }[] }[]
}
export type AdminProduct = Omit<ProductInput, 'images' | 'options'> & {
  id: number
  slug: string
  images: { id: number; url: string }[]
  options: (Omit<ProductInput['options'][number], 'choices'> & { choices: (ProductInput['options'][number]['choices'][number] & { image?: string | null })[] })[]
}
export type AdminProductRow = { id: number; slug: string; name: string; category: string; price: number; image: string; stock: number | null; active: boolean; availability: Availability; leadTimeDays: number | null }
export type Stats = {
  range: { from: string; to: string }
  orders: { total: number; byStatus: Record<OrderStatus, number> }
  collected: number
  cancelRate: number
  byDay: { date: string; orders: number; collected: number }[]
  byCategory: { category: string; orders: number; collected: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
}
export type CalendarDay = { date: string; slots: { startsAt: number; time: string; orders: OrderSummary[] }[] }

// ---- Lỗi chuẩn: { error: { code, message, fields?, ...extra } } ----
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public extra: Record<string, unknown> = {},
    public retryAfter?: number,
  ) {
    super(message)
  }
}

export async function apiError(res: Response) {
  const body = await res.json().catch(() => null)
  const { code, message, fields, ...extra } = body?.error ?? {}
  return new ApiError(
    res.status,
    code ?? 'unknown',
    message ?? `${res.status} ${res.statusText}`,
    fields,
    extra,
    Number(res.headers.get('retry-after')) || undefined,
  )
}

const cartId = (() => {
  try {
    let id = localStorage.getItem('cart-id')
    if (!id) localStorage.setItem('cart-id', (id = crypto.randomUUID()))
    return id
  } catch {
    return crypto.randomUUID()
  }
})()

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = init.body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), 'x-cart-id': cartId },
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ, vui lòng thử lại')
  }
  if (!res.ok) throw await apiError(res)
  return res.status === 204 ? (undefined as T) : res.json()
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const send = (method: string, body?: unknown) => ({ method, body })

export const api = {
  // cửa hàng
  products: () => req<Product[]>('/products'),
  categories: () => req<Category[]>('/categories'),
  settings: () => req<PublicSettings>('/settings/public'),
  slots: (days = 14) => req<{ days: SlotDay[] }>(`/pickup-slots?days=${days}`),
  // giỏ
  cart: () => req<Cart>('/cart'),
  add: (productId: number, picks: Picks, qty = 1) => req<Cart>('/cart/items', send('POST', { productId, picks, qty })),
  setQty: (lineId: string, qty: number) => req<Cart>(`/cart/items/${encodeURIComponent(lineId)}`, send('PUT', { qty })),
  clear: () => req<Cart>('/cart', send('DELETE')),
  // đặt xe, tra cứu
  placeOrder: (body: { contact: { name: string; phone: string; email: string; address: string }; note: string; pickupAt: number }) =>
    req<{ order: Order }>('/orders', send('POST', body)),
  track: (code: string) => req<{ order: Order }>(`/track/${encodeURIComponent(code)}`),
  // tài khoản
  me: () => req<{ user: SessionUser | null }>('/auth/me'),
  login: (identifier: string, password: string) => req<{ user: SessionUser; mergedCartLines: number }>('/auth/login', send('POST', { identifier, password })),
  register: (b: { phone: string; password: string; name: string; email?: string }) =>
    req<{ user: SessionUser; linkedOrders: number; mergedCartLines: number }>('/auth/register', send('POST', b)),
  logout: () => req<void>('/auth/logout', send('POST')),
  updateProfile: (b: { name?: string; email?: string | null }) => req<{ user: SessionUser }>('/account', send('PATCH', b)),
  changePassword: (currentPassword: string, newPassword: string) => req<void>('/account/password', send('POST', { currentPassword, newPassword })),
  myOrders: (page = 1) =>
    req<Page<{ code: string; status: OrderStatus; paymentStatus: PaymentStatus; total: number; pickupAt: number; createdAt: number; items: { name: string; image: string; qty: number }[] }>>(
      `/account/orders${qs({ page, pageSize: 20 })}`,
    ),
  myOrder: (code: string) => req<{ order: Order }>(`/account/orders/${encodeURIComponent(code)}`),
  cancelMyOrder: (code: string, reason?: string) => req<{ order: Order }>(`/account/orders/${encodeURIComponent(code)}/cancel`, send('POST', { reason })),
  // quản trị
  admin: {
    stats: (from?: string, to?: string) => req<Stats>(`/admin/stats${qs({ from, to })}`),
    orders: (q: { status?: string; q?: string; page?: number; pageSize?: number }) =>
      req<Page<OrderSummary> & { counts: Record<OrderStatus, number> }>(`/admin/orders${qs(q)}`),
    order: (code: string) => req<{ order: AdminOrder }>(`/admin/orders/${code}`),
    setStatus: (code: string, status: string, note?: string) => req<{ order: AdminOrder }>(`/admin/orders/${code}/status`, send('POST', { status, note })),
    pay: (code: string, b: { amount: number; method: 'cash' | 'transfer'; note?: string }) => req<{ order: AdminOrder }>(`/admin/orders/${code}/payments`, send('POST', b)),
    patchOrder: (code: string, b: { internalNote?: string | null; pickupAt?: number }) => req<{ order: AdminOrder }>(`/admin/orders/${code}`, send('PATCH', b)),
    calendar: (from: string, to: string) => req<{ days: CalendarDay[] }>(`/admin/calendar${qs({ from, to })}`),
    users: (q: { q?: string; role?: string; page?: number }) => req<Page<AdminUser>>(`/admin/users${qs({ ...q, pageSize: 50 })}`),
    patchUser: (id: string, b: { disabled?: boolean; role?: 'customer' | 'admin'; name?: string }) => req<{ user: AdminUser }>(`/admin/users/${id}`, send('PATCH', b)),
    resetPassword: (id: string, newPassword: string) => req<void>(`/admin/users/${id}/reset-password`, send('POST', { newPassword })),
    products: (q: { q?: string; category?: string; active?: string; page?: number }) => req<Page<AdminProductRow>>(`/admin/products${qs({ ...q, pageSize: 100 })}`),
    product: (id: number) => req<{ product: AdminProduct }>(`/admin/products/${id}`),
    createProduct: (b: ProductInput) => req<{ product: AdminProduct }>('/admin/products', send('POST', b)),
    updateProduct: (id: number, b: ProductInput) => req<{ product: AdminProduct }>(`/admin/products/${id}`, send('PUT', b)),
    patchProduct: (id: number, b: { active?: boolean; stock?: number | null }) => req<{ product: AdminProduct }>(`/admin/products/${id}`, send('PATCH', b)),
    deleteProduct: (id: number) => req<void>(`/admin/products/${id}`, send('DELETE')),
    media: (page = 1) => req<Page<MediaItem>>(`/admin/media${qs({ page, pageSize: 60 })}`),
    uploadMedia: (blob: Blob, name: string, width: number, height: number) => {
      const f = new FormData()
      f.set('file', blob, name)
      f.set('width', String(width))
      f.set('height', String(height))
      return req<{ media: { id: number; url: string; width: number | null; height: number | null } }>('/admin/media', send('POST', f))
    },
    deleteMedia: (id: number) => req<void>(`/admin/media/${id}`, send('DELETE')),
    createCategory: (b: { slug: string; name: string }) => req<{ category: { id: number; slug: string; name: string } }>('/admin/categories', send('POST', b)),
    settings: () => req<Settings>('/admin/settings'),
    saveSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => req<Settings[K]>(`/admin/settings/${key}`, send('PUT', { value })),
  },
}

export const vnd = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

// Giá rút gọn cho thẻ sản phẩm: "32,9 triệu ₫", "1,15 tỷ ₫"
export const vndShort = (n: number) => {
  const fmt = (v: number, d: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: d })
  if (n >= 1e9) return `${fmt(n / 1e9, 2)} tỷ ₫`
  if (n >= 1e6) return `${fmt(n / 1e6, 1)} triệu ₫`
  return vnd(n)
}

// Ảnh xe theo màu đang chọn: ảnh riêng của lựa chọn (do API trả), thiếu thì ảnh chính
export const imageFor = (p: Product, picks: Picks) => {
  const color = p.options.find((g) => g.type === 'color')
  const choice = color?.choices.find((c) => c.id === (picks[color.id] ?? color.choices[0]?.id))
  return choice?.image || p.image
}
