import { useState } from 'react'
import { Check, Copy, PackageSearch } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { api } from '@/api'
import { useAuth } from '@/providers'
import { useAsync } from '@/lib/useAsync'
import { ContactCard, holdNotice, ItemsAndPayment, OrderHeader, PickupCard, Timeline } from '@/components/OrderView'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const wrap = 'mx-auto max-w-[900px] px-4 py-8 sm:px-6 sm:py-12'

function CodeForm({ initial = '', autoFocus }: { initial?: string; autoFocus?: boolean }) {
  const [code, setCode] = useState(initial)
  const navigate = useNavigate()
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) navigate(`/track/${encodeURIComponent(code.trim())}`)
      }}
    >
      <Input autoFocus={autoFocus} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SS-XXXXX-XXXXX" aria-label="Mã đơn" className="h-11 rounded-full font-mono" />
      <Button type="submit" variant="brand" size="lg" className="h-11">
        Tra cứu
      </Button>
    </form>
  )
}

// /track: nhập mã đơn
export function TrackIndex() {
  return (
    <main className={wrap}>
      <div className="mx-auto flex max-w-md flex-col gap-4 text-center">
        <PackageSearch className="mx-auto size-10 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="text-3xl font-extrabold tracking-tight">Tra cứu đơn hàng</h1>
        <p className="text-muted-foreground">Nhập mã đơn bạn nhận được sau khi đặt xe để xem tiến độ.</p>
        <CodeForm autoFocus />
      </div>
    </main>
  )
}

// /track/:code: tiến độ đơn (dữ liệu đã che)
export function TrackOrder() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { data, error, loading } = useAsync(() => api.track(code), [code])
  const [copied, setCopied] = useState(false)
  const order = data?.order
  const isNew = params.get('new') === '1'

  if (loading) {
    return (
      <main className={wrap} aria-busy="true">
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </main>
    )
  }
  if (!order) {
    return (
      <main className={wrap}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <PackageSearch className="size-10 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-2xl font-bold">{error?.code === 'order_not_found' ? 'Không tìm thấy đơn hàng' : 'Không tra cứu được'}</h1>
          <p className="text-muted-foreground">{error?.code === 'order_not_found' ? 'Kiểm tra lại mã đơn và thử nhập lại.' : error?.code === 'rate_limited' ? `Bạn tra cứu quá nhanh, thử lại sau ${error.retryAfter ?? 'vài'} giây.` : 'Có lỗi xảy ra, vui lòng thử lại.'}</p>
          <div className="w-full">
            <CodeForm initial={code} />
          </div>
        </div>
      </main>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.code)
      setCopied(true)
      toast.success('Đã sao chép mã đơn')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Không sao chép được, hãy chọn và sao chép thủ công')
    }
  }
  const notice = holdNotice(order)

  return (
    <main className={wrap}>
      {isNew && (
        <section className="mb-6 rounded-2xl border border-success/30 bg-success/10 p-5 sm:p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold text-success">
            <Check className="size-5" /> Đặt xe thành công
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Mã đơn của bạn</p>
          <div className="flex flex-wrap items-center gap-3">
            <strong className="font-mono text-3xl font-extrabold tracking-tight sm:text-4xl">{order.code}</strong>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />} Sao chép mã
            </Button>
          </div>
          <p className="mt-3 text-sm">Lưu lại mã này để theo dõi đơn.</p>
          {!user && (
            <Button asChild variant="link" className="mt-1 h-auto p-0">
              <Link to="/register">Tạo tài khoản để xem lại đơn</Link>
            </Button>
          )}
        </section>
      )}

      <OrderHeader order={order} />
      {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}

      <div className="mt-6 grid items-start gap-5 md:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-5">
          <Card className="p-5 shadow-none">
            <Timeline order={order} />
          </Card>
          <PickupCard pickupAt={order.pickupAt} />
        </div>
        <div className="grid gap-5">
          <ItemsAndPayment order={order} />
          <ContactCard order={order} masked />
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        Mã đơn là bằng chứng để xem đơn này, đừng đăng công khai.
        <Button asChild variant="outline" size="sm">
          <Link to="/#san-pham">Tiếp tục xem xe</Link>
        </Button>
      </div>
    </main>
  )
}
