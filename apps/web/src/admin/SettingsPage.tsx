import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, ApiError, type Settings } from '@/api'
import { errorText, useAsync } from '@/lib/useAsync'
import { Field, FormError } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageTitle } from './AdminLayout'

const DAYS = [
  [1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN'],
] as const

function Section<K extends keyof Settings>({ title, name, value, children }: { title: string; name: K; value: Settings[K]; children: (v: Settings[K], set: (p: Partial<Settings[K]>) => void, e: Record<string, string>) => React.ReactNode }) {
  const [v, setV] = useState(value)
  const [err, setErr] = useState<ApiError>()
  const [busy, setBusy] = useState(false)
  useEffect(() => setV(value), [value])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      setV(await api.admin.saveSetting(name, v))
      toast.success('Đã lưu cấu hình')
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, 'unknown', errorText(e)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-6 shadow-none">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <form onSubmit={save} className="grid gap-4" noValidate>
        {children(v, (p) => setV((s) => ({ ...s, ...p })), err?.fields ?? {})}
        <FormError message={err && !err.fields ? errorText(err) : undefined} />
        <Button type="submit" disabled={busy} className="w-fit">
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </form>
    </Card>
  )
}

const num = (s: string) => (s === '' ? 0 : Number(s))

export default function SettingsPage() {
  const { data, loading, error } = useAsync(() => api.admin.settings(), [])
  if (error) return <p className="text-destructive">{errorText(error)}</p>
  if (loading || !data) return <Skeleton className="h-96 rounded-xl" />
  return (
    <>
      <PageTitle title="Cấu hình showroom" />
      <div className="grid max-w-2xl gap-5">
        <Section title="Thông tin showroom" name="showroom" value={data.showroom}>
          {(v, set, e) => (
            <>
              <Field label="Tên showroom" htmlFor="s-name" error={e.name}>
                <Input id="s-name" value={v.name} onChange={(x) => set({ name: x.target.value })} className="h-10" />
              </Field>
              <Field label="Địa chỉ" htmlFor="s-addr" error={e.address}>
                <Input id="s-addr" value={v.address} onChange={(x) => set({ address: x.target.value })} className="h-10" />
              </Field>
              <Field label="Số điện thoại" htmlFor="s-phone" error={e.phone}>
                <Input id="s-phone" value={v.phone} onChange={(x) => set({ phone: x.target.value })} className="h-10" />
              </Field>
            </>
          )}
        </Section>

        <Section title="Lịch nhận xe" name="pickup" value={data.pickup}>
          {(v, set, e) => (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Giờ mở cửa" htmlFor="p-open" error={e.open}>
                  <Input id="p-open" type="time" value={v.open} onChange={(x) => set({ open: x.target.value })} className="h-10" />
                </Field>
                <Field label="Giờ đóng cửa" htmlFor="p-close" error={e.close}>
                  <Input id="p-close" type="time" value={v.close} onChange={(x) => set({ close: x.target.value })} className="h-10" />
                </Field>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium">Các ngày mở cửa</legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(([d, l]) => {
                    const on = v.days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ days: on ? v.days.filter((x) => x !== d) : [...v.days, d].sort() })}
                        className={`h-9 w-12 rounded-full border text-sm font-medium ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
                {(e.days || Object.keys(e).some((k) => k.startsWith('days.'))) && <p role="alert" className="text-xs text-destructive">{e.days ?? 'Ngày không hợp lệ'}</p>}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Độ dài mỗi khung (phút)" htmlFor="p-slot" error={e.slotMinutes} hint="Phải chia hết khoảng giờ mở cửa">
                  <Input id="p-slot" inputMode="numeric" value={v.slotMinutes} onChange={(x) => set({ slotMinutes: num(x.target.value.replace(/\D/g, '')) })} className="h-10" />
                </Field>
                <Field label="Số đơn tối đa mỗi khung" htmlFor="p-cap" error={e.capacity}>
                  <Input id="p-cap" inputMode="numeric" value={v.capacity} onChange={(x) => set({ capacity: num(x.target.value.replace(/\D/g, '')) })} className="h-10" />
                </Field>
                <Field label="Báo trước tối thiểu (giờ)" htmlFor="p-min" error={e.minNoticeHours}>
                  <Input id="p-min" inputMode="numeric" value={v.minNoticeHours} onChange={(x) => set({ minNoticeHours: num(x.target.value.replace(/\D/g, '')) })} className="h-10" />
                </Field>
                <Field label="Đặt trước tối đa (ngày)" htmlFor="p-max" error={e.maxAdvanceDays}>
                  <Input id="p-max" inputMode="numeric" value={v.maxAdvanceDays} onChange={(x) => set({ maxAdvanceDays: num(x.target.value.replace(/\D/g, '')) })} className="h-10" />
                </Field>
              </div>
            </>
          )}
        </Section>

        <Section title="Giữ xe" name="orders" value={data.orders}>
          {(v, set, e) => (
            <Field label="Số giờ giữ xe cho đơn chưa xác nhận" htmlFor="o-hold" error={e.pendingHoldHours} hint="Quá hạn đơn tự hết hạn và xe được trả về kho">
              <Input id="o-hold" inputMode="numeric" value={v.pendingHoldHours} onChange={(x) => set({ pendingHoldHours: num(x.target.value.replace(/\D/g, '')) })} className="h-10 w-40" />
            </Field>
          )}
        </Section>
      </div>
    </>
  )
}
