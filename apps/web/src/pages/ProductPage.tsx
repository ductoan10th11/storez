import { useEffect, useState } from 'react'
import { Minus, Phone, Plus, ShoppingCart, Zap } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { imageFor, vnd, vndShort } from '@/api'
import { useCart, useCatalog } from '@/providers'
import { PHONE, PHONE_LABEL, priceOf } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Availability } from '@/components/Availability'
import { ProductBadge } from '@/components/ProductBadge'
import { Swatches } from '@/components/Swatches'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const wrap = 'mx-auto max-w-[1200px] px-4 pt-5 sm:px-6 sm:pt-7'

// Trang chi tiết /p/:slug: ảnh lớn đổi theo màu, đầy đủ tùy chọn, số lượng, thông số và xe cùng loại
export default function ProductPage() {
  const { slug } = useParams()
  const { products, loading, picksOf, pick, catName } = useCatalog()
  const { add, setOpen } = useCart()
  const navigate = useNavigate()
  const p = products.find((x) => x.slug === slug)
  const [qty, setQty] = useState(1)
  useEffect(() => setQty(1), [slug])
  useEffect(() => {
    document.title = p ? `${p.name} · Speed Showroom` : 'Speed Showroom'
    return () => void (document.title = 'Speed Showroom')
  }, [p])

  if (!p) {
    return (
      <main className={wrap}>
        {loading ? (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12" aria-hidden="true">
            <Skeleton className="aspect-[4/3] rounded-3xl" />
            <Skeleton className="min-h-80 rounded-3xl" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-7 text-center text-muted-foreground">
            <p>Không tìm thấy phương tiện này.</p>
            <Button asChild variant="outline">
              <Link to="/">Về trang chủ</Link>
            </Button>
          </div>
        )}
      </main>
    )
  }

  const picks = picksOf(p)
  const related = products.filter((x) => x.category === p.category && x.id !== p.id)
  const extras = p.options.flatMap((g) => {
    const c = g.choices.find((x) => x.id === picks[g.id])
    return c && c.price > 0 ? [{ group: g.name, name: c.name, price: c.price }] : []
  })
  const unit = priceOf(p, picks)
  const specs = p.spec.split('·').map((x) => x.trim()).filter(Boolean)
  const soldOut = p.availability === 'out_of_stock'

  return (
    <main className={wrap}>
      <Breadcrumb className="mb-5">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Trang chủ</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/?loai=${p.category}#san-pham`}>{catName(p.category)}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{p.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="lg:sticky lg:top-22">
          <div className="relative overflow-hidden rounded-3xl border bg-muted">
            <img src={imageFor(p, picks)} alt={p.name} className="block aspect-[4/3] w-full object-cover" />
            {p.badge && <ProductBadge text={p.badge} className="absolute top-3 left-3" />}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">{catName(p.category)}</p>
          <h1 className="text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.04em]">{p.name}</h1>
          <p className="mt-1.5 text-[0.84rem] text-muted-foreground">{p.spec}</p>
          <Availability p={p} className="text-sm" />
          <strong className="mt-3 mb-2.5 block text-3xl font-extrabold tracking-tight sm:text-[2rem]">{vnd(unit)}</strong>
          <p className="text-foreground/75">{p.description}</p>

          <Separator className="mt-6" />
          <div className="mt-5 flex flex-col gap-5">
            {p.options.map((g) => {
              const cur = g.choices.find((c) => c.id === picks[g.id]) ?? g.choices[0]
              return (
                <div key={g.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-2.5 text-xs tracking-wider text-muted-foreground uppercase">
                    <span>{g.name}</span>
                    {g.type === 'color' && <b className="text-sm font-semibold tracking-normal text-foreground normal-case">{cur.name}</b>}
                  </div>
                  {g.type === 'color' ? (
                    <Swatches group={g} value={cur.id} onPick={(c) => pick(p, g.id, c)} />
                  ) : (
                    <RadioGroup value={cur.id} onValueChange={(v) => pick(p, g.id, v)} className="grid gap-2">
                      {g.choices.map((c) => (
                        <Label
                          key={c.id}
                          htmlFor={`d-${p.id}-${g.id}-${c.id}`}
                          className={cn(
                            'cursor-pointer gap-3 rounded-xl border bg-card px-3.5 py-3 text-sm leading-snug transition-colors hover:border-foreground/40',
                            c.id === cur.id && 'border-foreground bg-muted ring-1 ring-foreground',
                          )}
                        >
                          <RadioGroupItem id={`d-${p.id}-${g.id}-${c.id}`} value={c.id} />
                          <span className="flex-1">{c.name}</span>
                          <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">{c.price > 0 ? `+${vndShort(c.price)}` : 'Gồm sẵn'}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              )
            })}
          </div>

          <Card className="mt-6 gap-2 rounded-2xl bg-muted py-4 text-sm shadow-none">
            <div className="flex justify-between gap-3 px-[18px] text-muted-foreground">
              <span>Giá cơ bản</span>
              <span>{vnd(p.price)}</span>
            </div>
            {extras.map((e) => (
              <div key={e.group} className="flex justify-between gap-3 px-[18px] text-muted-foreground">
                <span>{e.name}</span>
                <span>+{vnd(e.price)}</span>
              </div>
            ))}
            {qty > 1 && (
              <div className="flex justify-between gap-3 px-[18px] text-muted-foreground">
                <span>Số lượng</span>
                <span>× {qty}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex items-baseline justify-between gap-3 px-[18px]">
              <span>Thành tiền</span>
              <strong className="text-xl tracking-tight">{vnd(unit * qty)}</strong>
            </div>
          </Card>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <div role="group" aria-label="Số lượng" className="flex items-center gap-1.5 rounded-full border p-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Giảm số lượng">
                <Minus />
              </Button>
              <span className="min-w-7 text-center font-medium tabular-nums">{qty}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setQty((n) => Math.min(99, n + 1))} aria-label="Tăng số lượng">
                <Plus />
              </Button>
            </div>
            <Button variant="outline" size="lg" className="min-w-36 flex-1" disabled={soldOut} onClick={() => add(p, picks, qty)}>
              <ShoppingCart /> {soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
            </Button>
            <Button
              variant="brand"
              size="lg"
              className="min-w-36 flex-1"
              disabled={soldOut}
              onClick={async () => {
                await add(p, picks, qty)
                setOpen(false)
                navigate('/checkout')
              }}
            >
              <Zap /> Mua ngay
            </Button>
          </div>
          <p className="mt-3.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-4" />
            Cần tư vấn thêm? Gọi{' '}
            <a href={`tel:${PHONE}`} className="font-semibold text-foreground">
              {PHONE_LABEL}
            </a>
          </p>
        </div>
      </div>

      <section className="mt-16">
        <h2 className="mb-4 text-2xl font-bold tracking-tight">Thông số</h2>
        <ul className="grid border-t sm:grid-cols-2 sm:gap-x-10">
          <SpecRow label="Dòng xe" value={catName(p.category)} />
          {specs.map((x, i) => (
            <SpecRow key={i} label={`Thông số ${i + 1}`} value={x} />
          ))}
          <SpecRow label="Giá cơ bản" value={vnd(p.price)} />
        </ul>
      </section>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">Xe cùng loại</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.slice(0, 4).map((r) => (
              <Link key={r.id} to={`/p/${r.slug}`} className="group block">
                <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-none transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                  <img src={r.image} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <div className="flex flex-col px-3.5 pt-3 pb-3.5">
                    <b className="text-[0.95rem]">{r.name}</b>
                    <small className="text-muted-foreground">{vndShort(r.price)}</small>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-4 border-b py-3.5">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-right font-semibold">{value}</b>
    </li>
  )
}
