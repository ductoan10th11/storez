import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { normalizeCode } from '../../lib/ids'
import { getSettings } from '../../lib/settings'
import { now } from '../../lib/time'
import { optionalText, pageSchema, validate } from '../../lib/validate'
import { AppError } from '../../middleware/errors'
import { auditStmt } from '../../services/audit'
import { adminCalendar, getAdminOrder, listAdminOrders } from '../../services/admin-orders'
import { findOrder, recordPayment, transitionOrder, type OrderRow } from '../../services/orders'
import { assertSlotAvailable } from '../../services/slots'

const app = new Hono<AppEnv>()

const loadOrder = async (c: Context<AppEnv>): Promise<OrderRow> => {
  const code = normalizeCode(c.req.param('code') ?? '')
  const row = code ? await findOrder(c.env.DB, 'code', code) : null
  if (!row) throw new AppError(404, 'order_not_found', 'Không tìm thấy đơn hàng')
  return row
}

app.get(
  '/orders',
  validate(
    'query',
    pageSchema.extend({
      status: z.string().optional(),
      q: z.string().optional(),
      from: z.coerce.number().int().optional(),
      to: z.coerce.number().int().optional(),
    }),
  ),
  async (c) => c.json(await listAdminOrders(c.env.DB, c.req.valid('query'))),
)

app.get('/orders/:code', async (c) => c.json({ order: await getAdminOrder(c.env.DB, await loadOrder(c)) }))

app.post(
  '/orders/:code/status',
  validate('json', z.object({ status: z.enum(['confirmed', 'ready', 'completed', 'cancelled']), note: optionalText(300, 'Ghi chú') })),
  async (c) => {
    const order = await loadOrder(c)
    const { status, note } = c.req.valid('json')
    const actorId = c.var.user!.id
    const after = await transitionOrder(c.env.DB, order, {
      to: status,
      note,
      actorId,
      // Chỉ giao xe khi đã thu đủ tiền (BR-ORD-1)
      requirePaid: status === 'completed',
      audit: { actorId, action: 'order.status', detail: { from: order.status, to: status } },
    })
    return c.json({ order: await getAdminOrder(c.env.DB, after) })
  },
)

app.post(
  '/orders/:code/payments',
  validate(
    'json',
    z.object({
      amount: z.number({ error: 'Số tiền không hợp lệ' }).int('Số tiền phải là số nguyên').positive('Số tiền phải lớn hơn 0'),
      method: z.enum(['cash', 'transfer']),
      note: optionalText(200, 'Ghi chú'),
    }),
  ),
  async (c) => {
    const order = await loadOrder(c)
    const after = await recordPayment(c.env.DB, order, { ...c.req.valid('json'), actorId: c.var.user!.id })
    return c.json({ order: await getAdminOrder(c.env.DB, after) })
  },
)

app.patch(
  '/orders/:code',
  validate('json', z.object({ internalNote: z.string().trim().max(1000, 'Tối đa 1000 ký tự').nullable().optional(), pickupAt: z.number().int().optional() })),
  async (c) => {
    const order = await loadOrder(c)
    const body = c.req.valid('json')
    const sets: string[] = []
    const binds: (string | number | null)[] = []
    // Có gửi internalNote thì đổi (null hoặc chuỗi rỗng để xóa)
    if (body.internalNote !== undefined) {
      sets.push('internal_note = ?')
      binds.push(body.internalNote || null)
    }
    if (body.pickupAt !== undefined && body.pickupAt !== order.pickup_at) {
      if (order.status === 'cancelled' || order.status === 'expired' || order.status === 'completed') {
        throw new AppError(409, 'invalid_transition', 'Không thể đổi lịch hẹn của đơn đã kết thúc')
      }
      await assertSlotAvailable(c.env.DB, (await getSettings(c.env.DB)).pickup, body.pickupAt, now(), order.id)
      sets.push('pickup_at = ?')
      binds.push(body.pickupAt)
    }
    if (sets.length) {
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE orders SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, now(), order.id),
        // Ghi nhận có sửa ghi chú nội bộ, không chép nội dung vào nhật ký
        auditStmt(c.env.DB, {
          actorId: c.var.user!.id,
          action: 'order.update',
          target: `order:${order.code}`,
          detail: { internalNote: body.internalNote !== undefined, pickupAt: body.pickupAt },
        }),
      ])
    }
    return c.json({ order: await getAdminOrder(c.env.DB, (await findOrder(c.env.DB, 'id', order.id))!) })
  },
)

app.get(
  '/calendar',
  validate('query', z.object({ from: z.string(), to: z.string() })),
  async (c) => {
    const { from, to } = c.req.valid('query')
    return c.json(await adminCalendar(c.env.DB, (await getSettings(c.env.DB)).pickup, from, to))
  },
)

export default app
