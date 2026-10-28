import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError, vndShort, type AdminProduct, type ProductInput } from '@/api'
import { useCatalog } from '@/providers'
import { fold } from '@/lib/catalog'
import { errorText, useAsync } from '@/lib/useAsync'
import { Field, FormError } from '@/components/Field'
import { ImageSlot, MediaPicker, UploadButton, type Uploaded } from '@/components/MediaTools'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageTitle } from './AdminLayout'

type Choice = { key: string; locked: boolean; name: string; priceDelta: string; hex: string; media: Uploaded | null }
type Group = { key: string; locked: boolean; name: string; type: 'color' | 'choice'; choices: Choice[] }
type Form = {
  name: string
  slug: string
  category: string
  description: string
  spec: string
  badge: string
  basePrice: string
  stock: string
  madeToOrder: boolean
  leadTimeDays: string
  active: boolean
  images: Uploaded[]
  options: Group[]
}

const blank: Form = { name: '', slug: '', category: '', description: '', spec: '', badge: '', basePrice: '', stock: '0', madeToOrder: false, leadTimeDays: '', active: true, images: [], options: [] }
const newChoice = (type: Group['type']): Choice => ({ key: '', locked: false, name: '', priceDelta: '0', hex: type === 'color' ? '#e5322d' : '', media: null })

const slugify = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// Khóa ổn định: khóa đã có giữ nguyên; mục mới sinh từ tên, không trùng trong cùng cấp
function assignKeys<T extends { key: string; locked: boolean; name: string }>(list: T[], fallback: string): T[] {
  const used = new Set(list.filter((x) => x.locked).map((x) => x.key))
  return list.map((x) => {
    if (x.locked) return x
    const base = slugify(x.name) || fallback
    let k = base
    for (let i = 2; used.has(k); i++) k = `${base}-${i}`
    used.add(k)
    return { ...x, key: k }
  })
}

const move = <T,>(a: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= a.length) return a
  const c = [...a]
  ;[c[i], c[j]] = [c[j], c[i]]
  return c
}

function fromProduct(p: AdminProduct): Form {
  return {
    name: p.name, slug: p.slug, category: p.category, description: p.description, spec: p.spec, badge: p.badge,
    basePrice: String(p.basePrice), stock: p.stock === null ? '0' : String(p.stock), madeToOrder: p.stock === null,
    leadTimeDays: p.leadTimeDays === null ? '' : String(p.leadTimeDays), active: p.active,
    images: p.images,
    options: p.options.map((g) => ({
      key: g.key, locked: true, name: g.name, type: g.type,
      choices: g.choices.map((c) => ({ key: c.key, locked: true, name: c.name, priceDelta: String(c.priceDelta), hex: c.hex ?? '', media: c.mediaId && c.image ? { id: c.mediaId, url: c.image } : null })),
    })),
  }
}

const int = (s: string) => (s.trim() === '' ? NaN : Number(s))

