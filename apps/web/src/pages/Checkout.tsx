import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Clock, MapPin, ShoppingBag, Store } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError, vnd, type SlotDay } from '@/api'
import { useAuth, useCart, useCatalog } from '@/providers'
import { ADDRESS } from '@/lib/catalog'
import { fmtDayLabel, fmtPhone } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { Field, FormError } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const wrap = 'mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12'

function Summary({ compact }: { compact?: boolean }) {
  const { cart } = useCart()
  return (
    <div className="grid gap-3">
      {cart.items.map((i) => (
        <div key={i.id} className="flex gap-3">
          <img src={i.image} alt="" className={cn('shrink-0 rounded-lg object-cover', compact ? 'h-12 w-16' : 'h-[63px] w-[84px]')} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{i.product.name}</p>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              {i.options.map((o) => (
                <span key={o.group} className="inline-flex items-center">
                  {o.hex && <i style={{ background: o.hex }} className="mr-1 inline-block size-2.5 rounded-full ring-1 ring-black/20" />}
                  {o.choice}
                </span>
              ))}
            </p>
            <p className="text-xs text-muted-foreground">
              {vnd(i.unitPrice)} × {i.qty}
            </p>
          </div>
          <b className="text-sm tabular-nums">{vnd(i.unitPrice * i.qty)}</b>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="text-muted-foreground">Tổng tiền</span>
        <strong className="text-2xl tracking-tight">{vnd(cart.total)}</strong>
      </div>
    </div>
  )
}

// /checkout: đặt xe, không cần tài khoản
export default function Checkout() {
  const { cart, refresh } = useCart()
  const { user } = useAuth()
  const { settings } = useCatalog()
  const navigate = useNavigate()
  const slots = useAsync(() => api.slots(14), [])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [pickupAt, setPickupAt] = useState<number | null>(null)
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError>()
  const [showSummary, setShowSummary] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    document.title = 'Đặt xe · Speed Showroom'
  }, [])
  // Đã đăng nhập thì điền sẵn họ tên, SĐT, email
  useEffect(() => {
    if (user) {
      setName((v) => v || user.name)
      setPhone((v) => v || user.phone)
      setEmail((v) => v || user.email || '')
    }
  }, [user])

  const days: SlotDay[] = slots.data?.days ?? []
  // Chọn sẵn khung trống sớm nhất
  useEffect(() => {
    if (pickupAt !== null || !days.length) return
    const first = days.flatMap((d) => d.slots.map((s) => ({ ...s, date: d.date }))).find((s) => s.available)
    if (first) {
      setPickupAt(first.startsAt)
      setDay(first.date)
    }
  }, [days, pickupAt])
  const curDay = days.find((d) => d.date === day) ?? days[0]

  const fields = err?.fields ?? {}
  const f = (k: string) => fields[`contact.${k}`] ?? fields[k]
  const info = settings?.showroom

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (pickupAt === null) return setErr(new ApiError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { pickupAt: 'Chọn giờ đến nhận xe' }))
    setBusy(true)
    setErr(undefined)
    try {
      const { order } = await api.placeOrder({ contact: { name, phone, email, address }, note, pickupAt })
      await refresh()
      navigate(`/track/${order.code}?new=1`)
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e))
      setErr(ae)
      if (ae.code === 'cart_empty') {
        toast.error('Giỏ hàng trống')
        navigate('/')
      } else if (ae.code === 'out_of_stock') {
        const p = cart.items.find((i) => i.product.id === ae.extra.productId)?.product.name ?? 'Một xe trong giỏ'
        toast.error(`${p} chỉ còn ${ae.extra.available ?? 0} xe`)
        await refresh()
      } else if (ae.code === 'product_unavailable' || ae.code === 'option_invalid') {
        toast.error('Một số xe trong giỏ đã thay đổi. Vui lòng kiểm tra lại giỏ hàng')
        await refresh()
      } else if (ae.code === 'slot_unavailable') {
        toast.error('Khung giờ này vừa hết chỗ, vui lòng chọn giờ khác')
        setPickupAt(null)
        slots.reload()
      } else if (ae.code === 'validation_failed') {
        setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!cart.items.length && !busy) {
    return (
      <main className={wrap}>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          <ShoppingBag className="size-10" strokeWidth={1.5} />
          <p>Giỏ hàng đang trống, hãy chọn xe trước khi đặt.</p>
          <Button asChild variant="brand">
            <Link to="/#san-pham">Xem phương tiện</Link>
          </Button>
        </div>
      </main>
    )
  }

  const generic = err && !['validation_failed', 'slot_unavailable', 'out_of_stock'].includes(err.code) ? errorText(err) : undefined

  return (
    <main className={wrap}>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Đặt xe</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <form ref={formRef} onSubmit={submit} className="grid gap-8" noValidate>
          {/* Tóm tắt thu gọn cho điện thoại */}
          <Card className="gap-0 p-0 shadow-none lg:hidden">
            <button type="button" onClick={() => setShowSummary((v) => !v)} className="flex items-center justify-between gap-3 p-4 text-left" aria-expanded={showSummary}>
              <span className="font-semibold">
                {cart.count} xe · {vnd(cart.total)}
              </span>
              <ChevronDown className={cn('size-5 transition-transform', showSummary && 'rotate-180')} />
            </button>
            {showSummary && (
              <div className="border-t p-4">
                <Summary compact />
              </div>
            )}
          </Card>

          <section className="grid gap-4">
            <h2 className="text-lg font-bold">1. Thông tin liên hệ</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Họ và tên" htmlFor="name" error={f('name')} className="sm:col-span-2">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!f('name')} className="h-11" />
              </Field>
              <Field label="Số điện thoại" htmlFor="phone" error={f('phone')}>
                <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="0336 436 536" aria-invalid={!!f('phone')} className="h-11" />
              </Field>
              <Field label="Email" htmlFor="email" error={f('email')}>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!f('email')} className="h-11" />
              </Field>
              <Field label="Địa chỉ (không bắt buộc)" htmlFor="address" error={f('address')} className="sm:col-span-2">
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" aria-invalid={!!f('address')} className="h-11" />
              </Field>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-lg font-bold">2. Chọn ngày và giờ đến nhận xe</h2>
            {slots.loading && !days.length ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : slots.error ? (
              <p className="text-sm text-destructive">
                Không tải được khung giờ.{' '}
                <button type="button" className="underline" onClick={slots.reload}>
                  Thử lại
                </button>
              </p>
            ) : !days.length ? (
              <p className="rounded-xl border border-dashed p-5 text-center text-muted-foreground">Hiện chưa có khung giờ nào còn trống. Vui lòng gọi showroom để đặt lịch.</p>
            ) : (
              <>
                <ToggleGroup type="single" variant="outline" spacing={2} value={curDay?.date} onValueChange={(v) => v && setDay(v)} aria-label="Chọn ngày" className="-mx-1 justify-start overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                  {days.map((d) => {
                    const l = fmtDayLabel(d.date)
                    return (
                      <ToggleGroupItem key={d.date} value={d.date} className="h-auto min-w-16 flex-col rounded-xl px-3 py-2 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                        <span className="text-xs font-medium">{l.dow}</span>
                        <span className="text-base font-bold">{l.dm}</span>
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
                <div role="radiogroup" aria-label="Chọn giờ" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {curDay?.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      role="radio"
                      aria-checked={pickupAt === s.startsAt}
                      disabled={!s.available}
                      onClick={() => setPickupAt(s.startsAt)}
                      className={cn(
                        'flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors',
                        pickupAt === s.startsAt ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-foreground/40',
                        !s.available && 'cursor-not-allowed bg-muted text-muted-foreground opacity-60',
                      )}
                    >
                      {s.time}
                      {!s.available && <span className="text-[0.65rem] font-normal">Hết chỗ</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {fields.pickupAt && (
              <p role="alert" className="text-xs text-destructive">
                {fields.pickupAt}
              </p>
            )}
          </section>

          <section className="grid gap-3">
            <h2 className="text-lg font-bold">3. Ghi chú</h2>
            <Field label="Ghi chú (không bắt buộc)" htmlFor="note" error={fields.note}>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: tôi đến sau 9 giờ" aria-invalid={!!fields.note} />
            </Field>
          </section>

          <Card className="gap-2.5 bg-muted/50 p-4 text-sm shadow-none">
            <p className="flex items-center gap-2 font-semibold">
              <Store className="size-4" /> Nhận xe tại showroom · Thanh toán khi nhận xe · Không phí vận chuyển
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {info?.address ?? ADDRESS}
            </p>
            {settings && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4 shrink-0" /> Mở cửa {settings.pickup.open} đến {settings.pickup.close}
                {info ? ` · ${fmtPhone(info.phone)}` : ''}
              </p>
            )}
          </Card>

          <FormError message={generic} />
          <div className="grid gap-2">
            <Button type="submit" variant="brand" size="lg" className="h-12 w-full text-base sm:w-auto sm:self-start sm:px-10" disabled={busy}>
              {busy ? 'Đang gửi…' : 'Đặt xe'}
            </Button>
            <p className="text-xs text-muted-foreground">Nhân viên sẽ gọi xác nhận trong thời gian sớm nhất.</p>
          </div>
        </form>

        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <Card className="p-5 shadow-none">
            <h2 className="mb-4 text-lg font-bold">Giỏ hàng của bạn</h2>
            <Summary />
          </Card>
        </aside>
      </div>
    </main>
  )
}
