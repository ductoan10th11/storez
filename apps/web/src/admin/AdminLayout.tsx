import { useState } from 'react'
import { BarChart3, CalendarDays, ClipboardList, Image, LogOut, Menu, Package, Settings, ShieldAlert, Store, Users } from 'lucide-react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/providers'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Brand } from '@/components/Brand'

const NAV = [
  { to: '/admin', label: 'Tổng quan', icon: BarChart3, end: true },
  { to: '/admin/orders', label: 'Đơn hàng', icon: ClipboardList },
  { to: '/admin/calendar', label: 'Lịch nhận xe', icon: CalendarDays },
  { to: '/admin/products', label: 'Sản phẩm', icon: Package },
  { to: '/admin/media', label: 'Thư viện ảnh', icon: Image },
  { to: '/admin/users', label: 'Người dùng', icon: Users },
  { to: '/admin/settings', label: 'Cấu hình', icon: Settings },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Quản trị" className="grid gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <Icon className="size-4" /> {label}
        </NavLink>
      ))}
    </nav>
  )
}

// Khung admin: chỉ admin vào được. Chưa đăng nhập -> /login; không phải admin -> trang "Không có quyền"
export function AdminLayout() {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (user === undefined) return <div className="p-10 text-center text-muted-foreground">Đang tải…</div>
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
        <ShieldAlert className="size-12 text-destructive" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">Không có quyền</h1>
        <p className="text-muted-foreground">Tài khoản của bạn không có quyền vào khu vực quản trị.</p>
        <Button asChild variant="outline">
          <Link to="/">Về cửa hàng</Link>
        </Button>
      </main>
    )
  }
  // Trang in phiếu không cần khung
  if (loc.pathname.endsWith('/print')) return <Outlet />

  return (
    <div className="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-4 border-r bg-background p-4 lg:flex">
        <Brand to="/admin" />
        <Nav />
        <div className="mt-auto grid gap-1 text-sm">
          <Button asChild variant="ghost" className="justify-start">
            <Link to="/">
              <Store /> Xem cửa hàng
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            <LogOut /> Đăng xuất
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2.5 lg:hidden">
          <Button variant="outline" size="icon" aria-label="Mở menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <Brand to="/admin" />
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-64 gap-4 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Quản trị</SheetTitle>
              <SheetDescription className="sr-only">Điều hướng khu vực quản trị</SheetDescription>
            </SheetHeader>
            <Nav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="mx-auto max-w-[1200px] p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-center" />
    </div>
  )
}

export const PageTitle = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
    {children}
  </div>
)
