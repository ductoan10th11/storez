import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api, ApiError, type Cart, type Picks, type Product, type PublicSettings, type SessionUser } from '@/api'
import { CATEGORIES, defaultPicks } from '@/lib/catalog'
import { errorText } from '@/lib/useAsync'

// ---------- Đăng nhập ----------
type AuthCtx = {
  user: SessionUser | null | undefined // undefined = đang kiểm tra
  setUser: (u: SessionUser | null) => void
  logout: () => Promise<void>
}
const Auth = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Auth)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null))
  }, [])
  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setUser(null)
  }, [])
  return <Auth value={{ user, setUser, logout }}>{children}</Auth>
}

// ---------- Giỏ hàng ----------
const emptyCart: Cart = { items: [], total: 0, count: 0 }
type CartCtx = {
  cart: Cart
  open: boolean
  setOpen: (o: boolean) => void
  refresh: () => Promise<void>
  add: (p: Product, picks: Picks, qty?: number) => Promise<void>
  setQty: (lineId: string, qty: number) => Promise<void>
  clear: () => Promise<void>
}
const CartC = createContext<CartCtx>(null!)
export const useCart = () => useContext(CartC)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    setCart(await api.cart().catch(() => emptyCart))
  }, [])
  // Đăng nhập/đăng xuất đổi nguồn giỏ (KV <-> tài khoản) nên tải lại
  useEffect(() => {
    if (user !== undefined) refresh()
  }, [user?.id, user === undefined]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (p: Promise<Cart>) => {
    try {
      setCart(await p)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'product_unavailable') toast.error('Xe này hiện không còn bán')
      else toast.error(errorText(e))
      await refresh()
    }
  }, [refresh])

  const add = useCallback(
    async (p: Product, picks: Picks, qty = 1) => {
      await run(api.add(p.id, picks, qty))
      const group = p.options.find((g) => g.type === 'color')
      const color = group?.choices.find((c) => c.id === picks[group.id])?.name
      toast.success(`Đã thêm ${qty > 1 ? `${qty} × ` : ''}${p.name}${color ? ` (${color})` : ''} vào giỏ`, {
        duration: 3200,
        action: { label: 'Xem giỏ', onClick: () => setOpen(true) },
      })
    },
    [run],
  )

  const value = useMemo<CartCtx>(
    () => ({ cart, open, setOpen, refresh, add, setQty: (id, q) => run(api.setQty(id, q)), clear: () => run(api.clear()) }),
    [cart, open, refresh, add, run],
  )
  return <CartC value={value}>{children}</CartC>
}

// ---------- Danh mục xe (tải một lần) ----------
export type ShopCategory = { id: string; name: string; count: number; image: string }
type CatalogCtx = {
  products: Product[]
  categories: ShopCategory[]
  catName: (slug: string) => string
  loading: boolean
  error: string
  settings?: PublicSettings
  picksOf: (p: Product) => Picks
  pick: (p: Product, group: string, choice: string) => void
}
const Catalog = createContext<CatalogCtx>(null!)
export const useCatalog = () => useContext(Catalog)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<PublicSettings>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cats, setCats] = useState<{ slug: string; name: string; count: number }[]>([])
  const [picks, setPicks] = useState<Record<number, Picks>>({})

  useEffect(() => {
    Promise.all([api.products(), api.settings().catch(() => undefined), api.categories().catch(() => [])])
      .then(([p, s, c]) => {
        setProducts(p)
        setSettings(s)
        setCats(c)
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false))
  }, [])

  const picksOf = useCallback((p: Product): Picks => ({ ...defaultPicks(p), ...picks[p.id] }), [picks])
  const pick = useCallback((p: Product, group: string, choice: string) => setPicks((s) => ({ ...s, [p.id]: { ...defaultPicks(p), ...s[p.id], [group]: choice } })), [])
  // Danh mục lấy từ API (admin thêm được); ảnh đại diện: ảnh có sẵn hoặc ảnh xe đầu tiên của danh mục
  const categories = useMemo<ShopCategory[]>(
    () =>
      cats
        .filter((c) => c.count > 0)
        .map((c) => ({
          id: c.slug,
          name: c.name,
          count: c.count,
          image: CATEGORIES.find((x) => x.id === c.slug)?.image ?? products.find((p) => p.category === c.slug)?.image ?? '',
        })),
    [cats, products],
  )
  const catName = useCallback((slug: string) => cats.find((c) => c.slug === slug)?.name ?? '', [cats])
  return <Catalog value={{ products, categories, catName, loading, error, settings, picksOf, pick }}>{children}</Catalog>
}
