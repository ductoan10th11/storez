import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { validate } from '../lib/validate'
import { getSettings } from '../lib/settings'
import { epochToVnDate, now } from '../lib/time'
import { AppError } from '../middleware/errors'
import { listCategories, listProducts, loadProducts, toPublic } from '../services/catalog'
import { parseSlotRange, pickupSlots } from '../services/slots'

const app = new Hono<AppEnv>()

app.get('/settings/public', async (c) => {
  const { showroom, pickup } = await getSettings(c.env.DB)
  const { open, close, days, slotMinutes } = pickup
  return c.json({ showroom, pickup: { open, close, days, slotMinutes } })
})

app.get('/categories', async (c) => c.json(await listCategories(c.env.DB)))

app.get(
  '/products',
  validate(
    'query',
    z.object({
      category: z.string().optional(),
      q: z.string().optional(),
      sort: z.enum(['price_asc', 'price_desc']).optional(),
    }),
  ),
  async (c) => c.json(await listProducts(c.env.DB, c.req.valid('query'))),
)

app.get('/products/:slug', async (c) => {
  const [p] = await loadProducts(c.env.DB, { slug: c.req.param('slug') })
  if (!p) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  return c.json(toPublic(p))
})

app.get(
  '/pickup-slots',
  validate('query', z.object({ from: z.string().optional(), days: z.coerce.number().int().min(1).max(14).default(7) })),
  async (c) => {
    const q = c.req.valid('query')
    const t = now()
    const { from, days } = parseSlotRange(q.from, q.days, epochToVnDate(t))
    const { pickup } = await getSettings(c.env.DB)
    return c.json({ days: await pickupSlots(c.env.DB, pickup, t, from, days) })
  },
)

export default app
