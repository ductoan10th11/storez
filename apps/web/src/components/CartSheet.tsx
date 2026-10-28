import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { vnd, vndShort } from '@/api'
import { useCart } from '@/providers'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export function CartSheet() {
  const { cart, open, setOpen, setQty, clear } = useCart()
  const navigate = useNavigate()
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-105">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-lg">Giỏ hàng ({cart.count})</SheetTitle>
          <SheetDescription className="sr-only">Các phương tiện bạn đã thêm vào giỏ</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5">
          {cart.items.length === 0 && (
            <div className="mt-14 flex flex-col items-center gap-3.5 text-muted-foreground">
              <ShoppingBag className="size-10" strokeWidth={1.5} />
              <p>Giỏ hàng đang trống.</p>
              <Button variant="outline" onClick={() => (close(), navigate('/#san-pham'))}>
                Xem phương tiện
              </Button>
            </div>
          )}

          {cart.items.map(({ id, product: p, qty, unitPrice, options, image }) => (
            <div key={id} className="flex items-start gap-3 border-b py-3.5 last:border-b-0">
              <Link to={`/p/${p.slug}`} onClick={close} className="shrink-0">
                <img src={image} alt="" className="h-[63px] w-[84px] rounded-lg object-cover" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <Link to={`/p/${p.slug}`} onClick={close} className="font-semibold hover:underline">
                  {p.name}
                </Link>
                {p.availability === 'out_of_stock' && <span className="text-xs font-medium text-destructive">Hết hàng, vui lòng bỏ khỏi giỏ</span>}
                {options.length > 0 && (
                  <span className="flex flex-wrap gap-x-2.5 text-xs text-muted-foreground">
                    {options.map((o) => (
                      <span key={o.group} className="inline-flex items-center">
                        {o.hex && <i style={{ background: o.hex }} className="mr-1.5 inline-block size-2.5 rounded-full ring-1 ring-black/20" />}
                        {o.choice}
                      </span>
                    ))}
                  </span>
                )}
                <span className="text-[0.85rem] text-muted-foreground">{vndShort(unitPrice)}</span>
                <div className="mt-1.5 flex items-center gap-2.5 font-medium">
                  <Button variant="outline" size="icon-xs" onClick={() => setQty(id, qty - 1)} aria-label="Giảm số lượng">
                    <Minus />
                  </Button>
                  <span className="min-w-4 text-center tabular-nums">{qty}</span>
                  <Button variant="outline" size="icon-xs" onClick={() => setQty(id, qty + 1)} aria-label="Tăng số lượng">
                    <Plus />
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setQty(id, 0)} aria-label={`Xóa ${p.name}`} className="text-muted-foreground">
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>

        {cart.items.length > 0 && (
          <SheetFooter className="gap-2.5 border-t p-5">
            <div className="flex items-baseline justify-between text-muted-foreground">
              <span>Tổng cộng</span>
              <strong className="text-xl text-foreground">{vnd(cart.total)}</strong>
            </div>
            <Button variant="brand" size="lg" className="w-full" onClick={() => (close(), navigate('/checkout'))}>
              Đặt xe
            </Button>
            <Button variant="link" size="sm" className="self-center text-muted-foreground" onClick={clear}>
              Xóa giỏ hàng
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
