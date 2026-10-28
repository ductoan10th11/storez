import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api'
import { addDays, fmtDayLabel, fmtPhone, todayVn } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageTitle } from './AdminLayout'

// Lịch nhận xe theo ngày: từng khung giờ với các đơn pending/confirmed/ready
export default function Calendar() {
  const [date, setDate] = useState(todayVn())
  const { data, loading, error } = useAsync(() => api.admin.calendar(date, date), [date])
  const slots = data?.days[0]?.slots ?? []
  const l = fmtDayLabel(date)
  return (
    <>
      <PageTitle title="Lịch nhận xe">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Ngày trước" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft />
          </Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Chọn ngày" className="h-9 w-40" />
          <Button variant="outline" size="icon" aria-label="Ngày sau" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => setDate(todayVn())}>
            Hôm nay
          </Button>
        </div>
      </PageTitle>
      <p className="mb-4 text-lg font-semibold">
        {l.dow}, {l.dm}
      </p>
      {error ? (
        <p className="text-destructive">{errorText(error)}</p>
      ) : loading && !data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : slots.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Showroom không mở cửa ngày này.</p>
      ) : (
        <ul className="grid gap-2">
          {slots.map((s) => (
            <li key={s.startsAt} className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-[80px_1fr]">
              <b className="text-lg tabular-nums">{s.time}</b>
              {s.orders.length === 0 ? (
                <span className="text-sm text-muted-foreground">Trống</span>
              ) : (
                <div className="grid gap-2">
                  {s.orders.map((o) => (
                    <Link key={o.code} to={`/admin/orders/${o.code}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm hover:bg-muted">
                      <b className="font-mono">{o.code}</b>
                      <span>{o.contactName}</span>
                      <span className="text-muted-foreground">{fmtPhone(o.contactPhone)}</span>
                      <span className="text-muted-foreground">
                        {o.firstItemName}
                        {o.itemCount > 1 ? ` +${o.itemCount - 1}` : ''}
                      </span>
                      <StatusBadge status={o.status} className="ml-auto" />
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
