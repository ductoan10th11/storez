import { useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, type AdminUser } from '@/api'
import { useAuth } from '@/providers'
import { fmtDate, fmtPhone } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { Field, FormError } from '@/components/Field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageTitle } from './AdminLayout'

type Pending = { kind: 'disable' | 'enable' | 'role' | 'reset'; user: AdminUser }

export default function Users() {
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.admin.users({ q }), [q])
  const [pending, setPending] = useState<Pending>()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!pending) return
    const { kind, user } = pending
    setBusy(true)
    setErr(undefined)
    try {
      if (kind === 'reset') {
        await api.admin.resetPassword(user.id, pw)
        toast.success('Đã đặt lại mật khẩu. Hãy báo mật khẩu mới cho khách.')
      } else if (kind === 'role') {
        await api.admin.patchUser(user.id, { role: user.role === 'admin' ? 'customer' : 'admin' })
        toast.success('Đã đổi vai trò')
      } else {
        await api.admin.patchUser(user.id, { disabled: kind === 'disable' })
        toast.success(kind === 'disable' ? 'Đã khóa tài khoản' : 'Đã mở khóa')
      }
      setPending(undefined)
      setPw('')
      reload()
    } catch (e) {
      setErr(e instanceof ApiError && e.fields?.newPassword ? e.fields.newPassword : errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const title = pending && { disable: 'Khóa tài khoản', enable: 'Mở khóa tài khoản', role: pending.user.role === 'admin' ? 'Hạ xuống khách hàng' : 'Nâng lên quản trị', reset: 'Đặt lại mật khẩu' }[pending.kind]

  return (
    <>
      <PageTitle title="Người dùng">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(text.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="SĐT, tên hoặc email" aria-label="Tìm người dùng" className="h-10 w-64 rounded-full pl-9" />
        </form>
      </PageTitle>
      {error ? (
        <p className="text-destructive">{errorText(error)}</p>
      ) : loading && !data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Không có người dùng nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead className="text-right">Đơn</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((u) => {
              const self = u.id === me?.id
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtPhone(u.phone)}</TableCell>
                  <TableCell>{u.email ?? '–'}</TableCell>
                  <TableCell>{u.role === 'admin' ? <Badge>Quản trị</Badge> : <Badge variant="secondary">Khách</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.orderCount}</TableCell>
                  <TableCell>{u.disabled ? <Badge variant="destructive">Đã khóa</Badge> : 'Hoạt động'}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" disabled={self} title={self ? 'Không thể tự thao tác' : undefined} onClick={() => setPending({ kind: u.disabled ? 'enable' : 'disable', user: u })}>
                        {u.disabled ? 'Mở khóa' : 'Khóa'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => (setPw(''), setPending({ kind: 'reset', user: u }))}>
                        Đặt lại MK
                      </Button>
                      <Button variant="outline" size="sm" disabled={self} onClick={() => setPending({ kind: 'role', user: u })}>
                        {u.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => !o && (setPending(undefined), setErr(undefined))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {pending?.user.name} · {pending && fmtPhone(pending.user.phone)}
              {pending?.kind === 'reset' && '. Mọi phiên đăng nhập của người này sẽ bị hủy.'}
              {pending?.kind === 'disable' && '. Người này sẽ bị đăng xuất ngay.'}
            </DialogDescription>
          </DialogHeader>
          {pending?.kind === 'reset' && (
            <Field label="Mật khẩu mới" htmlFor="pw" hint="8 đến 128 ký tự. Hãy báo mật khẩu này cho khách.">
              <Input id="pw" type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" className="h-10" />
            </Field>
          )}
          <FormError message={err} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(undefined)}>
              Đóng
            </Button>
            <Button onClick={confirm} disabled={busy || (pending?.kind === 'reset' && pw.length < 8)}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
