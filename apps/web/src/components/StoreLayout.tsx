import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { CartSheet } from './CartSheet'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import { SpeedyChat } from './SpeedyChat'

// Cuộn: điều hướng mới thì lên đầu (hoặc tới #mục), quay lại (back/forward) thì trả vị trí cũ
export function ScrollManager() {
  const { key, pathname, hash } = useLocation()
  const type = useNavigationType()
  const saved = useRef(new Map<string, number>())
  const current = useRef(key)
  current.current = key

  useEffect(() => {
    const onScroll = () => saved.current.set(current.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (type === 'POP' && saved.current.has(key)) return window.scrollTo({ top: saved.current.get(key)!, behavior: 'instant' })
      if (hash) {
        const el = document.getElementById(hash.slice(1))
        if (el) return el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }, [key, pathname, hash, type])
  return null
}

export function StoreLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <CartSheet />
      <SpeedyChat />
      <Toaster position="bottom-center" />
    </>
  )
}
