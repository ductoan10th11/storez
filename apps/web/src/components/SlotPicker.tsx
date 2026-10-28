import { useEffect, useState } from 'react'
import { api } from '@/api'
import { fmtDayLabel } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// Chọn ngày (hàng cuộn ngang) + giờ (lưới); khung đầy mờ và không chọn được
export function SlotPicker({ value, onChange }: { value: number | null; onChange: (startsAt: number) => void }) {
  const { data, loading, error, reload } = useAsync(() => api.slots(14), [])
  const days = data?.days ?? []
  const [day, setDay] = useState('')
  useEffect(() => {
    if (!day && days.length) setDay(days.find((d) => d.slots.some((s) => s.startsAt === value))?.date ?? days[0].date)
  }, [days, day, value])
  const cur = days.find((d) => d.date === day) ?? days[0]

  if (loading && !days.length) return <Skeleton className="h-32 w-full rounded-xl" />
  if (error) return <p className="text-sm text-destructive">Không tải được khung giờ. <button type="button" className="underline" onClick={reload}>Thử lại</button></p>
  if (!days.length) return <p className="text-sm text-muted-foreground">Chưa có khung giờ nào còn trống.</p>
  return (
    <div className="grid gap-3">
      <ToggleGroup type="single" variant="outline" spacing={2} value={cur?.date} onValueChange={(v) => v && setDay(v)} aria-label="Chọn ngày" className="-mx-1 justify-start overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
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
      <div role="radiogroup" aria-label="Chọn giờ" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cur?.slots.map((s) => (
          <button
            key={s.startsAt}
            type="button"
            role="radio"
            aria-checked={value === s.startsAt}
            disabled={!s.available}
            onClick={() => onChange(s.startsAt)}
            className={cn(
              'flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold',
              value === s.startsAt ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-foreground/40',
              !s.available && 'cursor-not-allowed bg-muted text-muted-foreground opacity-60',
            )}
          >
            {s.time}
            {!s.available && <span className="text-[0.65rem] font-normal">Hết chỗ</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
