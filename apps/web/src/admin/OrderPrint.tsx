import { useEffect } from 'react'
import { useParams } from 'react-router'
import { api, vnd } from '@/api'
import { useCatalog } from '@/providers'
import { ADDRESS } from '@/lib/catalog'
import { fmtDateTime, fmtPhone } from '@/lib/format'
import { errorText, useAsync } from '@/lib/useAsync'
import { Button } from '@/components/ui/button'

// Phiếu nhận xe: chỉ nội dung phiếu, tự mở hộp thoại in khi tải xong
export default function OrderPrint() {
  const { code = '' } = useParams()
  const { data, error } = useAsync(() => api.admin.order(code), [code])
  const { settings } = useCatalog()
  const order = data?.order
  useEffect(() => {
    if (!order) return
    document.title = `Phiếu nhận xe ${order.code}`
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [order])

  if (error) return <p className="p-10 text-center text-destructive">{errorText(error)}</p>
  if (!order) return <p className="p-10 text-center text-muted-foreground">Đang tải…</p>

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>In phiếu</Button>
      </div>
      <header className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="text-2xl font-extrabold">{settings?.showroom.name ?? 'Speed Showroom'}</h1>
          <p className="text-sm">{settings?.showroom.address ?? ADDRESS}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase">Phiếu nhận xe</p>
          <p className="font-mono text-xl font-bold">{order.code}</p>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">Khách hàng</h2>
          <p className="font-semibold">{order.contact.name}</p>
          <p>{fmtPhone(order.contact.phone)}</p>
          <p>{order.contact.email}</p>
          {order.contact.address && <p>{order.contact.address}</p>}
        </div>
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">Lịch hẹn nhận xe</h2>
          <p className="text-lg font-bold">{fmtDateTime(order.pickupAt)}</p>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2">Phương tiện</th>
            <th className="py-2 text-right">SL</th>
            <th className="py-2 text-right">Đơn giá</th>
            <th className="py-2 text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-2">
                <b>{it.name}</b>
                <div className="text-xs">{it.options.map((o) => o.choice).join(' · ')}</div>
              </td>
              <td className="py-2 text-right">{it.qty}</td>
              <td className="py-2 text-right">{vnd(it.unitPrice)}</td>
              <td className="py-2 text-right">{vnd(it.unitPrice * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto grid w-72 gap-1 text-sm">
        <div className="flex justify-between"><dt>Tổng tiền</dt><dd className="font-bold">{vnd(order.total)}</dd></div>
        <div className="flex justify-between"><dt>Đã thu</dt><dd>{vnd(order.paidTotal)}</dd></div>
        <div className="flex justify-between border-t border-black pt-1"><dt className="font-bold">Còn lại</dt><dd className="font-bold">{vnd(order.remaining)}</dd></div>
      </dl>

      <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-sm">
        <div>
          <p className="font-semibold">Khách hàng</p>
          <p className="text-xs">(Ký và ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="font-semibold">Nhân viên showroom</p>
          <p className="text-xs">(Ký và ghi rõ họ tên)</p>
        </div>
      </footer>
    </div>
  )
}
