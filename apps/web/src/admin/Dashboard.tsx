import { AlertTriangle, CalendarClock, ClipboardList, Hourglass, PackageMinus } from 'lucide-react'
import { Link } from 'react-router'
import { api, vnd, vndShort } from '@/api'
import { addDays, fmtDayLabel, todayVn } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageTitle } from './AdminLayout'

function Stat({ to, icon: Icon, label, value, tone }: { to: string; icon: typeof ClipboardList; label: string; value: number | undefined; tone?: string }) {
  return (
    <Link to={to} className="group">
      <Card className="gap-1 p-4 shadow-none transition group-hover:border-foreground/30 group-hover:shadow-md">
        <Icon className={`size-5 ${tone ?? 'text-muted-foreground'}`} />
        <strong className="text-3xl font-extrabold tabular-nums">{value ?? '–'}</strong>
        <span className="text-sm text-muted-foreground">{label}</span>
      </Card>
    </Link>
  )
}

export default function Dashboard() {
  const today = todayVn()
  const { data, loading, error } = useAsync(async () => {
    const now = Date.now() / 1000
    const [stats, pending, active, cal, products] = await Promise.all([
      api.admin.stats(addDays(today, -29), today),
      api.admin.orders({ status: 'pending', pageSize: 100 }),
      api.admin.orders({ status: 'confirmed,ready', pageSize: 100 }),
      api.admin.calendar(today, today),
      api.admin.products({ active: '1' }),
    ])
    return {
      stats,
      pending: pending.counts.pending,
      expiring: pending.items.filter((o) => o.holdExpiresAt && o.holdExpiresAt < now + 6 * 3600).length,
      overdue: active.items.filter((o) => o.overdue).length,
      todayCount: cal.days[0]?.slots.reduce((s, x) => s + x.orders.length, 0) ?? 0,
      lowStock: products.items.filter((p) => p.stock !== null && p.stock <= 2).length,
    }
  }, [])

  if (error) return <p className="text-destructive">{errorText(error)}</p>
  const s = data?.stats
  const max = Math.max(1, ...(s?.byDay.map((d) => d.collected) ?? [1]))
  return (
    <>
      <PageTitle title="Tổng quan" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat to="/admin/orders?status=pending" icon={ClipboardList} label="Chờ xác nhận" value={data?.pending} tone="text-amber-600" />
        <Stat to="/admin/orders?status=pending" icon={Hourglass} label="Sắp hết hạn giữ xe (6 giờ)" value={data?.expiring} tone="text-orange-600" />
        <Stat to="/admin/calendar" icon={CalendarClock} label="Hẹn hôm nay" value={data?.todayCount} tone="text-blue-600" />
        <Stat to="/admin/orders?status=confirmed,ready" icon={AlertTriangle} label="Quá hẹn nhận xe" value={data?.overdue} tone="text-destructive" />
        <Stat to="/admin/products" icon={PackageMinus} label="Xe sắp hết (kho ≤ 2)" value={data?.lowStock} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="gap-3 p-5 shadow-none">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Tiền đã thu, 30 ngày qua</h2>
            <strong>{s ? vnd(s.collected) : ''}</strong>
          </div>
          {loading || !s ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div role="img" aria-label={`Biểu đồ tiền đã thu theo ngày, tổng ${vnd(s.collected)}`} className="flex h-40 items-end gap-[3px]">
              {s.byDay.map((d) => (
                <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${fmtDayLabel(d.date).dm}: ${vnd(d.collected)} · ${d.orders} đơn`}>
                  <div className="w-full rounded-t bg-brand/80 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(d.collected ? 4 : 1, (d.collected / max) * 100)}%`, opacity: d.collected ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
          )}
          {s && (
            <p className="text-xs text-muted-foreground">
              {s.orders.total} đơn tạo trong kỳ · tỉ lệ hủy/hết hạn {(s.cancelRate * 100).toFixed(0)}%
            </p>
          )}
        </Card>

        <Card className="gap-3 p-5 shadow-none">
          <h2 className="font-bold">Xe bán chạy</h2>
          {s && s.topProducts.length === 0 && <p className="text-sm text-muted-foreground">Chưa có đơn trong kỳ.</p>}
          {s && s.topProducts.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Xe</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Doanh số</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.topProducts.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{vndShort(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
