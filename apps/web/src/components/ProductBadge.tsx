import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  'Bán chạy': 'bg-brand text-white',
  Mới: 'bg-success text-white',
}

export function ProductBadge({ text, className }: { text: string; className?: string }) {
  return <Badge className={cn('border-0 px-3 py-0.5 text-xs font-semibold', TONE[text] ?? 'bg-primary text-primary-foreground', className)}>{text}</Badge>
}
