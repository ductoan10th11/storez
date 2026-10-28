import { useEffect, useState } from 'react'
import { ClipboardList, PackageOpen } from 'lucide-react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError, vndShort } from '@/api'
import { useAuth } from '@/providers'
import { fmtDateTime } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { Field, FormError } from '@/components/Field'
import { ContactCard, holdNotice, ItemsAndPayment, OrderHeader, PickupCard, Timeline } from '@/components/OrderView'
import { PaymentBadge, StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

const tab = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-full px-4 py-1.5 text-sm font-medium', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')

export function AccountLayout() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6 sm:py-12">
      <nav className="mb-6 flex gap-1" aria-label="Tài khoản">
        <NavLink to="/account/orders" className={tab}>
          Đơn hàng của tôi
        </NavLink>
        <NavLink to="/account" end className={tab}>
          Tài khoản
        </NavLink>
      </nav>
      <Outlet />
    </main>
  )
}

export function Profile() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [err, setErr] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [pwErr, setPwErr] = useState<ApiError>()
  const [pwBusy, setPwBusy] = useState(false)
  useEffect(() => void (document.title = 'Tài khoản · Speed Showroom'), [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      setUser((await api.updateProfile({ name, email: email.trim() || null })).user)
      toast.success('Đã lưu thay đổi')
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e)))
    } finally {
      setBusy(false)
    }
  }
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwBusy(true)
    setPwErr(undefined)
    try {
      await api.changePassword(cur, next)
      setCur('')
      setNext('')
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất')
    } catch (e) {
      setPwErr(e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e)))
    } finally {
      setPwBusy(false)
    }
  }
  return (
    <div className="grid gap-6">
      <Card className="p-6 shadow-none">
        <h2 className="mb-4 text-lg font-bold">Thông tin cá nhân</h2>
        <form onSubmit={save} className="grid gap-4" noValidate>
          <Field label="Số điện thoại" htmlFor="phone" hint="Số điện thoại không đổi được">
            <Input id="phone" value={user?.phone ?? ''} disabled className="h-11" />
          </Field>
          <Field label="Họ và tên" htmlFor="name" error={err?.fields?.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </Field>
          <Field label="Email" htmlFor="email" error={err?.fields?.email ?? (err?.code === 'email_taken' ? err.message : undefined)}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </Field>
          <FormError message={err && !err.fields && err.code !== 'email_taken' ? errorText(err) : undefined} />
          <Button type="submit" disabled={busy} className="w-fit">
            {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </form>
      </Card>
      <Card className="p-6 shadow-none">
        <h2 className="mb-4 text-lg font-bold">Đổi mật khẩu</h2>
        <form onSubmit={savePw} className="grid gap-4" noValidate>
          <Field label="Mật khẩu hiện tại" htmlFor="cur" error={pwErr?.code === 'invalid_credentials' ? 'Mật khẩu hiện tại không đúng' : pwErr?.fields?.currentPassword}>
            <Input id="cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className="h-11" />
          </Field>
          <Field label="Mật khẩu mới" htmlFor="next" hint="Tối thiểu 8 ký tự" error={pwErr?.fields?.newPassword}>
            <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className="h-11" />
          </Field>
          <FormError message={pwErr && !pwErr.fields && pwErr.code !== 'invalid_credentials' ? errorText(pwErr) : undefined} />
          <Button type="submit" disabled={pwBusy} className="w-fit">
            {pwBusy ? 'Đang đổi…' : 'Đổi mật khẩu'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export function MyOrders() {
  const { data, error, loading, reload } = useAsync(() => api.myOrders(), [])
  useEffect(() => void (document.title = 'Đơn hàng của tôi · Speed Showroom'), [])
  if (loading) return <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
  if (error) {
    return (
      <p className="rounded-xl border border-destructive/30 p-7 text-center text-destructive">
        {errorText(error)}{' '}
        <button className="underline" onClick={reload}>
          Thử lại
        </button>
      </p>
    )
  }
  if (!data?.items.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        <ClipboardList className="size-10" strokeWidth={1.5} />
        <p>Bạn chưa có đơn hàng nào.</p>
        <Button asChild variant="brand">
          <Link to="/#san-pham">Xem phương tiện</Link>
        </Button>
      </div>
    )
  }
  return (
    <ul className="grid gap-3">
      {data.items.map((o) => (
        <li key={o.code}>
          <Link to={`/account/orders/${o.code}`} className="flex gap-4 rounded-2xl border bg-card p-4 transition hover:border-foreground/30 hover:shadow-md">
            {o.items[0] ? <img src={o.items[0].image} alt="" className="h-[63px] w-[84px] shrink-0 rounded-lg object-cover" /> : <PackageOpen className="size-10" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-mono">{o.code}</b>
                <StatusBadge status={o.status} />
                <PaymentBadge status={o.paymentStatus} />
              </div>
              <p className="mt-1 truncate text-sm">
                {o.items[0]?.name}
                {o.items.length > 1 && ` +${o.items.length - 1} xe khác`}
              </p>
              <p className="text-xs text-muted-foreground">Hẹn nhận: {fmtDateTime(o.pickupAt)}</p>
            </div>
            <strong className="shrink-0 self-center">{vndShort(o.total)}</strong>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function MyOrder() {
  const { code = '' } = useParams()
  const { data, error, loading, reload, setData } = useAsync(() => api.myOrder(code), [code])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [cErr, setCErr] = useState<string>()
  const order = data?.order

  if (loading) return <Skeleton className="h-80 rounded-2xl" />
  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        <p>{error?.code === 'order_not_found' ? 'Không tìm thấy đơn hàng này trong tài khoản của bạn.' : errorText(error)}</p>
        <Button asChild variant="outline">
          <Link to="/account/orders">Về danh sách đơn</Link>
        </Button>
      </div>
    )
  }
  const cancel = async () => {
    setBusy(true)
    setCErr(undefined)
    try {
      setData((await api.cancelMyOrder(order.code, reason.trim() || undefined)))
      setCancelOpen(false)
      toast.success('Đã hủy đơn')
    } catch (e) {
      setCErr(errorText(e))
      if (e instanceof ApiError && e.code === 'invalid_transition') reload()
    } finally {
      setBusy(false)
    }
  }
  const notice = holdNotice(order)
  return (
    <div>
      <Button asChild variant="link" className="mb-3 h-auto p-0 text-muted-foreground">
        <Link to="/account/orders">← Đơn hàng của tôi</Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OrderHeader order={order} />
        {order.canCancel && (
          <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
            Hủy đơn
          </Button>
        )}
      </div>
      {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
      <div className="mt-6 grid items-start gap-5 md:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-5">
          <Card className="p-5 shadow-none">
            <Timeline order={order} />
          </Card>
          <PickupCard pickupAt={order.pickupAt} />
        </div>
        <div className="grid gap-5">
          <ItemsAndPayment order={order} />
          <ContactCard order={order} masked={false} />
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy đơn {order.code}?</DialogTitle>
            <DialogDescription>Xe sẽ được trả lại kho và không thể hoàn tác.</DialogDescription>
          </DialogHeader>
          <Field label="Lý do (không bắt buộc)" htmlFor="reason">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <FormError message={cErr} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Giữ đơn
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy ? 'Đang hủy…' : 'Xác nhận hủy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
