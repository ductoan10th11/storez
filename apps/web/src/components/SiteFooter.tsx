import { MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { useCart, useCatalog } from '@/providers'
import { ADDRESS, MAP_URL, PHONE } from '@/lib/catalog'
import { fmtPhone } from '@/lib/format'
import { Separator } from '@/components/ui/separator'
import { Brand } from './Brand'

const link = 'block py-1 text-left text-[0.92rem] text-white/65 transition-colors hover:text-white'

export function SiteFooter() {
  const { cart, setOpen } = useCart()
  const { categories, settings } = useCatalog()
  const address = settings?.showroom.address ?? ADDRESS
  const phone = settings?.showroom.phone ?? PHONE
  return (
    <footer className="relative mt-24 overflow-hidden bg-primary text-white/70">
      <div className="mx-auto max-w-[1200px] px-4 pt-14 sm:px-6">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.4fr_0.8fr_1fr_1.8fr]">
          <div className="col-span-2 lg:col-span-1">
            <Brand light className="text-white" />
            <p className="mt-3.5 max-w-[30ch] text-[0.92rem]">Xe máy, ô tô, máy bay, trực thăng và xe tăng.</p>
          </div>
          <div>
            <h4 className="mb-3.5 text-sm font-semibold text-white">Dòng xe</h4>
            {categories.map((c) => (
              <Link key={c.id} to={`/?loai=${c.id}#san-pham`} className={link}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <h4 className="mb-3.5 text-sm font-semibold text-white">Mua sắm</h4>
            <Link to="/#san-pham" className={link}>
              Tất cả phương tiện
            </Link>
            <button onClick={() => setOpen(true)} className={link}>
              Giỏ hàng ({cart.count})
            </button>
            <Link to="/track" className={link}>
              Tra cứu đơn hàng
            </Link>
          </div>
          <address className="col-span-2 not-italic lg:col-span-1">
            <h4 className="mb-3.5 text-sm font-semibold text-white">Liên hệ</h4>
            <a href={MAP_URL} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 py-1.5 text-[0.92rem] leading-normal text-white/80 hover:text-white">
              <MapPin className="mt-0.5 size-[18px] shrink-0 text-brand-2" />
              <span>{address}</span>
            </a>
            <a href={`tel:${phone}`} className="flex items-start gap-2.5 py-1.5 text-[0.92rem] leading-normal text-white/80 hover:text-white">
              <Phone className="mt-0.5 size-[18px] shrink-0 text-brand-2" />
              <span>{fmtPhone(phone)}</span>
            </a>
          </address>
        </div>

        <Separator className="mt-12 bg-white/12" />
        <p className="py-4.5 text-xs text-white/45">© 2026 Speed Showroom</p>
      </div>
      <div aria-hidden="true" className="bg-gradient-to-b from-white/25 to-transparent to-90% bg-clip-text pb-2 text-center text-[clamp(5rem,24vw,19rem)] leading-[1.05] font-extrabold tracking-[-0.05em] text-transparent select-none">
        SPEED
      </div>
    </footer>
  )
}
