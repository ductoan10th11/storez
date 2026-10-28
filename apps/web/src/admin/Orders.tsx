import { useState } from 'react'
import { Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { api, vndShort, type OrderStatus } from '@/api'
import { fmtDateTime, fmtPhone, STATUS } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { PaymentBadge, StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageTitle } from './AdminLayout'

const ORDER: OrderStatus[] = ['pending', 'confirmed', 'ready', 'completed', 'cancelled', 'expired']

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)
  const [text, setText] = useState(q)
  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k)
    if (!('page' in patch)) p.delete('page')
    setParams(p, { replace: true })
  }
  const { data, loading, error, reload } = useAsync(() => api.admin.orders({ status, q, page, pageSize: 20 }), [status, q, page])
  const now = Date.now() / 1000

  return (
    <>
      <PageTitle title="Đơn hàng">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: text.trim() })
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mã đơn, SĐT hoặc tên" aria-label="Tìm đơn hàng" className="h-10 w-64 rounded-full pl-9" />
        </form>
      </PageTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => set({ status: '' })} className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', !status ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
          Tất cả
        </button>
        {ORDER.map((s) => (
          <button key={s} onClick={() => set({ status: s })} className={cn('flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium', status === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            {STATUS[s].label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', status === s ? 'bg-white/20' : 'bg-muted')}>{data?.counts[s] ?? '–'}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-destructive">
          {errorText(error)}{' '}
          <button className="underline" onClick={reload}>
            Thử lại
          </button>
        </p>
      ) : loading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Không có đơn nào phù hợp.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Khách</TableHead>
                <TableHead>Xe</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead>Thanh toán</TableHead>
                <TableHead>Hẹn nhận</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Hạn giữ xe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((o) => {
                const soon = o.status === 'pending' && o.holdExpiresAt && o.holdExpiresAt < now + 6 * 3600
                return (
                  <TableRow key={o.code} className={cn(o.overdue && 'bg-red-50', soon && 'bg-orange-50')}>
                    <TableCell>
                      <Link to={`/admin/orders/${o.code}`} className="font-mono font-semibold underline-offset-2 hover:underline">
                        {o.code}
                      </Link>
                      {o.overdue && <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-[0.65rem] font-bold text-white">QUÁ HẸN</span>}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.contactName}</div>
                      <a href={`tel:${o.contactPhone}`} className="text-xs text-muted-foreground hover:underline">
                        {fmtPhone(o.contactPhone)}
                      </a>
                    </TableCell>
                    <TableCell>
                      {o.firstItemName}
                      {o.itemCount > 1 && <span className="text-muted-foreground"> +{o.itemCount - 1}</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{vndShort(o.total)}</TableCell>
                    <TableCell>
                      <PaymentBadge status={o.paymentStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(o.pickupAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className={cn('whitespace-nowrap', soon && 'font-semibold text-orange-700')}>{o.status === 'pending' && o.holdExpiresAt ? fmtDateTime(o.holdExpiresAt) : '–'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {data.total} đơn · trang {data.page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                Trước
              </Button>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => set({ page: String(page + 1) })}>
                Sau
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
