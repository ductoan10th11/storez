import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import { resizeImage } from '@/lib/image'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

export type Uploaded = { id: number; url: string }

const MSG: Record<string, string> = {
  unsupported_media: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP',
  payload_too_large: 'Ảnh quá lớn (tối đa 5 MB)',
  storage_unavailable: 'Chưa cấu hình kho lưu ảnh (Cloudinary)',
  storage_error: 'Kho lưu ảnh đang lỗi, vui lòng thử lại',
}

// Thu nhỏ ở trình duyệt rồi tải lên; trả { id, url }
export async function uploadFile(file: File): Promise<Uploaded> {
  try {
    const img = await resizeImage(file)
    const { media } = await api.admin.uploadMedia(img.blob, img.name, img.width, img.height)
    return { id: media.id, url: media.url }
  } catch (e) {
    if (e instanceof ApiError) throw new Error(MSG[e.code] ?? e.message)
    throw e
  }
}

// Nút chọn file (một hoặc nhiều), tải lên tuần tự, báo lỗi từng file
export function UploadButton({ onUploaded, multiple, label = 'Tải ảnh lên', variant = 'outline', className }: { onUploaded: (m: Uploaded) => void; multiple?: boolean; label?: string; variant?: 'outline' | 'secondary' | 'default'; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    for (const f of Array.from(files)) {
      try {
        onUploaded(await uploadFile(f))
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`)
      }
    }
    setBusy(false)
    if (ref.current) ref.current.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="sr-only" onChange={(e) => pick(e.target.files)} aria-label={label} tabIndex={-1} />
      <Button type="button" variant={variant} size="sm" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? 'Đang tải…' : label}
      </Button>
    </>
  )
}

// Chọn ảnh từ thư viện đã tải lên
export function MediaPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (m: Uploaded) => void }) {
  const { data, loading, reload } = useAsync(() => (open ? api.admin.media(1) : Promise.resolve(undefined)), [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chọn ảnh từ thư viện</DialogTitle>
          <DialogDescription>Bấm vào ảnh để chọn, hoặc tải ảnh mới lên.</DialogDescription>
        </DialogHeader>
        <UploadButton
          label="Tải ảnh mới"
          onUploaded={(m) => {
            reload()
            onPick(m)
            onOpenChange(false)
          }}
          className="w-fit"
        />
        {loading && !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {data?.items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ id: m.id, url: m.url })
                    onOpenChange(false)
                  }}
                  className="block w-full overflow-hidden rounded-lg border hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Chọn ảnh ${m.id}`}
                >
                  <img src={m.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Ô ảnh nhỏ có xem trước: tải lên hoặc chọn từ thư viện
export function ImageSlot({ value, onChange, className }: { value: Uploaded | null; onChange: (m: Uploaded | null) => void; className?: string }) {
  const [lib, setLib] = useState(false)
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="grid aspect-[4/3] w-28 place-items-center overflow-hidden rounded-lg border bg-muted">
        {value ? <img src={value.url} alt="Ảnh riêng" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-1">
        <UploadButton onUploaded={onChange} label="Tải lên" className="h-7 px-2 text-xs" />
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setLib(true)}>
          Thư viện
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => onChange(null)}>
            Bỏ
          </Button>
        )}
      </div>
      <MediaPicker open={lib} onOpenChange={setLib} onPick={onChange} />
    </div>
  )
}
