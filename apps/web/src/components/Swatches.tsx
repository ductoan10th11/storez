import type { OptionGroup } from '@/api'
import { cn } from '@/lib/utils'

// Chấm chọn màu: size "sm" cho thêm nhanh, "md" cho trang chi tiết
export function Swatches({
  group,
  value,
  onPick,
  size = 'md',
}: {
  group: OptionGroup
  value: string
  onPick: (choice: string) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="group" aria-label={group.name} className={cn('flex flex-wrap', size === 'sm' ? 'gap-2.5' : 'gap-3')}>
      {group.choices.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.name}
          aria-label={c.name}
          aria-pressed={c.id === value}
          onClick={() => onPick(c.id)}
          style={{ background: c.hex }}
          className={cn(
            'rounded-full border border-black/20 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
            'aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-foreground',
            size === 'sm' ? 'size-6.5 shadow-[inset_0_0_0_2px_#fff]' : 'size-9 shadow-[inset_0_0_0_3px_#fff]',
          )}
        />
      ))}
    </div>
  )
}
