import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { validate } from '../../lib/validate'
import { adminStats } from '../../services/stats'

const app = new Hono<AppEnv>()

app.get('/', validate('query', z.object({ from: z.string().optional(), to: z.string().optional() })), async (c) => {
  const { from, to } = c.req.valid('query')
  return c.json(await adminStats(c.env.DB, from, to))
})

export default app