export default function ProductForm() {
  const { id } = useParams()
  const editing = id !== undefined && id !== 'new'
  const navigate = useNavigate()
  const { catName } = useCatalog()
  const cats = useAsync(() => api.categories(), [])
  const loaded = useAsync(() => (editing ? api.admin.product(Number(id)) : Promise.resolve(undefined)), [id])
  const [f, setF] = useState<Form>(blank)
  const [ready, setReady] = useState(!editing)
  const [err, setErr] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  const [lib, setLib] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newCat, setNewCat] = useState({ slug: '', name: '' })
  const [catErr, setCatErr] = useState<string>()
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    document.title = (editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm') + ' · Quản trị'
  }, [editing])
  useEffect(() => {
    if (loaded.data) {
      setF(fromProduct(loaded.data.product))
      setSlugTouched(true)
      setReady(true)
    }
  }, [loaded.data])
  useEffect(() => {
    if (!editing && !f.category && cats.data?.length) setF((s) => ({ ...s, category: cats.data![0].slug }))
  }, [cats.data, editing, f.category])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))
  const setGroup = (gi: number, patch: Partial<Group>) => setF((s) => ({ ...s, options: s.options.map((g, i) => (i === gi ? { ...g, ...patch } : g)) }))
  const setChoice = (gi: number, ci: number, patch: Partial<Choice>) =>
    setF((s) => ({ ...s, options: s.options.map((g, i) => (i === gi ? { ...g, choices: g.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : g)) }))

  const fe = (path: string) => err?.fields?.[path]
  const price = int(f.basePrice)
  const previewImage = f.images[0]?.url ?? f.options.find((g) => g.type === 'color')?.choices.find((c) => c.media)?.media?.url

  const input = useMemo<ProductInput>(() => {
    const options = assignKeys(f.options, 'nhom').map((g) => ({
      key: g.key,
      name: g.name.trim(),
      type: g.type,
      choices: assignKeys(g.choices, 'lua-chon').map((c) => ({
        key: c.key,
        name: c.name.trim(),
        priceDelta: int(c.priceDelta),
        ...(g.type === 'color' ? { hex: c.hex } : {}),
        mediaId: c.media?.id ?? null,
      })),
    }))
    return {
      name: f.name.trim(),
      ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
      category: f.category,
      description: f.description,
      spec: f.spec,
      badge: f.badge,
      basePrice: price,
      stock: f.madeToOrder ? null : int(f.stock),
      leadTimeDays: f.leadTimeDays.trim() === '' ? null : int(f.leadTimeDays),
      active: f.active,
      images: f.images.map((i) => i.id),
      options,
    }
  }, [f, price])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      const { product } = editing ? await api.admin.updateProduct(Number(id), input) : await api.admin.createProduct(input)
      toast.success('Đã lưu sản phẩm')
      if (!editing) navigate(`/admin/products/${product.id}`, { replace: true })
      else setF(fromProduct(product))
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e))
      setErr(ae)
      if (ae.code === 'validation_failed' || ae.code === 'conflict') setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
    } finally {
      setBusy(false)
    }
  }

  const addCategory = async () => {
    setCatErr(undefined)
    try {
      const { category } = await api.admin.createCategory({ slug: newCat.slug.trim() || slugify(newCat.name), name: newCat.name.trim() })
      cats.reload()
      set('category', category.slug)
      setCatOpen(false)
      setNewCat({ slug: '', name: '' })
    } catch (e) {
      setCatErr(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : errorText(e))
    }
  }

  if (editing && (loaded.loading || !ready)) return loaded.error ? <p className="text-destructive">{loaded.error.code === 'not_found' ? 'Không tìm thấy sản phẩm.' : errorText(loaded.error)}</p> : <Skeleton className="h-96 rounded-xl" />
  const categories = cats.data ?? []

  return (
    <form onSubmit={submit} noValidate>
      <PageTitle title={editing ? `Sửa: ${f.name || 'sản phẩm'}` : 'Thêm sản phẩm'}>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/products">Quay lại</Link>
          </Button>
          <Button type="submit" variant="brand" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </PageTitle>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
        <div className="grid gap-5">
          <Card className="gap-4 p-5 shadow-none">
            <h2 className="font-bold">Thông tin chung</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên xe" htmlFor="p-name" error={fe('name')} className="sm:col-span-2">
                <Input
                  id="p-name"
                  value={f.name}
                  aria-invalid={!!fe('name')}
                  onChange={(e) => {
                    set('name', e.target.value)
                    if (!slugTouched && !editing) set('slug', slugify(e.target.value))
                  }}
                  className="h-10"
                />
              </Field>
              <Field label="Slug (địa chỉ trang)" htmlFor="p-slug" error={fe('slug')} hint="Tự sinh từ tên, có thể sửa">
                <Input id="p-slug" value={f.slug} aria-invalid={!!fe('slug')} onChange={(e) => (setSlugTouched(true), set('slug', e.target.value))} className="h-10" />
              </Field>
              <Field label="Loại" htmlFor="p-cat" error={fe('category')}>
                <div className="flex gap-2">
                  <select id="p-cat" value={f.category} onChange={(e) => set('category', e.target.value)} aria-invalid={!!fe('category')} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm">
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" className="h-10" onClick={() => setCatOpen(true)}>
                    Thêm loại
                  </Button>
                </div>
              </Field>
              <Field label="Mô tả" htmlFor="p-desc" error={fe('description')} className="sm:col-span-2">
                <Textarea id="p-desc" value={f.description} onChange={(e) => set('description', e.target.value)} aria-invalid={!!fe('description')} />
              </Field>
              <Field label="Thông số" htmlFor="p-spec" error={fe('spec')} hint="Ngăn cách bằng dấu “ · ”, ví dụ: 125cc · Tay ga · 2 chỗ">
                <Input id="p-spec" value={f.spec} onChange={(e) => set('spec', e.target.value)} aria-invalid={!!fe('spec')} className="h-10" />
              </Field>
              <Field label="Nhãn" htmlFor="p-badge" error={fe('badge')} hint="Ví dụ: Bán chạy, Mới, Cao cấp">
                <Input id="p-badge" value={f.badge} onChange={(e) => set('badge', e.target.value)} aria-invalid={!!fe('badge')} className="h-10" />
              </Field>
              <Field label="Giá cơ bản (VND)" htmlFor="p-price" error={fe('basePrice')}>
                <Input id="p-price" inputMode="numeric" value={f.basePrice} onChange={(e) => set('basePrice', e.target.value.replace(/\D/g, ''))} aria-invalid={!!fe('basePrice')} className="h-10" />
              </Field>
              <Field label="Thời gian chờ (ngày)" htmlFor="p-lead" error={fe('leadTimeDays')} hint="Chỉ để hiển thị với xe làm theo đơn">
                <Input id="p-lead" inputMode="numeric" value={f.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value.replace(/\D/g, ''))} aria-invalid={!!fe('leadTimeDays')} className="h-10" />
              </Field>
              <Field label="Số lượng trong kho" htmlFor="p-stock" error={fe('stock')}>
                <div className="flex items-center gap-3">
                  <Input id="p-stock" inputMode="numeric" value={f.madeToOrder ? '' : f.stock} disabled={f.madeToOrder} onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))} aria-invalid={!!fe('stock')} className="h-10 w-28" />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={f.madeToOrder} onCheckedChange={(v) => set('madeToOrder', v)} /> Làm theo đơn
                  </label>
                </div>
              </Field>
              <div className="flex items-center gap-3 sm:self-end sm:pb-2">
                <Switch id="p-active" checked={f.active} onCheckedChange={(v) => set('active', v)} />
                <label htmlFor="p-active" className="text-sm font-medium">
                  {f.active ? 'Đang hiện ở cửa hàng' : 'Đang ẩn'}
                </label>
              </div>
            </div>
          </Card>

          <Card className="gap-4 p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Ảnh sản phẩm</h2>
              <div className="flex gap-2">
                <UploadButton multiple label="Tải ảnh lên" onUploaded={(m) => setF((s) => (s.images.some((i) => i.id === m.id) ? s : { ...s, images: [...s.images, m] }))} />
                <Button type="button" variant="outline" size="sm" onClick={() => setLib(true)}>
                  Chọn từ thư viện
                </Button>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Ảnh đầu tiên là ảnh chính. Ảnh được thu nhỏ ngay trên trình duyệt trước khi tải lên.</p>
            {f.images.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có ảnh. Xe sẽ hiện không có ảnh chính.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {f.images.map((m, i) => (
                  <li key={m.id} className="overflow-hidden rounded-xl border">
                    <div className="relative">
                      <img src={m.url} alt="" className="aspect-[4/3] w-full object-cover" />
                      {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">Ảnh chính</span>}
                    </div>
                    <div className="flex justify-between p-1">
                      <span className="flex">
                        <Button type="button" variant="ghost" size="icon-xs" aria-label="Đưa lên trước" disabled={i === 0} onClick={() => set('images', move(f.images, i, -1))}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label="Đưa xuống sau" disabled={i === f.images.length - 1} onClick={() => set('images', move(f.images, i, 1))}>
                          <ArrowDown />
                        </Button>
                      </span>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label="Bỏ ảnh khỏi sản phẩm" onClick={() => set('images', f.images.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {Object.keys(err?.fields ?? {}).filter((k) => k.startsWith('images')).map((k) => (
              <p key={k} role="alert" className="text-xs text-destructive">{err!.fields![k]}</p>
            ))}
          </Card>

          <Card className="gap-4 p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Tùy chọn (màu, phiên bản, gói…)</h2>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => set('options', [...f.options, { key: '', locked: false, name: 'Màu sắc', type: 'color', choices: [newChoice('color')] }])}>
                  <Plus /> Nhóm màu
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set('options', [...f.options, { key: '', locked: false, name: '', type: 'choice', choices: [newChoice('choice')] }])}>
                  <Plus /> Nhóm lựa chọn
                </Button>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Lựa chọn đầu tiên của mỗi nhóm là mặc định, phụ phí nên là 0. Đổi tên thoải mái; khóa nội bộ giữ nguyên để giỏ hàng và đơn cũ không bị lỗi.</p>
            {f.options.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Xe này chưa có tùy chọn.</p>}

            {f.options.map((g, gi) => (
              <fieldset key={gi} className="grid gap-3 rounded-xl border p-4">
                <legend className="sr-only">Nhóm {g.name || gi + 1}</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={g.type === 'color' ? 'Tên nhóm màu' : 'Tên nhóm'} htmlFor={`g-${gi}`} error={fe(`options.${gi}.name`) ?? fe(`options.${gi}.key`)} className="min-w-48 flex-1">
                    <Input id={`g-${gi}`} value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} aria-invalid={!!fe(`options.${gi}.name`)} className="h-9" />
                  </Field>
                  <span className="pb-2 text-xs text-muted-foreground">{g.type === 'color' ? 'Nhóm màu' : 'Nhóm lựa chọn'}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Đưa nhóm lên" disabled={gi === 0} onClick={() => set('options', move(f.options, gi, -1))}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Đưa nhóm xuống" disabled={gi === f.options.length - 1} onClick={() => set('options', move(f.options, gi, 1))}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa nhóm" onClick={() => set('options', f.options.filter((_, i) => i !== gi))}>
                    <Trash2 />
                  </Button>
                </div>
                {fe(`options.${gi}.choices`) && <p role="alert" className="text-xs text-destructive">{fe(`options.${gi}.choices`)}</p>}

                <ul className="grid gap-3">
                  {g.choices.map((c, ci) => {
                    const p = (k: string) => fe(`options.${gi}.choices.${ci}.${k}`)
                    return (
                      <li key={ci} className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-[1fr_auto]">
                        <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
                          <Field label={ci === 0 ? 'Lựa chọn (mặc định)' : 'Lựa chọn'} htmlFor={`c-${gi}-${ci}`} error={p('name') ?? p('key')}>
                            <Input id={`c-${gi}-${ci}`} value={c.name} onChange={(e) => setChoice(gi, ci, { name: e.target.value })} aria-invalid={!!(p('name') || p('key'))} className="h-9 bg-background" />
                          </Field>
                          <Field label="Phụ phí (VND)" htmlFor={`pd-${gi}-${ci}`} error={p('priceDelta')}>
                            <Input id={`pd-${gi}-${ci}`} inputMode="numeric" value={c.priceDelta} onChange={(e) => setChoice(gi, ci, { priceDelta: e.target.value.replace(/\D/g, '') })} aria-invalid={!!p('priceDelta')} className="h-9 bg-background" />
                          </Field>
                          {g.type === 'color' && (
                            <Field label="Màu" htmlFor={`hx-${gi}-${ci}`} error={p('hex')}>
                              <input id={`hx-${gi}-${ci}`} type="color" value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'} onChange={(e) => setChoice(gi, ci, { hex: e.target.value })} aria-invalid={!!p('hex')} className="h-9 w-14 cursor-pointer rounded-md border bg-background p-1" />
                            </Field>
                          )}
                          <div className="flex gap-1 sm:col-span-3">
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Đưa lựa chọn lên" disabled={ci === 0} onClick={() => setGroup(gi, { choices: move(g.choices, ci, -1) })}>
                              <ArrowUp />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Đưa lựa chọn xuống" disabled={ci === g.choices.length - 1} onClick={() => setGroup(gi, { choices: move(g.choices, ci, 1) })}>
                              <ArrowDown />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Xóa lựa chọn" disabled={g.choices.length === 1} onClick={() => setGroup(gi, { choices: g.choices.filter((_, j) => j !== ci) })}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        {g.type === 'color' && (
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">Ảnh xe màu này</p>
                            <ImageSlot value={c.media} onChange={(m) => setChoice(gi, ci, { media: m })} />
                            {p('mediaId') && <p role="alert" className="text-xs text-destructive">{p('mediaId')}</p>}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setGroup(gi, { choices: [...g.choices, newChoice(g.type)] })}>
                  <Plus /> Thêm lựa chọn
                </Button>
              </fieldset>
            ))}
          </Card>

          <FormError message={err && !err.fields && err.code !== 'conflict' ? errorText(err) : undefined} />
          {err?.code === 'conflict' && <FormError message={err.message} />}
          {err?.code === 'validation_failed' && <FormError message="Có trường chưa hợp lệ, hãy xem các ô được đánh dấu đỏ." />}
        </div>

        <aside className="xl:sticky xl:top-6">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Xem trước trên cửa hàng</p>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="grid aspect-[5/4] place-items-center bg-muted">{previewImage ? <img src={previewImage} alt="" className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">Chưa có ảnh</span>}</div>
            <div className="grid gap-1 border-t p-4">
              {f.badge && <span className="w-fit rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">{f.badge}</span>}
              <b className="text-lg">{f.name || 'Tên xe'}</b>
              <span className="text-xs text-muted-foreground">{f.spec || 'Thông số'}</span>
              <span className="text-xs text-muted-foreground">{catName(f.category)}</span>
              <strong className="mt-1 text-lg">{Number.isFinite(price) ? vndShort(price) : '–'}</strong>
            </div>
          </Card>
        </aside>
      </div>

      <MediaPicker open={lib} onOpenChange={setLib} onPick={(m) => setF((s) => (s.images.some((i) => i.id === m.id) ? s : { ...s, images: [...s.images, m] }))} />
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm loại xe</DialogTitle>
            <DialogDescription>Ví dụ: Xe đạp điện. Địa chỉ (slug) tự sinh từ tên nếu để trống.</DialogDescription>
          </DialogHeader>
          <Field label="Tên loại" htmlFor="nc-name">
            <Input id="nc-name" value={newCat.name} onChange={(e) => setNewCat((s) => ({ ...s, name: e.target.value }))} className="h-10" />
          </Field>
          <Field label="Slug (không bắt buộc)" htmlFor="nc-slug">
            <Input id="nc-slug" value={newCat.slug} onChange={(e) => setNewCat((s) => ({ ...s, slug: e.target.value }))} className="h-10" />
          </Field>
          <FormError message={catErr} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCatOpen(false)}>
              Đóng
            </Button>
            <Button type="button" onClick={addCategory} disabled={!newCat.name.trim()}>
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
