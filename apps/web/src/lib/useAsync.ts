import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api'

// Tải dữ liệu máy chủ: { data, error, loading, reload }. Kết quả cũ bị bỏ khi deps đổi.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError>()
  const [loading, setLoading] = useState(true)
  const ticket = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(() => {
    const t = ++ticket.current
    setLoading(true)
    fnRef.current()
      .then((d) => t === ticket.current && (setData(d), setError(undefined)))
      .catch((e) => t === ticket.current && setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e?.message ?? e))))
      .finally(() => t === ticket.current && setLoading(false))
  }, [])

  useEffect(run, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: run, setData }
}

// Thông điệp lỗi hiển thị cho người dùng (docs/06 mục 5)
export function errorText(e: unknown) {
  if (!(e instanceof ApiError)) return 'Có lỗi xảy ra, vui lòng thử lại'
  if (e.code === 'rate_limited') return `Bạn thao tác quá nhanh, vui lòng thử lại sau ${e.retryAfter ?? 'vài'} giây`
  if (e.code === 'internal_error' || e.code === 'network') return e.code === 'network' ? e.message : 'Có lỗi xảy ra, vui lòng thử lại'
  if (e.code === 'account_disabled') return 'Tài khoản đã bị khóa. Vui lòng liên hệ showroom'
  return e.message
}
