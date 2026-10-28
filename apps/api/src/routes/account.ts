import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { emailSchema, fieldsOf, nameSchema, optionalText, pageSchema, passwordSchema, validate } from '../lib/validate'
import { AppError } from '../middleware/errors'
import { noStore, requireAuth } from '../middleware/auth'
import { normalizeCode } from '../lib/ids'
import { changePassword, updateProfile } from '../services/auth'
import { cancelOrder, findOrder, getFullOrder, paymentStatusOf, type OrderRow } from '../services/orders'

const app = new Hono<AppEnv>()
app.use('*', noStore, requireAuth)

app.patch(
  '/',
  validate('json', z.object({ name: nameSchema.optional(), email: z.union([emailSchema, z.literal('').transform(() => null), z.null()]).optional() })),
  async (c) => c.json({ user: await updateProfile(c.env.DB, c.var.user!.id, c.req.valid('json')) }),
)

app.post(
  '/password',
  validate('json', z.object({ currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'), newPassword: passwordSchema })),
  async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json')
    await changePassword(c.env.DB, c.var.user!.id, c.var.sessionId, currentPassword, newPassword)
    return c.body(null, 204)
  },
)

// Mọi truy vấn đơn đều có user_id = :me; đơn của người khác trả 404 để không xác nhận đơn tồn tại
const ownOrder = async (c: Context<AppEnv>, rawCode: string): Promise<OrderRow> => {
  const code = normalizeCode(rawCode)
  const row = code ? await findOrder(c.env.DB, 'code', code) : null
  if (!row || row.user_id !== c.var.user!.id) throw new AppError(404, 'order_not_found', 'Không tìm thấy đơn hàng')
  return row
}

app.get('/orders', validate('query', pageSchema), async (c) => {
  const { page, pageSize } = c.req.valid('query')
  const userId = c.var.user!.id
  const [total, rows, items] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').bind(userId),
    c.env.DB.prepare(
      `SELECT id, code, status, total, paid_total, pickup_at, created_at FROM orders
       WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    ).bind(userId, pageSize, (page - 1) * pageSize),
    c.env.DB.prepare(
      `SELECT i.order_id, i.name, i.image, i.qty FROM order_items i
       WHERE i.order_id IN (SELECT id FROM (SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?))
       ORDER BY i.id`,
    ).bind(userId, pageSize, (page - 1) * pageSize),
  ])
  const itemsBy = new Map<string, { name: string; image: string; qty: number }[]>()
  for (const i of items.results as { order_id: string; name: string; image: string; qty: number }[]) {
    const list = itemsBy.get(i.order_id) ?? itemsBy.set(i.order_id, []).get(i.order_id)!
    list.push({ name: i.name, image: i.image, qty: i.qty })
  }
  return c.json({
    items: (rows.results as Pick<OrderRow, 'id' | 'code' | 'status' | 'total' | 'paid_total' | 'pickup_at' | 'created_at'>[]).map((r) => ({
      code: r.code,
      status: r.status,
      paymentStatus: paymentStatusOf(r.paid_total, r.total),
      total: r.total,
      pickupAt: r.pickup_at,
      createdAt: r.created_at,
      items: itemsBy.get(r.id) ?? [],
    })),
    total: (total.results[0] as { n: number }).n,
    page,
    pageSize,
  })
})

app.get('/orders/:code', async (c) => {
  const row = await ownOrder(c, c.req.param('code'))
  return c.json({ order: await getFullOrder(c.env.DB, row) })
})

// Body không bắt buộc: thân rỗng coi như {}
app.post('/orders/:code/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ reason: optionalText(200, 'Lý do') }).safeParse(body)
  if (!parsed.success) throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', fieldsOf(parsed.error))
  const row = await ownOrder(c, c.req.param('code'))
  const after = await cancelOrder(c.env.DB, row, { actorId: c.var.user!.id, note: parsed.data.reason, byAdmin: false })
  return c.json({ order: await getFullOrder(c.env.DB, after) })
})

export default app
