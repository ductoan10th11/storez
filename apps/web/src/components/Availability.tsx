import type { Product } from '@/api'
import { cn } from '@/lib/utils'

// Tình trạng xe (FR-CAT-2): có sẵn / đặt trước (kèm thời gian chờ) / hết hàng
export function Availability({ p, className }: { p: Pick<Product, 'availability' | 'leadTimeDays'>; className?: string }) {
  const map = {
    in_stock: { text: 'Có sẵn tại showroom', dot: 'bg-success' },
    preorder: { text: p.leadTimeDays ? `Đặt trước · nhận sau khoảng ${p.leadTimeDays} ngày` : 'Đặt trước', dot: 'bg-amber-500' },
    out_of_stock: { text: 'Hết hàng', dot: 'bg-destructive' },
  }[p.availability]
  return (
    <span className={cn('mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80', className)}>
      <i className={cn('size-2 rounded-full', map.dot)} aria-hidden="true" />
      {map.text}
    </span>
  )
}
