import type { OrderStatus, PaymentStatus } from '@/api'

const VN = 7 * 3600
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const p2 = (n: number) => String(n).padStart(2, '0')

// epoch giây -> các phần theo giờ Việt Nam (UTC+7)
const parts = (epoch: number) => {
  const d = new Date((epoch + VN) * 1000)
  return { dow: DOW[d.getUTCDay()], dd: p2(d.getUTCDate()), mm: p2(d.getUTCMonth() + 1), yyyy: d.getUTCFullYear(), h: p2(d.getUTCHours()), mi: p2(d.getUTCMinutes()) }
}

// "T2, 03/11 lúc 09:00"
export const fmtDateTime = (epoch: number) => {
  const t = parts(epoch)
  return `${t.dow}, ${t.dd}/${t.mm} lúc ${t.h}:${t.mi}`
}
export const fmtDate = (epoch: number) => {
  const t = parts(epoch)
  return `${t.dow}, ${t.dd}/${t.mm}/${t.yyyy}`
}
export const fmtTime = (epoch: number) => {
  const t = parts(epoch)
  return `${t.h}:${t.mi}`
}
export const fmtDayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return { dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], dm: `${p2(d)}/${p2(m)}` }
}
export const todayVn = () => new Date(Date.now() + VN * 1000).toISOString().slice(0, 10)
export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// 0336436536 -> 0336 436 536
export const fmtPhone = (p: string) => (/^0\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p)

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  pending: { label: 'Chờ xác nhận', tone: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Đã xác nhận', tone: 'bg-blue-100 text-blue-900' },
  ready: { label: 'Xe sẵn sàng', tone: 'bg-green-100 text-green-900' },
  completed: { label: 'Đã giao xe', tone: 'bg-zinc-800 text-white' },
  cancelled: { label: 'Đã hủy', tone: 'bg-red-100 text-red-900' },
  expired: { label: 'Hết hạn giữ xe', tone: 'bg-red-100 text-red-900' },
}
export const PAYMENT: Record<PaymentStatus, string> = { unpaid: 'Chưa thu', partial: 'Đã cọc', paid: 'Đã đủ' }
export const AVAILABILITY = { in_stock: 'Có sẵn', preorder: 'Đặt trước', out_of_stock: 'Hết hàng' } as const
