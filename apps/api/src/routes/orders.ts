import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { emailSchema, nameSchema, optionalText, phoneSchema, validate } from '../lib/validate'
import { noStore } from '../middleware/auth'
import { checkRate, clientIp, rateLimit } from '../middleware/rate-limit'
import { createOrder } from '../services/orders'
import { cartStoreFor } from './cart'

const app = new Hono<AppEnv>()
app.use('*', noStore)

// Giá, tổng tiền... gửi lên đều bị bỏ qua (zod object chỉ giữ trường đã khai báo)
const createSchema = z.object({
  contact: z.object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema,
    address: optionalText(200, 'Địa chỉ'),
  }),
  note: optionalText(500, 'Ghi chú'),
  pickupAt: z.number({ error: 'Chọn giờ nhận xe' }).int(),
})

app.post('/', rateLimit('order-create', 5, 3600), validate('json', createSchema), async (c) => {
  const input = c.req.valid('json')
  await checkRate(c.env.CART, 'order-phone', input.contact.phone, 5, 86400)
  const user = c.var.user
  const store = cartStoreFor(c)
  const guestId = user ? undefined : c.req.header('x-cart-id')
  const order = await createOrder(c.env.DB, {
    input,
    store,
    userId: user?.id ?? null,
    guestKv: guestId ? { kv: c.env.CART, cartId: guestId } : undefined,
  })
  return c.json({ order }, 201)
})

export default app
