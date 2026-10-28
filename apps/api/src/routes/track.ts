import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { noStore } from '../middleware/auth'
import { rateLimit } from '../middleware/rate-limit'
import { trackOrder } from '../services/track'

const app = new Hono<AppEnv>()
app.use('*', noStore)

app.get('/:code', rateLimit('track', 30, 60), async (c) => c.json({ order: await trackOrder(c.env.DB, c.req.param('code')) }))

export default app
