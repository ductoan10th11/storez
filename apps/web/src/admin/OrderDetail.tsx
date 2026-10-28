import { useEffect, useState } from 'react'
import { Calendar, Phone, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError, vnd, type AdminOrder, type OrderStatus } from '@/api'
import { fmtDateTime, fmtPhone } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { Field, FormError } from '@/components/Field'
import { ContactCard, ItemsAndPayment, Timeline } from '@/components/OrderView'
import { SlotPicker } from '@/components/SlotPicker'
import { PaymentBadge, StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

type Action = { to: 'confirmed' | 'ready' | 'completed' | 'cancelled'; label: string; danger?: boolean; confirm: string }
const ACTIONS: Record<OrderStatus, Action[]> = {
  pending: [
    { to: 'confirmed', label: 'Xác nhận', confirm: 'Xác nhận đơn này? (Nhân viên đã gọi cho khách)' },
    { to: 'cancelled', label: 'Hủy', danger: true, confirm: 'Hủy đơn và trả xe về kho?' },
  ],
  confirmed: [
    { to: 'ready', label: 'Xe sẵn sàng', confirm: 'Đánh dấu xe đã sẵn sàng để khách nhận?' },
    { to: 'cancelled', label: 'Hủy', danger: true, confirm: 'Hủy đơn và trả xe về kho?' },
  ],
  ready: [
    { to: 'completed', label: 'Đã giao xe', confirm: 'Xác nhận đã giao xe cho khách?' },
    { to: 'cancelled', label: 'Hủy', danger: true, confirm: 'Hủy đơn và trả xe về kho?' },
  ],
  completed: [],
  cancelled: [],
  expired: [],
}

export default function OrderDetail() {
  const { code = '' } = useParams()
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.order(code), [code])
  const order = data?.order
  const set = (o: AdminOrder) => setData({ order: o })

  const [action, setAction] = useState<Action>()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [aErr, setAErr] = useState<string>()

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'transfer'>('transfer')
  const [payNote, setPayNote] = useState('')
  const [pErr, setPErr] = useState<string>()
  const [pBusy, setPBusy] = useState(false)

  const [internal, setInternal] = useState('')
  const [resched, setResched] = useState(false)
  const [slot, setSlot] = useState<number | null>(null)
  const [rErr, setRErr] = useState<string>()

  useEffect(() => {
    document.title = `${code} · Quản trị`
  }, [code])
  useEffect(() => {
    if (order) setInternal(order.internalNote ?? '')
  }, [order?.internalNote]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !order) return <Skeleton className="h-96 rounded-2xl" />
  if (!order) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <p>{error?.code === 'order_not_found' ? 'Không tìm thấy đơn hàng.' : errorText(error)}</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/admin/orders">Về danh sách đơn</Link>
        </Button>
      </div>
    )
  }

  const conflict = async (e: unknown) => {
    // invalid_transition / payment_incomplete / overpay: báo tại chỗ và làm mới đơn
    if (e instanceof ApiError && ['invalid_transition', 'payment_incomplete', 'overpay'].includes(e.code)) await reload()
    return e instanceof ApiError && e.code === 'payment_incomplete'
      ? `Cần thu đủ tiền trước khi giao xe (còn ${vnd(Number(e.extra.remaining ?? order.remaining))})`
      : e instanceof ApiError && e.code === 'overpay'
        ? `Số tiền thu vượt quá tổng đơn (còn ${vnd(Number(e.extra.remaining ?? order.remaining))})`
        : errorText(e)
  }

  const run = async () => {
    if (!action) return
    setBusy(true)
    setAErr(undefined)
    try {
      set((await api.admin.setStatus(order.code, action.to, note.trim() || undefined)).order)
      setAction(undefined)
      setNote('')
      toast.success('Đã cập nhật trạng thái')
    } catch (e) {
      setAErr(await conflict(e))
    } finally {
      setBusy(false)
    }
  }

  const pay = async (e: React.FormEvent) => {
    e.preventDefault()
    setPBusy(true)
    setPErr(undefined)
    try {
      set((await api.admin.pay(order.code, { amount: Number(amount.replace(/\D/g, '')), method, note: payNote.trim() || undefined })).order)
      setAmount('')
      setPayNote('')
      toast.success('Đã ghi khoản thu')
    } catch (e) {
      setPErr(e instanceof ApiError && e.fields?.amount ? e.fields.amount : await conflict(e))
    } finally {
      setPBusy(false)
    }
  }

  const saveNote = async () => {
    if ((order.internalNote ?? '') === internal.trim()) return
    try {
      set((await api.admin.patchOrder(order.code, { internalNote: internal.trim() || null })).order)
      toast.success('Đã lưu ghi chú')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const reschedule = async () => {
    if (slot === null) return
    setRErr(undefined)
    try {
      set((await api.admin.patchOrder(order.code, { pickupAt: slot })).order)
      setResched(false)
      toast.success('Đã đổi lịch hẹn')
    } catch (e) {
      setRErr(errorText(e))
    }
  }

  const actions = ACTIONS[order.status]
  const needPay = order.remaining > 0
  const canPay = order.status !== 'cancelled' && order.status !== 'expired' && order.remaining > 0

  return (
    <>
      <Button asChild variant="link" className="mb-2 h-auto p-0 text-muted-foreground">
        <Link to="/admin/orders">← Đơn hàng</Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-extrabold tracking-tight">{order.code}</h1>
          <StatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
          {order.overdue && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-white">QUÁ HẸN</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/admin/orders/${order.code}/print`} target="_blank">
              <Printer /> In phiếu nhận xe
            </Link>
          </Button>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions.map((a) => {
            const blocked = a.to === 'completed' && needPay
            return (
              <Button
                key={a.to}
                variant={a.danger ? 'outline' : 'brand'}
                className={a.danger ? 'text-destructive' : undefined}
                disabled={blocked}
                onClick={() => (setAErr(undefined), setNote(''), setAction(a))}
              >
                {a.label}
              </Button>
            )
          })}
          {order.status === 'ready' && needPay && <span className="text-sm text-muted-foreground">Cần thu đủ tiền trước khi giao xe (còn {vnd(order.remaining)}).</span>}
        </div>
      )}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-5">
          <ItemsAndPayment order={order} />

          <Card className="gap-4 p-5 shadow-none">
            <h2 className="font-bold">Thu tiền</h2>
            {canPay ? (
              <form onSubmit={pay} className="grid gap-3" noValidate>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAmount(String(Math.min(order.remaining, Math.round(order.total * 0.1))))}>
                    Cọc 10%
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAmount(String(order.remaining))}>
                    Thu hết phần còn lại
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="Số tiền (VND)" htmlFor="amount">
                    <Input id="amount" inputMode="numeric" value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className="h-10" />
                  </Field>
                  <Field label="Hình thức" htmlFor="method">
                    <select id="method" value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="transfer">Chuyển khoản</option>
                      <option value="cash">Tiền mặt</option>
                    </select>
                  </Field>
                </div>
                <Field label="Ghi chú (không bắt buộc)" htmlFor="payNote">
                  <Input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} className="h-10" />
                </Field>
                <FormError message={pErr} />
                <Button type="submit" disabled={pBusy || !amount} className="w-fit">
                  {pBusy ? 'Đang ghi…' : 'Ghi khoản thu'}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{order.remaining <= 0 ? 'Đã thu đủ.' : 'Không thu tiền với đơn đã hủy hoặc hết hạn.'}</p>
            )}
            {order.payments.length > 0 && (
              <ul className="divide-y rounded-lg border text-sm">
                {order.payments.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <b>{vnd(p.amount)}</b> · {p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                      {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(p.at)}
                      {p.receivedBy ? ` · ${p.receivedBy}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-2 p-5 shadow-none">
            <h2 className="font-bold">Ghi chú nội bộ</h2>
            <Textarea value={internal} onChange={(e) => setInternal(e.target.value)} onBlur={saveNote} placeholder="Chỉ nhân viên thấy, khách không bao giờ thấy" aria-label="Ghi chú nội bộ" />
            <p className="text-xs text-muted-foreground">Tự lưu khi rời khỏi ô.</p>
          </Card>
        </div>

        <div className="grid gap-5">
          <ContactCard order={order} masked={false} />
          <a href={`tel:${order.contact.phone}`} className="-mt-3">
            <Button variant="outline" className="w-full">
              <Phone /> Gọi {fmtPhone(order.contact.phone)}
            </Button>
          </a>
          <Card className="gap-3 p-5 shadow-none">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Lịch hẹn nhận xe</p>
            <p className="text-xl font-extrabold tracking-tight">{fmtDateTime(order.pickupAt)}</p>
            {order.status !== 'cancelled' && order.status !== 'expired' && order.status !== 'completed' && (
              <Button variant="outline" size="sm" className="w-fit" onClick={() => (setSlot(order.pickupAt), setRErr(undefined), setResched(true))}>
                <Calendar /> Đổi lịch hẹn
              </Button>
            )}
            {order.status === 'pending' && order.holdExpiresAt && <p className="text-xs text-muted-foreground">Giữ xe đến {fmtDateTime(order.holdExpiresAt)}</p>}
          </Card>
          <Card className="p-5 shadow-none">
            <h2 className="mb-3 font-bold">Lịch sử</h2>
            <Timeline order={order} />
          </Card>
        </div>
      </div>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.label} đơn {order.code}</DialogTitle>
            <DialogDescription>{action?.confirm}</DialogDescription>
          </DialogHeader>
          <Field label="Ghi chú (không bắt buộc, khách có thể thấy)" htmlFor="note">
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <FormError message={aErr} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(undefined)}>
              Đóng
            </Button>
            <Button variant={action?.danger ? 'destructive' : 'brand'} onClick={run} disabled={busy}>
              {busy ? 'Đang xử lý…' : action?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resched} onOpenChange={setResched}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Đổi lịch hẹn</DialogTitle>
            <DialogDescription>Chọn khung giờ còn trống.</DialogDescription>
          </DialogHeader>
          <SlotPicker value={slot} onChange={setSlot} />
          <FormError message={rErr} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResched(false)}>
              Đóng
            </Button>
            <Button onClick={reschedule} disabled={slot === null || slot === order.pickupAt}>
              Lưu lịch hẹn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
