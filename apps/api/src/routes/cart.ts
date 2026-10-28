import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { AppError } from '../middleware/errors'
import { noStore } from '../middleware/auth'
import { validate } from '../lib/validate'
import { addToCart, CART_ID_RE, clearCart, dbStore, hydrate, kvStore, setLineQty, type CartStore } from '../services/cart'

// Người đã đăng nhập dùng giỏ tài khoản (D1, bỏ qua x-cart-id); khách dùng KV theo x-cart-id
export function cartStoreFor(c: Context<AppEnv>): CartStore {
  const user = c.var.user
  if (user) return dbStore(c.env.DB, user.id)
  const id = c.req.header('x-cart-id')
  if (!id || !CART_ID_RE.test(id)) {
    throw new AppError(400, 'validation_failed', 'Thiếu hoặc sai x-cart-id', { 'x-cart-id': 'Thiếu hoặc sai định dạng' })
  }
  return kvStore(c.env.CART, id)
}

const app = new Hono<AppEnv>()
app.use('*', noStore)

app.get('/', async (c) => c.json(await hydrate(c.env.DB, await cartStoreFor(c).read())))

app.delete('/', async (c) => c.json(await clearCart(cartStoreFor(c))))

app.post(
  '/items',
  validate(
    'json',
    z.object({
      productId: z.number().int(),
      picks: z.record(z.string(), z.string()).optional(),
      qty: z.number().optional(),
    }),
  ),
  async (c) => c.json(await addToCart(c.env.DB, cartStoreFor(c), c.req.valid('json'))),
)

app.put(
  '/items/:id',
  validate('json', z.object({ qty: z.number() })),
  async (c) => c.json(await setLineQty(c.env.DB, cartStoreFor(c), c.req.param('id'), c.req.valid('json').qty)),
)

export default app
