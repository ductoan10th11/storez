import { AppError } from '../middleware/errors'
import { normalizeCode } from '../lib/ids'
import { maskEmail, maskName, maskPhone } from './masking'
import { findOrder, loadOrderParts, buildOrder } from './orders'

// Tra cứu công khai: chỉ trả dữ liệu đã che (docs/05 mục 6). Mã sai định dạng và mã không tồn tại cho cùng một lỗi.
export async function trackOrder(db: D1Database, rawCode: string) {
  const notFound = () => new AppError(404, 'order_not_found', 'Không tìm thấy đơn hàng với mã này')
  const code = normalizeCode(rawCode)
  if (!code) throw notFound()
  const row = await findOrder(db, 'code', code)
  if (!row) throw notFound()
  const full = buildOrder(row, await loadOrderParts(db, row.id))
  return {
    code: full.code,
    status: full.status,
    paymentStatus: full.paymentStatus,
    total: full.total,
    paidTotal: full.paidTotal,
    remaining: full.remaining,
    pickupAt: full.pickupAt,
    createdAt: full.createdAt,
    holdExpiresAt: full.holdExpiresAt,
    contact: {
      name: maskName(full.contact.name),
      phone: maskPhone(full.contact.phone),
      email: maskEmail(full.contact.email),
    },
    items: full.items.map(({ productId: _p, ...i }) => i),
    events: full.events,
    canCancel: false,
  }
}
