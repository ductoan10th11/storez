import { Zap } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Brand({ className, light, icon = true, to = '/' }: { className?: string; light?: boolean; icon?: boolean; to?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 text-[1.05rem] font-extrabold tracking-tight', className)}>
      {icon && (
        <span className={cn('grid size-7 place-items-center rounded-lg', light ? 'bg-brand text-white' : 'bg-primary text-primary-foreground')}>
          <Zap className="size-4 fill-current" />
        </span>
      )}
      Speed Showroom
    </Link>
  )
}
