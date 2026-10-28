import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import { useAuth } from '@/providers'
import { errorText } from '@/lib/useAsync'
import { Field, FormError } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const wrap = 'mx-auto flex max-w-md flex-col gap-5 px-4 py-10 sm:py-16'

// returnTo chỉ nhận đường dẫn nội bộ (chống chuyển hướng ra ngoài)
const safeReturn = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null)

// Chưa đăng nhập vào trang cần quyền thì chuyển về /login?returnTo=...
export function RequireAuth() {
  const { user } = useAuth()
  const loc = useLocation()
  if (user === undefined) return <div className="p-10 text-center text-muted-foreground">Đang tải…</div>
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <Outlet />
}

export function Login() {
  const { user, setUser } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const returnTo = safeReturn(params.get('returnTo'))
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError>()
  useEffect(() => void (document.title = 'Đăng nhập · Speed Showroom'), [])
  useEffect(() => {
    if (user) navigate(returnTo ?? '/', { replace: true })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      const r = await api.login(identifier, password)
      setUser(r.user)
      if (r.mergedCartLines > 0) toast.success('Đã gộp giỏ hàng vào tài khoản của bạn')
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className={wrap}>
      <h1 className="text-3xl font-extrabold tracking-tight">Đăng nhập</h1>
      <Card className="p-6 shadow-none">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Số điện thoại hoặc email" htmlFor="identifier" error={err?.fields?.identifier}>
            <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus className="h-11" />
          </Field>
          <Field label="Mật khẩu" htmlFor="password" error={err?.fields?.password}>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-11" />
          </Field>
          <FormError message={err && !err.fields ? errorText(err) : undefined} />
          <Button type="submit" variant="brand" size="lg" className="h-11 w-full" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{' '}
        <Link to={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register'} className="font-semibold text-foreground underline">
          Đăng ký
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">Quên mật khẩu? Liên hệ showroom để được đặt lại.</p>
    </main>
  )
}

export function Register() {
  const { user, setUser } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const returnTo = safeReturn(params.get('returnTo'))
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError>()
  const [done, setDone] = useState(false)
  useEffect(() => void (document.title = 'Đăng ký · Speed Showroom'), [])
  useEffect(() => {
    if (user && !done) navigate(returnTo ?? '/', { replace: true })
  }, [user, done]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      const r = await api.register({ ...f, email: f.email || undefined })
      setDone(true)
      setUser(r.user)
      if (r.linkedOrders > 0) {
        toast.success(`Tìm thấy ${r.linkedOrders} đơn đặt bằng số điện thoại này`)
        navigate('/account/orders', { replace: true })
      } else {
        navigate(returnTo ?? '/', { replace: true })
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e)))
    } finally {
      setBusy(false)
    }
  }
  const fe = err?.fields ?? {}
  return (
    <main className={wrap}>
      <h1 className="text-3xl font-extrabold tracking-tight">Tạo tài khoản</h1>
      <p className="-mt-3 text-sm text-muted-foreground">Các đơn bạn đã đặt bằng số điện thoại này sẽ tự hiện trong tài khoản.</p>
      <Card className="p-6 shadow-none">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Họ và tên" htmlFor="name" error={fe.name}>
            <Input id="name" value={f.name} onChange={set('name')} autoComplete="name" autoFocus aria-invalid={!!fe.name} className="h-11" />
          </Field>
          <Field
            label="Số điện thoại"
            htmlFor="phone"
            error={fe.phone ?? (err?.code === 'phone_taken' ? 'Số điện thoại đã được đăng ký' : undefined)}
            hint={undefined}
          >
            <Input id="phone" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" aria-invalid={!!fe.phone} className="h-11" />
            {err?.code === 'phone_taken' && (
              <Link to="/login" className="text-xs font-semibold underline">
                Đăng nhập bằng số này
              </Link>
            )}
          </Field>
          <Field label="Email (không bắt buộc)" htmlFor="email" error={fe.email}>
            <Input id="email" type="email" value={f.email} onChange={set('email')} autoComplete="email" aria-invalid={!!fe.email} className="h-11" />
          </Field>
          <Field label="Mật khẩu" htmlFor="password" error={fe.password} hint="Tối thiểu 8 ký tự">
            <Input id="password" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" aria-invalid={!!fe.password} className="h-11" />
          </Field>
          <FormError message={err && !err.fields ? errorText(err) : undefined} />
          <Button type="submit" variant="brand" size="lg" className="h-11 w-full" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Đăng ký'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold text-foreground underline">
          Đăng nhập
        </Link>
      </p>
    </main>
  )
}
