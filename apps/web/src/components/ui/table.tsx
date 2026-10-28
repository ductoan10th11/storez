import * as React from 'react'
import { cn } from '@/lib/utils'

// Bảng cuộn ngang trong khung, không làm tràn trang
export const Table = ({ className, ...p }: React.ComponentProps<'table'>) => (
  <div className="w-full overflow-x-auto rounded-xl border">
    <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
  </div>
)
export const TableHeader = (p: React.ComponentProps<'thead'>) => <thead className="bg-muted/60 [&_tr]:border-b" {...p} />
export const TableBody = (p: React.ComponentProps<'tbody'>) => <tbody className="[&_tr:last-child]:border-0" {...p} />
export const TableRow = ({ className, ...p }: React.ComponentProps<'tr'>) => <tr className={cn('border-b transition-colors hover:bg-muted/40', className)} {...p} />
export const TableHead = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('h-10 px-3 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground', className)} {...p} />
)
export const TableCell = ({ className, ...p }: React.ComponentProps<'td'>) => <td className={cn('px-3 py-2.5 align-middle', className)} {...p} />
