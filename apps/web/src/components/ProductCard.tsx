import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'
import { imageFor, vndShort, type Picks, type Product } from '@/api'
import { priceOf } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Availability } from './Availability'
import { ProductBadge } from './ProductBadge'
import { Swatches } from './Swatches'

type Props = {
  p: Product
  flipped: boolean
  picks: Picks
  onFlip: () => void
  onBack: () => void
  onPick: (group: string, choice: string) => void
  onConfirm: () => void
}

// Mặt trước và mặt sau nằm chung một ô lưới nên card luôn cao bằng mặt cao hơn.
// Mặt đang ẩn đặt invisible (sau khi lật xong) để không bị focus hay đọc nhầm.
const face =
  'col-start-1 row-start-1 gap-0 overflow-hidden rounded-2xl py-0 shadow-xs [backface-visibility:hidden] group-hover/card:border-foreground/20 group-hover/card:shadow-xl'
const shown = 'visible [transition:box-shadow_.2s,visibility_0s_linear_0s]'
const hidden = 'invisible [transition:box-shadow_.2s,visibility_0s_linear_.35s]'

// Card 2 mặt: mặt trước giới thiệu xe (bấm để vào trang chi tiết),
// mặt sau để thêm nhanh: đổi màu/phiên bản (ảnh đổi theo) rồi thêm vào giỏ
export function ProductCard({ p, flipped, picks, onFlip, onBack, onPick, onConfirm }: Props) {
  const hasExtra = p.options.some((g) => g.choices.some((c) => c.price > 0))
  const href = `/p/${p.slug}`
  const soldOut = p.availability === 'out_of_stock'
  const colorGroup = p.options.find((g) => g.type === 'color')
  const colorName = colorGroup?.choices.find((c) => c.id === picks[colorGroup.id])?.name

  return (
    <article
      id={`p-${p.id}`}
      className={cn('group/card [perspective:1600px] transition-transform duration-200', !flipped && 'hover:-translate-y-1')}
    >
      <div
        className={cn(
          'relative grid h-full [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:duration-75',
          flipped && '[transform:rotateY(180deg)]',
        )}
      >
        {/* Mặt trước */}
        <Card className={cn(face, 'relative cursor-pointer', flipped ? hidden : shown)}>
          <div className="relative block overflow-hidden bg-muted">
            <img
              src={imageFor(p, picks)}
              alt={p.name}
              loading="lazy"
              className="aspect-[5/4] w-full object-cover transition-transform duration-300 group-hover/card:scale-105"
            />
            {p.badge && <ProductBadge text={p.badge} className="absolute top-3 left-3" />}
          </div>
          <div className="flex flex-1 flex-col gap-1 border-t p-5">
            <h3 className="text-xl font-bold tracking-tight">
              <Link
                to={href}
                aria-label={`Xem chi tiết ${p.name}`}
                className="underline-offset-4 group-hover/card:underline after:absolute after:inset-0 after:content-['']"
              >
                {p.name}
              </Link>
            </h3>
            <p className="text-[0.84rem] text-muted-foreground">{p.spec}</p>
            <Availability p={p} />
            <p className="mt-1.5 line-clamp-2 text-sm text-foreground/75">{p.description}</p>
            {colorGroup && (
              <div className="mt-3.5 flex items-center gap-2.5 border-t border-dashed pt-3.5 text-xs text-muted-foreground">
                <span className="flex" aria-hidden="true">
                  {colorGroup.choices.map((c) => (
                    <i key={c.id} style={{ background: c.hex }} className="-ml-1.5 size-[18px] rounded-full border-2 border-white ring-1 ring-black/15 first:ml-0" />
                  ))}
                </span>
                <span>{colorGroup.choices.length} màu · tùy chọn phiên bản</span>
              </div>
            )}
            <div className="mt-auto flex items-end justify-between gap-2.5 pt-4">
              <div className="flex flex-col leading-tight">
                <small className="mb-0.5 text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">{hasExtra ? 'Từ' : 'Giá'}</small>
                <strong className="text-[1.35rem] font-extrabold tracking-tight">{vndShort(p.price)}</strong>
              </div>
              <Button size="lg" onClick={onFlip} disabled={soldOut} className="relative z-10 hover:bg-brand">
                <ShoppingCart /> {soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Mặt sau: thêm nhanh */}
        <Card role="group" aria-label={`Thêm nhanh ${p.name}`} className={cn(face, '[transform:rotateY(180deg)]', flipped ? shown : hidden)}>
          <div className="relative border-b bg-muted">
            <img src={imageFor(p, picks)} alt={p.name} className="aspect-[16/10] w-full object-cover" />
            <Button variant="outline" size="icon-sm" onClick={onBack} aria-label="Quay lại" className="absolute top-2.5 left-2.5 bg-white shadow-md">
              <ArrowLeft />
            </Button>
            {colorName && (
              <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-3 py-0.5 text-xs font-semibold">{colorName}</span>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center gap-3 px-4 pt-3.5 pb-1.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <h3 className="text-base font-bold tracking-tight">{p.name}</h3>
              <strong className="text-lg font-extrabold tracking-tight whitespace-nowrap">{vndShort(priceOf(p, picks))}</strong>
            </div>
            {p.options.map((g) =>
              g.type === 'color' ? (
                <Swatches key={g.id} group={g} size="sm" value={picks[g.id]} onPick={(c) => onPick(g.id, c)} />
              ) : (
                <div key={g.id} className="grid grid-cols-[76px_1fr] items-center gap-2.5">
                  <Label htmlFor={`sel-${p.id}-${g.id}`} className="text-xs font-normal text-muted-foreground">
                    {g.name}
                  </Label>
                  <Select value={picks[g.id]} onValueChange={(v) => onPick(g.id, v)}>
                    <SelectTrigger id={`sel-${p.id}-${g.id}`} className="h-9 w-full min-w-0 rounded-xl bg-white text-[0.84rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {g.choices.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.price > 0 && <span className="text-muted-foreground"> (+{vndShort(c.price)})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ),
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 px-4 pt-3 pb-4">
            <Button variant="brand" onClick={onConfirm}>
              <ShoppingCart /> Thêm vào giỏ
            </Button>
            <Button asChild variant="outline">
              <Link to={href}>Chi tiết</Link>
            </Button>
          </div>
        </Card>
      </div>
    </article>
  )
}
