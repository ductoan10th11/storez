import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AuthProvider, CartProvider, CatalogProvider } from '@/providers'
import { StoreLayout, ScrollManager } from '@/components/StoreLayout'
import { Button } from '@/components/ui/button'
import { AdminLayout } from '@/admin/AdminLayout'
import Calendar from '@/admin/Calendar'
import Dashboard from '@/admin/Dashboard'
import MediaLibrary from '@/admin/MediaLibrary'
import OrderDetail from '@/admin/OrderDetail'
import OrderPrint from '@/admin/OrderPrint'
import Orders from '@/admin/Orders'
import ProductForm from '@/admin/ProductForm'
import Products from '@/admin/Products'
import SettingsPage from '@/admin/SettingsPage'
import Users from '@/admin/Users'
import { AccountLayout, MyOrder, MyOrders, Profile } from '@/pages/Account'
import { Login, Register, RequireAuth } from '@/pages/Auth'
import Checkout from '@/pages/Checkout'
import Home from '@/pages/Home'
import ProductPage from '@/pages/ProductPage'
import { TrackIndex, TrackOrder } from '@/pages/Track'

function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight">404</h1>
      <p className="text-muted-foreground">Không tìm thấy trang bạn cần.</p>
      <Button asChild variant="brand">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <CatalogProvider>
            <ScrollManager />
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<Home />} />
                <Route path="p/:slug" element={<ProductPage />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="track" element={<TrackIndex />} />
                <Route path="track/:code" element={<TrackOrder />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route element={<RequireAuth />}>
                  <Route path="account" element={<AccountLayout />}>
                    <Route index element={<Profile />} />
                    <Route path="orders" element={<MyOrders />} />
                    <Route path="orders/:code" element={<MyOrder />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:code" element={<OrderDetail />} />
                <Route path="orders/:code/print" element={<OrderPrint />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="products" element={<Products />} />
                <Route path="products/:id" element={<ProductForm />} />
                <Route path="media" element={<MediaLibrary />} />
                <Route path="users" element={<Users />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </CatalogProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
