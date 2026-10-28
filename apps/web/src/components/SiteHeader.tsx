import { useState } from 'react'
import { ClipboardList, LogOut, Search, Settings, ShieldCheck, ShoppingCart, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth, useCart, useCatalog } from '@/providers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Brand } from './Brand'

export function SiteHeader() {
  const { user, logout } = useAuth()
  const { cart, setOpen } = useCart()
  const { categories } = useCatalog()
  const navigate = useNavigate()
  const [trackOpen, setTrackOpen] = useState(false)
  const [code, setCode] = useState('')
  const go = (id: string) => navigate(id === 'all' ? '/#san-pham' : `/?loai=${id}#san-pham`)

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:gap-4 lg:py-3">
        <Brand icon={false} />
        <nav aria-label="Danh mục" className="order-3 -ml-3 flex w-full gap-0.5 overflow-x-auto [scrollbar-width:none] lg:order-none lg:ml-3 lg:w-auto">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => go('all')}>
            Tất cả
          </Button>
          {categories.map((c) => (
            <Button key={c.id} variant="ghost" size="sm" className="text-muted-foreground" onClick={() => go(c.id)}>
              {c.name}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="icon" aria-label="Tra cứu đơn hàng" onClick={() => setTrackOpen(true)}>
            <Search />
          </Button>

          {user === undefined ? null : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 max-w-40 gap-2" aria-label="Menu tài khoản">
                  <User />
                  <span className="hidden truncate sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => navigate('/account/orders')}>
                  <ClipboardList /> Đơn hàng của tôi
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/account')}>
                  <Settings /> Tài khoản
                </DropdownMenuItem>
                {user.role === 'admin' && (
                  <DropdownMenuItem onSelect={() => navigate('/admin')}>
                    <ShieldCheck /> Quản trị
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await logout()
                    navigate('/')
                  }}
                >
                  <LogOut /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" className="h-10">
              <Link to="/login">Đăng nhập</Link>
            </Button>
          )}

          <Button variant="outline" onClick={() => setOpen(true)} aria-label={`Giỏ hàng, ${cart.count} sản phẩm`} className="h-10 gap-2">
            <ShoppingCart />
            <span className="hidden sm:inline">Giỏ hàng</span>
            <Badge className="h-5 min-w-5 justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">{cart.count}</Badge>
          </Button>
        </div>
      </div>

      <Dialog open={trackOpen} onOpenChange={setTrackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tra cứu đơn hàng</DialogTitle>
            <DialogDescription>Nhập mã đơn có dạng SS-XXXXX-XXXXX để xem tiến độ.</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!code.trim()) return
              setTrackOpen(false)
              navigate(`/track/${encodeURIComponent(code.trim())}`)
              setCode('')
            }}
          >
            <Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SS-XXXXX-XXXXX" aria-label="Mã đơn" className="h-10 rounded-full" />
            <Button type="submit" variant="brand" className="h-10">
              Tra cứu
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}
