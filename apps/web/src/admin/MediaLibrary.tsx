import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, type MediaItem } from '@/api'
import { errorText, useAsync } from '@/lib/useAsync'
import { UploadButton } from '@/components/MediaTools'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageTitle } from './AdminLayout'

export default function MediaLibrary() {
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(() => api.admin.media(page), [page])
  const [del, setDel] = useState<MediaItem>()
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!del) return
    setBusy(true)
    try {
      await api.admin.deleteMedia(del.id)
      toast.success('Đã xóa ảnh')
      setDel(undefined)
      reload()
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'media_in_use' ? 'Ảnh đang được dùng (sản phẩm, màu hoặc đơn cũ) nên không xóa được' : errorText(e))
      setDel(undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle title="Thư viện ảnh">
        <UploadButton multiple label="Tải ảnh lên" variant="default" onUploaded={() => reload()} />
      </PageTitle>
      {error ? (
        <p className="text-destructive">{errorText(error)}</p>
      ) : loading && !data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Chưa có ảnh nào.</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {data.items.map((m) => (
              <li key={m.id} className="group relative overflow-hidden rounded-xl border bg-background">
                <img src={m.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center justify-between gap-1 p-2 text-xs">
                  {m.inUse ? <Badge variant="secondary">Đang dùng</Badge> : <span className="text-muted-foreground">Chưa dùng</span>}
                  <Button variant="ghost" size="icon-xs" aria-label={`Xóa ảnh ${m.id}`} disabled={m.inUse} onClick={() => setDel(m)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} ảnh</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trước
              </Button>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
                Sau
              </Button>
            </div>
          </div>
        </>
      )}
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa ảnh này?</DialogTitle>
            <DialogDescription>Ảnh sẽ bị xóa khỏi kho lưu trữ và không thể khôi phục.</DialogDescription>
          </DialogHeader>
          {del && <img src={del.url} alt="" className="max-h-48 rounded-lg" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(undefined)}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
