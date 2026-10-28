import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Phone, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { imageFor, vnd } from '@/api'
import { useCart, useCatalog } from '@/providers'
import { PHONE, SORTS, fold, type Sort } from '@/lib/catalog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProductCard } from '@/components/ProductCard'

const kicker = 'mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase'
const h2 = 'text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-bold tracking-tight'
const chip =
  'h-9 rounded-full px-4 text-sm font-medium text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

export default function Home() {
  const { products, categories, catName, loading, error, picksOf, pick } = useCatalog()
  const { add } = useCart()
  const [params, setParams] = useSearchParams()
  const category = params.get('loai') ?? 'all'
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('default')
  const [flipped, setFlipped] = useState<number | null>(null) // card đang lật ra mặt sau

  useEffect(() => {
    document.title = 'Speed Showroom'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFlipped(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setCategory = (id: string) => setParams(id === 'all' ? {} : { loai: id }, { replace: true, preventScrollReset: true })
  const filtered = category !== 'all' || query !== '' || sort !== 'default'
  const reset = () => {
    setCategory('all')
    setQuery('')
    setSort('default')
  }

  const visible = useMemo(() => {
    const q = fold(query.trim())
    const list = products.filter((p) => (category === 'all' || p.category === category) && (!q || fold(`${p.name} ${p.spec}`).includes(q)))
    if (sort === 'asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'desc') list.sort((a, b) => b.price - a.price)
    return list
  }, [products, category, query, sort])

  const featured = products.find((p) => p.badge === 'Cao cấp' && p.category === 'may-bay') ?? products.find((p) => p.badge === 'Cao cấp')

  const addAndClose = async (id: number) => {
    const p = products.find((x) => x.id === id)
    if (!p) return
    setFlipped(null)
    await add(p, picksOf(p))
  }

  const openOptions = (id: number) => {
    setCategory('all')
    setQuery('')
    setFlipped(id)
    window.setTimeout(() => document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 sm:px-6">
      {/* Hero */}
      <section className="grid items-center gap-9 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-[72px]">
        <div>
          <p className={`${kicker} mb-4`}>Speed Showroom</p>
          <h1 className="text-[clamp(2.6rem,5.4vw,4.8rem)] leading-none font-extrabold tracking-[-0.05em]">
            Phương tiện cho
            <br />
            <span className="text-brand">mọi hành trình.</span>
          </h1>
          <p className="mt-5 max-w-[44ch] text-lg text-muted-foreground">
            Xe máy, ô tô, máy bay, trực thăng và xe tăng. Giá và thông số rõ ràng, chọn nhanh, đặt giữ xe và hẹn ngày đến showroom nhận.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Button asChild variant="brand" size="lg" className="h-12 px-7 text-base">
              <Link to="/#san-pham">
                Xem phương tiện <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-7 text-base">
              <a href={`tel:${PHONE}`}>
                <Phone /> Gọi tư vấn
              </a>
            </Button>
          </div>
        </div>
        <div className="relative mx-auto aspect-[1/0.9] w-full max-w-130 lg:max-w-none" aria-hidden="true">
          <span className="absolute top-0 right-0 aspect-square w-[76%] rounded-full bg-gradient-to-br from-brand-2 to-brand" />
          <img
            src="/vehicles/truc-thang-twin.svg"
            alt=""
            className="absolute bottom-[6%] left-0 aspect-[4/3] w-[90%] -rotate-3 rounded-3xl object-cover shadow-[0_30px_60px_rgba(14,14,18,0.28)]"
          />
        </div>
      </section>

      {/* Danh mục */}
      <section className="mt-16 sm:mt-18">
        <p className={kicker}>Danh mục</p>
        <h2 className={`${h2} mb-5`}>Bạn muốn đi bằng gì?</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4.5">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/?loai=${c.id}#san-pham`}
              className="group grid grid-cols-[1fr_auto] items-center overflow-hidden rounded-2xl border bg-card text-left shadow-xs transition hover:-translate-y-1 hover:border-foreground/20 hover:shadow-xl"
            >
              <span className="col-span-2 block overflow-hidden bg-muted">
                {c.image && <img src={c.image} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
              </span>
              <span className="flex flex-col py-3.5 pl-3 sm:pl-4">
                <strong className="font-semibold">{c.name}</strong>
                <small className="text-[0.82rem] text-muted-foreground">{c.count} mẫu</small>
              </span>
              <span className="mx-3 grid size-8 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:mx-4">
                <ArrowRight className="size-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Danh sách */}
      <section id="san-pham" className="mt-16 scroll-mt-20 sm:mt-18">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className={kicker}>Bộ sưu tập</p>
            <h2 className={h2}>{category === 'all' ? 'Tất cả phương tiện' : catName(category)}</h2>
          </div>
          <span className="text-sm text-muted-foreground">{loading ? '' : `${visible.length} mẫu`}</span>
        </div>

        <div className="my-6 flex flex-wrap items-center justify-between gap-3.5">
          <ToggleGroup type="single" variant="outline" spacing={1.5} value={category} onValueChange={(v) => v && setCategory(v)} aria-label="Lọc theo loại" className="flex-wrap">
            {[{ id: 'all', name: 'Tất cả' }, ...categories].map((c) => (
              <ToggleGroupItem key={c.id} value={c.id} className={chip}>
                {c.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc thông số" aria-label="Tìm phương tiện" className="h-10 rounded-full pl-10 sm:w-64" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger aria-label="Sắp xếp" className="h-10! w-44 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORTS.map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <p className="mb-5 rounded-xl border border-destructive/30 p-7 text-center text-destructive">
            Không tải được dữ liệu ({error}).{' '}
            <button className="font-medium underline" onClick={() => location.reload()}>
              Thử lại
            </button>
          </p>
        )}

        {!error && !loading && visible.length === 0 && (
          <div className="mb-5 flex flex-col items-center gap-3 rounded-xl border border-dashed p-7 text-muted-foreground">
            <p>Không có phương tiện nào phù hợp.</p>
            <Button variant="outline" onClick={reset}>
              Xóa bộ lọc
            </Button>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-5.5">
          {loading &&
            Array.from({ length: 6 }, (_, i) => (
              <Card key={i} aria-hidden="true" className="gap-0 overflow-hidden rounded-2xl py-0">
                <Skeleton className="aspect-[5/4] rounded-none" />
                <div className="flex flex-col gap-3 p-5">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </Card>
            ))}
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              flipped={flipped === p.id}
              picks={picksOf(p)}
              onFlip={() => setFlipped(p.id)}
              onBack={() => setFlipped(null)}
              onPick={(g, c) => pick(p, g, c)}
              onConfirm={() => addAndClose(p.id)}
            />
          ))}
        </div>
        {filtered && !loading && visible.length > 0 && (
          <Button variant="link" className="mx-auto mt-5 flex text-muted-foreground" onClick={reset}>
            Xóa bộ lọc
          </Button>
        )}
      </section>

      {/* Nổi bật */}
      {featured && (
        <section className="mt-16 sm:mt-18">
          <div className="grid items-center gap-8 overflow-hidden rounded-[28px] bg-gradient-to-br from-primary from-40% to-[#3a1210] p-6 text-white sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:pr-10 lg:pl-12">
            <div>
              <p className={kicker}>Nổi bật</p>
              <h2 className="mb-3 text-[clamp(2rem,4vw,3.2rem)] leading-tight font-extrabold tracking-[-0.04em]">{featured.name}</h2>
              <p className="max-w-[42ch] text-white/70">{featured.description}</p>
              <p className="mt-2.5 text-[0.85rem] text-white/55">{featured.spec}</p>
              <strong className="mt-4 block text-[1.8rem] font-extrabold tracking-tight text-brand-2">{vnd(featured.price)}</strong>
              <div className="mt-7 flex flex-wrap gap-2.5">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90" onClick={() => openOptions(featured.id)} disabled={featured.availability === 'out_of_stock'}>
                  Chọn tùy chọn
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <Link to={`/p/${featured.slug}`}>Xem chi tiết</Link>
                </Button>
              </div>
            </div>
            <img src={imageFor(featured, picksOf(featured))} alt={featured.name} loading="lazy" className="aspect-[4/3] w-full rounded-[20px] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.5)] lg:rotate-2" />
          </div>
        </section>
      )}
    </main>
  )
}
