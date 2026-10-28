import type { OrderStatus, PaymentStatus } from '@/api'
import { PAYMENT, STATUS } from '@/lib/format'
import { cn } from '@/lib/utils'

export const StatusBadge = ({ status, className }: { status: OrderStatus; className?: string }) => (
  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS[status].tone, className)}>{STATUS[status].label}</span>
)

const PAY_TONE: Record<PaymentStatus, string> = { unpaid: 'bg-zinc-100 text-zinc-700', partial: 'bg-amber-100 text-amber-900', paid: 'bg-green-100 text-green-900' }
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', PAY_TONE[status])}>{PAYMENT[status]}</span>
)
