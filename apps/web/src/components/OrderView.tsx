import { Check, MapPin, Navigation, Phone, X } from 'lucide-react'
import type { Order, OrderStatus } from '@/api'
import { vnd } from '@/api'
import { useCatalog } from '@/providers'
import { ADDRESS, PHONE } from '@/lib/catalog'
import { fmtDateTime, fmtPhone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PaymentBadge, StatusBadge } from './StatusBadge'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Đã nhận đơn' },
  { status: 'confirmed', label: 'Đã xác nhận' },
  { status: 'ready', label: 'Xe sẵn sàng' },
  { status: 'completed', label: 'Đã giao xe' },
]
const END: Record<string, string> = { cancelled: 'Đã hủy', expired: 'Hết hạn giữ xe' }

// Dòng thời gian: bước đã qua có dấu tích + giờ, bước hiện tại nổi bật, bước chưa tới mờ; hủy/hết hạn là bước cuối màu đỏ
export function Timeline({ order }: { order: Pick<Order, 'status' | 'events'> }) {
  const at = new Map(order.events.map((e) => [e.status, e]))
  const ended = order.status === 'cancelled' || order.status === 'expired'
  const reached = STEPS.filter((s) => at.has(s.status))
  const steps = ended ? reached : STEPS
  const currentIdx = ended ? -1 : steps.findIndex((s) => !at.has(s.status))
  return (
    <ol className="grid gap-0" aria-label="Tiến độ đơn hàng">
      {steps.map((s, i) => {
        const ev = at.get(s.status)
        const current = i === currentIdx
        const last = i === steps.length - 1 && !ended
        return (
          <li key={s.status} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className={cn('absolute top-7 bottom-0 left-[13px] w-0.5', ev ? 'bg-success' : 'bg-border')} />}
            <span className={cn('z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 bg-background', ev ? 'border-success bg-success text-white' : current ? 'border-brand text-brand' : 'border-border text-muted-foreground')}>
              {ev ? <Check className="size-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
            </span>
            <div className={cn('pt-0.5', !ev && !current && 'opacity-50')}>
              <p className={cn('leading-tight font-semibold', current && 'text-brand')}>
                {s.label}
                {current && <span className="ml-2 text-xs font-medium">Đang chờ</span>}
              </p>
              {ev && <p className="text-xs text-muted-foreground">{fmtDateTime(ev.at)}{ev.actor ? ` · ${ev.actor}` : ''}</p>}
              {ev?.note && <p className="mt-0.5 text-xs text-foreground/70">“{ev.note}”</p>}
            </div>
          </li>
        )
      })}
      {ended && (
        <li className="relative flex gap-3 pt-5">
          <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full bg-destructive text-white">
            <X className="size-4" />
          </span>
          <div className="pt-0.5">
            <p className="leading-tight font-semibold text-destructive">{END[order.status]}</p>
            {at.get(order.status) && <p className="text-xs text-muted-foreground">{fmtDateTime(at.get(order.status)!.at)}</p>}
            {at.get(order.status)?.note && <p className="mt-0.5 text-xs text-foreground/70">“{at.get(order.status)!.note}”</p>}
          </div>
        </li>
      )}
    </ol>
  )
}

export function PickupCard({ pickupAt }: { pickupAt: number }) {
  const { settings } = useCatalog()
  const address = settings?.showroom.address ?? ADDRESS
  const phone = settings?.showroom.phone ?? PHONE
  return (
    <Card className="gap-3 p-5 shadow-none">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Lịch hẹn nhận xe</p>
      <p className="text-2xl font-extrabold tracking-tight">{fmtDateTime(pickupAt)}</p>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        {address}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`tel:${phone}`}>
            <Phone /> Gọi showroom
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
            <Navigation /> Chỉ đường
          </a>
        </Button>
      </div>
    </Card>
  )
}

export function ItemsAndPayment({ order }: { order: Order }) {
  return (
    <Card className="gap-0 p-0 shadow-none">
      <div className="divide-y">
        {order.items.map((it, i) => (
          <div key={i} className="flex gap-3 p-4">
            <img src={it.image} alt="" className="h-[63px] w-[84px] shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{it.name}</p>
              <p className="flex flex-wrap gap-x-2.5 text-xs text-muted-foreground">
                {it.options.map((o) => (
                  <span key={o.group} className="inline-flex items-center">
                    {o.hex && <i style={{ background: o.hex }} className="mr-1.5 inline-block size-2.5 rounded-full ring-1 ring-black/20" />}
                    {o.choice}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {vnd(it.unitPrice)} × {it.qty}
              </p>
            </div>
            <strong className="shrink-0 tabular-nums">{vnd(it.unitPrice * it.qty)}</strong>
          </div>
        ))}
      </div>
      <dl className="grid gap-1.5 border-t bg-muted/50 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Tổng tiền</dt>
          <dd className="font-bold">{vnd(order.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Đã thu</dt>
          <dd>{vnd(order.paidTotal)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Còn lại</dt>
          <dd className="flex items-center gap-2">
            <PaymentBadge status={order.paymentStatus} />
            <b>{vnd(order.remaining)}</b>
          </dd>
        </div>
      </dl>
    </Card>
  )
}

export function ContactCard({ order, masked }: { order: Order; masked: boolean }) {
  const c = order.contact
  return (
    <Card className="gap-1 p-5 text-sm shadow-none">
      <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Người đặt{masked ? ' (đã che một phần)' : ''}</p>
      <p className="font-semibold">{c.name}</p>
      <p>{masked ? c.phone : fmtPhone(c.phone)}</p>
      <p>{c.email}</p>
      {c.address && <p className="text-muted-foreground">{c.address}</p>}
      {order.note && <p className="mt-1 text-muted-foreground">Ghi chú: {order.note}</p>}
    </Card>
  )
}

export function OrderHeader({ order }: { order: Order }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-mono text-2xl font-extrabold tracking-tight">{order.code}</h1>
      <StatusBadge status={order.status} />
    </div>
  )
}

export function holdNotice(order: Order) {
  return order.status === 'pending' && order.holdExpiresAt ? `Nhân viên sẽ gọi xác nhận. Xe được giữ cho bạn đến ${fmtDateTime(order.holdExpiresAt)}.` : null
}
