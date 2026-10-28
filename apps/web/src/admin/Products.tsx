import { useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError, vndShort, type AdminProductRow } from '@/api'
import { useCatalog } from '@/providers'
import { AVAILABILITY } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageTitle } from './AdminLayout'

function StockCell({ p, onSaved }: { p: AdminProductRow; onSaved: () => void }) {
  const [v, setV] = useState(p.stock === null ? '' : String(p.stock))
  const save = async () => {
    const next = v.trim() === '' ? null : Number(v)
    if (next === p.stock) return
    if (next !== null && (!Number.isInteger(next) || next < 0)) return toast.error('Kho phải là số nguyên từ 0 trở lên, hoặc để trống nếu làm theo đơn')
    try {
      await api.admin.patchProduct(p.id, { stock: next })
      toast.success('Đã lưu kho')
      onSaved()
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  return <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Theo đơn" aria-label={`Kho của ${p.name}`} inputMode="numeric" className="h-8 w-24 text-right" />
}

export default function Products() {
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.admin.products({ q }), [q])
  const { catName } = useCatalog()
  const [del, setDel] = useState<AdminProductRow>()
  const [busy, setBusy] = useState(false)

  const toggle = async (p: AdminProductRow, active: boolean) => {
    try {
      await api.admin.patchProduct(p.id, { active })
      toast.success(active ? 'Đã hiện xe' : 'Đã ẩn xe')
      reload()
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  const remove = async () => {
    if (!del) return
    setBusy(true)
    try {
      await api.admin.deleteProduct(del.id)
      toast.success('Đã xóa xe. Đơn cũ vẫn giữ nguyên thông tin.')
      setDel(undefined)
      reload()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Sản phẩm">
        <div className="flex gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault()
              setQ(text.trim())
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm theo tên" aria-label="Tìm sản phẩm" className="h-10 w-56 rounded-full pl-9" />
          </form>
          <Button asChild variant="brand">
            <Link to="/admin/products/new">
              <Plus /> Thêm sản phẩm
            </Link>
          </Button>
        </div>
      </PageTitle>
      {error ? (
        <p className="text-destructive">{errorText(error)}</p>
      ) : loading && !data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Chưa có sản phẩm nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ảnh</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead className="text-right">Kho</TableHead>
              <TableHead>Tình trạng</TableHead>
              <TableHead>Hiện</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((p) => (
              <TableRow key={p.id} className={p.active ? undefined : 'opacity-60'}>
                <TableCell>{p.image ? <img src={p.image} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-muted" />}</TableCell>
                <TableCell>
                  <Link to={`/admin/products/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{catName(p.category) || p.category}</TableCell>
                <TableCell className="text-right tabular-nums">{vndShort(p.price)}</TableCell>
                <TableCell className="text-right">
                  <StockCell key={`${p.id}-${p.stock}`} p={p} onSaved={reload} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{AVAILABILITY[p.availability]}</TableCell>
                <TableCell>
                  <Switch checked={p.active} onCheckedChange={(v) => toggle(p, v)} aria-label={`${p.active ? 'Ẩn' : 'Hiện'} ${p.name}`} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" aria-label={`Xóa ${p.name}`} onClick={() => setDel(p)}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa {del?.name}?</DialogTitle>
            <DialogDescription>Xe, tùy chọn và liên kết ảnh sẽ bị xóa. Đơn cũ vẫn giữ nguyên thông tin xe. Nếu chỉ muốn tạm ngừng bán, hãy dùng công tắc “Hiện”.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(undefined)}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              Xóa xe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
